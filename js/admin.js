// sa-incident-tracker/js/admin.js

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxwR8LmQ1zBjLWJVu9gXGwwT2wyXSsp3q4WcQT1Rb6dRIk9gvbiiZNJbUcwttMQ4ostdQ/exec";

let allAlerts = [];
let currentEditingAlert = null;
let currentPhotoIndex = 0;
let currentImage = null;
let rects = [];
let canvas = null;
let ctx = null;
let isDrawing = false;
let startX, startY;

// Simple auth check
function checkAdminAuth() {
  const auth = localStorage.getItem('adminAuth');
  if (!auth) {
    const password = prompt("Enter admin password:");
    if (password !== "test") { // ← CHANGE THIS
      alert("Access denied");
      window.location.href = "index.html";
      return false;
    }
    localStorage.setItem('adminAuth', 'true');
  }
  return true;
}

document.addEventListener('DOMContentLoaded', () => {
  if (!checkAdminAuth()) return;

  initMap('map');
  loadAllAlerts();

  document.getElementById('logout')?.addEventListener('click', () => {
    if (confirm("Logout?")) {
      localStorage.removeItem('adminAuth');
      window.location.href = "index.html";
    }
  });

  // Blur modal controls
  document.getElementById('cancel-blur')?.addEventListener('click', closeBlurModal);
  document.getElementById('clear-rects')?.addEventListener('click', clearRects);
  document.getElementById('apply-blur')?.addEventListener('click', applyBlur);
});

async function loadAllAlerts() {
  try {
    const res = await fetch(`${SCRIPT_URL}?action=get-alerts`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "Load failed");

    allAlerts = data.alerts;
    renderTable();
    renderMarkers();
    updatePendingCount();
  } catch (err) {
    console.error("Admin load error:", err);
    alert("Could not load alerts. Check console.");
  }
}

