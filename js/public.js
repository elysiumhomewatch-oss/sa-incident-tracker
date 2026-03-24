// sa-incident-tracker/js/public.js
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxwR8LmQ1zBjLWJVu9gXGwwT2wyXSsp3q4WcQT1Rb6dRIk9gvbiiZNJbUcwttMQ4ostdQ/exec";

document.addEventListener('DOMContentLoaded', () => {
  initMap();
  enableReportClick();
  loadPublicAlerts();

  const form = document.getElementById('submit-report-form');
  const messageDiv = document.getElementById('submit-message');

  // ==================== MAP RESIZE HANDLE ====================
  const mapContainer = document.getElementById('map-container');
  const mapDiv = document.getElementById('map');
  const resizeHandle = document.getElementById('resize-handle');

  let isResizing = false;
  let startY, startHeight;

  if (resizeHandle) {
    // Mouse drag
    resizeHandle.addEventListener('mousedown', (e) => {
      isResizing = true;
      startY = e.clientY;
      startHeight = mapDiv.clientHeight;
      document.body.style.cursor = 'nwse-resize';
      e.preventDefault();
    });

    // Touch drag (mobile)
    resizeHandle.addEventListener('touchstart', (e) => {
      isResizing = true;
      startY = e.touches[0].clientY;
      startHeight = mapDiv.clientHeight;
      e.preventDefault();
    });
  }

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const deltaY = e.clientY - startY;
    let newHeight = startHeight + deltaY;
    if (newHeight < 300) newHeight = 300;
    if (newHeight > window.innerHeight * 0.85) newHeight = window.innerHeight * 0.85;

    mapDiv.style.height = newHeight + 'px';
    if (window.mapInstance) window.mapInstance.invalidateSize();
  });

  document.addEventListener('touchmove', (e) => {
    if (!isResizing) return;
    const deltaY = e.touches[0].clientY - startY;
    let newHeight = startHeight + deltaY;
    if (newHeight < 300) newHeight = 300;
    if (newHeight > window.innerHeight * 0.85) newHeight = window.innerHeight * 0.85;

    mapDiv.style.height = newHeight + 'px';
    if (window.mapInstance) window.mapInstance.invalidateSize();
  });

  document.addEventListener('mouseup', () => {
    isResizing = false;
    document.body.style.cursor = 'default';
  });

  document.addEventListener('touchend', () => {
    isResizing = false;
  });

  // ==================== FORM SUBMIT ====================
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      console.log("Form submit triggered");

      const previewDiv = document.getElementById('photo-preview');
      if (previewDiv) previewDiv.innerHTML = '';

      let photoUrls = [];
      let photoBlobs = [];

      // Collect from camera and gallery inputs
      for (let slot = 1; slot <= 3; slot++) {
        const cameraInput = document.getElementById(`photo${slot}-camera`);
        const galleryInput = document.getElementById(`photo${slot}-gallery`);

        let file = null;
        if (cameraInput && cameraInput.files && cameraInput.files.length > 0) {
          file = cameraInput.files[0];
        } else if (galleryInput && galleryInput.files && galleryInput.files.length > 0) {
          file = galleryInput.files[0];
        }

        if (file) {
          console.log(`Photo ${slot} selected: ${file.name}, size: ${(file.size / 1024).toFixed(1)} KB`);

          const resizedBlob = await resizeAndCompressImage(file, 800, 0.7);
          if (resizedBlob) {
            photoBlobs.push(resizedBlob);

            if (previewDiv) {
              const img = document.createElement('img');
              img.src = URL.createObjectURL(resizedBlob);
              img.style.width = '80px';
              img.style.height = '80px';
              img.style.objectFit = 'cover';
              img.style.borderRadius = '6px';
              img.style.border = '2px solid #006633';
              previewDiv.appendChild(img);
            }
          }
        }
      }

      if (photoBlobs.length > 3) {
        alert("Maximum 3 photos allowed. Using first 3.");
        photoBlobs = photoBlobs.slice(0, 3);
      }

      console.log(`Prepared ${photoBlobs.length} resized photos for upload`);

      // Upload to ImgBB
      for (let i = 0; i < photoBlobs.length; i++) {
        const blob = photoBlobs[i];
        const uploadFormData = new FormData();
        uploadFormData.append("image", blob, `photo-${i+1}.jpg`);
        uploadFormData.append("key", "ccb5d3992f0066955a63d303a75c32a0");

        try {
          console.log(`Uploading photo ${i+1}...`);
          const res = await fetch("https://api.imgbb.com/1/upload", {
            method: "POST",
            body: uploadFormData
          });

          const json = await res.json();
          console.log(`ImgBB response for photo ${i+1}:`, json);

          if (json.success && json.data?.url) {
            photoUrls.push(json.data.url);
            console.log(`Photo ${i+1} uploaded successfully`);
          } else {
            console.error(`Photo ${i+1} upload failed:`, json.error);
            alert(`Photo ${i+1} upload failed – continuing without it.`);
          }
        } catch (err) {
          console.error(`Photo ${i+1} error:`, err);
          alert(`Could not upload photo ${i+1} – continuing without it.`);
        }
      }

      // Build params and submit
      const formData = new FormData(form);
      const params = new URLSearchParams();

      for (const [key, value] of formData.entries()) {
        params.append(key, value.trim());
      }

      photoUrls.forEach((url, idx) => {
        params.append(`photo${idx + 1}`, url);
      });

      params.append('action', 'submit-alert');

      console.log("FINAL PARAMS:", params.toString());

      try {
        const response = await fetch(`${SCRIPT_URL}?${params.toString()}`);
        const result = await response.json();

        if (result.success) {
          messageDiv.textContent = "Report submitted successfully — awaiting moderation.";
          messageDiv.style.color = "#28a745";
          messageDiv.style.display = "block";
          form.reset();
          if (previewDiv) previewDiv.innerHTML = '';

          // Clear inputs
          for (let slot = 1; slot <= 3; slot++) {
            const cam = document.getElementById(`photo${slot}-camera`);
            const gal = document.getElementById(`photo${slot}-gallery`);
            if (cam) cam.value = '';
            if (gal) gal.value = '';
          }
        } else {
          messageDiv.textContent = "Submission failed: " + (result.error || "Unknown");
          messageDiv.style.color = "#dc3545";
          messageDiv.style.display = "block";
        }
      } catch (err) {
        console.error("Submit error:", err);
        messageDiv.textContent = "Network error — please try again later.";
        messageDiv.style.color = "#dc3545";
        messageDiv.style.display = "block";
      }

      setTimeout(() => { messageDiv.style.display = "none"; }, 8000);
    });
  }
});

