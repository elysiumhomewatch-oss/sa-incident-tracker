// sa-incident-tracker/js/admin.js

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxwR8LmQ1zBjLWJVu9gXGwwT2wyXSsp3q4WcQT1Rb6dRIk9gvbiiZNJbUcwttMQ4ostdQ/exec";

let allAlerts = [];
let currentEditingAlert = null;
let currentPhotoUrls = [];
let currentPhotoIndex = 0;
let canvas = null;
let ctx = null;
let isDrawing = false;
let startX, startY;
let rects = [];

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
  document.getElementById('apply-blur')?.addEventListener('click', applyBlurToCurrent);
  document.getElementById('done-blur')?.addEventListener('click', doneBlurAll);
  document.getElementById('prev-photo')?.addEventListener('click', () => navigatePhoto(-1));
  document.getElementById('next-photo')?.addEventListener('click', () => navigatePhoto(1));
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
          <option value="in-progress" ${alert.status==='in-progress'?'selected':''}>In Progress</option>
          <option value="resolved"   ${alert.status==='resolved'?'selected':''}>Resolved</option>
        </select>
      </td>
      <td>
        <button class="approve-btn" data-row="${alert.row}">Approve</button>
        <button class="reject-btn"  data-row="${alert.row}">Reject</button>
        <button class="blur-btn" data-row="${alert.row}" data-alert='${JSON.stringify(alert)}'>Blur Images</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Status & quick buttons
  document.querySelectorAll('.status-select').forEach(sel => {
    sel.addEventListener('change', () => updateStatus(sel.dataset.row, sel.value));
  });

  document.querySelectorAll('.approve-btn').forEach(btn => {
    btn.addEventListener('click', () => updateStatus(btn.dataset.row, 'approved'));
  });

  document.querySelectorAll('.reject-btn').forEach(btn => {
    btn.addEventListener('click', () => updateStatus(btn.dataset.row, 'rejected'));
  });

  // Blur button
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
// Blur Editor Modal – now supports multiple photos
// ────────────────────────────────────────────────
function openBlurEditor(alert) {
  currentEditingAlert = alert;
  currentPhotoIndex = 0;
  rects = [];

  const modal = document.getElementById('blur-modal');
  const indexEl = document.getElementById('current-photo-index');
  const totalEl = document.getElementById('total-photos');

  if (!modal) {
    alert("Blur modal not found in page.");
    return;
  }

  if (!alert.photos || !alert.photos.trim()) {
    alert("No photos in this report.");
    return;
  }

  currentPhotoUrls = alert.photos.split(',').map(u => u.trim()).filter(Boolean);
  if (currentPhotoUrls.length === 0) return;

  totalEl.textContent = currentPhotoUrls.length;
  updatePhotoDisplay();

  modal.style.display = 'flex';

  canvas = document.getElementById('blur-canvas');
  ctx = canvas.getContext('2d');

  loadAndDrawCurrentPhoto();

  // Mouse drawing events
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
    rects.push({
      x: Math.min(startX, endX),
      y: Math.min(startY, endY),
      w: Math.abs(endX - startX),
      h: Math.abs(endY - startY)
    });
    redraw();
  };

  canvas.onmouseout = () => { isDrawing = false; };
}

function updatePhotoDisplay() {
  document.getElementById('current-photo-index').textContent = currentPhotoIndex + 1;
  document.getElementById('prev-photo').disabled = currentPhotoIndex === 0;
  document.getElementById('next-photo').disabled = currentPhotoIndex === currentPhotoUrls.length - 1;
}

