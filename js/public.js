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

    // ────────────────────────────────────────────────
    // Upload up to 3 photos to ImgBB
    // ────────────────────────────────────────────────
    let photoUrls = [];

    for (let i = 1; i <= 3; i++) {
      const fileInput = document.getElementById(`photo${i}`);
      if (fileInput && fileInput.files && fileInput.files.length > 0) {
        const file = fileInput.files[0];
        console.log(`Preparing to upload photo ${i}: ${file.name}`);

        const uploadFormData = new FormData();
        uploadFormData.append("image", file);
        uploadFormData.append("key", "ccb5d3992f0066955a63d303a75c32a0"); // your ImgBB key

        try {
          const uploadResponse = await fetch("https://api.imgbb.com/1/upload", {
            method: "POST",
            body: uploadFormData
          });

          const uploadResult = await uploadResponse.json();
          console.log(`ImgBB response for photo ${i}:`, uploadResult);

          if (uploadResult.success && uploadResult.data && uploadResult.data.url) {
            photoUrls.push(uploadResult.data.url);
            console.log(`Photo ${i} uploaded successfully: ${uploadResult.data.url}`);
          } else {
            console.error(`Photo ${i} upload failed:`, uploadResult.error || uploadResult);
            alert(`Photo ${i} upload failed — continuing without it.`);
          }
        } catch (uploadErr) {
          console.error(`Photo ${i} network/upload error:`, uploadErr);
          alert(`Could not upload photo ${i} — continuing without it.`);
        }
      }
    }

    // ────────────────────────────────────────────────
    // Prepare form data + add photo URLs as photo1, photo2, photo3
    // ────────────────────────────────────────────────
    const formData = new FormData(form);
    const params = new URLSearchParams();

    for (const [key, value] of formData.entries()) {
      params.append(key, value.trim());
    }

    // Add each uploaded photo URL as separate params (Apps Script expects photo1, photo2, photo3)
    photoUrls.forEach((url, idx) => {
      params.append(`photo${idx + 1}`, url);
    });

    params.append('action', 'submit-alert');

    console.log("Final params being sent:", params.toString());

    // ────────────────────────────────────────────────
    // Send to Apps Script
    // ────────────────────────────────────────────────
    try {
      const response = await fetch(`${SCRIPT_URL}?${params.toString()}`);
      const result = await response.json();

      console.log("Server response:", result);

      if (result.success) {
        messageDiv.textContent = "Report submitted successfully — awaiting moderation.";
        messageDiv.style.color = "#28a745";
        messageDiv.style.display = "block";
        form.reset();

        // Clear file inputs visually
        for (let i = 1; i <= 3; i++) {
          const input = document.getElementById(`photo${i}`);
          if (input) input.value = "";
        }
      } else {
        messageDiv.textContent = "Submission failed: " + (result.error || "Unknown error");
        messageDiv.style.color = "#dc3545";
        messageDiv.style.display = "block";
      }
    } catch (err) {
      console.error("Submit network error:", err);
      messageDiv.textContent = "Network error — please try again later.";
      messageDiv.style.color = "#dc3545";
      messageDiv.style.display = "block";
    }

    // Auto-hide message after 8 seconds
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
