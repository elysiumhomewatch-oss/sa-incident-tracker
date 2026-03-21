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
// Submit form handler – with ImgBB photo upload
// ────────────────────────────────────────────────
if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const fileInput = document.getElementById('photo-upload');
    let photoUrl = "";

    // ────────────────────────────────────────────────
    // NEW: Photo upload to ImgBB (if a file is selected)
    // ────────────────────────────────────────────────
    if (fileInput && fileInput.files.length > 0) {
      const file = fileInput.files[0];
      const uploadFormData = new FormData();
      uploadFormData.append("image", file);
      uploadFormData.append("key", "YOUR_IMGBB_API_KEY_HERE"); // ← Paste your real ImgBB key here

      try {
        const uploadResponse = await fetch("https://api.imgbb.com/1/upload", {
          method: "POST",
          body: uploadFormData
        });

        const uploadResult = await uploadResponse.json();

        if (uploadResult.success) {
          photoUrl = uploadResult.data.url; // direct image URL
          console.log("Photo uploaded successfully:", photoUrl);
        } else {
          console.error("ImgBB upload failed:", uploadResult.error);
          alert("Photo upload failed: " + (uploadResult.error?.message || "Unknown error"));
          // You can choose to continue without photo or stop here
          // return; // ← uncomment if you want to block submit on upload fail
        }
      } catch (uploadErr) {
        console.error("Photo upload network error:", uploadErr);
        alert("Could not upload photo — continuing without it.");
      }
    }

    // ────────────────────────────────────────────────
    // Prepare normal form data (including photo URL if uploaded)
    // ────────────────────────────────────────────────
    const formData = new FormData(form);
    const params = new URLSearchParams();

    for (const [key, value] of formData.entries()) {
      // If photo URL was uploaded, override any empty photo field
      if (key === "photo" && photoUrl) {
        params.append(key, photoUrl);
      } else {
        params.append(key, value.trim());
      }
    }

    params.append('action', 'submit-alert');

    // ────────────────────────────────────────────────
    // Send to Apps Script (same as before)
    // ────────────────────────────────────────────────
    try {
      const response = await fetch(`${SCRIPT_URL}?${params.toString()}`);
      const result = await response.json();

      if (result.success) {
        messageDiv.textContent = "Report submitted successfully — awaiting moderation.";
        messageDiv.style.color = "#28a745";
        messageDiv.style.display = "block";
        form.reset();
        // Optional: clear file input visually
        if (fileInput) fileInput.value = "";
      } else {
        messageDiv.textContent = "Submission failed: " + (result.error || "Unknown error");
        messageDiv.style.color = "#dc3545";
        messageDiv.style.display = "block";
      }
    } catch (err) {
      console.error("Submit error:", err);
      messageDiv.textContent = "Network error — please try again later.";
      messageDiv.style.color = "#dc3545";
      messageDiv.style.display = "block";
    }

    // Auto-hide message
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
