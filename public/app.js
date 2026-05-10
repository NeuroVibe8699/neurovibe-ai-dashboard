const API = '';
let token = localStorage.getItem('nv_token');
let currentUser = JSON.parse(localStorage.getItem('nv_user') || 'null');
let gateways = [], nodes = [], sites = [], currentSite = null, addingPin = null;
let sensorChart, deviceChart, tempChart, freqChart;

// ===== AUTH =====
document.getElementById('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  try {
    const res = await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    token = data.token;
    currentUser = data.user;
    localStorage.setItem('nv_token', token);
    localStorage.setItem('nv_user', JSON.stringify(currentUser));
    showApp();
  } catch (err) {
    const el = document.getElementById('loginError');
    el.textContent = err.message;
    el.style.display = 'block';
  }
});

function logout() {
  localStorage.removeItem('nv_token');
  localStorage.removeItem('nv_user');
  token = null; currentUser = null;
  document.getElementById('appPage').style.display = 'none';
  document.getElementById('loginPage').style.display = 'flex';
}

async function showApp() {
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('appPage').style.display = 'flex';
  document.getElementById('userAvatar').textContent = currentUser.name[0].toUpperCase();
  document.getElementById('sideUserName').textContent = currentUser.name;
  document.getElementById('sideUserRole').textContent = currentUser.role;
  if (currentUser.role !== 'admin') {
    document.querySelectorAll('[data-page="users"]').forEach(el => el.style.display = 'none');
  }
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => showPage(el.dataset.page));
  });
  await loadAll();
  showPage('dashboard');
  setInterval(updateClock, 1000);
  updateClock();
  setInterval(updateCharts, 3000);
}

function updateClock() {
  const el = document.getElementById('dashTime');
  if (el) el.textContent = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'medium' });
}

if (token && currentUser) showApp();

