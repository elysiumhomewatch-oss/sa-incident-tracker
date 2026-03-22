// sa-incident-tracker/js/public.js

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxwR8LmQ1zBjLWJVu9gXGwwT2wyXSsp3q4WcQT1Rb6dRIk9gvbiiZNJbUcwttMQ4ostdQ/exec";

document.addEventListener('DOMContentLoaded', () => {
  initMap();
  
  // IMPORTANT: This enables the click-to-report feature on the map
  enableReportClick();

  loadPublicAlerts();

  const form = document.getElementById('submit-report-form');
  const messageDiv = document.getElementById('submit-message');

  // ────────────────────────────────────────────────
if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    console.log("Form submit triggered");

    const previewDiv = document.getElementById('photo-preview');
    previewDiv.innerHTML = '';

    let photoUrls = [];
    let photoBlobs = []; // resized blobs ready to upload

    // Collect from both inputs (camera and gallery)
    const inputs = [document.getElementById('photo-input-1'), document.getElementById('photo-input-2')];
    let photoCount = 0;

    for (let input of inputs) {
      if (input && input.files && input.files.length > 0) {
        const file = input.files[0];
        console.log(`Photo selected: ${file.name}, size: ${(file.size / 1024).toFixed(1)} KB`);

        // Resize & compress
        const resizedBlob = await resizeAndCompressImage(file, 800, 0.7); // max 800px width, 70% quality
        if (resizedBlob) {
          photoBlobs.push(resizedBlob);
          photoCount++;

          // Show preview
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

    if (photoCount > 3) {
      alert("Maximum 3 photos allowed. Only the first 3 will be used.");
      photoBlobs = photoBlobs.slice(0, 3);
    }

    console.log(`Prepared ${photoBlobs.length} resized photos for upload`);

    // Upload resized blobs
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
          console.log(`Photo ${i+1} uploaded: ${json.data.url}`);
        } else {
          console.error(`Photo ${i+1} upload failed:`, json.error);
          alert(`Photo ${i+1} upload failed – continuing without it.`);
        }
      } catch (err) {
        console.error(`Photo ${i+1} error:`, err);
        alert(`Could not upload photo ${i+1} – continuing without it.`);
      }
    }

    // Build params
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
        previewDiv.innerHTML = '';
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

      canvas.toBlob(
        (blob) => resolve(blob),
        'image/jpeg',
        quality
      );
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
});

// ────────────────────────────────────────────────
// Modal handler for "Add report here?"
// ────────────────────────────────────────────────
function showAddReportModal(lat, lng) {
  const modal = document.getElementById('add-report-modal');
  const coordsDisplay = document.getElementById('modal-coords-display');
  const confirmBtn = document.getElementById('modal-confirm-btn');
  const cancelBtn = document.getElementById('modal-cancel-btn');

  if (!modal) {
    console.warn("Add-report modal not found in DOM");
    return;
  }

  // Show coordinates in modal
  coordsDisplay.textContent = `Latitude:  ${lat}\nLongitude: ${lng}`;

  // Show modal
  modal.style.display = 'flex';

  // Confirm → fill form + close modal
  const onConfirm = () => {
    const latField = document.getElementById('lat');
    const lngField = document.getElementById('lng');
    const formElement = document.getElementById('submit-report-form');

    if (latField && lngField) {
      latField.value = lat;
      lngField.value = lng;

      // Scroll to form smoothly
      formElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Optional: focus the type dropdown after filling coords
      document.querySelector('#submit-report-form select')?.focus();
    }

    modal.style.display = 'none';
    confirmBtn.removeEventListener('click', onConfirm);
  };

  // Cancel → remove temp marker + close
  const onCancel = () => {
    if (window.tempMarker) {
      window.mapInstance.removeLayer(window.tempMarker);
      window.tempMarker = null;
    }
    modal.style.display = 'none';
    cancelBtn.removeEventListener('click', onCancel);
  };

  // Attach listeners (once per modal open)
  confirmBtn.addEventListener('click', onConfirm);
  cancelBtn.addEventListener('click', onCancel);
}

// ────────────────────────────────────────────────
// Load approved alerts only
// ────────────────────────────────────────────────
async function loadPublicAlerts() {
  try {
    const res = await fetch(`${SCRIPT_URL}?action=get-alerts&filter=approved`);
    const data = await res.json();

    if (!data.success) {
      throw new Error("Load failed: " + (data.error || "Unknown response"));
    }

    markersCluster.clearLayers();
    data.alerts.forEach(addMarkerToCluster);
    fitToMarkers();
  } catch (err) {
    console.error("Public alerts load error:", err);
    // Optional: show user message on page
  }
}
