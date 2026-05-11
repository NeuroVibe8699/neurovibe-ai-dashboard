const API = '';
let token = localStorage.getItem('nv_token');
let currentUser = JSON.parse(localStorage.getItem('nv_user') || 'null');
let gateways = [], nodes = [], sites = [], currentSite = null, addingPin = null, movingPinId = null;
let sensorChart, deviceChart, tempChart, freqChart;
let nodeDataCharts = {}, nodeDataInterval = null, currentNodeForData = null, allNodeData = [];

const NODE_ICON_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="2" y="2" width="20" height="20" rx="4" fill="#6366f1"/><rect x="6" y="6" width="4" height="6" rx="1" fill="white"/><rect x="14" y="6" width="4" height="6" rx="1" fill="white"/><rect x="6" y="15" width="12" height="3" rx="1" fill="white"/><rect x="9" y="18" width="2" height="4" fill="#6366f1"/><rect x="13" y="18" width="2" height="4" fill="#6366f1"/></svg>`;

const SENSOR_LIST = [
  { key:'temp',  label:'Temperature',   unit:'°C',   color:'#ef4444', min:0, max:100  },
  { key:'vib',   label:'Vibration',     unit:'mm/s', color:'#6366f1', min:0, max:20   },
  { key:'press', label:'Pressure',      unit:'bar',  color:'#10b981', min:0, max:10   },
  { key:'rpm',   label:'RPM',           unit:'RPM',  color:'#f59e0b', min:0, max:3000 },
  { key:'mag',   label:'Magnetic Flux', unit:'mT',   color:'#8b5cf6', min:0, max:100  },
  { key:'ultra', label:'Ultrasound',    unit:'dB',   color:'#06b6d4', min:0, max:100  },
];

const INTERVAL_OPTIONS = [
  { label:'5 Minutes',  ms:300000   },
  { label:'15 Minutes', ms:900000   },
  { label:'30 Minutes', ms:1800000  },
  { label:'1 Hour',     ms:3600000  },
  { label:'2 Hours',    ms:7200000  },
  { label:'4 Hours',    ms:14400000 },
  { label:'8 Hours',    ms:28800000 },
  { label:'12 Hours',   ms:43200000 },
  { label:'24 Hours',   ms:86400000 },
];

// ===== AUTH =====
document.getElementById('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  try {
    const res = await fetch(`${API}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    token = data.token; currentUser = data.user;
    localStorage.setItem('nv_token', token);
    localStorage.setItem('nv_user', JSON.stringify(currentUser));
    showApp();
  } catch (err) {
    const el = document.getElementById('loginError');
    el.textContent = err.message; el.style.display = 'block';
  }
});

function logout() {
  localStorage.removeItem('nv_token'); localStorage.removeItem('nv_user');
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
  setInterval(updateClock, 1000); updateClock();
  setInterval(updateCharts, 3000);
}

function updateClock() {
  const el = document.getElementById('dashTime');
  if (el) el.textContent = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'medium' });
}

if (token && currentUser) showApp();

