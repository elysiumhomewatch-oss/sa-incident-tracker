// sa-incident-tracker/js/public.js
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxwR8LmQ1zBjLWJVu9gXGwwT2wyXSsp3q4WcQT1Rb6dRIk9gvbiiZNJbUcwttMQ4ostdQ/exec";  // ← replace !



  // Submit form handler (assuming you add form id="submit-form" in index.html)

document.addEventListener('DOMContentLoaded', () => {
  initMap();
  loadPublicAlerts();

  function showAddReportModal(lat, lng) {
  const modal = document.getElementById('add-report-modal');
  const coordsDisplay = document.getElementById('modal-coords-display');
  const confirmBtn = document.getElementById('modal-confirm-btn');
  const cancelBtn = document.getElementById('modal-cancel-btn');

  if (!modal) {
    console.warn("Add-report modal not found in DOM");
    return;
  }

  // Show coordinates
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

      // Optional: focus first required field after coords
      document.querySelector('#submit-report-form select')?.focus();
    }

    modal.style.display = 'none';
    confirmBtn.removeEventListener('click', onConfirm);
  };

  // Cancel → remove temp marker + close
  const onCancel = () => {
    if (window.tempMarker) {
      mapInstance.removeLayer(window.tempMarker);
      window.tempMarker = null;
    }
    modal.style.display = 'none';
    cancelBtn.removeEventListener('click', onCancel);
  };

  confirmBtn.addEventListener('click', onConfirm);
  cancelBtn.addEventListener('click', onCancel);
}

  const form = document.getElementById('submit-report-form');
  const messageDiv = document.getElementById('submit-message');

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const formData = new FormData(form);
      const params = new URLSearchParams();

      for (const [key, value] of formData.entries()) {
        params.append(key, value.trim());
      }

      params.append('action', 'submit-alert');

      try {
        const response = await fetch(`${SCRIPT_URL}?${params.toString()}`);
        const result = await response.json();

        if (result.success) {
          messageDiv.textContent = "Report submitted successfully — awaiting moderation.";
          messageDiv.style.color = "#28a745";
          messageDiv.style.display = "block";
          form.reset();
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

      // Auto-hide message after 8 seconds
      setTimeout(() => {
        messageDiv.style.display = "none";
      }, 8000);
    });
  }
});
});

async function loadPublicAlerts() {
  try {
    const res = await fetch(`${SCRIPT_URL}?action=get-alerts&filter=approved`);
    const data = await res.json();
    if (!data.success) throw new Error("Load failed");

    markersCluster.clearLayers();
    data.alerts.forEach(addMarkerToCluster);
    fitToMarkers();
  } catch (err) {
    console.error(err);
    // Optional: show message on page
  }
}

function showAddReportModal(lat, lng) {
  const modal = document.getElementById('add-report-modal');
  const coordsP = document.getElementById('modal-coords');
  const confirmBtn = document.getElementById('modal-confirm');
  const cancelBtn = document.getElementById('modal-cancel');

  if (!modal) return; // fallback if modal HTML missing

  coordsP.textContent = `Latitude: ${lat}\nLongitude: ${lng}`;

  modal.style.display = 'flex';

  const confirmHandler = () => {
    const latInput = document.getElementById('lat');
    const lngInput = document.getElementById('lng');
    if (latInput && lngInput) {
      latInput.value = lat;
      lngInput.value = lng;
      document.getElementById('submit-report-form')?.scrollIntoView({ behavior: 'smooth' });
    }
    modal.style.display = 'none';
    confirmBtn.removeEventListener('click', confirmHandler);
  };

  const cancelHandler = () => {
    if (tempMarker) {
      mapInstance.removeLayer(tempMarker);
      tempMarker = null;
    }
    modal.style.display = 'none';
    cancelBtn.removeEventListener('click', cancelHandler);
  };

  confirmBtn.addEventListener('click', confirmHandler);
  cancelBtn.addEventListener('click', cancelHandler);
}
