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
    console.log("Form submit event triggered");

    // Show previews of selected photos (mobile-friendly)
    const previewDiv = document.getElementById('photo-preview');
    previewDiv.innerHTML = '';

    let photoUrls = [];

    for (let i = 1; i <= 3; i++) {
      const fileInput = document.getElementById(`photo${i}`);
      if (fileInput && fileInput.files && fileInput.files.length > 0) {
        const file = fileInput.files[0];
        console.log(`Photo ${i} selected:`, file.name, file.size, file.type);

        // Show preview thumbnail
        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        img.style.width = '80px';
        img.style.height = '80px';
        img.style.objectFit = 'cover';
        img.style.borderRadius = '6px';
        img.style.border = '2px solid #006633';
        previewDiv.appendChild(img);

        const uploadFormData = new FormData();
        uploadFormData.append("image", file);
        uploadFormData.append("key", "ccb5d3992f0066955a63d303a75c32a0");

        try {
          console.log(`Uploading photo ${i}...`);
          const uploadResponse = await fetch("https://api.imgbb.com/1/upload", {
            method: "POST",
            body: uploadFormData
          });

          console.log(`Upload HTTP status for photo ${i}:`, uploadResponse.status);

          const uploadResult = await uploadResponse.json();
          console.log(`Full ImgBB response for photo ${i}:`, JSON.stringify(uploadResult));

          if (uploadResult.success && uploadResult.data && uploadResult.data.url) {
            photoUrls.push(uploadResult.data.url);
            console.log(`Photo ${i} success: ${uploadResult.data.url}`);
          } else {
            console.error(`Photo ${i} failed:`, uploadResult.error || "No success");
            alert(`Photo ${i} upload failed – continuing without it.`);
          }
        } catch (uploadErr) {
          console.error(`Photo ${i} error:`, uploadErr);
          alert(`Could not upload photo ${i} – continuing without it.`);
        }
      }
    }

    console.log("All uploaded photo URLs:", photoUrls);

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

    console.log("FINAL PARAMS BEFORE SEND:", params.toString());

    try {
      const response = await fetch(`${SCRIPT_URL}?${params.toString()}`);
      console.log("Fetch response status:", response.status);

      const result = await response.json();
      console.log("FULL SERVER RESPONSE:", result);

      if (result.success) {
        messageDiv.textContent = "Report submitted successfully — awaiting moderation.";
        messageDiv.style.color = "#28a745";
        messageDiv.style.display = "block";
        form.reset();
        previewDiv.innerHTML = ''; // clear previews
        for (let i = 1; i <= 3; i++) {
          const input = document.getElementById(`photo${i}`);
          if (input) input.value = "";
        }
      } else {
        messageDiv.textContent = "Submission failed: " + (result.error || "Unknown");
        messageDiv.style.color = "#dc3545";
        messageDiv.style.display = "block";
      }
    } catch (err) {
      console.error("Submit network error:", err);
      messageDiv.textContent = "Network error — please try again later.";
      messageDiv.style.color = "#dc3545";
      messageDiv.style.display = "block";
    }

    setTimeout(() => {
      messageDiv.style.display = "none";
    }, 8000);
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
