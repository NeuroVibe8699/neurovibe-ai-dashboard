require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'neurovibe2024secret';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'viewer',
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS gateways (
        id SERIAL PRIMARY KEY,
        model VARCHAR(20) NOT NULL,
        serial_no VARCHAR(100) UNIQUE NOT NULL,
        imei VARCHAR(20),
        radio_mac VARCHAR(20),
        lan_mac VARCHAR(20),
        wan_mac VARCHAR(20),
        ble_mac VARCHAR(20),
        frequency VARCHAR(10),
        site VARCHAR(100),
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS nodes (
        id SERIAL PRIMARY KEY,
        model VARCHAR(20) NOT NULL,
        serial_no VARCHAR(100) UNIQUE NOT NULL,
        radio_mac VARCHAR(20),
        ble_mac VARCHAR(20),
        frequency VARCHAR(10),
        is_ai BOOLEAN DEFAULT false,
        gateway_id INTEGER REFERENCES gateways(id),
        site VARCHAR(100),
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS motors (
        id SERIAL PRIMARY KEY,
        node_id INTEGER REFERENCES nodes(id) ON DELETE CASCADE,
        motor_name VARCHAR(100),
        motor_tag VARCHAR(50),
        location VARCHAR(100),
        rpm VARCHAR(20),
        power_kw VARCHAR(20),
        voltage VARCHAR(20),
        current_a VARCHAR(20),
        bearing_type VARCHAR(100),
        sensor_type VARCHAR(100),
        alert_threshold VARCHAR(50),
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS sites (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        location VARCHAR(200),
        description TEXT,
        map_data JSONB DEFAULT '[]',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    const existing = await pool.query("SELECT id FROM users WHERE email = 'admin@neurovibe.ai'");
    if (existing.rows.length === 0) {
      const hash = await bcrypt.hash('admin@123', 10);
      await pool.query("INSERT INTO users (name,email,password,role) VALUES ($1,$2,$3,$4)",
        ['Admin', 'admin@neurovibe.ai', hash, 'admin']);
    }
    console.log('DB ready');
  } catch (err) { console.error('DB error:', err.message); }
}

function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
}
function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const r = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
    const user = r.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      JWT_SECRET, { expiresIn: '24h' }
    );
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/users', auth, adminOnly, async (req, res) => {
  const r = await pool.query('SELECT id,name,email,role,created_at FROM users ORDER BY id');
  res.json(r.rows);
});
app.post('/api/users', auth, adminOnly, async (req, res) => {
  const { name, email, password, role } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    const r = await pool.query('INSERT INTO users (name,email,password,role) VALUES ($1,$2,$3,$4) RETURNING id,name,email,role',
      [name, email, hash, role || 'viewer']);
    res.json(r.rows[0]);
  } catch (err) { res.status(400).json({ error: err.message }); }
});
app.delete('/api/users/:id', auth, adminOnly, async (req, res) => {
  await pool.query('DELETE FROM users WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

app.get('/api/gateways', auth, async (req, res) => {
  const r = await pool.query('SELECT * FROM gateways ORDER BY id DESC');
  res.json(r.rows);
});
app.post('/api/gateways', auth, async (req, res) => {
  const { model, serial_no, imei, radio_mac, lan_mac, wan_mac, ble_mac, frequency, site } = req.body;
  try {
    const r = await pool.query(
      'INSERT INTO gateways (model,serial_no,imei,radio_mac,lan_mac,wan_mac,ble_mac,frequency,site) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
      [model, serial_no, imei, radio_mac, lan_mac, wan_mac, ble_mac, frequency, site]);
    res.json(r.rows[0]);
  } catch (err) { res.status(400).json({ error: err.message }); }
});
app.delete('/api/gateways/:id', auth, async (req, res) => {
  await pool.query('DELETE FROM gateways WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

app.get('/api/nodes', auth, async (req, res) => {
  const r = await pool.query(
    'SELECT n.*,g.model as gateway_model,g.serial_no as gateway_serial FROM nodes n LEFT JOIN gateways g ON n.gateway_id=g.id ORDER BY n.id DESC'
  );
  res.json(r.rows);
});
app.post('/api/nodes', auth, async (req, res) => {
  const { model, serial_no, radio_mac, ble_mac, frequency, is_ai, gateway_id, site } = req.body;
  try {
    const r = await pool.query(
      'INSERT INTO nodes (model,serial_no,radio_mac,ble_mac,frequency,is_ai,gateway_id,site) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
      [model, serial_no, radio_mac, ble_mac, frequency, is_ai || false, gateway_id || null, site]);
    res.json(r.rows[0]);
  } catch (err) { res.status(400).json({ error: err.message }); }
});
app.delete('/api/nodes/:id', auth, async (req, res) => {
  await pool.query('DELETE FROM nodes WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

app.get('/api/nodes/:id/motors', auth, async (req, res) => {
  const r = await pool.query('SELECT * FROM motors WHERE node_id=$1 ORDER BY id', [req.params.id]);
  res.json(r.rows);
});
app.post('/api/nodes/:id/motors', auth, async (req, res) => {
  const { motor_name, motor_tag, location, rpm, power_kw, voltage, current_a, bearing_type, sensor_type, alert_threshold, notes } = req.body;
  const r = await pool.query(
    'INSERT INTO motors (node_id,motor_name,motor_tag,location,rpm,power_kw,voltage,current_a,bearing_type,sensor_type,alert_threshold,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *',
    [req.params.id, motor_name, motor_tag, location, rpm, power_kw, voltage, current_a, bearing_type, sensor_type, alert_threshold, notes]);
  res.json(r.rows[0]);
});
app.put('/api/motors/:id', auth, async (req, res) => {
  const { motor_name, motor_tag, location, rpm, power_kw, voltage, current_a, bearing_type, sensor_type, alert_threshold, notes } = req.body;
  const r = await pool.query(
    'UPDATE motors SET motor_name=$1,motor_tag=$2,location=$3,rpm=$4,power_kw=$5,voltage=$6,current_a=$7,bearing_type=$8,sensor_type=$9,alert_threshold=$10,notes=$11 WHERE id=$12 RETURNING *',
    [motor_name, motor_tag, location, rpm, power_kw, voltage, current_a, bearing_type, sensor_type, alert_threshold, notes, req.params.id]);
  res.json(r.rows[0]);
});
app.delete('/api/motors/:id', auth, async (req, res) => {
  await pool.query('DELETE FROM motors WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

app.get('/api/sites', auth, async (req, res) => {
  const r = await pool.query('SELECT * FROM sites ORDER BY id DESC');
  res.json(r.rows);
});
app.post('/api/sites', auth, async (req, res) => {
  const { name, location, description } = req.body;
  const r = await pool.query('INSERT INTO sites (name,location,description) VALUES ($1,$2,$3) RETURNING *',
    [name, location, description]);
  res.json(r.rows[0]);
});
app.put('/api/sites/:id/map', auth, async (req, res) => {
  const { map_data } = req.body;
  const r = await pool.query('UPDATE sites SET map_data=$1 WHERE id=$2 RETURNING *',
    [JSON.stringify(map_data), req.params.id]);
  res.json(r.rows[0]);
});
app.delete('/api/sites/:id', auth, async (req, res) => {
  await pool.query('DELETE FROM sites WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

app.get('/api/dashboard/stats', auth, async (req, res) => {
  try {
    const [gw, nd, st, us, ai, mt] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM gateways'),
      pool.query('SELECT COUNT(*) FROM nodes'),
      pool.query('SELECT COUNT(*) FROM sites'),
      pool.query('SELECT COUNT(*) FROM users'),
      pool.query('SELECT COUNT(*) FROM nodes WHERE is_ai=true'),
      pool.query('SELECT COUNT(*) FROM motors'),
    ]);
    res.json({
      gateways: +gw.rows[0].count, nodes: +nd.rows[0].count,
      sites: +st.rows[0].count, users: +us.rows[0].count,
      ai_nodes: +ai.rows[0].count, motors: +mt.rows[0].count
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/import/gateways', auth, async (req, res) => {
  const { rows } = req.body; let count = 0;
  for (const r of rows) {
    try {
      await pool.query(
        'INSERT INTO gateways (model,serial_no,imei,radio_mac,lan_mac,wan_mac,ble_mac,frequency) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (serial_no) DO NOTHING',
        [r.model, r.serial_no, r.imei, r.radio_mac, r.lan_mac, r.wan_mac, r.ble_mac, r.frequency]);
      count++;
    } catch {}
  }
  res.json({ imported: count });
});

app.post('/api/import/nodes', auth, async (req, res) => {
  const { rows } = req.body; let count = 0;
  for (const r of rows) {
    try {
      await pool.query(
        'INSERT INTO nodes (model,serial_no,radio_mac,ble_mac,frequency,is_ai) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (serial_no) DO NOTHING',
        [r.model, r.serial_no, r.radio_mac, r.ble_mac, r.frequency, r.is_ai === 'Yes']);
      count++;
    } catch {}
  }
  res.json({ imported: count });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

initDB().then(() => app.listen(PORT, () => console.log(`NeuroVibe running on port ${PORT}`)));