// ===== API HELPER =====
async function api(url, method = 'GET', body = null) {
  const opts = {
    method,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API}${url}`, opts);
  if (res.status === 401) { logout(); return null; }
  return res.json();
}

async function loadAll() {
  [gateways, nodes, sites] = await Promise.all([
    api('/api/gateways'), api('/api/nodes'), api('/api/sites')
  ]);
  gateways = gateways || [];
  nodes = nodes || [];
  sites = sites || [];
}

// ===== NAV =====
function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const pg = document.getElementById(`page-${page}`);
  if (pg) pg.classList.add('active');
  const nv = document.querySelector(`[data-page="${page}"]`);
  if (nv) nv.classList.add('active');
  if (page === 'dashboard') renderDashboard();
  if (page === 'gateways') renderGateways();
  if (page === 'nodes') renderNodes();
  if (page === 'sites') renderSites();
  if (page === 'users') loadUsers();
}

// ===== DASHBOARD =====
async function renderDashboard() {
  const stats = await api('/api/dashboard/stats') || {};
  const cards = [
    { icon: '📡', label: 'Gateways', value: stats.gateways || 0, sub: 'Total registered', g: 'linear-gradient(90deg,#6366f1,#8b5cf6)' },
    { icon: '🔌', label: 'Nodes', value: stats.nodes || 0, sub: `${stats.ai_nodes || 0} AI-enabled`, g: 'linear-gradient(90deg,#10b981,#059669)' },
    { icon: '🗺️', label: 'Sites', value: stats.sites || 0, sub: 'Plant locations', g: 'linear-gradient(90deg,#f59e0b,#d97706)' },
    { icon: '👥', label: 'Users', value: stats.users || 0, sub: 'Platform users', g: 'linear-gradient(90deg,#06b6d4,#0891b2)' },
    { icon: '🤖', label: 'AI Nodes', value: stats.ai_nodes || 0, sub: 'AI-enabled devices', g: 'linear-gradient(90deg,#8b5cf6,#6d28d9)' },
    { icon: '⚙️', label: 'Motors', value: stats.motors || 0, sub: 'Assigned motors', g: 'linear-gradient(90deg,#ef4444,#dc2626)' },
  ];
  document.getElementById('statsGrid').innerHTML = cards.map(c => `
    <div class="stat-card" style="--g:${c.g}">
      <div class="stat-label">${c.icon} ${c.label}</div>
      <div class="stat-value">${c.value}</div>
      <div class="stat-sub">${c.sub}</div>
    </div>`).join('');
  initCharts();
}

function initCharts() {
  const labels = ['00:00', '03:00', '06:00', '09:00', '12:00', '15:00', '18:00', '21:00'];
  const rand = (min, max, n = 8) => Array.from({ length: n }, () => +(Math.random() * (max - min) + min).toFixed(1));

  if (sensorChart) sensorChart.destroy();
  sensorChart = new Chart(document.getElementById('sensorChart'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Temperature (°C)', data: rand(60, 95), borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.08)', tension: 0.4, fill: true, pointRadius: 3 },
        { label: 'Vibration (mm/s)', data: rand(2, 12), borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.08)', tension: 0.4, fill: true, pointRadius: 3 },
        { label: 'Pressure (bar)', data: rand(1, 8), borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.08)', tension: 0.4, fill: true, pointRadius: 3 },
        { label: 'RPM (×100)', data: rand(10, 20), borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.08)', tension: 0.4, fill: true, pointRadius: 3 },
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } },
      scales: { y: { beginAtZero: false, grid: { color: '#f1f5f9' } }, x: { grid: { color: '#f1f5f9' } } }
    }
  });

  if (deviceChart) deviceChart.destroy();
  deviceChart = new Chart(document.getElementById('deviceChart'), {
    type: 'doughnut',
    data: {
      labels: ['Gateways', 'Standard Nodes', 'AI Nodes'],
      datasets: [{ data: [gateways.length || 1, nodes.filter(n => !n.is_ai).length || 1, nodes.filter(n => n.is_ai).length || 1], backgroundColor: ['#6366f1', '#10b981', '#8b5cf6'], borderWidth: 0, hoverOffset: 8 }]
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } }, cutout: '68%' }
  });

  if (tempChart) tempChart.destroy();
  tempChart = new Chart(document.getElementById('tempChart'), {
    type: 'bar',
    data: {
      labels: ['NVS1001', 'NVS1002', 'NVS1003', 'NVS1004', 'NVS1005'],
      datasets: [{ label: 'Avg Temp (°C)', data: rand(55, 95, 5), backgroundColor: ['#6366f1', '#8b5cf6', '#ef4444', '#f59e0b', '#10b981'], borderRadius: 8, borderSkipped: false }]
    },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: false, grid: { color: '#f1f5f9' } }, x: { grid: { display: false } } } }
  });

  if (freqChart) freqChart.destroy();
  const f868 = gateways.filter(g => g.frequency === '868MHz').length;
  const f915 = gateways.filter(g => g.frequency === '915MHz').length;
  freqChart = new Chart(document.getElementById('freqChart'), {
    type: 'pie',
    data: {
      labels: ['868MHz', '915MHz'],
      datasets: [{ data: [f868 || 1, f915 || 1], backgroundColor: ['#6366f1', '#10b981'], borderWidth: 0, hoverOffset: 8 }]
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } } }
  });
}

function updateCharts() {
  if (!sensorChart) return;
  sensorChart.data.datasets.forEach(ds => {
    ds.data.shift();
    const last = ds.data[ds.data.length - 1];
    ds.data.push(+(last + (Math.random() - 0.5) * 4).toFixed(1));
  });
  sensorChart.update('none');
}

// ===== GATEWAYS =====
function renderGateways() {
  document.getElementById('gwBody').innerHTML = gateways.length === 0
    ? '<tr><td colspan="11" style="text-align:center;padding:40px;color:#64748b;">No gateways yet. Click "+ Add Gateway".</td></tr>'
    : gateways.map(g => `<tr>
        <td><span class="badge badge-blue">${g.model}</span></td>
        <td class="mono">${g.serial_no}</td>
        <td class="mono">${g.imei || '-'}</td>
        <td class="mono">${g.radio_mac || '-'}</td>
        <td class="mono">${g.lan_mac || '-'}</td>
        <td class="mono">${g.wan_mac || '-'}</td>
        <td class="mono">${g.ble_mac || '-'}</td>
        <td><span class="badge badge-gray">${g.frequency || '-'}</span></td>
        <td>${g.site || '-'}</td>
        <td><span class="badge ${g.status === 'active' ? 'badge-green' : 'badge-red'}">${g.status || 'active'}</span></td>
        <td><button class="btn-icon" onclick="deleteGateway(${g.id})">🗑️</button></td>
      </tr>`).join('');
}

async function submitGateway(e) {
  e.preventDefault();
  const body = {
    model: document.getElementById('gwModel').value,
    serial_no: document.getElementById('gwSerial').value,
    imei: document.getElementById('gwIMEI').value,
    radio_mac: document.getElementById('gwRadioMAC').value,
    lan_mac: document.getElementById('gwLANMAC').value,
    wan_mac: document.getElementById('gwWANMAC').value,
    ble_mac: document.getElementById('gwBLEMAC').value,
    frequency: document.getElementById('gwFreq').value,
    site: document.getElementById('gwSite').value,
  };
  const res = await api('/api/gateways', 'POST', body);
  if (res && res.id) {
    gateways.unshift(res);
    closeModal('gwModal');
    e.target.reset();
    renderGateways();
    toast('Gateway added!', 'success');
  } else toast(res?.error || 'Error', 'error');
}

async function deleteGateway(id) {
  if (!confirm('Delete this gateway?')) return;
  await api(`/api/gateways/${id}`, 'DELETE');
  gateways = gateways.filter(g => g.id !== id);
  renderGateways();
  toast('Deleted', 'success');
}

// ===== NODES =====
function renderNodes() {
  const gwOpts = gateways.map(g => `<option value="${g.id}">${g.model} - ${g.serial_no}</option>`).join('');
  document.getElementById('nodeGateway').innerHTML = '<option value="">None</option>' + gwOpts;
  document.getElementById('nodeBody').innerHTML = nodes.length === 0
    ? '<tr><td colspan="10" style="text-align:center;padding:40px;color:#64748b;">No nodes yet. Click "+ Add Node".</td></tr>'
    : nodes.map(n => `<tr>
        <td><span class="badge badge-purple">${n.model}</span></td>
        <td class="mono">${n.serial_no}</td>
        <td class="mono">${n.radio_mac || '-'}</td>
        <td class="mono">${n.ble_mac || '-'}</td>
        <td><span class="badge badge-gray">${n.frequency || '-'}</span></td>
        <td>${n.is_ai ? '<span class="badge badge-ai">🤖 AI</span>' : '<span class="badge badge-gray">Standard</span>'}</td>
        <td>${n.gateway_model ? `<span class="badge badge-blue">${n.gateway_model}</span>` : '-'}</td>
        <td>${n.site || '-'}</td>
        <td><span class="badge ${n.status === 'active' ? 'badge-green' : 'badge-red'}">${n.status || 'active'}</span></td>
        <td style="display:flex;gap:6px;">
          <button class="btn btn-sm btn-outline" onclick="openCongregation(${n.id})">⚙️</button>
          <button class="btn-icon" onclick="deleteNode(${n.id})">🗑️</button>
        </td>
      </tr>`).join('');
}

async function submitNode(e) {
  e.preventDefault();
  const body = {
    model: document.getElementById('nodeModel').value,
    serial_no: document.getElementById('nodeSerial').value,
    radio_mac: document.getElementById('nodeRadioMAC').value,
    ble_mac: document.getElementById('nodeBLEMAC').value,
    frequency: document.getElementById('nodeFreq').value,
    is_ai: document.getElementById('nodeAI').value === 'true',
    gateway_id: document.getElementById('nodeGateway').value || null,
    site: document.getElementById('nodeSite').value,
  };
  const res = await api('/api/nodes', 'POST', body);
  if (res && res.id) {
    nodes.unshift(res);
    closeModal('nodeModal');
    e.target.reset();
    renderNodes();
    toast('Node added!', 'success');
  } else toast(res?.error || 'Error', 'error');
}

async function deleteNode(id) {
  if (!confirm('Delete this node?')) return;
  await api(`/api/nodes/${id}`, 'DELETE');
  nodes = nodes.filter(n => n.id !== id);
  renderNodes();
  toast('Deleted', 'success');
}

// ===== CONGREGATION =====
let congNode = null, congMotors = [];

async function openCongregation(nodeId) {
  congNode = nodes.find(n => n.id === nodeId);
  if (!congNode) return;
  congMotors = await api(`/api/nodes/${nodeId}/motors`) || [];
  document.getElementById('congTitle').textContent = `${congNode.model} - ${congNode.serial_no}`;
  document.getElementById('congNodeInfo').innerHTML = `
    <div class="node-icon">🔌</div>
    <div>
      <h3 style="font-size:1rem;font-weight:700;">${congNode.model} — ${congNode.serial_no}</h3>
      <p style="color:var(--muted);font-size:0.84rem;margin-top:5px;">
        ${congNode.frequency} &nbsp;|&nbsp;
        ${congNode.is_ai ? '<span class="badge badge-ai">🤖 AI Model</span>' : '<span class="badge badge-gray">Standard</span>'}
        &nbsp;|&nbsp; Radio: <span class="mono">${congNode.radio_mac || '-'}</span>
        &nbsp;|&nbsp; BLE: <span class="mono">${congNode.ble_mac || '-'}</span>
      </p>
    </div>`;
  renderMotors();
  showPage('congregation');
}

function renderMotors() {
  const grid = document.getElementById('motorGrid');
  if (congMotors.length === 0) {
    grid.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted);">⚙️<br>No motors assigned. Click "+ Add Motor".</div>';
    return;
  }
  grid.innerHTML = congMotors.map(m => `
    <div class="motor-card ${m.motor_name ? 'saved' : ''}">
      <h5>⚙️ ${m.motor_name || 'New Motor'}</h5>
      <div class="matrix-row"><label>Motor Name</label><input id="mn_${m.id}" value="${m.motor_name || ''}" placeholder="Pump Motor A" /></div>
      <div class="matrix-row"><label>Motor Tag</label><input id="mt_${m.id}" value="${m.motor_tag || ''}" placeholder="PM-A-001" /></div>
      <div class="matrix-row"><label>Location</label><input id="ml_${m.id}" value="${m.location || ''}" placeholder="Zone 1" /></div>
      <div class="matrix-row"><label>RPM</label><input type="number" id="mr_${m.id}" value="${m.rpm || ''}" placeholder="1450" /></div>
      <div class="matrix-row"><label>Power (kW)</label><input type="number" id="mp_${m.id}" value="${m.power_kw || ''}" placeholder="7.5" /></div>
      <div class="matrix-row"><label>Voltage (V)</label><input type="number" id="mv_${m.id}" value="${m.voltage || ''}" placeholder="415" /></div>
      <div class="matrix-row"><label>Current (A)</label><input type="number" id="mca_${m.id}" value="${m.current_a || ''}" placeholder="14.2" /></div>
      <div class="matrix-row"><label>Bearing</label><input id="mb_${m.id}" value="${m.bearing_type || ''}" placeholder="SKF 6205" /></div>
      <div class="matrix-row"><label>Sensor Type</label>
        <select id="ms_${m.id}">
          ${['Vibration','Temperature','Vibration + Temperature','Ultrasound','Magnetic Flux','Pressure','RPM','All Sensors']
            .map(s => `<option ${m.sensor_type === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>
      <div class="matrix-row"><label>Alert Threshold</label><input id="ma_${m.id}" value="${m.alert_threshold || ''}" placeholder="85°C" /></div>
      <div class="matrix-row" style="align-items:flex-start">
        <label style="padding-top:4px">Notes</label>
        <textarea id="mno_${m.id}" rows="2" placeholder="Notes...">${m.notes || ''}</textarea>
      </div>
      <div style="display:flex;gap:8px;margin-top:12px;">
        <button class="btn btn-success btn-sm" onclick="saveMotor(${m.id})">💾 Save</button>
        <button class="btn btn-danger btn-sm" onclick="deleteMotor(${m.id})">🗑️ Remove</button>
      </div>
    </div>`).join('');
}

async function addMotor() {
  const res = await api(`/api/nodes/${congNode.id}/motors`, 'POST', {
    motor_name: '', motor_tag: '', location: '', rpm: '', power_kw: '',
    voltage: '', current_a: '', bearing_type: '', sensor_type: 'Vibration',
    alert_threshold: '', notes: ''
  });
  if (res && res.id) { congMotors.push(res); renderMotors(); toast('Motor added!', 'success'); }
}

async function saveMotor(id) {
  const body = {
    motor_name: document.getElementById(`mn_${id}`)?.value,
    motor_tag: document.getElementById(`mt_${id}`)?.value,
    location: document.getElementById(`ml_${id}`)?.value,
    rpm: document.getElementById(`mr_${id}`)?.value,
    power_kw: document.getElementById(`mp_${id}`)?.value,
    voltage: document.getElementById(`mv_${id}`)?.value,
    current_a: document.getElementById(`mca_${id}`)?.value,
    bearing_type: document.getElementById(`mb_${id}`)?.value,
    sensor_type: document.getElementById(`ms_${id}`)?.value,
    alert_threshold: document.getElementById(`ma_${id}`)?.value,
    notes: document.getElementById(`mno_${id}`)?.value,
  };
  const res = await api(`/api/motors/${id}`, 'PUT', body);
  if (res && res.id) {
    const i = congMotors.findIndex(m => m.id === id);
    if (i !== -1) congMotors[i] = res;
    renderMotors();
    toast('Saved!', 'success');
  }
}

async function deleteMotor(id) {
  if (!confirm('Remove motor?')) return;
  await api(`/api/motors/${id}`, 'DELETE');
  congMotors = congMotors.filter(m => m.id !== id);
  renderMotors();
  toast('Removed', 'success');
}

// ===== SITES =====
function renderSites() {
  document.getElementById('sitesList').innerHTML = sites.length === 0
    ? '<div style="padding:20px;text-align:center;color:var(--muted);">No sites yet</div>'
    : sites.map(s => `
        <div class="site-item ${currentSite?.id === s.id ? 'active' : ''}" onclick="selectSite(${s.id})">
          <h4>🏭 ${s.name}</h4>
          <p>${s.location || 'No location'}</p>
        </div>`).join('');
}

function selectSite(id) {
  currentSite = sites.find(s => s.id === id);
  document.getElementById('mapTitle').textContent = `🗺️ ${currentSite.name}`;
  document.getElementById('mapEmpty').style.display = 'none';
  document.getElementById('mapToolbar').style.display = 'flex';
  renderMap();
  renderSites();
}

function renderMap() {
  document.querySelectorAll('#mapCanvas .map-pin').forEach(p => p.remove());
  (currentSite.map_data || []).forEach(pin => addPinToMap(pin));
}

function addPinToMap(pin) {
  const canvas = document.getElementById('mapCanvas');
  const el = document.createElement('div');
  el.className = 'map-pin';
  el.style.left = pin.x + '%';
  el.style.top = pin.y + '%';
  el.innerHTML = `
    <div class="pin-marker ${pin.type}">${pin.type === 'gw' ? '📡' : '🔌'}</div>
    <div class="pin-label">${pin.label}</div>`;
  el.addEventListener('dblclick', () => {
    currentSite.map_data = (currentSite.map_data || []).filter(p => p.id !== pin.id);
    el.remove();
  });
  canvas.appendChild(el);
}

function addPin(type) {
  addingPin = type;
  toast(`Click map to place ${type === 'gateway' ? '📡 Gateway' : '🔌 Node'} pin`, 'info');
}

document.getElementById('mapCanvas').addEventListener('click', e => {
  if (!addingPin || !currentSite) return;
  const rect = e.currentTarget.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width * 100).toFixed(1);
  const y = ((e.clientY - rect.top) / rect.height * 100).toFixed(1);
  const label = prompt(`Label for this ${addingPin}:`, addingPin === 'gateway' ? 'GW-01' : 'ND-01');
  if (!label) { addingPin = null; return; }
  const pin = { id: Date.now(), type: addingPin === 'gateway' ? 'gw' : 'nd', x, y, label };
  if (!currentSite.map_data) currentSite.map_data = [];
  currentSite.map_data.push(pin);
  addPinToMap(pin);
  addingPin = null;
});

