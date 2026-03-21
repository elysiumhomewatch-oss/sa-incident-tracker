// sa-incident-tracker/js/admin.js
const SCRIPT_URL = "YOUR_SCRIPT_URL_HERE";  // ← replace !

let allAlerts = [];
let storedAuth = null;

document.addEventListener('DOMContentLoaded', () => {
  storedAuth = JSON.parse(localStorage.getItem('adminAuth') || 'null');
  if (!storedAuth) {
    alert("Admin login required. For now using no auth – add later.");
    // Later: redirect or show modal
  }

  initMap('map');  // smaller map in admin

  loadAllAlerts();

  // Quick X create button (expand later)
  document.getElementById('create-from-x')?.addEventListener('click', createFromX);
});

async function loadAllAlerts() {
  try {
    const res = await fetch(`${SCRIPT_URL}?action=get-alerts`);
    const data = await res.json();
    if (!data.success) throw new Error();

    allAlerts = data.alerts;
    renderTable();
    renderMarkers();
    updatePendingCount();
  } catch (err) {
    console.error("Admin load failed", err);
  }
}

function renderTable() {
  const tbody = document.getElementById('alert-table-body') || document.createElement('tbody');
  tbody.innerHTML = '';

  allAlerts.forEach(alert => {
    const tr = document.createElement('tr');
    tr.className = alert.status?.toLowerCase() || '';
    tr.innerHTML = `
      <td>${alert.timestamp || '—'}</td>
      <td>${alert.type || 'other'}</td>
      <td>${alert.area || 'Unknown'}</td>
      <td>${alert.reporter || 'Anonymous'}</td>
      <td>
        <select class="status-select" data-row="${alert.row}">
          <option value="pending"   ${alert.status==='pending'?'selected':''}>Pending</option>
          <option value="approved"  ${alert.status==='approved'?'selected':''}>Approved</option>
          <option value="rejected"  ${alert.status==='rejected'?'selected':''}>Rejected</option>
          <option value="in-progress">In Progress</option>
          <option value="resolved">Resolved</option>
        </select>
      </td>
      <td>
        <button class="approve-btn" data-row="${alert.row}">Approve</button>
        <button class="reject-btn"  data-row="${alert.row}">Reject</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Add listeners for status change & quick buttons
  document.querySelectorAll('.status-select').forEach(sel => {
    sel.addEventListener('change', () => updateStatus(sel.dataset.row, sel.value));
  });
  document.querySelectorAll('.approve-btn').forEach(btn => {
    btn.addEventListener('click', () => updateStatus(btn.dataset.row, 'approved'));
  });
  document.querySelectorAll('.reject-btn').forEach(btn => {
    btn.addEventListener('click', () => updateStatus(btn.dataset.row, 'rejected'));
  });
}

async function updateStatus(row, status) {
  if (!confirm(`Set status to ${status}?`)) return;
  const params = new URLSearchParams({ action: 'update-status', row, status });
  try {
    const res = await fetch(`${SCRIPT_URL}?${params}`);
    const data = await res.json();
    if (data.success) {
      loadAllAlerts();  // refresh
    }
  } catch (err) {}
}

function updatePendingCount() {
  const pending = allAlerts.filter(a => a.status?.toLowerCase() === 'pending').length;
  const el = document.getElementById('pending-count');
  if (el) el.textContent = `Pending moderation: ${pending}`;
}

function renderMarkers() {
  markersCluster.clearLayers();
  allAlerts.forEach(addMarkerToCluster);
  fitToMarkers();
}

function createFromX() {
  const keywords = document.getElementById('x-keywords')?.value.trim() || 'protest OR riot OR looting Durban';
  const url = `https://x.com/search?q=${encodeURIComponent(keywords)}&f=live`;
  const desc = prompt("Description / key observations:", `X signal: ${keywords}`);
  if (!desc) return;

  const params = new URLSearchParams({
    action: 'add-alert',
    type: 'protest',  // default – change later
    area: 'Durban area',
    desc,
    social: url
  });

  fetch(`${SCRIPT_URL}?${params}`)
    .then(r => r.json())
    .then(d => {
      if (d.success) {
        alert("Pending alert created from X search!");
        loadAllAlerts();
      }
    })
    .catch(() => alert("Failed to create alert"));
}