function renderTable() {
  const tbody = document.getElementById('alert-table-body');
  tbody.innerHTML = '';

  allAlerts.forEach(alert => {
    const tr = document.createElement('tr');
    tr.className = alert.status?.toLowerCase() || '';
    tr.innerHTML = `
      <td>${alert.timestamp || '—'}</td>
      <td>${alert.type || 'other'}</td>
      <td>${alert.area || 'Unknown'}</td>
      <td>${alert.reporter || 'Anonymous'}</td>
      <td title="${alert.description || ''}">${(alert.description || '').substring(0, 80)}${(alert.description || '').length > 80 ? '...' : ''}</td>
      
      <td style="text-align:center;">
        ${alert.photos ? 
          alert.photos.split(',').map((url, i) => {
            const trimmed = url.trim();
            return trimmed ? `
              <a href="${trimmed}" target="_blank" title="Photo ${i+1}">
                <img src="${trimmed}" alt="Photo ${i+1}" style="width:60px; height:60px; object-fit:cover; border-radius:4px; border:1px solid #ddd; margin:2px;">
              </a>
            ` : '';
          }).join('')
          : '—'}
      </td>

      <td>
        <select class="status-select" data-row="${alert.row}">
          <option value="pending"    ${alert.status==='pending'?'selected':''}>Pending</option>
          <option value="approved"   ${alert.status==='approved'?'selected':''}>Approved</option>
          <option value="rejected"   ${alert.status==='rejected'?'selected':''}>Rejected</option>
          <option value="in-progress">${alert.status==='in-progress'?'selected':''}>In Progress</option>
          <option value="resolved"   ${alert.status==='resolved'?'selected':''}>Resolved</option>
        </select>
      </td>
      <td>
        <button class="approve-btn" data-row="${alert.row}">Approve</button>
        <button class="reject-btn" data-row="${alert.row}">Reject</button>
        <button class="blur-btn" data-row="${alert.row}" data-alert='${JSON.stringify(alert)}'>Blur Images</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Status dropdown & quick buttons
  document.querySelectorAll('.status-select').forEach(sel => {
    sel.addEventListener('change', () => updateStatus(sel.dataset.row, sel.value));
  });

  document.querySelectorAll('.approve-btn').forEach(btn => {
    btn.addEventListener('click', () => updateStatus(btn.dataset.row, 'approved'));
  });

  document.querySelectorAll('.reject-btn').forEach(btn => {
    btn.addEventListener('click', () => updateStatus(btn.dataset.row, 'rejected'));
  });

  // Blur button – open editor for this alert
  document.querySelectorAll('.blur-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const alertData = JSON.parse(btn.dataset.alert);
      openBlurEditor(alertData);
    });
  });
}

async function updateStatus(row, newStatus) {
  if (!confirm(`Set status to "${newStatus}"?`)) return;

  const params = new URLSearchParams({
    action: 'update-status',
    row: row,
    status: newStatus
  });

  try {
    const res = await fetch(`${SCRIPT_URL}?${params}`);
    const data = await res.json();
    if (data.success) {
      loadAllAlerts();
    } else {
      alert("Update failed: " + (data.error || "Unknown"));
    }
  } catch (err) {
    console.error("Status update error:", err);
    alert("Network error – try again");
  }
}

function updatePendingCount() {
  const pending = allAlerts.filter(a => a.status?.toLowerCase() === 'pending').length;
  const el = document.getElementById('pending-count');
  if (el) {
    el.textContent = `Pending reports: ${pending}`;
    el.style.color = pending > 0 ? '#d32f2f' : '#28a745';
  }
}

function renderMarkers() {
  markersCluster.clearLayers();
  allAlerts.forEach(addMarkerToCluster);
  fitToMarkers();
}

// ────────────────────────────────────────────────
// Blur Editor – Option 2: In-browser canvas drawing
// ────────────────────────────────────────────────
function openBlurEditor(alert) {
  currentEditingAlert = alert;
  currentPhotoIndex = 0;
  rects = [];

  const modal = document.getElementById('blur-modal');
  const canvasEl = document.getElementById('blur-canvas');
  document.getElementById('current-photo-index').textContent = `1 of ${alert.photos ? alert.photos.split(',').length : 0}`;

  if (!alert.photos || !alert.photos.trim()) {
    alert("No photos in this report.");
    return;
  }

  const urls = alert.photos.split(',').map(u => u.trim()).filter(Boolean);
  if (urls.length === 0) return;

  canvas = canvasEl;
  ctx = canvas.getContext('2d');

  loadAndDrawImage(urls[currentPhotoIndex]);

  modal.style.display = 'flex';

  // Mouse events for drawing rectangles
  canvas.onmousedown = (e) => {
    isDrawing = true;
    startX = e.offsetX;
    startY = e.offsetY;
  };

  canvas.onmousemove = (e) => {
    if (!isDrawing) return;
    drawPreview(e.offsetX, e.offsetY);
  };

  canvas.onmouseup = (e) => {
    if (!isDrawing) return;
    isDrawing = false;
    const endX = e.offsetX;
    const endY = e.offsetY;
    rects.push({x: Math.min(startX, endX), y: Math.min(startY, endY), w: Math.abs(endX - startX), h: Math.abs(endY - startY)});
    redraw();
  };

  canvas.onmouseout = () => { isDrawing = false; };
}

function loadAndDrawImage(url) {
  currentImage = new Image();
  currentImage.crossOrigin = "anonymous";
  currentImage.onload = () => {
    canvas.width = currentImage.width;
    canvas.height = currentImage.height;
    ctx.drawImage(currentImage, 0, 0);
    redraw();
  };
  currentImage.onerror = () => {
    ctx.fillStyle = "#f88";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "black";
    ctx.font = "20px Arial";
    ctx.fillText("Failed to load image", 20, 40);
  };
  currentImage.src = url;
}

function redraw() {
  ctx.drawImage(currentImage, 0, 0);
  ctx.strokeStyle = "red";
  ctx.lineWidth = 3;
  rects.forEach(r => {
    ctx.strokeRect(r.x, r.y, r.w, r.h);
  });
}

function drawPreview(endX, endY) {
  redraw();
  ctx.strokeStyle = "red";
  ctx.lineWidth = 3;
  ctx.strokeRect(startX, startY, endX - startX, endY - startY);
}

function clearRects() {
  rects = [];
  redraw();
}

async function applyBlur() {
  if (rects.length === 0) {
    alert("No areas selected to blur.");
    return;
  }

  // Apply blur to selected rectangles
  rects.forEach(r => {
    StackBlur.canvasRGBA(canvas, r.x, r.y, r.w, r.h, 20); // 20 = blur radius
  });

  // Convert canvas to blob → upload to ImgBB
  canvas.toBlob(async (blob) => {
    const formData = new FormData();
    formData.append("image", blob, "blurred.jpg");
    formData.append("key", "ccb5d3992f0066955a63d303a75c32a0"); // your ImgBB key

    try {
      const res = await fetch("https://api.imgbb.com/1/upload", { method: "POST", body: formData });
      const json = await res.json();

      if (json.success) {
        const newUrl = json.data.url;
        alert("Blurred photo saved! New URL:\n" + newUrl);

        // Update sheet – replace this photo's URL
        const urls = currentEditingAlert.photos.split(',').map(u => u.trim());
        urls[currentPhotoIndex] = newUrl;
        const updatedPhotos = urls.join(',');

        const params = new URLSearchParams({
          action: 'update-photos',
          row: currentEditingAlert.row,
          photos: updatedPhotos
        });

        await fetch(`${SCRIPT_URL}?${params}`);
        alert("Sheet updated with blurred photo!");
        loadAllAlerts(); // refresh
        closeBlurModal();
      } else {
        alert("Upload failed: " + (json.error?.message || "Unknown"));
      }
    } catch (err) {
      console.error(err);
      alert("Blur save failed – check console.");
    }
  }, 'image/jpeg', 0.9);
}

function closeBlurModal() {
  document.getElementById('blur-modal').style.display = 'none';
  rects = [];
}
