// sa-incident-tracker/js/public.js
const SCRIPT_URL = "YOUR_SCRIPT_URL_HERE";  // ← replace !

document.addEventListener('DOMContentLoaded', () => {
  initMap();

  loadPublicAlerts();

  // Submit form handler (assuming you add form id="submit-form" in index.html)
  const form = document.getElementById('submit-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const params = new URLSearchParams();
      for (const [k, v] of formData) params.append(k, v);

      params.append('action', 'submit-alert');

      try {
        const res = await fetch(`${SCRIPT_URL}?${params}`);
        const data = await res.json();
        if (data.success) {
          alert("Report submitted! It will appear after moderation.");
          form.reset();
        } else {
          alert("Error: " + (data.error || "Unknown"));
        }
      } catch (err) {
        alert("Network error – try again later.");
      }
    });
  }
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
