// sa-incident-tracker/js/map.js
const MAP_CENTER = [-29.85, 31.03];  // Durban approx
const DEFAULT_ZOOM = 11;

const alertColors = {
  crime:       { fill: "#d32f2f", border: "#b71c1c" },
  protest:     { fill: "#1976d2", border: "#0d47a1" },
  "mass-action":{ fill: "#f57c00", border: "#ef6c00" },
  riot:        { fill: "#7b1fa2", border: "#4a148c" },
  disruption:  { fill: "#fbc02d", border: "#f9a825" },
  suspicious:  { fill: "#795548", border: "#4e342e" },
  other:       { fill: "#757575", border: "#424242" }
};

let mapInstance = null;
let markersCluster = null;

function initMap(containerId = 'map') {
  if (mapInstance) return mapInstance;

  mapInstance = L.map(containerId, {
    center: MAP_CENTER,
    zoom: DEFAULT_ZOOM,
    maxZoom: 19,          // ← Add this line (or 18/20 depending on your tiles)
    minZoom: 3            // Optional but good practice
  });
  
  markersCluster = L.markerClusterGroup({
    maxClusterRadius: 50,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true
  });
  mapInstance.addLayer(markersCluster);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19           // ← Make sure the tile layer also declares it
  }).addTo(mapInstance);

  return mapInstance;
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
    ${alert.description ? alert.description.substring(0,120) + '...' : ''}<br>
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
  if (bounds.isValid()) mapInstance.fitBounds(bounds, { padding: [60, 60] });
}