async function api(url, method = 'GET', body = null) {
  const opts = { method, headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API}${url}`, opts);
  if (res.status === 401) { logout(); return null; }
  return res.json();
}

async function loadAll() {
  [gateways, nodes, sites] = await Promise.all([api('/api/gateways'), api('/api/nodes'), api('/api/sites')]);
  gateways = gateways || []; nodes = nodes || []; sites = sites || [];
}

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
    { icon:'📡', label:'Gateways',    value:stats.gateways||0,  sub:'Total registered',    g:'linear-gradient(90deg,#6366f1,#8b5cf6)' },
    { icon:'🔌', label:'Nodes',       value:stats.nodes||0,     sub:`${stats.ai_nodes||0} AI-enabled`, g:'linear-gradient(90deg,#10b981,#059669)' },
    { icon:'🗺️', label:'Sites',       value:stats.sites||0,     sub:'Plant locations',      g:'linear-gradient(90deg,#f59e0b,#d97706)' },
    { icon:'👥', label:'Users',       value:stats.users||0,     sub:'Platform users',       g:'linear-gradient(90deg,#06b6d4,#0891b2)' },
    { icon:'🤖', label:'AI Nodes',    value:stats.ai_nodes||0,  sub:'AI-enabled devices',   g:'linear-gradient(90deg,#8b5cf6,#6d28d9)' },
    { icon:'⚙️', label:'Motors',      value:stats.motors||0,    sub:'Assigned motors',      g:'linear-gradient(90deg,#ef4444,#dc2626)' },
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
  const labels = ['00:00','03:00','06:00','09:00','12:00','15:00','18:00','21:00'];
  const rand = (min,max,n=8) => Array.from({length:n},()=>+(Math.random()*(max-min)+min).toFixed(1));
  if (sensorChart) sensorChart.destroy();
  sensorChart = new Chart(document.getElementById('sensorChart'), {
    type:'line', data:{labels, datasets:[
      {label:'Temperature (°C)', data:rand(60,95), borderColor:'#ef4444', backgroundColor:'rgba(239,68,68,0.08)', tension:0.4, fill:true, pointRadius:3},
      {label:'Vibration (mm/s)', data:rand(2,12),  borderColor:'#6366f1', backgroundColor:'rgba(99,102,241,0.08)', tension:0.4, fill:true, pointRadius:3},
      {label:'Pressure (bar)',   data:rand(1,8),   borderColor:'#10b981', backgroundColor:'rgba(16,185,129,0.08)', tension:0.4, fill:true, pointRadius:3},
      {label:'RPM (×100)',       data:rand(10,20), borderColor:'#f59e0b', backgroundColor:'rgba(245,158,11,0.08)', tension:0.4, fill:true, pointRadius:3},
    ]},
    options:{responsive:true, plugins:{legend:{position:'bottom',labels:{font:{size:11}}}}, scales:{y:{beginAtZero:false,grid:{color:'#f1f5f9'}},x:{grid:{color:'#f1f5f9'}}}}
  });
  if (deviceChart) deviceChart.destroy();
  deviceChart = new Chart(document.getElementById('deviceChart'), {
    type:'doughnut', data:{labels:['Gateways','Standard Nodes','AI Nodes'], datasets:[{data:[gateways.length||1, nodes.filter(n=>!n.is_ai).length||1, nodes.filter(n=>n.is_ai).length||1], backgroundColor:['#6366f1','#10b981','#8b5cf6'], borderWidth:0, hoverOffset:8}]},
    options:{responsive:true, plugins:{legend:{position:'bottom',labels:{font:{size:11}}}}, cutout:'68%'}
  });
  if (tempChart) tempChart.destroy();
  tempChart = new Chart(document.getElementById('tempChart'), {
    type:'bar', data:{labels:['NVS1001','NVS1002','NVS1003','NVS1004','NVS1005'], datasets:[{label:'Avg Temp (°C)', data:rand(55,95,5), backgroundColor:['#6366f1','#8b5cf6','#ef4444','#f59e0b','#10b981'], borderRadius:8, borderSkipped:false}]},
    options:{responsive:true, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:false,grid:{color:'#f1f5f9'}},x:{grid:{display:false}}}}
  });
  if (freqChart) freqChart.destroy();
  const f868 = gateways.filter(g=>g.frequency==='868MHz').length;
  const f915 = gateways.filter(g=>g.frequency==='915MHz').length;
  freqChart = new Chart(document.getElementById('freqChart'), {
    type:'pie', data:{labels:['868MHz','915MHz'], datasets:[{data:[f868||1,f915||1], backgroundColor:['#6366f1','#10b981'], borderWidth:0, hoverOffset:8}]},
    options:{responsive:true, plugins:{legend:{position:'bottom',labels:{font:{size:11}}}}}
  });
}

function updateCharts() {
  if (!sensorChart) return;
  sensorChart.data.datasets.forEach(ds => {
    ds.data.shift();
    const last = ds.data[ds.data.length-1];
    ds.data.push(+(last+(Math.random()-0.5)*4).toFixed(1));
  });
  sensorChart.update('none');
}

// ===== GATEWAYS =====
function renderGateways() {
  document.getElementById('gwBody').innerHTML = gateways.length === 0
    ? '<tr><td colspan="11" style="text-align:center;padding:40px;color:#64748b;">No gateways yet.</td></tr>'
    : gateways.map(g => `<tr>
        <td><span class="badge badge-blue">${g.model}</span></td>
        <td class="mono">${g.serial_no}</td>
        <td class="mono">${g.imei||'-'}</td>
        <td class="mono">${g.radio_mac||'-'}</td>
        <td class="mono">${g.lan_mac||'-'}</td>
        <td class="mono">${g.wan_mac||'-'}</td>
        <td class="mono">${g.ble_mac||'-'}</td>
        <td><span class="badge badge-gray">${g.frequency||'-'}</span></td>
        <td>${g.site||'-'}</td>
        <td><span class="badge ${g.status==='active'?'badge-green':'badge-red'}">${g.status||'active'}</span></td>
        <td><button class="btn-icon" onclick="deleteGateway(${g.id})">🗑️</button></td>
      </tr>`).join('');
}

async function submitGateway(e) {
  e.preventDefault();
  const body = { model:document.getElementById('gwModel').value, serial_no:document.getElementById('gwSerial').value, imei:document.getElementById('gwIMEI').value, radio_mac:document.getElementById('gwRadioMAC').value, lan_mac:document.getElementById('gwLANMAC').value, wan_mac:document.getElementById('gwWANMAC').value, ble_mac:document.getElementById('gwBLEMAC').value, frequency:document.getElementById('gwFreq').value, site:document.getElementById('gwSite').value };
  const res = await api('/api/gateways','POST',body);
  if (res&&res.id) { gateways.unshift(res); closeModal('gwModal'); e.target.reset(); renderGateways(); toast('Gateway added!','success'); }
  else toast(res?.error||'Error','error');
}

async function deleteGateway(id) {
  if (!confirm('Delete this gateway?')) return;
  await api(`/api/gateways/${id}`,'DELETE');
  gateways = gateways.filter(g=>g.id!==id);
  renderGateways(); toast('Deleted','success');
}

// ===== NODES =====
function renderNodes() {
  const gwOpts = gateways.map(g=>`<option value="${g.id}">${g.model} - ${g.serial_no}</option>`).join('');
  document.getElementById('nodeGateway').innerHTML = '<option value="">None</option>' + gwOpts;
  document.getElementById('nodeBody').innerHTML = nodes.length === 0
    ? '<tr><td colspan="10" style="text-align:center;padding:40px;color:#64748b;">No nodes yet.</td></tr>'
    : nodes.map(n => `<tr>
        <td>
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="display:inline-flex;">${NODE_ICON_SVG}</span>
            <span class="badge badge-purple">${n.model}</span>
          </div>
        </td>
        <td class="mono">${n.serial_no}</td>
        <td class="mono">${n.radio_mac||'-'}</td>
        <td class="mono">${n.ble_mac||'-'}</td>
        <td><span class="badge badge-gray">${n.frequency||'-'}</span></td>
        <td>${n.is_ai?'<span class="badge badge-ai">🤖 AI</span>':'<span class="badge badge-gray">Standard</span>'}</td>
        <td>${n.gateway_model?`<span class="badge badge-blue">${n.gateway_model}</span>`:'-'}</td>
        <td>${n.site||'-'}</td>
        <td><span class="badge ${n.status==='active'?'badge-green':'badge-red'}">${n.status||'active'}</span></td>
        <td style="display:flex;gap:6px;align-items:center;">
          <button class="btn btn-sm btn-outline" onclick="openCongregation(${n.id})">⚙️ Config</button>
          <button class="btn btn-sm" style="background:#f59e0b;color:#fff;" onclick="openNodeData(${n.id})">📊 Data</button>
          <button class="btn-icon" onclick="deleteNode(${n.id})">🗑️</button>
        </td>
      </tr>`).join('');
}

async function submitNode(e) {
  e.preventDefault();
  const body = { model:document.getElementById('nodeModel').value, serial_no:document.getElementById('nodeSerial').value, radio_mac:document.getElementById('nodeRadioMAC').value, ble_mac:document.getElementById('nodeBLEMAC').value, frequency:document.getElementById('nodeFreq').value, is_ai:document.getElementById('nodeAI').value==='true', gateway_id:document.getElementById('nodeGateway').value||null, site:document.getElementById('nodeSite').value };
  const res = await api('/api/nodes','POST',body);
  if (res&&res.id) { nodes.unshift(res); closeModal('nodeModal'); e.target.reset(); renderNodes(); toast('Node added!','success'); }
  else toast(res?.error||'Error','error');
}

async function deleteNode(id) {
  if (!confirm('Delete this node?')) return;
  await api(`/api/nodes/${id}`,'DELETE');
  nodes = nodes.filter(n=>n.id!==id);
  renderNodes(); toast('Deleted','success');
}

// ===== NODE DATA =====
function openNodeData(nodeId) {
  currentNodeForData = nodes.find(n => n.id === nodeId);
  if (!currentNodeForData) return;
  allNodeData = [];
  document.getElementById('nodeDataModal')?.remove();

  const yr = new Date().getFullYear();
  const yearOpts = Array.from({length:5},(_,i)=>yr-i).map(y=>`<option value="${y}">${y}</option>`).join('');
  const monthOpts = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m,i)=>`<option value="${i+1}">${m}</option>`).join('');
  const intOpts = INTERVAL_OPTIONS.map((o,i)=>`<option value="${o.ms}" ${i===0?'selected':''}>${o.label}</option>`).join('');
  const senOpts = SENSOR_LIST.map(s=>`<option value="${s.key}">${s.label} (${s.unit})</option>`).join('');

  const modal = document.createElement('div');
  modal.id = 'nodeDataModal';
  modal.className = 'modal-overlay';
  modal.style.display = 'flex';
  modal.innerHTML = `
    <div class="modal" style="max-width:960px;width:96%;max-height:92vh;">
      <div class="modal-header" style="background:linear-gradient(135deg,#0f172a,#1e1b4b);color:#fff;border-radius:16px 16px 0 0;padding:16px 24px;">
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="width:40px;height:40px;background:rgba(99,102,241,0.3);border-radius:10px;display:flex;align-items:center;justify-content:center;">${NODE_ICON_SVG}</div>
          <div>
            <h3 style="color:#fff;font-size:1rem;margin:0;">📊 ${currentNodeForData.model} — ${currentNodeForData.serial_no}</h3>
            <p style="color:rgba(255,255,255,0.5);font-size:0.72rem;margin:2px 0 0;">NeuroVibe AI Technologies Pvt. Ltd.</p>
          </div>
        </div>
        <button class="modal-close" style="color:#fff;background:rgba(255,255,255,0.1);" onclick="closeNodeData()">✕</button>
      </div>
      <div style="padding:16px;overflow-y:auto;max-height:80vh;">
        <div class="nd-control-bar">
          <div class="nd-ctrl-group">
            <label>📋 View Mode</label>
            <div style="display:flex;gap:5px;flex-wrap:wrap;">
              <button class="data-tab active" onclick="switchDataTab('overall',this)">📈 Overall</button>
              <button class="data-tab" onclick="switchDataTab('spectrum',this)">🌊 Spectrum</button>
              <button class="data-tab" onclick="switchDataTab('rms',this)">📉 RMS</button>
              <button class="data-tab" onclick="switchDataTab('water',this)">💧 Water</button>
              <button class="data-tab" onclick="switchDataTab('ptp',this)">🎯 Pick to Pick</button>
            </div>
          </div>
          <div class="nd-ctrl-group">
            <label>🔌 Sensor</label>
            <select id="sensorSelect" onchange="onSensorChange()" class="nd-select">
              <option value="all">All Sensors</option>${senOpts}
            </select>
          </div>
          <div class="nd-ctrl-group">
            <label>⏱️ Interval</label>
            <select id="dataIntervalSel" onchange="onIntervalChange()" class="nd-select">${intOpts}</select>
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            <div class="live-dot"></div>
            <span style="font-size:0.78rem;color:var(--success);font-weight:700;">LIVE</span>
          </div>
        </div>
        <div class="nd-download-bar">
          <span style="font-size:0.82rem;font-weight:700;">📥 Download:</span>
          <select id="dlYear" class="nd-select">${yearOpts}</select>
          <select id="dlMonth" class="nd-select">${monthOpts}</select>
          <select id="dlSensor" class="nd-select"><option value="all">All Sensors</option>${senOpts}</select>
          <select id="dlFormat" class="nd-select"><option value="csv">CSV</option><option value="json">JSON</option></select>
          <button class="btn btn-primary btn-sm" onclick="downloadNodeData()">⬇ Download</button>
        </div>
        <div id="tab-overall" class="data-tab-content active">
          <div class="nd-charts-grid" id="overallGrid"></div>
          <div class="nd-live-grid" id="liveValuesGrid"></div>
        </div>
        <div id="tab-spectrum" class="data-tab-content">
          <div class="nd-chart-card" style="margin-bottom:14px;">
            <div class="nd-chart-title">🌊 Vibration Spectrum (FFT)</div>
            <canvas id="spectrumChart" height="140"></canvas>
          </div>
          <div class="nd-chart-card">
            <div class="nd-chart-title">🔊 Ultrasound Spectrum</div>
            <canvas id="ultraChart" height="140"></canvas>
          </div>
        </div>
        <div id="tab-rms" class="data-tab-content">
          <div class="nd-rms-grid" id="rmsGrid"></div>
        </div>
        <div id="tab-water" class="data-tab-content">
          <div class="nd-water-grid" id="waterGrid"></div>
        </div>
        <div id="tab-ptp" class="data-tab-content">
          <div style="margin-bottom:12px;">
            <h4 style="font-size:0.95rem;font-weight:700;">🎯 Pick to Pick Analysis</h4>
            <p style="font-size:0.78rem;color:var(--muted);">Peak (Max) aur Trough (Min) ka difference</p>
          </div>
          <div class="nd-ptp-grid" id="ptpGrid"></div>
          <div class="nd-chart-card" style="margin-top:14px;">
            <div class="nd-chart-title">🎯 Pick to Pick Trend</div>
            <canvas id="ptpChart" height="130"></canvas>
          </div>
        </div>
      </div>
    </div>`;

  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) closeNodeData(); });
  initNodeDataCharts();
  startLiveData();
}

function closeNodeData() {
  if (nodeDataInterval) clearInterval(nodeDataInterval);
  nodeDataInterval = null;
  Object.values(nodeDataCharts).forEach(c => { try { c.destroy(); } catch {} });
  nodeDataCharts = {};
  document.getElementById('nodeDataModal')?.remove();
}

function switchDataTab(tab, btn) {
  document.querySelectorAll('.data-tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.data-tab').forEach(b => b.classList.remove('active'));
  document.getElementById(`tab-${tab}`)?.classList.add('active');
  btn.classList.add('active');
}

function onSensorChange() { renderOverallCharts(); }

function onIntervalChange() {
  if (nodeDataInterval) clearInterval(nodeDataInterval);
  startLiveData();
}

function startLiveData() {
  updateLiveData();
  nodeDataInterval = setInterval(updateLiveData, 3000);
}

function initNodeDataCharts() {
  renderOverallCharts();
  renderSpectrumCharts();
  renderRmsCards();
  renderWaterCards();
  renderPtpCards();
}

function renderOverallCharts() {
  const grid = document.getElementById('overallGrid');
  if (!grid) return;
  const sel = document.getElementById('sensorSelect')?.value || 'all';
  const list = sel === 'all' ? SENSOR_LIST : SENSOR_LIST.filter(s => s.key === sel);
  list.forEach(s => { if (nodeDataCharts[s.key]) { try { nodeDataCharts[s.key].destroy(); } catch {} delete nodeDataCharts[s.key]; } });
  grid.innerHTML = list.map(s => `
    <div class="nd-chart-card">
      <div class="nd-chart-title" style="color:${s.color};">${s.label} (${s.unit})</div>
      <canvas id="chart_${s.key}" height="100"></canvas>
    </div>`).join('');
  list.forEach(s => {
    nodeDataCharts[s.key] = new Chart(document.getElementById(`chart_${s.key}`), {
      type:'line',
      data:{labels:Array.from({length:20},(_,i)=>`${i}s`), datasets:[{label:s.label, data:Array.from({length:20},()=>+(Math.random()*(s.max-s.min)+s.min).toFixed(2)), borderColor:s.color, backgroundColor:s.color+'22', tension:0.4, fill:true, pointRadius:2, borderWidth:2}]},
      options:{responsive:true, animation:false, plugins:{legend:{display:false}}, scales:{y:{min:s.min,max:s.max,grid:{color:'#f1f5f9'}},x:{display:false}}}
    });
  });
}

function renderSpectrumCharts() {
  const fl = Array.from({length:50},(_,i)=>`${i*10}Hz`);
  if (nodeDataCharts.spectrum) { try { nodeDataCharts.spectrum.destroy(); } catch {} }
  if (nodeDataCharts.ultra) { try { nodeDataCharts.ultra.destroy(); } catch {} }
  nodeDataCharts.spectrum = new Chart(document.getElementById('spectrumChart'), {
    type:'bar', data:{labels:fl, datasets:[{data:Array.from({length:50},()=>+(Math.random()*10).toFixed(2)), backgroundColor:'#6366f1aa', borderColor:'#6366f1', borderWidth:1}]},
    options:{responsive:true, animation:false, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true}, x:{ticks:{maxTicksLimit:10}}}}
  });
  nodeDataCharts.ultra = new Chart(document.getElementById('ultraChart'), {
    type:'bar', data:{labels:fl, datasets:[{data:Array.from({length:50},()=>+(Math.random()*8).toFixed(2)), backgroundColor:'#06b6d4aa', borderColor:'#06b6d4', borderWidth:1}]},
    options:{responsive:true, animation:false, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true}, x:{ticks:{maxTicksLimit:10}}}}
  });
}

function renderRmsCards() {
  const grid = document.getElementById('rmsGrid');
  if (!grid) return;
  grid.innerHTML = SENSOR_LIST.map(s => `
    <div class="nd-rms-card" style="border-top:3px solid ${s.color};">
      <div class="nd-rms-label">${s.label} RMS</div>
      <div class="nd-rms-val" id="rms_${s.key}" style="color:${s.color};">--</div>
      <div class="nd-rms-unit">${s.unit}</div>
      <canvas id="rmsChart_${s.key}" height="60"></canvas>
    </div>`).join('');
  SENSOR_LIST.forEach(s => {
    nodeDataCharts[`rms_${s.key}`] = new Chart(document.getElementById(`rmsChart_${s.key}`), {
      type:'line', data:{labels:Array.from({length:20},(_,i)=>`${i}`), datasets:[{data:Array.from({length:20},()=>+(Math.random()*(s.max-s.min)*0.5+s.min).toFixed(2)), borderColor:s.color, backgroundColor:s.color+'22', tension:0.4, fill:true, pointRadius:0, borderWidth:2}]},
      options:{responsive:true, animation:false, plugins:{legend:{display:false}}, scales:{y:{display:false},x:{display:false}}}
    });
  });
}

function renderWaterCards() {
  const grid = document.getElementById('waterGrid');
  if (!grid) return;
  grid.innerHTML = SENSOR_LIST.map(s => `
    <div class="nd-water-card">
      <div class="nd-water-label" style="color:${s.color};">${s.label}</div>
      <div class="nd-water-wrap">
        <div class="nd-water-tank">
          <div class="nd-water-fill" id="wf_${s.key}" style="height:50%;background:linear-gradient(180deg,${s.color},${s.color}88);"></div>
          <div id="wb_${s.key}" style="position:absolute;inset:0;pointer-events:none;"></div>
        </div>
        <div class="nd-water-scale">
          <span>${s.max}</span><span>${(s.max*0.75).toFixed(0)}</span><span>${(s.max*0.5).toFixed(0)}</span><span>${(s.max*0.25).toFixed(0)}</span><span>0</span>
        </div>
      </div>
      <div class="nd-water-val" id="wv_${s.key}" style="color:${s.color};">-- ${s.unit}</div>
    </div>`).join('');
}

function renderPtpCards() {
  const grid = document.getElementById('ptpGrid');
  if (!grid) return;
  grid.innerHTML = SENSOR_LIST.map(s => `
    <div class="nd-ptp-card" style="border-left:4px solid ${s.color};">
      <div style="font-size:0.8rem;font-weight:700;color:${s.color};margin-bottom:8px;">${s.label}</div>
      <div style="display:flex;gap:8px;margin-bottom:8px;">
        <div class="nd-ptp-stat"><div class="nd-ptp-lbl">Peak</div><div class="nd-ptp-val" id="ptpMax_${s.key}" style="color:${s.color};">--</div></div>
        <div class="nd-ptp-stat"><div class="nd-ptp-lbl">Trough</div><div class="nd-ptp-val" id="ptpMin_${s.key}" style="color:#64748b;">--</div></div>
        <div class="nd-ptp-stat"><div class="nd-ptp-lbl">P-P</div><div class="nd-ptp-val" id="ptpPP_${s.key}" style="color:#6366f1;">--</div></div>
        <div class="nd-ptp-stat"><div class="nd-ptp-lbl">Unit</div><div class="nd-ptp-val" style="color:#64748b;">${s.unit}</div></div>
      </div>
      <div style="height:5px;background:var(--border);border-radius:3px;overflow:hidden;">
        <div id="ptpBar_${s.key}" style="height:100%;background:${s.color};width:50%;border-radius:3px;transition:width 0.5s;"></div>
      </div>
    </div>`).join('');
  setTimeout(() => {
    if (nodeDataCharts.ptp) { try { nodeDataCharts.ptp.destroy(); } catch {} }
    const el = document.getElementById('ptpChart');
    if (!el) return;
    nodeDataCharts.ptp = new Chart(el, {
      type:'line',
      data:{labels:Array.from({length:20},(_,i)=>`${i*5}min`), datasets:SENSOR_LIST.map(s=>({label:s.label, data:Array.from({length:20},()=>+(Math.random()*s.max*0.3).toFixed(2)), borderColor:s.color, backgroundColor:'transparent', tension:0.4, pointRadius:3, borderWidth:2}))},
      options:{responsive:true, animation:false, plugins:{legend:{position:'bottom',labels:{font:{size:10}}}}, scales:{y:{beginAtZero:true,grid:{color:'#f1f5f9'}},x:{grid:{color:'#f1f5f9'}}}}
    });
  }, 100);
}

function updateLiveData() {
  const rand = (min,max) => +(Math.random()*(max-min)+min).toFixed(2);
  const vals = { temp:rand(55,95), vib:rand(1,15), press:rand(1,8), rpm:Math.floor(rand(800,2800)), mag:rand(10,80), ultra:rand(20,90) };
  allNodeData.push({ ts:Date.now(), ...vals });
  if (allNodeData.length > 500) allNodeData.shift();

  SENSOR_LIST.forEach(s => {
    const c = nodeDataCharts[s.key];
    if (c) { c.data.datasets[0].data.shift(); c.data.datasets[0].data.push(vals[s.key]); c.update('none'); }
  });

  const lv = document.getElementById('liveValuesGrid');
  if (lv) {
    lv.innerHTML = SENSOR_LIST.map(s => {
      const pct = ((vals[s.key]-s.min)/(s.max-s.min)*100).toFixed(1);
      return `<div class="nd-live-card">
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.8rem;margin-bottom:7px;">
          <span style="font-weight:600;">${s.label}</span>
          <strong style="color:${s.color}">${vals[s.key]} ${s.unit}</strong>
        </div>
        <div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden;">
          <div style="width:${pct}%;height:100%;background:${s.color};border-radius:3px;transition:width 0.5s;"></div>
        </div>
      </div>`;
    }).join('');
  }

  if (nodeDataCharts.spectrum) { nodeDataCharts.spectrum.data.datasets[0].data=Array.from({length:50},()=>+(Math.random()*10).toFixed(2)); nodeDataCharts.spectrum.update('none'); }
  if (nodeDataCharts.ultra) { nodeDataCharts.ultra.data.datasets[0].data=Array.from({length:50},()=>+(Math.random()*8).toFixed(2)); nodeDataCharts.ultra.update('none'); }

  SENSOR_LIST.forEach(s => {
    const el = document.getElementById(`rms_${s.key}`);
    if (el) el.textContent = vals[s.key];
    const c = nodeDataCharts[`rms_${s.key}`];
    if (c) { c.data.datasets[0].data.shift(); c.data.datasets[0].data.push(vals[s.key]); c.update('none'); }
  });

  SENSOR_LIST.forEach(s => {
    const pct = ((vals[s.key]-s.min)/(s.max-s.min)*100);
    const fill = document.getElementById(`wf_${s.key}`);
    const valEl = document.getElementById(`wv_${s.key}`);
    const bubble = document.getElementById(`wb_${s.key}`);
    if (fill) fill.style.height = Math.min(95,Math.max(5,pct))+'%';
    if (valEl) valEl.textContent = `${vals[s.key]} ${s.unit}`;
    if (bubble) bubble.innerHTML = Array.from({length:3},()=>`<div style="position:absolute;bottom:0;left:${Math.random()*80+10}%;width:${Math.random()*8+4}px;height:${Math.random()*8+4}px;border-radius:50%;background:rgba(255,255,255,0.5);animation:rise ${Math.random()*2+1}s linear infinite;"></div>`).join('');
  });

  const recent = allNodeData.slice(-20);
  SENSOR_LIST.forEach(s => {
    const arr = recent.map(d=>d[s.key]);
    if (!arr.length) return;
    const maxV=Math.max(...arr), minV=Math.min(...arr), pp=+(maxV-minV).toFixed(2);
    const pct=(pp/s.max*100).toFixed(1);
    const maxEl=document.getElementById(`ptpMax_${s.key}`);
    const minEl=document.getElementById(`ptpMin_${s.key}`);
    const ppEl=document.getElementById(`ptpPP_${s.key}`);
    const barEl=document.getElementById(`ptpBar_${s.key}`);
    if (maxEl) maxEl.textContent=maxV.toFixed(2);
    if (minEl) minEl.textContent=minV.toFixed(2);
    if (ppEl) ppEl.textContent=pp;
    if (barEl) barEl.style.width=Math.min(100,pct)+'%';
  });

  if (nodeDataCharts.ptp) {
    nodeDataCharts.ptp.data.datasets.forEach((ds,i) => {
      const s=SENSOR_LIST[i];
      const arr=recent.map(d=>d[s.key]);
      if (!arr.length) return;
      const pp=+(Math.max(...arr)-Math.min(...arr)).toFixed(2);
      ds.data.shift(); ds.data.push(pp);
    });
    nodeDataCharts.ptp.update('none');
  }
}

function downloadNodeData() {
  const year=document.getElementById('dlYear').value;
  const month=document.getElementById('dlMonth').value;
  const sensor=document.getElementById('dlSensor').value;
  const format=document.getElementById('dlFormat').value;
  const node=currentNodeForData;
  const list=sensor==='all'?SENSOR_LIST:SENSOR_LIST.filter(s=>s.key===sensor);
  const data=allNodeData.length>0?allNodeData:Array.from({length:10},(_,i)=>({ts:Date.now()-i*60000,...Object.fromEntries(SENSOR_LIST.map(s=>[s.key,+(Math.random()*(s.max-s.min)+s.min).toFixed(2)]))}));
  if (format==='csv') {
    const headers=['Timestamp',...list.map(s=>`${s.label}(${s.unit})`)];
    const rows=data.map(d=>[new Date(d.ts).toISOString(),...list.map(s=>d[s.key])]);
    const csv=[headers,...rows].map(r=>r.join(',')).join('\n');
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
    a.download=`${node.serial_no}_${year}_${String(month).padStart(2,'0')}_${sensor}.csv`;
    a.click();
  } else {
    const json=JSON.stringify({node:node.serial_no,model:node.model,year,month,sensor,data},null,2);
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([json],{type:'application/json'}));
    a.download=`${node.serial_no}_${year}_${String(month).padStart(2,'0')}_${sensor}.json`;
    a.click();
  }
  toast(`✅ Downloaded: ${node.serial_no} ${year}-${String(month).padStart(2,'0')}`,'success');
}

// ===== CONGREGATION =====
let congNode = null, congMotors = [];

async function openCongregation(nodeId) {
  congNode = nodes.find(n=>n.id===nodeId);
  if (!congNode) return;
  congMotors = await api(`/api/nodes/${nodeId}/motors`)||[];
  document.getElementById('congTitle').textContent = `${congNode.model} - ${congNode.serial_no}`;
  document.getElementById('congNodeInfo').innerHTML = `
    <div class="node-icon" style="display:flex;align-items:center;justify-content:center;width:56px;height:56px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:14px;">${NODE_ICON_SVG}</div>
    <div>
      <h3 style="font-size:1rem;font-weight:700;">${congNode.model} — ${congNode.serial_no}</h3>
      <p style="color:var(--muted);font-size:0.84rem;margin-top:5px;">
        ${congNode.frequency} &nbsp;|&nbsp;
        ${congNode.is_ai?'<span class="badge badge-ai">🤖 AI Model</span>':'<span class="badge badge-gray">Standard</span>'}
        &nbsp;|&nbsp; Radio: <span class="mono">${congNode.radio_mac||'-'}</span>
        &nbsp;|&nbsp; BLE: <span class="mono">${congNode.ble_mac||'-'}</span>
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
  grid.innerHTML = congMotors.map(m => {
    const health = m.health_score || 100;
    const healthColor = health >= 75 ? '#28A745' : health >= 50 ? '#FFC107' : '#DC3545';
    const healthLabel = health >= 75 ? '✅ Normal' : health >= 50 ? '⚠️ Warning' : '🔴 Critical';
    return `
    <div class="motor-card ${m.motor_name ? 'saved' : ''}">

      <!-- HEALTH SCORE -->
      <div class="motor-health-bar">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <h5 style="margin:0;">⚙️ ${m.motor_name || 'New Motor'}</h5>
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:0.72rem;font-weight:700;color:${healthColor};">${healthLabel}</span>
            <span class="health-score-badge" style="background:${healthColor};">${health}%</span>
          </div>
        </div>
        <div class="health-track">
          <div class="health-fill" style="width:${health}%;background:${healthColor};"></div>
        </div>
      </div>

      <!-- SECTION: BASIC INFO -->
      <div class="motor-section-title">📋 Asset Information</div>
      <div class="matrix-row"><label>Asset ID</label><input id="mtag_${m.id}" value="${m.motor_tag||''}" placeholder="MTR-001" /></div>
      <div class="matrix-row"><label>Motor Name</label><input id="mn_${m.id}" value="${m.motor_name||''}" placeholder="Cooling Tower Motor" /></div>
      <div class="matrix-row"><label>Location</label><input id="ml_${m.id}" value="${m.location||''}" placeholder="Zone 1 - Floor A" /></div>
      <div class="matrix-row"><label>Health Score</label>
        <div style="display:flex;align-items:center;gap:8px;flex:1;">
          <input type="range" id="mhealth_${m.id}" min="0" max="100" value="${health}"
            oninput="document.getElementById('mhealthval_${m.id}').textContent=this.value+'%'"
            style="flex:1;" />
          <span id="mhealthval_${m.id}" style="font-weight:700;color:${healthColor};min-width:36px;">${health}%</span>
        </div>
      </div>

      <!-- SECTION: MACHINE TYPE -->
      <div class="motor-section-title">🏭 Machine Classification</div>
      <div class="matrix-row"><label>Machine Type</label>
        <select id="mtype_${m.id}">
          ${['Pump','Motor','Compressor','Fan/Blower','Gearbox','Conveyor','Crusher','Turbine','Generator','Agitator','Centrifuge','Other'].map(t=>`<option ${(m.machine_type||'')=== t?'selected':''}>${t}</option>`).join('')}
        </select>
      </div>
      <div class="matrix-row"><label>Machine Make</label><input id="mmake_${m.id}" value="${m.machine_make||''}" placeholder="ABB, Siemens, WEG..." /></div>
      <div class="matrix-row"><label>Machine Model</label><input id="mmodel_${m.id}" value="${m.machine_model||''}" placeholder="Model number" /></div>
      <div class="matrix-row"><label>RPM Type</label>
        <select id="mrpmtype_${m.id}">
          ${['Constant','Variable'].map(t=>`<option ${(m.rpm_type||'Constant')===t?'selected':''}>${t}</option>`).join('')}
        </select>
      </div>
      <div class="matrix-row"><label>Rotor Type</label>
        <select id="mrotor_${m.id}">
          ${['Squirrel Cage','Wound Rotor','Permanent Magnet','Other'].map(t=>`<option ${(m.rotor_type||'')=== t?'selected':''}>${t}</option>`).join('')}
        </select>
      </div>

      <!-- SECTION: ELECTRICAL -->
      <div class="motor-section-title">⚡ Electrical Parameters</div>
      <div class="matrix-row"><label>Power (kW)</label><input type="number" id="mp_${m.id}" value="${m.power_kw||''}" placeholder="7.5" /></div>
      <div class="matrix-row"><label>Voltage (V)</label><input type="number" id="mv_${m.id}" value="${m.voltage||''}" placeholder="415" /></div>
      <div class="matrix-row"><label>Current (A)</label><input type="number" id="mca_${m.id}" value="${m.current_a||''}" placeholder="14.2" /></div>
      <div class="matrix-row"><label>Frequency (Hz)</label><input type="number" id="mfreq_${m.id}" value="${m.motor_freq||''}" placeholder="50" /></div>

      <!-- SECTION: MECHANICAL -->
      <div class="motor-section-title">🔧 Mechanical Parameters</div>
      <div class="matrix-row"><label>Rated RPM</label><input type="number" id="mr_${m.id}" value="${m.rpm||''}" placeholder="1450" /></div>
      <div class="matrix-row"><label>Coupling Type</label>
        <select id="mcoupling_${m.id}">
          ${['Direct','Belt','Gear','Flexible','Fluid','Chain','Other'].map(t=>`<option ${(m.coupling_type||'')=== t?'selected':''}>${t}</option>`).join('')}
        </select>
      </div>

      <!-- SECTION: BEARING DE -->
      <div class="motor-section-title">🔵 Bearing — Drive End (DE)</div>
      <div class="matrix-row"><label>DE Bearing No.</label><input id="mb_${m.id}" value="${m.bearing_type||''}" placeholder="6312-C3" /></div>
      <div class="matrix-row"><label>DE Manufacturer</label>
        <select id="mbdemake_${m.id}">
          ${['SKF','FAG','NSK','NTN','Timken','INA','Other'].map(t=>`<option ${(m.bearing_de_make||'')=== t?'selected':''}>${t}</option>`).join('')}
        </select>
      </div>
      <div class="matrix-row"><label>DE Type</label>
        <select id="mbdetype_${m.id}">
          ${['Ball','Roller','Spherical','Tapered','Needle','Other'].map(t=>`<option ${(m.bearing_de_type||'')=== t?'selected':''}>${t}</option>`).join('')}
        </select>
      </div>

      <!-- SECTION: BEARING NDE -->
      <div class="motor-section-title">🟢 Bearing — Non-Drive End (NDE)</div>
      <div class="matrix-row"><label>NDE Bearing No.</label><input id="mbnde_${m.id}" value="${m.bearing_nde||''}" placeholder="6308-C3" /></div>
      <div class="matrix-row"><label>NDE Manufacturer</label>
        <select id="mbndemake_${m.id}">
          ${['SKF','FAG','NSK','NTN','Timken','INA','Other'].map(t=>`<option ${(m.bearing_nde_make||'')=== t?'selected':''}>${t}</option>`).join('')}
        </select>
      </div>
      <div class="matrix-row"><label>NDE Type</label>
        <select id="mbnde_type_${m.id}">
          ${['Ball','Roller','Spherical','Tapered','Needle','Other'].map(t=>`<option ${(m.bearing_nde_type||'')=== t?'selected':''}>${t}</option>`).join('')}
        </select>
      </div>

      <!-- SECTION: FAULT FREQUENCIES -->
      <div class="motor-section-title">📊 Fault Frequencies (Vibration Analysis)</div>
      <div class="fault-freq-info">These values are used for bearing fault detection in spectrum analysis</div>
      <div class="matrix-row"><label>BPFI (Hz)</label><input type="number" step="0.01" id="mbpfi_${m.id}" value="${m.bpfi||''}" placeholder="Ball Pass Freq Inner" /></div>
      <div class="matrix-row"><label>BPFO (Hz)</label><input type="number" step="0.01" id="mbpfo_${m.id}" value="${m.bpfo||''}" placeholder="Ball Pass Freq Outer" /></div>
      <div class="matrix-row"><label>BSF (Hz)</label><input type="number" step="0.01" id="mbsf_${m.id}" value="${m.bsf||''}" placeholder="Ball Spin Frequency" /></div>

      <!-- SECTION: SENSOR CONFIG -->
      <div class="motor-section-title">📡 Sensor Configuration</div>
      <div class="matrix-row"><label>Sensor Type</label>
        <select id="ms_${m.id}">
          ${['Vibration','Temperature','Vibration + Temperature','Ultrasound','Magnetic Flux','Pressure','RPM','All Sensors'].map(s=>`<option ${m.sensor_type===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
      <div class="matrix-row"><label>Alert Threshold</label><input id="ma_${m.id}" value="${m.alert_threshold||''}" placeholder="85°C / 10mm/s" /></div>

      <!-- SECTION: DATA TIMING (Cloud Config) -->
      <div class="motor-section-title">☁️ Data Collection Timing (Cloud Config)</div>
      <div class="timing-info">⚡ Node will follow these settings — configured from cloud, no code change needed</div>
      <div class="matrix-row"><label>Overall Active</label>
        <select id="moverall_${m.id}" class="timing-select">
          ${[
            {l:'5 Minutes', v:'5min'},
            {l:'15 Minutes',v:'15min'},
            {l:'30 Minutes',v:'30min'},
            {l:'1 Hour',    v:'1hr'},
            {l:'2 Hours',   v:'2hr'},
            {l:'4 Hours',   v:'4hr'},
            {l:'6 Hours',   v:'6hr'},
            {l:'8 Hours',   v:'8hr'},
            {l:'12 Hours',  v:'12hr'},
            {l:'16 Hours',  v:'16hr'},
            {l:'18 Hours',  v:'18hr'},
            {l:'24 Hours',  v:'24hr'},
          ].map(o=>`<option value="${o.v}" ${(m.overall_time||'5min')===o.v?'selected':''}>${o.l}</option>`).join('')}
        </select>
      </div>
      <div class="matrix-row"><label>Spectrum Active</label>
        <select id="mspectrum_${m.id}" class="timing-select">
          ${[
            {l:'15 Minutes',v:'15min'},
            {l:'30 Minutes',v:'30min'},
            {l:'1 Hour',    v:'1hr'},
            {l:'2 Hours',   v:'2hr'},
            {l:'4 Hours',   v:'4hr'},
            {l:'6 Hours',   v:'6hr'},
            {l:'8 Hours',   v:'8hr'},
            {l:'12 Hours',  v:'12hr'},
            {l:'16 Hours',  v:'16hr'},
            {l:'18 Hours',  v:'18hr'},
            {l:'24 Hours',  v:'24hr'},
          ].map(o=>`<option value="${o.v}" ${(m.spectrum_time||'15min')===o.v?'selected':''}>${o.l}</option>`).join('')}
        </select>
      </div>
      <div class="matrix-row"><label>Sleep After</label>
        <select id="msleep_${m.id}" class="timing-select">
          ${[
            {l:'No Sleep',  v:'none'},
            {l:'30 sec',    v:'30s'},
            {l:'1 Minute',  v:'1min'},
            {l:'5 Minutes', v:'5min'},
            {l:'10 Minutes',v:'10min'},
            {l:'30 Minutes',v:'30min'},
            {l:'1 Hour',    v:'1hr'},
          ].map(o=>`<option value="${o.v}" ${(m.sleep_after||'none')===o.v?'selected':''}>${o.l}</option>`).join('')}
        </select>
      </div>

      <!-- CLOUD CONFIG PREVIEW -->
      <div class="cloud-config-preview" id="ccprev_${m.id}">
        <div class="ccp-title">☁️ Node Config Preview</div>
        <div class="ccp-row"><span>Overall:</span><span id="ccov_${m.id}" class="ccp-val">5min</span></div>
        <div class="ccp-row"><span>Spectrum:</span><span id="ccsp_${m.id}" class="ccp-val">15min</span></div>
        <div class="ccp-row"><span>Sleep:</span><span id="ccsl_${m.id}" class="ccp-val">No Sleep</span></div>
        <div class="ccp-row"><span>Status:</span><span class="ccp-val" style="color:#28A745;">✅ Synced to Node</span></div>
      </div>

      <!-- SECTION: NOTES -->
      <div class="motor-section-title">📝 Maintenance Notes</div>
      <div class="matrix-row" style="align-items:flex-start">
        <label style="padding-top:4px">Notes</label>
        <textarea id="mno_${m.id}" rows="3" placeholder="Maintenance history, observations...">${m.notes||''}</textarea>
      </div>

      <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;">
        <button class="btn btn-success btn-sm" onclick="saveMotor(${m.id})">💾 Save Config</button>
        <button class="btn btn-sm" style="background:#06b6d4;color:#fff;" onclick="previewCloudConfig(${m.id})">☁️ Preview</button>
        <button class="btn btn-danger btn-sm" onclick="deleteMotor(${m.id})">🗑️ Remove</button>
      </div>
    </div>`;
  }).join('');

  // Update cloud config previews
  congMotors.forEach(m => updateCloudPreview(m.id));
}

function updateCloudPreview(id) {
  const ov = document.getElementById(`moverall_${id}`)?.value || '5min';
  const sp = document.getElementById(`mspectrum_${id}`)?.value || '15min';
  const sl = document.getElementById(`msleep_${id}`)?.value || 'none';
  const ovEl = document.getElementById(`ccov_${id}`);
  const spEl = document.getElementById(`ccsp_${id}`);
  const slEl = document.getElementById(`ccsl_${id}`);
  if (ovEl) ovEl.textContent = ov;
  if (spEl) spEl.textContent = sp;
  if (slEl) slEl.textContent = sl === 'none' ? 'No Sleep' : sl;
}

function previewCloudConfig(id) {
  updateCloudPreview(id);
  toast('☁️ Config preview updated!', 'info');
}

async function addMotor() {
  const res = await api(`/api/nodes/${congNode.id}/motors`,'POST',{motor_name:'',motor_tag:'',location:'',rpm:'',power_kw:'',voltage:'',current_a:'',bearing_type:'',sensor_type:'Vibration',alert_threshold:'',notes:''});
  if (res&&res.id) { congMotors.push(res); renderMotors(); toast('Motor added!','success'); }
}

async function saveMotor(id) {
  const body = {
    motor_name:     document.getElementById(`mn_${id}`)?.value,
    motor_tag:      document.getElementById(`mtag_${id}`)?.value,
    location:       document.getElementById(`ml_${id}`)?.value,
    machine_type:   document.getElementById(`mtype_${id}`)?.value,
    machine_make:   document.getElementById(`mmake_${id}`)?.value,
    machine_model:  document.getElementById(`mmodel_${id}`)?.value,
    rpm_type:       document.getElementById(`mrpmtype_${id}`)?.value,
    rotor_type:     document.getElementById(`mrotor_${id}`)?.value,
    rpm:            document.getElementById(`mr_${id}`)?.value,
    power_kw:       document.getElementById(`mp_${id}`)?.value,
    voltage:        document.getElementById(`mv_${id}`)?.value,
    current_a:      document.getElementById(`mca_${id}`)?.value,
    motor_freq:     document.getElementById(`mfreq_${id}`)?.value,
    coupling_type:  document.getElementById(`mcoupling_${id}`)?.value,
    bearing_type:   document.getElementById(`mb_${id}`)?.value,
    bearing_de_make:document.getElementById(`mbdemake_${id}`)?.value,
    bearing_de_type:document.getElementById(`mbdetype_${id}`)?.value,
    bearing_nde:    document.getElementById(`mbnde_${id}`)?.value,
    bearing_nde_make:document.getElementById(`mbndemake_${id}`)?.value,
    bearing_nde_type:document.getElementById(`mbnde_type_${id}`)?.value,
    bpfi:           document.getElementById(`mbpfi_${id}`)?.value,
    bpfo:           document.getElementById(`mbpfo_${id}`)?.value,
    bsf:            document.getElementById(`mbsf_${id}`)?.value,
    sensor_type:    document.getElementById(`ms_${id}`)?.value,
    alert_threshold:document.getElementById(`ma_${id}`)?.value,
    overall_time:   document.getElementById(`moverall_${id}`)?.value,
    spectrum_time:  document.getElementById(`mspectrum_${id}`)?.value,
    sleep_after:    document.getElementById(`msleep_${id}`)?.value,
    health_score:   parseInt(document.getElementById(`mhealth_${id}`)?.value || 100),
    notes:          document.getElementById(`mno_${id}`)?.value,
  };
  const res = await api(`/api/motors/${id}`, 'PUT', body);
  if (res && res.id) {
    const i = congMotors.findIndex(m => m.id === id);
    if (i !== -1) congMotors[i] = res;
    updateCloudPreview(id);
    renderMotors();
    toast('✅ Motor config saved & synced to cloud!', 'success');
  }
}


async function deleteMotor(id) {
  if (!confirm('Remove motor?')) return;
  await api(`/api/motors/${id}`,'DELETE');
  congMotors=congMotors.filter(m=>m.id!==id);
  renderMotors(); toast('Removed','success');
}

// ===== SITES =====
function renderSites() {
  document.getElementById('sitesList').innerHTML = sites.length===0
    ?'<div style="padding:20px;text-align:center;color:var(--muted);">No sites yet</div>'
    :sites.map(s=>`<div class="site-item ${currentSite?.id===s.id?'active':''}" onclick="selectSite(${s.id})"><h4>🏭 ${s.name}</h4><p>${s.location||'No location'}</p></div>`).join('');
}

function selectSite(id) {
  currentSite=sites.find(s=>s.id===id);
  document.getElementById('mapTitle').textContent=`🗺️ ${currentSite.name}`;
  document.getElementById('mapEmpty').style.display='none';
  document.getElementById('mapToolbar').style.display='flex';
  renderMap(); renderSites();
}

function renderMap() {
  document.querySelectorAll('#mapCanvas .map-pin').forEach(p=>p.remove());
  (currentSite.map_data||[]).forEach(pin=>addPinToMap(pin));
}

function addPinToMap(pin) {
  const canvas=document.getElementById('mapCanvas');
  const el=document.createElement('div');
  el.className='map-pin';
  el.style.left=pin.x+'%'; el.style.top=pin.y+'%';
  el.dataset.pinId=pin.id;
  el.innerHTML=`
    <div class="pin-marker ${pin.type}" title="${pin.label}">
      ${pin.type==='gw'?'📡':NODE_ICON_SVG}
    </div>
    <div class="pin-label">${pin.label}</div>
    <div class="pin-actions">
      ${pin.type==='nd'?`<span class="pin-btn config-btn" onclick="openPinConfig(${pin.nodeId})">⚙️</span>`:''}
      ${pin.type==='nd'?`<span class="pin-btn move-btn" onclick="startMovePin(${pin.id})">✋</span>`:''}
      ${pin.type==='nd'?`<span class="pin-btn data-btn" onclick="openNodeData(${pin.nodeId})">📊</span>`:''}
      ${pin.type==='gw'?`<span class="pin-btn gw-btn" onclick="showGatewayNodes(${pin.gatewayId})">👁️</span>`:''}
      <span class="pin-btn del-btn" onclick="deletePin(${pin.id})">🗑️</span>
    </div>`;
  if (pin.type==='nd') {
    el.querySelector('.pin-marker').addEventListener('click',e=>{e.stopPropagation();if(movingPinId)return;openPinConfig(pin.nodeId);});
  }
  if (pin.type==='gw') {
    el.querySelector('.pin-marker').addEventListener('click',e=>{e.stopPropagation();showGatewayNodes(pin.gatewayId);});
  }
  canvas.appendChild(el);
}

function startMovePin(pinId) {
  movingPinId=pinId;
  toast('✋ Map pe click karo jahan move karna hai','info');
  document.getElementById('mapCanvas').style.cursor='crosshair';
  document.querySelectorAll('.map-pin').forEach(el=>{
    if(parseInt(el.dataset.pinId)===pinId){el.style.opacity='0.5';el.style.outline='2px dashed #6366f1';el.style.borderRadius='8px';}
  });
}

function deletePin(pinId) {
  currentSite.map_data=(currentSite.map_data||[]).filter(p=>p.id!==pinId);
  document.querySelector(`[data-pin-id="${pinId}"]`)?.remove();
  toast('Pin deleted','success');
}

function openPinConfig(nodeId) {
  if(!nodeId){toast('Node linked nahi hai','warning');return;}
  const node=nodes.find(n=>n.id===parseInt(nodeId));
  if(!node){toast('Node nahi mila!','error');return;}
  openCongregation(node.id);
}

function showGatewayNodes(gatewayId) {
  if(!gatewayId){toast('Gateway linked nahi hai','warning');return;}
  const gw=gateways.find(g=>g.id===parseInt(gatewayId));
  const gwNodes=nodes.filter(n=>n.gateway_id===parseInt(gatewayId));
  document.getElementById('gwPopup')?.remove();
  const popup=document.createElement('div');
  popup.id='gwPopup'; popup.className='gw-popup';
  popup.innerHTML=`
    <div class="gw-popup-header">
      <h4>📡 ${gw?gw.model:'Gateway'} — ${gw?gw.serial_no:''}</h4>
      <button onclick="document.getElementById('gwPopup').remove()">✕</button>
    </div>
    <div class="gw-popup-body">
      ${gwNodes.length===0?'<p style="color:var(--muted);text-align:center;padding:20px;">No nodes linked</p>'
        :gwNodes.map(n=>`<div class="gw-node-item" onclick="openCongregation(${n.id})">
          <span class="badge badge-purple">${n.model}</span>
          <span class="mono">${n.serial_no}</span>
          ${n.is_ai?'<span class="badge badge-ai">🤖 AI</span>':''}
          <span class="badge ${n.status==='active'?'badge-green':'badge-red'}">${n.status}</span>
          <span class="pin-btn config-btn">⚙️</span>
        </div>`).join('')}
    </div>`;
  document.body.appendChild(popup);
}

function addPin(type) {
  addingPin=type;
  toast(`Click map to place ${type==='gateway'?'📡 Gateway':'🔌 Node'} pin`,'info');
}

document.getElementById('mapCanvas').addEventListener('click', e=>{
  const rect=e.currentTarget.getBoundingClientRect();
  const x=((e.clientX-rect.left)/rect.width*100).toFixed(1);
  const y=((e.clientY-rect.top)/rect.height*100).toFixed(1);
  if(movingPinId){
    const pinEl=document.querySelector(`[data-pin-id="${movingPinId}"]`);
    if(pinEl){pinEl.style.left=x+'%';pinEl.style.top=y+'%';pinEl.style.opacity='1';pinEl.style.outline='none';}
    const p=currentSite.map_data.find(p=>p.id===movingPinId);
    if(p){p.x=x;p.y=y;}
    movingPinId=null;
    document.getElementById('mapCanvas').style.cursor='crosshair';
    toast('Pin moved! 💾 Save karo.','success');
    return;
  }
  if(!addingPin||!currentSite) return;
  const label=prompt('Label:',addingPin==='gateway'?'GW-01':'ND-01');
  if(!label){addingPin=null;return;}
  let nodeId=null,gatewayId=null;
  if(addingPin==='node'&&nodes.length>0){
    const sel=nodes.map((n,i)=>`${i+1}. ${n.model} - ${n.serial_no}`).join('\n');
    const choice=prompt(`Konsa node?\n\n${sel}\n\nNumber daalo:`);
    const idx=parseInt(choice)-1;
    if(idx>=0&&nodes[idx]) nodeId=nodes[idx].id;
  }
  if(addingPin==='gateway'&&gateways.length>0){
    const sel=gateways.map((g,i)=>`${i+1}. ${g.model} - ${g.serial_no}`).join('\n');
    const choice=prompt(`Konsa gateway?\n\n${sel}\n\nNumber daalo:`);
    const idx=parseInt(choice)-1;
    if(idx>=0&&gateways[idx]) gatewayId=gateways[idx].id;
  }
  const pin={id:Date.now(),type:addingPin==='gateway'?'gw':'nd',x,y,label,nodeId,gatewayId};
  if(!currentSite.map_data) currentSite.map_data=[];
  currentSite.map_data.push(pin);
  addPinToMap(pin);
  addingPin=null;
});

async function saveMap() {
  if(!currentSite) return;
  await api(`/api/sites/${currentSite.id}/map`,'PUT',{map_data:currentSite.map_data});
  toast('Map saved! ✅','success');
}

async function submitSite(e) {
  e.preventDefault();
  const body={name:document.getElementById('siteName').value,location:document.getElementById('siteLocation').value,description:document.getElementById('siteDesc').value};
  const res=await api('/api/sites','POST',body);
  if(res&&res.id){sites.unshift(res);closeModal('siteModal');e.target.reset();renderSites();toast('Site added!','success');}
}

// ===== USERS =====
async function loadUsers() {
  const users=await api('/api/users')||[];
  document.getElementById('userBody').innerHTML=users.map(u=>`
    <tr>
      <td><strong>${u.name}</strong></td>
      <td>${u.email}</td>
      <td><span class="badge ${u.role==='admin'?'badge-purple':'badge-gray'}">${u.role}</span></td>
      <td style="font-size:0.78rem;color:var(--muted);">${new Date(u.created_at).toLocaleDateString('en-IN')}</td>
      <td>${u.email!=='admin@neurovibe.ai'?`<button class="btn-icon" onclick="deleteUser(${u.id})">🗑️</button>`:'-'}</td>
    </tr>`).join('');
}

async function submitUser(e) {
  e.preventDefault();
  const body={name:document.getElementById('uName').value,email:document.getElementById('uEmail').value,password:document.getElementById('uPassword').value,role:document.getElementById('uRole').value};
  const res=await api('/api/users','POST',body);
  if(res&&res.id){closeModal('userModal');e.target.reset();loadUsers();toast('User created!','success');}
  else toast(res?.error||'Error','error');
}

async function deleteUser(id) {
  if(!confirm('Delete user?')) return;
  await api(`/api/users/${id}`,'DELETE');
  loadUsers(); toast('Deleted','success');
}

// ===== IMPORT/EXPORT =====
async function importCSV(type,input) {
  const file=input.files[0]; if(!file) return;
  const text=await file.text();
  const lines=text.split('\n').filter(l=>l.trim());
  const headers=lines[0].split(',').map(h=>h.replace(/"/g,'').trim());
  const rows=lines.slice(1).map(line=>{
    const vals=line.split(',').map(v=>v.replace(/"/g,'').trim());
    const obj={}; headers.forEach((h,i)=>obj[h]=vals[i]||'');
    return type==='gateways'
      ?{model:obj['Model'],serial_no:obj['Serial No'],imei:obj['IMEI'],radio_mac:obj['Radio MAC'],lan_mac:obj['LAN MAC'],wan_mac:obj['WAN MAC'],ble_mac:obj['BLE MAC'],frequency:obj['Frequency']}
      :{model:obj['Model'],serial_no:obj['Serial No'],radio_mac:obj['Radio MAC'],ble_mac:obj['BLE MAC'],frequency:obj['Frequency'],is_ai:obj['AI Model']};
  });
  const res=await api(`/api/import/${type}`,'POST',{rows});
  toast(`${res?.imported||0} ${type} imported!`,'success');
  await loadAll();
  if(type==='gateways') renderGateways(); else renderNodes();
}

function exportCSV(type) {
  let headers,rows;
  if(type==='gateways'){headers=['Model','Serial No','IMEI','Radio MAC','LAN MAC','WAN MAC','BLE MAC','Frequency','Site'];rows=gateways.map(g=>[g.model,g.serial_no,g.imei,g.radio_mac,g.lan_mac,g.wan_mac,g.ble_mac,g.frequency,g.site]);}
  else{headers=['Model','Serial No','Radio MAC','BLE MAC','Frequency','AI Model','Site'];rows=nodes.map(n=>[n.model,n.serial_no,n.radio_mac,n.ble_mac,n.frequency,n.is_ai?'Yes':'No',n.site]);}
  const csv=[headers,...rows].map(r=>r.map(c=>`"${c||''}"`).join(',')).join('\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download=`neurovibe_${type}_${Date.now()}.csv`;
  a.click(); toast(`${type} exported!`,'success');
}

function filterTable(tableId,query) {
  const q=query.toLowerCase();
  document.querySelectorAll(`#${tableId} tbody tr`).forEach(row=>{
    row.style.display=row.textContent.toLowerCase().includes(q)?'':'none';
  });
}

function openModal(id){document.getElementById(id).style.display='flex';}
function closeModal(id){document.getElementById(id).style.display='none';}
document.querySelectorAll('.modal-overlay').forEach(el=>{
  el.addEventListener('click',e=>{if(e.target===el) el.style.display='none';});
});

function toast(msg,type='info'){
  const c=document.getElementById('toastContainer');
  const t=document.createElement('div');
  t.className=`toast ${type}`;
  const icons={success:'✅',error:'❌',warning:'⚠️',info:'ℹ️'};
  t.innerHTML=`${icons[type]||'ℹ️'} ${msg}`;
  c.appendChild(t);
  setTimeout(()=>t.remove(),3500);
}
