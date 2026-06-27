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

// ===== DEMO DATA STORE =====
let _demoGateways = [], _demoNodes = [], _demoSites = [], _demoUsers = [
  { id:1, name:'Admin', email:'admin@neurovibe.ai', role:'admin', created_at: new Date().toISOString() }
];
let _demoMotors = {};
let _demoIdCounter = 100;

function demoApi(url, method, body) {
  const newId = () => ++_demoIdCounter;

  if (url === '/api/dashboard/stats') return Promise.resolve({
    gateways: _demoGateways.length, nodes: _demoNodes.length,
    sites: _demoSites.length, users: _demoUsers.length,
    ai_nodes: _demoNodes.filter(n=>n.is_ai).length,
    motors: Object.values(_demoMotors).flat().length
  });

  // GATEWAYS
  if (url === '/api/gateways' && method === 'GET') return Promise.resolve([..._demoGateways]);
  if (url === '/api/gateways' && method === 'POST') {
    const gw = { id:newId(), ...body, status:'active' };
    _demoGateways.unshift(gw); return Promise.resolve(gw);
  }
  if (url.match(/\/api\/gateways\/\d+/) && method === 'DELETE') {
    const gid = parseInt(url.split('/')[3]);
    _demoGateways = _demoGateways.filter(g=>g.id!==gid);
    return Promise.resolve({});
  }

  // NODES
  if (url === '/api/nodes' && method === 'GET') return Promise.resolve([..._demoNodes]);
  if (url === '/api/nodes' && method === 'POST') {
    const gw = _demoGateways.find(g=>g.id===parseInt(body.gateway_id));
    const nd = { id:newId(), ...body, status:'active', gateway_model: gw?.model||null };
    _demoNodes.unshift(nd); return Promise.resolve(nd);
  }
  if (url.match(/\/api\/nodes\/\d+\/motors/) && method === 'GET') {
    const nid = parseInt(url.split('/')[3]);
    return Promise.resolve(_demoMotors[nid] || []);
  }
  if (url.match(/\/api\/nodes\/\d+\/motors/) && method === 'POST') {
    const nid = parseInt(url.split('/')[3]);
    const motor = { id:newId(), ...body, health_score:100 };
    if (!_demoMotors[nid]) _demoMotors[nid] = [];
    _demoMotors[nid].push(motor); return Promise.resolve(motor);
  }
  if (url.match(/\/api\/nodes\/\d+/) && method === 'DELETE') {
    const nid = parseInt(url.split('/')[3]);
    _demoNodes = _demoNodes.filter(n=>n.id!==nid);
    return Promise.resolve({});
  }

  // MOTORS
  if (url.match(/\/api\/motors\/\d+/) && method === 'PUT') {
    const mid = parseInt(url.split('/')[3]);
    for (const nid in _demoMotors) {
      const idx = _demoMotors[nid].findIndex(m=>m.id===mid);
      if (idx !== -1) {
        _demoMotors[nid][idx] = { ..._demoMotors[nid][idx], ...body, id:mid };
        return Promise.resolve(_demoMotors[nid][idx]);
      }
    }
    return Promise.resolve({});
  }
  if (url.match(/\/api\/motors\/\d+/) && method === 'DELETE') {
    const mid = parseInt(url.split('/')[3]);
    for (const nid in _demoMotors) {
      _demoMotors[nid] = _demoMotors[nid].filter(m=>m.id!==mid);
    }
    return Promise.resolve({});
  }

  // SITES
  if (url === '/api/sites' && method === 'GET') return Promise.resolve([..._demoSites]);
  if (url === '/api/sites' && method === 'POST') {
    const site = { id:newId(), ...body, map_data:[] };
    _demoSites.unshift(site); return Promise.resolve(site);
  }
  if (url.match(/\/api\/sites\/\d+\/map/) && method === 'PUT') {
    const sid = parseInt(url.split('/')[3]);
    const site = _demoSites.find(s=>s.id===sid);
    if (site) site.map_data = body.map_data;
    return Promise.resolve({});
  }

  // USERS
  if (url === '/api/users' && method === 'GET') return Promise.resolve([..._demoUsers]);
  if (url === '/api/users' && method === 'POST') {
    const user = { id:newId(), ...body, created_at: new Date().toISOString() };
    _demoUsers.push(user); return Promise.resolve(user);
  }
  if (url.match(/\/api\/users\/\d+/) && method === 'DELETE') {
    const uid = parseInt(url.split('/')[3]);
    _demoUsers = _demoUsers.filter(u=>u.id!==uid);
    return Promise.resolve({});
  }

  // IMPORT
  if (url.match(/\/api\/import\//) && method === 'POST') {
    const type = url.split('/')[3];
    if (type === 'gateways') {
      body.rows.forEach(r => { if(r.model) _demoGateways.push({ id:newId(), ...r, status:'active' }); });
      return Promise.resolve({ imported: body.rows.length });
    } else {
      body.rows.forEach(r => { if(r.model) _demoNodes.push({ id:newId(), ...r, status:'active' }); });
      return Promise.resolve({ imported: body.rows.length });
    }
  }

  return Promise.resolve(null);
}

// ===== AUTH =====
document.getElementById('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;

  if (email === 'admin@neurovibe.ai' && password === 'admin@123') {
    token = 'demo-token';
    currentUser = { name:'Admin', role:'admin', email:'admin@neurovibe.ai' };
    localStorage.setItem('nv_token', token);
    localStorage.setItem('nv_user', JSON.stringify(currentUser));
    showApp();
    return;
  }

  const el = document.getElementById('loginError');
  el.textContent = 'Invalid email or password';
  el.style.display = 'block';
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
  if (el) el.textContent = new Date().toLocaleString('en-IN', { dateStyle:'medium', timeStyle:'medium' });
}

if (token && currentUser) showApp();

async function api(url, method = 'GET', body = null) {
  if (token === 'demo-token') return demoApi(url, method, body);
  const opts = { method, headers: { 'Authorization':`Bearer ${token}`, 'Content-Type':'application/json' } };
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
    { icon:'📡', label:'Gateways',  value:stats.gateways||0, sub:'Total registered',       g:'linear-gradient(90deg,#6366f1,#8b5cf6)' },
    { icon:'🔌', label:'Nodes',     value:stats.nodes||0,    sub:`${stats.ai_nodes||0} AI-enabled`, g:'linear-gradient(90deg,#10b981,#059669)' },
    { icon:'🗺️', label:'Sites',     value:stats.sites||0,    sub:'Plant locations',         g:'linear-gradient(90deg,#f59e0b,#d97706)' },
    { icon:'👥', label:'Users',     value:stats.users||0,    sub:'Platform users',          g:'linear-gradient(90deg,#06b6d4,#0891b2)' },
    { icon:'🤖', label:'AI Nodes',  value:stats.ai_nodes||0, sub:'AI-enabled devices',      g:'linear-gradient(90deg,#8b5cf6,#6d28d9)' },
    { icon:'⚙️', label:'Motors',    value:stats.motors||0,   sub:'Assigned motors',         g:'linear-gradient(90deg,#ef4444,#dc2626)' },
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
        <td><div style="display:flex;align-items:center;gap:8px;"><span style="display:inline-flex;">${NODE_ICON_SVG}</span><span class="badge badge-purple">${n.model}</span></div></td>
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
  setTimeout(() => {
    if (tab === 'spectrum') { nodeDataCharts.spectrum?.resize(); nodeDataCharts.ultra?.resize(); }
    else if (tab === 'rms') { SENSOR_LIST.forEach(s => nodeDataCharts[`rms_${s.key}`]?.resize()); }
    else if (tab === 'ptp') { nodeDataCharts.ptp?.resize(); }
  }, 50);
}

function onSensorChange() { renderOverallCharts(); }
function onIntervalChange() { if (nodeDataInterval) clearInterval(nodeDataInterval); startLiveData(); }
function startLiveData() { updateLiveData(); nodeDataInterval = setInterval(updateLiveData, 3000); }

function initNodeDataCharts() {
  renderOverallCharts();
  const tabEl = document.getElementById('tab-spectrum');
  if (tabEl) { tabEl.style.display='block'; tabEl.style.visibility='hidden'; tabEl.style.position='absolute'; }
  renderSpectrumCharts();
  if (tabEl) { tabEl.style.display=''; tabEl.style.visibility=''; tabEl.style.position=''; }
  renderRmsCards();
  renderWaterCards();
  renderPtpCards();
}

function renderOverallCharts() {
  const grid = document.getElementById('overallGrid');
  if (!grid) return;
  const sel = document.getElementById('sensorSelect')?.value || 'all';
  const list = sel === 'all' ? SENSOR_LIST : SENSOR_LIST.filter(s => s.key === sel);
  list.forEach(s => { if (nodeDataCharts[s.key]) { try { nodeDataCharts[s.key].destroy(); } catch {} delete
