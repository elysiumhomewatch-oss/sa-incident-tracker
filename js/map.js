// sa-incident-tracker/js/map.js
const MAP_CENTER = [-29.85, 31.03];
const DEFAULT_ZOOM = 11;

const alertIcons = {
  crime:        { emoji: "🚨", color: "#ff5252", border: "#c62828", label: "Crime" },
  protest:      { emoji: "✊", color: "#448aff", border: "#1565c0", label: "Protest" },
  "mass-action": { emoji: "🚧", color: "#ffab40", border: "#ef6c00", label: "Mass Action" },
  riot:         { emoji: "🔥", color: "#ab47bc", border: "#6a1b9a", label: "Riot" },
  disruption:   { emoji: "🚧", color: "#ffeb3b", border: "#f9a825", label: "Disruption" },
  suspicious:   { emoji: "👀", color: "#a1887f", border: "#5d4037", label: "Suspicious" },
  other:        { emoji: "⚠️", color: "#90a4ae", border: "#455a64", label: "Other" }
};

window.mapInstance = null;
window.tempMarker = null;
let markersCluster = null;
let clickListener = null;
let allMarkers = [];           // Store all markers for filtering
let timeFilterDays = 90;       // Default: last 90 days

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

      const iconInfo = alertIcons[dominantType] || alertIcons.other;

      return L.divIcon({
        html: `<div style="background:${iconInfo.color}; color:white; width:44px; height:44px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:22px; border:3px solid ${iconInfo.border}; box-shadow:0 3px 10px rgba(0,0,0,0.4); text-shadow:0 0 4px rgba(0,0,0,0.8);">${iconInfo.emoji}</div>`,
        className: '',
        iconSize: [44, 44],
        iconAnchor: [22, 22]
      });
    }
  });

  window.mapInstance.addLayer(markersCluster);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19
  }).addTo(window.mapInstance);

  addLegendWithFilters();
  enableReportClick();

  return window.mapInstance;
}

// ==================== LEGEND WITH DATE SLIDER ====================
function addLegendWithFilters() {
  const legend = L.control({ position: 'topright' });

  legend.onAdd = function() {
    const div = L.DomUtil.create('div', 'legend-container');
    div.style.background = 'white';
    div.style.padding = '12px 14px';
    div.style.borderRadius = '8px';
    div.style.boxShadow = '0 3px 12px rgba(0,0,0,0.25)';
    div.style.minWidth = '260px';
    div.style.fontFamily = 'Arial, sans-serif';
    div.style.userSelect = 'none';

    div.innerHTML = `
      <div style="font-weight:bold; margin-bottom:10px; cursor:pointer; display:flex; justify-content:space-between; align-items:center;" id="legend-header">
        <span>🔍 Filter Incidents</span>
        <span id="legend-toggle">▼</span>
      </div>
      <div id="legend-body" style="display:none;">
        <!-- Type Filters -->
        <div style="margin-bottom:15px;">
          <strong>Incident Type</strong><br>
          ${Object.keys(alertIcons).map(type => {
            const info = alertIcons[type];
            return `
              <label style="display:flex; align-items:center; gap:8px; margin:6px 0; font-size:0.95em; cursor:pointer;">
                <input type="checkbox" value="${type}" checked style="accent-color: ${info.color};">
                <span style="font-size:1.3em;">${info.emoji}</span>
                <span>${info.label}</span>
              </label>
            `;
          }).join('')}
        </div>

        <!-- Date Range Slider -->
        <div>
          <strong>Date Range</strong>
          <div style="margin:10px 0;">
            <input type="range" id="date-slider" min="0" max="90" value="90" step="1" style="width:100%;">
            <div style="display:flex; justify-content:space-between; font-size:0.85em; color:#555; margin-top:4px;">
              <span id="date-label">Last 90 days</span>
              <span>All time</span>
            </div>
          </div>
        </div>

        <button id="reset-filters" style="margin-top:15px; width:100%; padding:10px; background:#006633; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:bold;">
          Reset All Filters
        </button>
      </div>
    `;

    L.DomEvent.disableClickPropagation(div);
    L.DomEvent.disableScrollPropagation(div);

    // Toggle legend
    div.querySelector('#legend-header').addEventListener('click', () => {
      const body = div.querySelector('#legend-body');
      const toggle = div.querySelector('#legend-toggle');
      if (body.style.display === 'none') {
        body.style.display = 'block';
        toggle.textContent = '▲';
      } else {
        body.style.display = 'none';
        toggle.textContent = '▼';
      }
    });

    // Type checkboxes
    div.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', applyFilters);
    });

    // Date slider
    const slider = div.querySelector('#date-slider');
    const label = div.querySelector('#date-label');
    slider.addEventListener('input', () => {
      const days = parseInt(slider.value);
      label.textContent = days === 90 ? "Last 90 days" : `Last ${days} days`;
      applyFilters();
    });

    // Reset button
    div.querySelector('#reset-filters').addEventListener('click', () => {
      div.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true);
      slider.value = 90;
      label.textContent = "Last 90 days";
      applyFilters();
    });

    return div;
  };

  legend.addTo(window.mapInstance);
}

