// sa-incident-tracker/js/map.js

const MAP_CENTER = [-29.85, 31.03];  // Durban approx
const DEFAULT_ZOOM = 11;

// Brighter, more visible colors for markers & clusters
const alertColors = {
  crime:       { fill: "#ff5252", border: "#c62828" },
  protest:     { fill: "#448aff", border: "#1565c0" },
  "mass-action":{ fill: "#ffab40", border: "#ef6c00" },
  riot:        { fill: "#ab47bc", border: "#6a1b9a" },
  disruption:  { fill: "#ffeb3b", border: "#f9a825" },
  suspicious:  { fill: "#a1887f", border: "#5d4037" },
  other:       { fill: "#90a4ae", border: "#455a64" }
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
    zoomToBoundsOnClick: true,

    iconCreateFunction: function(cluster) {
      const count = cluster.getChildCount();

      const childMarkers = cluster.getAllChildMarkers();
      const typeCounts = {};
      childMarkers.forEach(m => {
        const t = m.options.alertType || 'other';
        typeCounts[t] = (typeCounts[t] || 0) + 1;
      });

      let dominantType = 'other';
      let maxCount = 0;
      for (const t in typeCounts) {
        if (typeCounts[t] > maxCount) {
          maxCount = typeCounts[t];
          dominantType = t;
        }
      }

      const colorInfo = alertColors[dominantType] || alertColors.other;

      return L.divIcon({
        html: `
          <div style="
            background-color: ${colorInfo.fill};
            color: white;
            width: 44px;
            height: 44px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 16px;
            border: 3px solid ${colorInfo.border};
            box-shadow: 0 2px 8px rgba(0,0,0,0.35);
            text-shadow: 0 0 4px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.7);
          ">
            ${count}
          </div>
        `,
        className: '',
        iconSize: [44, 44]
      });
    }
  });

  window.mapInstance.addLayer(markersCluster);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19
  }).addTo(window.mapInstance);

  enableReportClick();

  return window.mapInstance;
}

function enableReportClick() {
  if (clickListener) {
    window.mapInstance.off('click', clickListener);
  }

  clickListener = function(e) {
    const lat = e.latlng.lat.toFixed(5);
    const lng = e.latlng.lng.toFixed(5);

    if (window.tempMarker) {
      window.mapInstance.removeLayer(window.tempMarker);
    }

    window.tempMarker = L.circleMarker([lat, lng], {
      radius: 8,
      fillColor: "#3388ff",
      color: "#ffffff",
      weight: 3,
      opacity: 1,
      fillOpacity: 0.8
    }).addTo(window.mapInstance);

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

  // ────────────────────────────────────────────────
  // UPDATED POPUP – now supports multiple photos
  // Assumes your sheet has columns: photo (H), photo2 (L), photo3 (M)
  // You can add more (photo4, photo5, etc.) the same way
  // ────────────────────────────────────────────────
  const popupContent = `
    <b>${alert.type?.toUpperCase() || 'OTHER'} - ${alert.area || 'Unknown'}</b><br>
    ${alert.timestamp || '—'}<br>
    ${alert.description ? alert.description.substring(0,120) + '...' : ''}<br>
    Reporter: ${alert.reporter || 'Anonymous'}<br>
    Status: ${alert.status}<br>
    ${alert.social ? `<a href="${alert.social}" target="_blank" style="color:#1976d2;">X / Social evidence →</a><br>` : ''}
    
    <!-- Single photo (existing column H) -->
    ${alert.photo ? 
      `<a href="${alert.photo}" target="_blank" style="color:#d81b60; font-weight:bold;">View Photo 1 →</a><br>` 
      : ''}

    <!-- Photo 2 (column L) -->
    ${alert.photo2 ? 
      `<a href="${alert.photo2}" target="_blank" style="color:#d81b60; font-weight:bold;">View Photo 2 →</a><br>` 
      : ''}

    <!-- Photo 3 (column M) -->
    ${alert.photo3 ? 
      `<a href="${alert.photo3}" target="_blank" style="color:#d81b60; font-weight:bold;">View Photo 3 →</a>` 
      : ''}
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
