// sa-incident-tracker/js/map.js

const MAP_CENTER = [-29.85, 31.03];  // Durban approx
const DEFAULT_ZOOM = 11;

const alertColors = {
  crime:       { fill: "#ff5252", border: "#c62828" },      // bright red
  protest:     { fill: "#448aff", border: "#1565c0" },      // bright blue
  "mass-action":{ fill: "#ffab40", border: "#ef6c00" },     // bright orange
  riot:        { fill: "#ab47bc", border: "#6a1b9a" },      // brighter purple
  disruption:  { fill: "#ffeb3b", border: "#f9a825" },      // vivid yellow
  suspicious:  { fill: "#a1887f", border: "#5d4037" },      // medium brown
  other:       { fill: "#90a4ae", border: "#455a64" }       // cool gray
};

// Global references so public.js can access them
window.mapInstance = null;
window.tempMarker = null;
let markersCluster = null;
let clickListener = null;

function initMap(containerId = 'map') {
  if (window.mapInstance) return window.mapInstance;

  window.mapInstance = L.map(containerId, {
    center: MAP_CENTER,
    zoom: DEFAULT_ZOOM,
    maxZoom: 19,
    minZoom: 3
  });

  markersCluster = L.markerClusterGroup({
    maxClusterRadius: 50,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true
  });

  window.mapInstance.addLayer(markersCluster);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19
  }).addTo(window.mapInstance);

  // Enable click-to-report functionality
  enableReportClick();

  return window.mapInstance;
}

function enableReportClick() {
  // Remove any existing listener to prevent duplicates
  if (clickListener) {
    window.mapInstance.off('click', clickListener);
  }

  clickListener = function(e) {
    const lat = e.latlng.lat.toFixed(5);
    const lng = e.latlng.lng.toFixed(5);

    // Remove previous temp marker if exists
    if (window.tempMarker) {
      window.mapInstance.removeLayer(window.tempMarker);
    }

    // Place small temporary blue marker
    window.tempMarker = L.circleMarker([lat, lng], {
      radius: 8,
      fillColor: "#3388ff",
      color: "#ffffff",
      weight: 3,
      opacity: 1,
      fillOpacity: 0.8
    }).addTo(window.mapInstance);

    // Show the "Add report here?" modal
    showAddReportModal(lat, lng);
  };

  window.mapInstance.on('click', clickListener);
}

function addMarkerToCluster(alert) {
  const lat = parseFloat(alert.lat) || -29.85;
  const lng = parseFloat(alert.lng) || 31.03;
  const color = alertColors[alert.type?.toLowerCase()] || alertColors.other;

  const marker = L.circleMarker([lat, lng], {
    radius: 10,
    fillColor: color.fill,
    color: color.border,
    weight: 2,
    opacity: 1,
    fillOpacity: 0.8
  });

  const popupContent = `
    <b>${alert.type?.toUpperCase() || 'OTHER'} - ${alert.area || 'Unknown'}</b><br>
    ${alert.timestamp || '—'}<br>
    ${alert.description ? alert.description.substring(0, 120) + '...' : ''}<br>
    Reporter: ${alert.reporter || 'Anonymous'}<br>
    Status: ${alert.status}<br>
    ${alert.social ? `<a href="${alert.social}" target="_blank">X / Social evidence</a>` : ''}
  `;

  marker.bindPopup(popupContent);
  marker.options.alertType = alert.type?.toLowerCase() || 'other';
  markersCluster.addLayer(marker);
}

function fitToMarkers() {
  if (!markersCluster || markersCluster.getLayers().length === 0) return;
  const bounds = markersCluster.getBounds();
  if (bounds.isValid()) {
    window.mapInstance.fitBounds(bounds, { padding: [60, 60] });
  }
}
