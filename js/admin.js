// sa-incident-tracker/js/admin.js

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxwR8LmQ1zBjLWJVu9gXGwwT2wyXSsp3q4WcQT1Rb6dRIk9gvbiiZNJbUcwttMQ4ostdQ/exec";

let allAlerts = [];

// Simple auth check (expand later with real token/password)
function checkAdminAuth() {
  const auth = localStorage.getItem('adminAuth');
  if (!auth) {
    const password = prompt("Enter admin password:");
    if (password !== "your-secret-password-here") { // ← CHANGE THIS
      alert("Access denied");
      window.location.href = "index.html";
      return false;
    }
    localStorage.setItem('adminAuth', 'true');
  }
  return true;
}

document.addEventListener('DOMContentLoaded', () => {
  if (!checkAdminAuth()) return;

  initMap('map');           // smaller map for admin
  loadAllAlerts();

  document.getElementById('logout')?.addEventListener('click', () => {
    if (confirm("Logout?")) {
      localStorage.removeItem('adminAuth');
      window.location.href = "index.html";
    }
  });
});

async function loadAllAlerts() {
  try {
    const res = await fetch(`${SCRIPT_URL}?action=get-alerts`);
    const data = await res.json();

    if (!data.success) {
      throw new Error(data.error || "Load failed");
    }

    allAlerts = data.alerts;
    renderTable();
    renderMarkers();
    updatePendingCount();
  } catch (err) {
    console.error("Admin load error:", err);
    alert("Could not load alerts. Check console.");
  }
}

function renderTable() {
  const tbody = document.getElementById('alert-table-body');
  tbody.innerHTML = '';

  allAlerts.forEach(alert => {
    const tr = document.createElement('tr');
    tr.className = alert.status?.toLowerCase() || '';
    tr.innerHTML = `
      <td>${alert.timestamp || '—'}</td>
      <td>${alert.type || 'other'}</td>
      <td>${alert.area || 'Unknown'}</td>
      <td>${alert.reporter || 'Anonymous'}</td>
      <td title="${alert.description || ''}">${(alert.description || '').substring(0, 80)}${(alert.description || '').length > 80 ? '...' : ''}</td>
      <td>
        <select class="status-select" data-row="${alert.row}">
          <option value="pending"    ${alert.status==='pending'?'selected':''}>Pending</option>
          <option value="approved"   ${alert.status==='approved'?'selected':''}>Approved</option>
          <option value="rejected"   ${alert.status==='rejected'?'selected':''}>Rejected</option>
          <option value="in-progress">${alert.status==='in-progress'?'selected':''}>In Progress</option>
          <option value="resolved"   ${alert.status==='resolved'?'selected':''}>Resolved</option>
        </select>
      </td>
      <td>
        <button class="approve-btn" data-row="${alert.row}">Approve</button>
        <button class="reject-btn"  data-row="${alert.row}">Reject</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Event listeners for status change & quick buttons
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

async function updateStatus(row, newStatus) {
  if (!confirm(`Set status to "${newStatus}"?`)) return;

  const params = new URLSearchParams({
    action: 'update-status',
    row: row,
    status: newStatus
  });

  try {
    const res = await fetch(`${SCRIPT_URL}?${params}`);
    const data = await res.json();

    if (data.success) {
      loadAllAlerts(); // refresh table & map
    } else {
      alert("Update failed: " + (data.error || "Unknown"));
    }
  } catch (err) {
    console.error("Status update error:", err);
    alert("Network error – try again");
  }
}

function updatePendingCount() {
  const pending = allAlerts.filter(a => a.status?.toLowerCase() === 'pending').length;
  const el = document.getElementById('pending-count');
  if (el) {
    el.textContent = `Pending reports: ${pending}`;
    el.style.color = pending > 0 ? '#d32f2f' : '#28a745';
  }
}

function renderMarkers() {
  markersCluster.clearLayers();
  allAlerts.forEach(addMarkerToCluster);
  fitToMarkers();
}