// ==================== FILTER LOGIC ====================
function applyFilters() {
  const checkedTypes = new Set();
  document.querySelectorAll('.legend-container input[type="checkbox"]:checked').forEach(cb => {
    checkedTypes.add(cb.value);
  });

  const slider = document.getElementById('date-slider');
  const days = slider ? parseInt(slider.value) : 90;
  timeFilterDays = days;

  console.log(`Applying filters → Types: ${checkedTypes.size || 'All'}, Days: ${days}`);

  markersCluster.clearLayers();
  let shown = 0;

  allMarkers.forEach(marker => {
    const type = marker.options.alertType || 'other';
    const typeMatch = checkedTypes.size === 0 || checkedTypes.has(type);

    let timeMatch = true;
    if (days < 90 && marker.options.timestamp) {
      const alertTimeMs = parseGoogleDateToMs(marker.options.timestamp);
      if (alertTimeMs) {
        const daysOld = (Date.now() - alertTimeMs) / (1000 * 60 * 60 * 24);
        timeMatch = daysOld <= days;
      } else {
        timeMatch = false;
      }
    }

    if (typeMatch && timeMatch) {
      markersCluster.addLayer(marker);
      shown++;
    }
  });

  console.log(`Filtered result: ${shown} markers shown`);
  fitToMarkers();
}

// Robust date parser for Google Sheets timestamps
function parseGoogleDateToMs(timestamp) {
  if (!timestamp) return null;

  let date = new Date(timestamp);
  if (!isNaN(date.getTime())) return date.getTime();

  const cleaned = timestamp.toString().trim();
  date = new Date(cleaned);
  if (!isNaN(date.getTime())) return date.getTime();

  console.warn("Could not parse timestamp:", timestamp);
  return null;
}

function enableReportClick() {
  if (clickListener) window.mapInstance.off('click', clickListener);

  clickListener = function(e) {
    const lat = e.latlng.lat.toFixed(5);
    const lng = e.latlng.lng.toFixed(5);

    if (window.tempMarker) window.mapInstance.removeLayer(window.tempMarker);

    window.tempMarker = L.circleMarker([lat, lng], {
      radius: 8, fillColor: "#3388ff", color: "#ffffff", weight: 3, opacity: 1, fillOpacity: 0.8
    }).addTo(window.mapInstance);

    showAddReportModal(lat, lng);
  };

  window.mapInstance.on('click', clickListener);
}

function addMarkerToCluster(alert) {
  const lat = parseFloat(alert.lat) || -29.85;
  const lng = parseFloat(alert.lng) || 31.03;

  const typeKey = alert.type?.toLowerCase().trim() || 'other';
  const iconInfo = alertIcons[typeKey] || alertIcons.other;

  const markerIcon = L.divIcon({
    html: `<div style="background:${iconInfo.color}; color:white; width:38px; height:38px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:20px; border:3px solid ${iconInfo.border}; box-shadow:0 3px 10px rgba(0,0,0,0.35); text-shadow:0 0 3px rgba(0,0,0,0.7);">${iconInfo.emoji}</div>`,
    className: '',
    iconSize: [38, 38],
    iconAnchor: [19, 19]
  });

  const marker = L.marker([lat, lng], { icon: markerIcon });

  // === YOUR ORIGINAL POPUP (restored) ===
  const popupContent = `
    <div style="font-family: Arial, sans-serif; min-width: 320px; max-width: 420px; padding: 8px;">
      <b style="font-size: 1.25em; color: #1a3c6d;">${alert.type?.toUpperCase() || 'OTHER'} – ${alert.area || 'Unknown'}</b><br>
      <small style="color: #555;">${alert.timestamp || '—'}</small><br><br>
      <div style="margin-bottom: 12px; line-height: 1.5;">
        ${alert.description ? alert.description.substring(0, 160) + (alert.description.length > 160 ? '…' : '') : 'No description provided'}
      </div>
      <div style="margin: 12px 0; font-size: 0.95em; color: #444;">
        Reporter: ${alert.reporter || 'Anonymous'}<br>
        Status: <strong>${alert.status}</strong>
      </div>
      ${alert.social ? `
        <div style="margin: 12px 0;">
          <a href="${alert.social}" target="_blank" style="color:#1976d2; text-decoration:none; font-weight:bold;">
            → X / Social evidence
          </a>
        </div>
      ` : ''}
      <div style="display: flex; flex-wrap: nowrap; overflow-x: auto; gap: 12px; margin-top: 12px; padding-bottom: 4px;">
        ${alert.photos ?
          alert.photos.split(',').map((url, i) => {
            const trimmedUrl = url.trim();
            return trimmedUrl ? `
              <div style="flex: 0 0 160px; width: 160px; text-align: center;">
                <a href="${trimmedUrl}" target="_blank" style="display: block; text-decoration: none;">
                  <img src="${trimmedUrl}"
                       alt="Incident photo ${i+1}"
                       loading="lazy"
                       style="width: 100%; height: 120px; object-fit: cover; border-radius: 6px; box-shadow: 0 2px 6px rgba(0,0,0,0.3); border: 1px solid #ccc;"
                       onerror="this.src='https://via.placeholder.com/160x120?text=Image+Not+Found';">
                </a>
                <div style="margin-top: 6px; font-size: 0.85em; color: #555;">Photo ${i+1}</div>
              </div>
            ` : '';
          }).join('')
          : '<div style="color:#777; font-style:italic; text-align:center; margin:12px 0;">No photos attached</div>'}
      </div>
    </div>
  `;

  marker.bindPopup(popupContent);
  marker.options.alertType = typeKey;
  marker.options.timestamp = alert.timestamp;   // ← Critical for date filter!

  allMarkers.push(marker);
  markersCluster.addLayer(marker);
}

function fitToMarkers() {
  if (!markersCluster || markersCluster.getLayers().length === 0) return;
  const bounds = markersCluster.getBounds();
  if (bounds.isValid()) {
    window.mapInstance.fitBounds(bounds, { padding: [60, 60] });
  }
}