// Resize and compress image client-side
async function resizeAndCompressImage(file, maxWidth = 800, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// Modal handler
function showAddReportModal(lat, lng) {
  const modal = document.getElementById('add-report-modal');
  const coordsDisplay = document.getElementById('modal-coords-display');
  const confirmBtn = document.getElementById('modal-confirm-btn');
  const cancelBtn = document.getElementById('modal-cancel-btn');

  if (!modal) {
    console.warn("Add-report modal not found");
    return;
  }

  coordsDisplay.textContent = `Latitude: ${lat}\nLongitude: ${lng}`;
  modal.style.display = 'flex';

  const onConfirm = () => {
    const latField = document.getElementById('lat');
    const lngField = document.getElementById('lng');
    if (latField && lngField) {
      latField.value = lat;
      lngField.value = lng;
      document.getElementById('submit-report-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    modal.style.display = 'none';
    confirmBtn.removeEventListener('click', onConfirm);
  };

  const onCancel = () => {
    if (window.tempMarker && window.mapInstance) {
      window.mapInstance.removeLayer(window.tempMarker);
      window.tempMarker = null;
    }
    modal.style.display = 'none';
    cancelBtn.removeEventListener('click', onCancel);
  };

  confirmBtn.addEventListener('click', onConfirm);
  cancelBtn.addEventListener('click', onCancel);
}

// Load approved alerts
async function loadPublicAlerts() {
  try {
    const res = await fetch(`${SCRIPT_URL}?action=get-alerts&filter=approved`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "Unknown response");

    markersCluster.clearLayers();
    data.alerts.forEach(addMarkerToCluster);
    fitToMarkers();
  } catch (err) {
    console.error("Public alerts load error:", err);
  }
}

  // ==================== MAP RESIZE HANDLE ====================
  const resizeHandle = document.getElementById('resize-handle');
  const mapDiv = document.getElementById('map');

  let isResizing = false;
  let startY, startHeight;

  if (resizeHandle) {
    resizeHandle.addEventListener('mousedown', (e) => {
      isResizing = true;
      startY = e.clientY;
      startHeight = mapDiv.clientHeight;
      document.body.style.cursor = 'nwse-resize';
      e.preventDefault();
    });

    resizeHandle.addEventListener('touchstart', (e) => {
      isResizing = true;
      startY = e.touches[0].clientY;
      startHeight = mapDiv.clientHeight;
      e.preventDefault();
    });
  }

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const deltaY = e.clientY - startY;
    let newHeight = startHeight + deltaY;
    if (newHeight < 300) newHeight = 300;
    if (newHeight > window.innerHeight * 0.8) newHeight = window.innerHeight * 0.8;

    mapDiv.style.height = newHeight + 'px';
    if (window.mapInstance) window.mapInstance.invalidateSize();
  });

  document.addEventListener('touchmove', (e) => {
    if (!isResizing) return;
    const deltaY = e.touches[0].clientY - startY;
    let newHeight = startHeight + deltaY;
    if (newHeight < 300) newHeight = 300;
    if (newHeight > window.innerHeight * 0.8) newHeight = window.innerHeight * 0.8;

    mapDiv.style.height = newHeight + 'px';
    if (window.mapInstance) window.mapInstance.invalidateSize();
  });

  document.addEventListener('mouseup', () => { isResizing = false; document.body.style.cursor = 'default'; });
  document.addEventListener('touchend', () => { isResizing = false; });