async function saveMap() {
  if (!currentSite) return;
  await api(`/api/sites/${currentSite.id}/map`, 'PUT', { map_data: currentSite.map_data });
  toast('Map saved!', 'success');
}

async function submitSite(e) {
  e.preventDefault();
  const body = {
    name: document.getElementById('siteName').value,
    location: document.getElementById('siteLocation').value,
    description: document.getElementById('siteDesc').value,
  };
  const res = await api('/api/sites', 'POST', body);
  if (res && res.id) {
    sites.unshift(res);
    closeModal('siteModal');
    e.target.reset();
    renderSites();
    toast('Site added!', 'success');
  }
}

// ===== USERS =====
async function loadUsers() {
  const users = await api('/api/users') || [];
  document.getElementById('userBody').innerHTML = users.map(u => `
    <tr>
      <td><strong>${u.name}</strong></td>
      <td>${u.email}</td>
      <td><span class="badge ${u.role === 'admin' ? 'badge-purple' : 'badge-gray'}">${u.role}</span></td>
      <td style="font-size:0.78rem;color:var(--muted);">${new Date(u.created_at).toLocaleDateString('en-IN')}</td>
      <td>${u.email !== 'admin@neurovibe.ai' ? `<button class="btn-icon" onclick="deleteUser(${u.id})">🗑️</button>` : '-'}</td>
    </tr>`).join('');
}

