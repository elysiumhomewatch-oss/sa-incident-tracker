// sa-incident-tracker/js/admin.js

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxwR8LmQ1zBjLWJVu9gXGwwT2wyXSsp3q4WcQT1Rb6dRIk9gvbiiZNJbUcwttMQ4ostdQ/exec";

let allAlerts = [];
let currentEditingAlert = null;
let currentPhotoIndex = 0;
let photoUrls = [];
let rects = []; // rectangles for current photo only
let canvas = null;
let ctx = null;
let isDrawing = false;
let startX, startY;
let currentImage = null;

// Simple auth check
function checkAdminAuth() {
  const auth = localStorage.getItem('adminAuth');
  if (!auth) {
    const password = prompt("Enter admin password:");
    if (password !== "test") { // ← CHANGE THIS to a real password
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

  // Blur modal controls – safe binding
  const cancelBtn = document.getElementById('cancel-blur');
  const clearBtn = document.getElementById('clear-rects');
  const applyBtn = document.getElementById('apply-blur');
  const saveAllBtn = document.getElementById('save-all-close');

  if (cancelBtn) cancelBtn.addEventListener('click', closeBlurModal);
  if (clearBtn) clearBtn.addEventListener('click', clearRects);
  if (applyBtn) applyBtn.addEventListener('click', applyBlurCurrentPhoto);
  if (saveAllBtn) saveAllBtn.addEventListener('click', saveAllAndClose);
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
  if (!tbody) return; // safety

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
          <option value="in-progress" ${alert.status==='in-progress'?'selected':''}>In Progress"</option>
          <option value="resolved"   ${alert.status==='resolved'?'selected':''}>Resolved</option>
        </select>
      </td>
      <td>
        <button class="approve-btn" data-row="${alert.row}">Approve</button>
        <button class="reject-btn"  data-row="${alert.row}">Reject</button>
        ${alert.photos ? `<button class="blur-btn" data-row="${alert.row}" data-alert='${JSON.stringify(alert)}'>Blur Images</button>` : ''}
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

  // Blur button – open editor only if photos exist
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
      loadAllAlerts(); // refresh
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
// Blur Editor – supports multiple photos with navigation
// ────────────────────────────────────────────────
function openBlurEditor(alert) {
  currentEditingAlert = alert;
  currentPhotoIndex = 0;
  rects = [];

  const modal = document.getElementById('blur-modal');
  if (!modal) {
    alert("Blur modal not found in page.");
    return;
  }

  photoUrls = alert.photos ? alert.photos.split(',').map(u => u.trim()).filter(Boolean) : [];
  if (photoUrls.length === 0) {
    alert("No photos to edit in this report.");
    return;
  }

  const totalEl = document.getElementById('total-photos');
  if (totalEl) totalEl.textContent = photoUrls.length;

  updatePhotoDisplay();

  modal.style.display = 'flex';

  canvas = document.getElementById('blur-canvas');
  if (!canvas) {
    console.error("Canvas element not found");
    return;
  }
  ctx = canvas.getContext('2d');

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

  // Navigation buttons
  const prevBtn = document.getElementById('prev-photo');
  const nextBtn = document.getElementById('next-photo');

  if (prevBtn) {
    prevBtn.onclick = () => {
      if (currentPhotoIndex > 0) {
        currentPhotoIndex--;
        updatePhotoDisplay();
      }
    };
  }

  if (nextBtn) {
    nextBtn.onclick = () => {
      if (currentPhotoIndex < photoUrls.length - 1) {
        currentPhotoIndex++;
        updatePhotoDisplay();
      }
    };
  }

  // Other modal buttons
  document.getElementById('cancel-blur')?.onclick = closeBlurModal;
  document.getElementById('clear-rects')?.onclick = clearRects;
  document.getElementById('apply-blur')?.onclick = applyBlurCurrentPhoto;
  document.getElementById('save-all-close')?.onclick = saveAllAndClose;

  // Initial button state
  updateNavButtons();
}

function updatePhotoDisplay() {
  const indexEl = document.getElementById('current-photo-index');
  if (indexEl) indexEl.textContent = currentPhotoIndex + 1;

  rects = []; // reset rects for new photo
  loadAndDrawImage(photoUrls[currentPhotoIndex]);
  updateNavButtons();
}

function updateNavButtons() {
  const prevBtn = document.getElementById('prev-photo');
  const nextBtn = document.getElementById('next-photo');

  if (prevBtn) {
    const disabled = currentPhotoIndex === 0;
    prevBtn.disabled = disabled;
    prevBtn.style.opacity = disabled ? '0.5' : '1';
    prevBtn.style.cursor = disabled ? 'not-allowed' : 'pointer';
  }

  if (nextBtn) {
    const disabled = currentPhotoIndex === photoUrls.length - 1;
    nextBtn.disabled = disabled;
    nextBtn.style.opacity = disabled ? '0.5' : '1';
    nextBtn.style.cursor = disabled ? 'not-allowed' : 'pointer';
  }
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
  if (!currentImage) return;
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

async function applyBlurCurrentPhoto() {
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
    formData.append("image", blob, `blurred-photo-${currentPhotoIndex + 1}.jpg`);
    formData.append("key", "ccb5d3992f0066955a63d303a75c32a0");

    try {
      const res = await fetch("https://api.imgbb.com/1/upload", { method: "POST", body: formData });
      const json = await res.json();

      if (json.success) {
        const newUrl = json.data.url;
        alert(`Blurred photo ${currentPhotoIndex + 1} uploaded!\nNew URL: ${newUrl}`);

        // Replace this photo's URL
        const urls = currentEditingAlert.photos.split(',').map(u => u.trim());
        urls[currentPhotoIndex] = newUrl;
        currentEditingAlert.photos = urls.join(',');

        // Save to sheet
        const params = new URLSearchParams({
          action: 'update-photos',
          row: currentEditingAlert.row,
          photos: currentEditingAlert.photos
        });

        const updateRes = await fetch(`${SCRIPT_URL}?${params}`);
        const updateJson = await updateRes.json();

        if (updateJson.success) {
          alert("Sheet updated with blurred photo!");
          loadAllAlerts(); // refresh
        } else {
          alert("Sheet update failed: " + (updateJson.error || "Unknown"));
        }
      } else {
        alert("Upload failed: " + (json.error?.message || "Unknown"));
      }
    } catch (err) {
      console.error("Blur save error:", err);
      alert("Failed to save blurred photo – check console.");
    }
  }, 'image/jpeg', 0.92);
}

async function saveAllAndClose() {
  if (confirm("Save all changes and close?")) {
    closeBlurModal();
    loadAllAlerts();
  }
}

function closeBlurModal() {
  const modal = document.getElementById('blur-modal');
  if (modal) modal.style.display = 'none';
  rects = [];
}
