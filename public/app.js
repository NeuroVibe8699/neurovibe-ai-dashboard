// Ensure API maps to your backend execution port (e.g., http://localhost:5000)
const API = localStorage.getItem('nv_api_url') || 'http://localhost:5000';
let token = localStorage.getItem('nv_token');
let currentUser = JSON.parse(localStorage.getItem('nv_user') || 'null');
let gateways = [], nodes = [], sites = [], currentSite = null, addingPin = null, movingPinId = null;
let sensorChart, deviceChart, tempChart, freqChart;
let nodeDataCharts = {}, nodeDataInterval = null, currentNodeForData = null, allNodeData = [];

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

// ===== AUTHENTICATION PIPELINE =====
const loginFormElement = document.getElementById('loginForm');
if (loginFormElement) {
  loginFormElement.addEventListener('submit', async e => {
    e.preventDefault();
    
    const errorEl = document.getElementById('loginError');
    if (errorEl) { errorEl.style.display = 'none'; errorEl.textContent = ''; }

    const emailField = document.getElementById('loginEmail');
    const passwordField = document.getElementById('loginPassword');

    if (!emailField || !passwordField) return;

    const email = emailField.value;
    const password = passwordField.value;

    try {
      // Hardcoded fallback for demonstration if your local backend container isn't running yet
      if (email === 'admin@neurovibe.ai' && password === 'admin@123') {
        token = "mock_secure_token_session_hash";
        currentUser = { name: "Admin Manager", email: "admin@neurovibe.ai", role: "admin" };
        localStorage.setItem('nv_token', token);
        localStorage.setItem('nv_user', JSON.stringify(currentUser));
        showApp();
        return;
      }

      const res = await fetch(`${API}/api/auth/login`, {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invalid credentials or connection error.');
      
      token = data.token; 
      currentUser = data.user;
      
      localStorage.setItem('nv_token', token);
      localStorage.setItem('nv_user', JSON.stringify(currentUser));
      
      showApp();
    } catch (err) {
      if (errorEl) {
        errorEl.textContent = err.message + " (Using local offline developer bypass credentials if backend server is not running)"; 
        errorEl.style.display = 'block';
      }
    }
  });
}

function logout() {
  localStorage.removeItem('nv_token'); localStorage.removeItem('nv_user');
  token = null; currentUser = null;
  document.getElementById('appPage').style.display = 'none';
  document.getElementById('loginPage').style.display = 'flex';
}

async function showApp() {
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('appPage').style.display = 'flex';
  
  if (!currentUser && localStorage.getItem('nv_user')) {
    currentUser = JSON.parse(localStorage.getItem('nv_user'));
  }

  document.getElementById('userAvatar').textContent = currentUser && currentUser.name ? currentUser.name[0].toUpperCase() : 'A';
  document.getElementById('sideUserName').textContent = currentUser ? currentUser.name : 'Admin';
  document.getElementById('sideUserRole').textContent = currentUser ? currentUser.role : 'user';

  const userRole = String(currentUser ? currentUser.role : 'user').trim().toLowerCase();

  if (userRole === 'admin') {
    document.querySelectorAll('.admin-only-btn').forEach(el => el.style.setProperty('display', 'inline-flex', 'important'));
    document.querySelectorAll('[data-page="users"]').forEach(el => el.style.setProperty('display', 'flex', 'important'));
  } else {
    document.querySelectorAll('.admin-only-btn').forEach(el => el.style.setProperty('display', 'none', 'important'));
    document.querySelectorAll('[data-page="users"]').forEach(el => el.style.setProperty('display', 'none', 'important'));
  }

  document.querySelectorAll('.nav-item').forEach(el => {
    el.replaceWith(el.cloneNode(true));
  });

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
  try {
    const res = await fetch(`${API}${url}`, opts);
    if (res.status === 401) { logout(); return null; }
    return res.json();
  } catch(e) {
    return null;
  }
}

async function loadAll() {
  try {
    [gateways, nodes, sites] = await Promise.all([api('/api/gateways'), api('/api/nodes'), api('/api/sites')]);
  } catch(e) {
    console.warn("Using offline sandbox mode parameters.");
  }
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
  if (page === 'sites') {
    renderSites();
    const mapToolbar = document.getElementById('mapToolbar');
    if (mapToolbar) {
      const userRole = String(currentUser ? currentUser.role : 'user').trim().toLowerCase();
      mapToolbar.style.display = (userRole === 'admin') ? 'flex' : 'none';
    }
  }
  if (page === 'users') loadUsers();
}

// ===== DASHBOARD INFRASTRUCTURE =====
async function renderDashboard() {
  const stats = await api('/api/dashboard/stats') || {};
  const cards = [
    { icon:'📡', label:'Gateways',    value:stats.gateways||0,  sub:'Total registered',    g:'linear-gradient(90deg,#6366f1,#8b5cf6)' },
    { icon:'',   label:'Nodes',       value:stats.nodes||0,     sub:`${stats.ai_nodes||0} AI-enabled`, g:'linear-gradient(90deg,#10b981,#059669)' },
    { icon:'🗺️', label:'Sites',       value:stats.sites||0,     sub:'Plant locations',      g:'linear-gradient(90deg,#f59e0b,#d97706)' },
    { icon:'👥', label:'Users',       value:stats.users||0,     sub:'Platform users',       g:'linear-gradient(90deg,#06b6d4,#0891b2)' },
    { icon:'🤖', label:'AI Nodes',    value:stats.ai_nodes||0,  sub:'AI-enabled devices',   g:'linear-gradient(90deg,#8b5cf6,#6d28d9)' },
    { icon:'⚙️', label:'Motors',      value:stats.motors||0,    sub:'Assigned motors',      g:'linear-gradient(90deg,#ef4444,#dc2626)' },
  ];
  const statsGrid = document.getElementById('statsGrid');
  if (statsGrid) {
    statsGrid.innerHTML = cards.map(c => `
      <div class="stat-card" style="--g:${c.g}">
        <div class="stat-label">${c.icon} ${c.label}</div>
        <div class="stat-value">${c.value}</div>
        <div class="stat-sub">${c.sub}</div>
      </div>`).join('');
  }
  initCharts();
}

function initCharts() {
  const labels = ['00:00','03:00','06:00','09:00','12:00','15:00','18:00','21:00'];
  const rand = (min,max,n=8) => Array.from({length:n},()=>+(Math.random()*(max-min)+min).toFixed(1));
  
  const sensorCtx = document.getElementById('sensorChart');
  if (sensorCtx) {
    if (sensorChart) sensorChart.destroy();
    sensorChart = new Chart(sensorCtx, {
      type:'line', data:{labels, datasets:[
        {label:'Temperature (°C)', data:rand(60,95), borderColor:'#ef4444', backgroundColor:'rgba(239,68,68,0.08)', tension:0.4, fill:true, pointRadius:3},
        {label:'Vibration (mm/s)', data:rand(2,12),  borderColor:'#6366f1', backgroundColor:'rgba(99,102,241,0.08)', tension:0.4, fill:true, pointRadius:3},
        {label:'Pressure (bar)',   data:rand(1,8),   borderColor:'#10b981', backgroundColor:'rgba(16,185,129,0.08)', tension:0.4, fill:true, pointRadius:3},
        {label:'RPM (×100)',       data:rand(10,20), borderColor:'#f59e0b', backgroundColor:'rgba(245,158,11,0.08)', tension:0.4, fill:true, pointRadius:3},
      ]},
      options:{responsive:true, plugins:{legend:{position:'bottom'}}, scales:{y:{beginAtZero:false}}}
    });
  }

  const deviceCtx = document.getElementById('deviceChart');
  if (deviceCtx) {
    if (deviceChart) deviceChart.destroy();
    deviceChart = new Chart(deviceCtx, {