async function submitUser(e) {
  e.preventDefault();
  const body = {
    name: document.getElementById('uName').value,
    email: document.getElementById('uEmail').value,
    password: document.getElementById('uPassword').value,
    role: document.getElementById('uRole').value,
  };
  const res = await api('/api/users', 'POST', body);
  if (res && res.id) {
    closeModal('userModal');
    e.target.reset();
    loadUsers();
    toast('User created!', 'success');
  } else toast(res?.error || 'Error', 'error');
}

async function deleteUser(id) {
  if (!confirm('Delete user?')) return;
  await api(`/api/users/${id}`, 'DELETE');
  loadUsers();
  toast('Deleted', 'success');
}

// ===== IMPORT / EXPORT =====
async function importCSV(type, input) {
  const file = input.files[0];
  if (!file) return;
  const text = await file.text();
  const lines = text.split('\n').filter(l => l.trim());
  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
  const rows = lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.replace(/"/g, '').trim());
    const obj = {};
    headers.forEach((h, i) => obj[h] = vals[i] || '');
    return type === 'gateways'
      ? { model: obj['Model'], serial_no: obj['Serial No'], imei: obj['IMEI'], radio_mac: obj['Radio MAC'], lan_mac: obj['LAN MAC'], wan_mac: obj['WAN MAC'], ble_mac: obj['BLE MAC'], frequency: obj['Frequency'] }
      : { model: obj['Model'], serial_no: obj['Serial No'], radio_mac: obj['Radio MAC'], ble_mac: obj['BLE MAC'], frequency: obj['Frequency'], is_ai: obj['AI Model'] };
  });
  const res = await api(`/api/import/${type}`, 'POST', { rows });
  toast(`${res?.imported || 0} ${type} imported!`, 'success');
  await loadAll();
  if (type === 'gateways') renderGateways();
  else renderNodes();
}