function loadAndDrawCurrentPhoto() {
  const url = currentPhotoUrls[currentPhotoIndex];
  currentImage = new Image();
  currentImage.crossOrigin = "anonymous";
  currentImage.onload = () => {
    canvas.width = currentImage.width;
    canvas.height = currentImage.height;
    ctx.drawImage(currentImage, 0, 0);
    rects = []; // reset rectangles for each photo
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

function navigatePhoto(direction) {
  currentPhotoIndex += direction;
  if (currentPhotoIndex < 0) currentPhotoIndex = 0;
  if (currentPhotoIndex >= currentPhotoUrls.length) currentPhotoIndex = currentPhotoUrls.length - 1;
  updatePhotoDisplay();
  loadAndDrawCurrentPhoto();
}

async function applyBlurToCurrent() {
  if (rects.length === 0) {
    alert("No areas selected to blur on this photo.");
    return;
  }

  rects.forEach(r => {
    StackBlur.canvasRGBA(canvas, r.x, r.y, r.w, r.h, 20);
  });

  canvas.toBlob(async (blob) => {
    if (!blob) {
      alert("Failed to generate blurred image.");
      return;
    }

    const formData = new FormData();
    formData.append("image", blob, "blurred-photo.jpg");
    formData.append("key", "ccb5d3992f0066955a63d303a75c32a0");

    try {
      const res = await fetch("https://api.imgbb.com/1/upload", { method: "POST", body: formData });
      const json = await res.json();

      if (json.success) {
        const newUrl = json.data.url;
        alert("Blurred photo uploaded!\nNew URL: " + newUrl);

        // Replace only this photo's URL
        currentPhotoUrls[currentPhotoIndex] = newUrl;
        alert("This photo blurred and ready. Continue with next or click Done to save all changes.");
      } else {
        alert("Upload failed: " + (json.error?.message || "Unknown"));
      }
    } catch (err) {
      console.error("Blur upload error:", err);
      alert("Failed to upload blurred photo – check console.");
    }
  }, 'image/jpeg', 0.9);
}

async function doneBlurAll() {
  if (currentPhotoUrls.length === 0) {
    closeBlurModal();
    return;
  }

  const updatedPhotos = currentPhotoUrls.join(',');

  try {
    const params = new URLSearchParams({
      action: 'update-photos',
      row: currentEditingAlert.row,
      photos: updatedPhotos
    });

    const res = await fetch(`${SCRIPT_URL}?${params.toString()}`);
    const json = await res.json();

    if (json.success) {
      alert("All changes saved to sheet!");
      loadAllAlerts();
      closeBlurModal();
    } else {
      alert("Sheet update failed: " + (json.error || "Unknown"));
    }
  } catch (err) {
    console.error("Final save error:", err);
    alert("Failed to save changes – check console.");
  }
}

function closeBlurModal() {
  document.getElementById('blur-modal').style.display = 'none';
  rects = [];
  currentEditingAlert = null;
  currentPhotoUrls = [];
  currentPhotoIndex = 0;
}


// ────────────────────────────────────────────────
// Live Cameras Section – horizontal scroll + add/remove
// ────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Load saved cameras from sheet when page loads
  loadSavedCameras();

  // Handle add camera form
  document.getElementById('add-camera-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const name = formData.get('name').trim();
    const url = formData.get('url').trim();

    if (!name || !url) {
      alert("Please fill both name and URL.");
      return;
    }

    const params = new URLSearchParams({
      action: 'add-camera',
      name: name,
      url: url
    });

    try {
      const res = await fetch(`${SCRIPT_URL}?${params}`);
      const result = await res.json();
      if (result.success) {
        alert("Camera added!");
        e.target.reset();
        loadSavedCameras(); // refresh list
      } else {
        alert("Failed: " + (result.error || "Unknown"));
      }
    } catch (err) {
      console.error(err);
      alert("Network error – try again.");
    }
  });
});

// Load and display saved cameras
async function loadSavedCameras() {
  try {
    const res = await fetch(`${SCRIPT_URL}?action=get-cameras`);
    const data = await res.json();

    if (!data.success) {
      console.error("Failed to load cameras:", data.error);
      return;
    }

    const container = document.getElementById('camera-scroll-container');
    container.innerHTML = ''; // clear existing

    if (data.cameras.length === 0) {
      container.innerHTML = '<p style="color:#777; text-align:center; width:100%;">No cameras added yet.</p>';
      return;
    }

    data.cameras.forEach(cam => {
      const div = document.createElement('div');
      div.style.cssText = 'flex:0 0 320px; text-align:center; background:#fff; padding:10px; border-radius:8px; border:1px solid #ddd; box-shadow:0 2px 8px rgba(0,0,0,0.1);';
      div.innerHTML = `
        <h4 style="margin:0 0 8px 0; font-size:1.1em;">${cam.name}</h4>
        <img id="cam-${cam.id}" 
             src="${cam.url}" 
             style="width:100%; border:3px solid #006633; border-radius:8px;" 
             alt="Live cam ${cam.name}">
        <button onclick="removeCamera('${cam.id}')" 
                style="margin-top:10px; background:#dc3545; color:white; padding:6px 12px; border:none; border-radius:4px; cursor:pointer;">
          Remove
        </button>
      `;
      container.appendChild(div);

      // Auto-refresh this image every 60 seconds
      setInterval(() => {
        const img = document.getElementById(`cam-${cam.id}`);
        if (img) {
          img.src = img.src.split('?')[0] + '?' + new Date().getTime();
        }
      }, 60000);
    });
  } catch (err) {
    console.error("Load cameras error:", err);
  }
}

// Remove camera by ID
async function removeCamera(id) {
  if (!confirm("Remove this camera?")) return;

  const params = new URLSearchParams({
    action: 'remove-camera',
    id: id
  });

  try {
    const res = await fetch(`${SCRIPT_URL}?${params}`);
    const result = await res.json();
    if (result.success) {
      alert("Camera removed.");
      loadSavedCameras();
    } else {
      alert("Failed: " + (result.error || "Unknown"));
    }
  } catch (err) {
    console.error(err);
    alert("Network error.");
  }
}