function exportCSV(type) {
  let headers, rows;
  if (type === 'gateways') {
    headers = ['Model', 'Serial No', 'IMEI', 'Radio MAC', 'LAN MAC', 'WAN MAC', 'BLE MAC', 'Frequency', 'Site'];
    rows = gateways.map(g => [g.model, g.serial_no, g.imei, g.radio_mac, g.lan_mac, g.wan_mac, g.ble_mac, g.frequency, g.site]);
  } else {
    headers = ['Model', 'Serial No', 'Radio MAC', 'BLE MAC', 'Frequency', 'AI Model', 'Site'];
    rows = nodes.map(n => [n.model, n.serial_no, n.radio_mac, n.ble_mac, n.frequency, n.is_ai ? 'Yes' : 'No', n.site]);
  }
  const csv = [headers, ...rows].map(r => r.map(c => `"${c || ''}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `neurovibe_${type}_${Date.now()}.csv`;
  a.click();
  toast(`${type} exported!`, 'success');
}

function filterTable(tableId, query) {
  const q = query.toLowerCase();
  document.querySelectorAll(`#${tableId} tbody tr`).forEach(row => {
    row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}

// ===== MODAL =====
function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
document.querySelectorAll('.modal-overlay').forEach(el => {
  el.addEventListener('click', e => { if (e.target === el) el.style.display = 'none'; });
});

// ===== TOAST =====
function toast(msg, type = 'info') {
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  t.innerHTML = `${icons[type] || 'ℹ️'} ${msg}`;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}
