'use strict';

/**
 * Ideioworld Panel — zero-dependency server.
 * Uses only Node.js built-in modules (http, sqlite, crypto, fs, path).
 * No `npm install` required — just: node src/server.js
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const config = require('./config');
const db = require('./db');
const { parseMultipart } = require('./multipart');

const MAX_BODY = 80 * 1024 * 1024;   // 80 MB total request
const MAX_FILE = 15 * 1024 * 1024;   // 15 MB per file

// In-memory session store (fine for a local single-process app).
const sessions = new Map(); // token -> { username }

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */
function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('Payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > -1) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function getSession(req) {
  const token = parseCookies(req).sid;
  return token && sessions.has(token) ? sessions.get(token) : null;
}

function saveFile(file) {
  if (!file || !file.data || !file.data.length) return null;
  if (file.data.length > MAX_FILE) throw new Error(`"${file.filename}" exceeds 15MB limit`);
  const safe = file.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const unique = crypto.randomBytes(6).toString('hex');
  const name = `${Date.now()}-${unique}-${safe}`;
  fs.writeFileSync(path.join(config.paths.uploads, name), file.data);
  return name;
}

function removeFile(name) {
  if (!name) return;
  fs.unlink(path.join(config.paths.uploads, name), () => {});
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.pdf': 'application/pdf', '.txt': 'text/plain',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

// Prevent path traversal for static/upload paths.
function safeJoin(base, target) {
  const p = path.normalize(path.join(base, target));
  return p.startsWith(base) ? p : null;
}

/* ------------------------------------------------------------------ *
 * Records data layer
 * ------------------------------------------------------------------ */
const FIELDS = [
  'business_name', 'owner_name', 'contact_no', 'email', 'location',
  'category', 'business_type', 'gst_no', 'timings', 'menu_services',
  'deal', 'status', 'notes', 'description', 'start_date', 'closed_days',
  'mobility',
];

function rowToRecord(row) {
  if (!row) return null;
  let images = [];
  try { images = JSON.parse(row.images || '[]'); } catch { images = []; }
  return { ...row, images };
}
const nowISO = () => new Date().toISOString();

function runQuery(sql, params) {
  const stmt = db.prepare(sql);
  return Object.keys(params).length ? stmt.all(params) : stmt.all();
}

/* ------------------------------------------------------------------ *
 * API handlers
 * ------------------------------------------------------------------ */
async function handleApi(req, res, url) {
  const { pathname } = url;
  const method = req.method;

  // --- Auth-free endpoints ---
  if (pathname === '/api/login' && method === 'POST') {
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    if (body.username === config.auth.username && body.password === config.auth.password) {
      const token = crypto.randomBytes(24).toString('hex');
      sessions.set(token, { username: body.username });
      res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; Path=/; Max-Age=28800; SameSite=Lax`);
      return sendJSON(res, 200, { ok: true });
    }
    return sendJSON(res, 401, { error: 'Invalid username or password' });
  }

  if (pathname === '/api/logout' && method === 'POST') {
    const token = parseCookies(req).sid;
    if (token) sessions.delete(token);
    res.setHeader('Set-Cookie', 'sid=; HttpOnly; Path=/; Max-Age=0');
    return sendJSON(res, 200, { ok: true });
  }

  // --- Everything below requires auth ---
  const sess = getSession(req);
  if (!sess) return sendJSON(res, 401, { error: 'Not authenticated' });

  if (pathname === '/api/me' && method === 'GET') {
    return sendJSON(res, 200, { user: sess });
  }
  if (pathname === '/api/options' && method === 'GET') {
    return sendJSON(res, 200, config.options);
  }
  if (pathname === '/api/stats' && method === 'GET') {
    return handleStats(res);
  }
  if (pathname === '/api/export.csv' && method === 'GET') {
    return handleExport(res, url);
  }

  // /api/records ...
  if (pathname === '/api/records' && method === 'GET') return handleList(res, url);
  if (pathname === '/api/records' && method === 'POST') return handleCreate(req, res);

  const idMatch = /^\/api\/records\/(\d+)$/.exec(pathname);
  if (idMatch) {
    const id = idMatch[1];
    if (method === 'GET') return handleGetOne(res, id);
    if (method === 'PUT') return handleUpdate(req, res, id);
    if (method === 'DELETE') return handleDelete(res, id);
  }

  return sendJSON(res, 404, { error: 'Unknown endpoint' });
}

function handleList(res, url) {
  const q = url.searchParams;
  const where = [];
  const params = {};
  const add = (key, col) => {
    const v = q.get(key);
    if (v) { where.push(`${col} = @${key}`); params[key] = v; }
  };
  add('type', 'type');
  add('category', 'category');
  add('status', 'status');
  add('business_type', 'business_type');
  const search = q.get('q');
  if (search) {
    where.push(`(business_name LIKE @q OR owner_name LIKE @q OR contact_no LIKE @q
      OR email LIKE @q OR location LIKE @q OR category LIKE @q OR gst_no LIKE @q
      OR menu_services LIKE @q OR notes LIKE @q)`);
    params.q = `%${search}%`;
  }
  const sql = `SELECT * FROM records
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY updated_at DESC`;
  const rows = runQuery(sql, params).map(rowToRecord);
  sendJSON(res, 200, rows);
}

function handleGetOne(res, id) {
  const row = db.prepare('SELECT * FROM records WHERE id = ?').get(id);
  if (!row) return sendJSON(res, 404, { error: 'Not found' });
  sendJSON(res, 200, rowToRecord(row));
}

async function parseForm(req) {
  const buf = await readBody(req);
  const ct = req.headers['content-type'] || '';
  if (ct.includes('multipart/form-data')) return parseMultipart(buf, ct);
  if (ct.includes('application/json')) {
    return { fields: JSON.parse(buf.toString('utf8') || '{}'), files: {} };
  }
  // urlencoded fallback
  const fields = {};
  new URLSearchParams(buf.toString('utf8')).forEach((v, k) => { fields[k] = v; });
  return { fields, files: {} };
}

async function handleCreate(req, res) {
  let form;
  try { form = await parseForm(req); } catch (e) { return sendJSON(res, 400, { error: e.message }); }
  const b = form.fields;
  if (!b.business_name || !b.business_name.trim()) {
    return sendJSON(res, 400, { error: 'Business Name is required' });
  }
  let logo = null, owner_photo = null, document = null, images = [];
  try {
    logo = form.files.logo ? saveFile(form.files.logo[0]) : null;
    owner_photo = form.files.owner_photo ? saveFile(form.files.owner_photo[0]) : null;
    document = form.files.document ? saveFile(form.files.document[0]) : null;
    if (form.files.images) images = form.files.images.map(saveFile).filter(Boolean);
  } catch (e) { return sendJSON(res, 400, { error: e.message }); }

  const record = {
    type: b.type === 'mobile_hut' ? 'mobile_hut' : 'business',
    business_name: b.business_name.trim(),
    owner_name: b.owner_name || null,
    contact_no: b.contact_no || null,
    email: b.email || null,
    location: b.location || null,
    category: b.category || null,
    business_type: b.business_type || null,
    gst_no: b.gst_no || null,
    timings: b.timings || null,
    menu_services: b.menu_services || null,
    deal: b.deal || null,
    status: b.status || 'New Lead',
    notes: b.notes || null,
    description: b.description || null,
    start_date: b.start_date || null,
    closed_days: b.closed_days || null,
    mobility: b.mobility || null,
    logo, owner_photo, document,
    images: JSON.stringify(images),
    created_at: nowISO(),
    updated_at: nowISO(),
  };
  const cols = Object.keys(record);
  const sql = `INSERT INTO records (${cols.join(',')}) VALUES (${cols.map((c) => '@' + c).join(',')})`;
  const info = db.prepare(sql).run(record);
  const row = db.prepare('SELECT * FROM records WHERE id = ?').get(info.lastInsertRowid);
  sendJSON(res, 201, rowToRecord(row));
}

async function handleUpdate(req, res, id) {
  const existing = db.prepare('SELECT * FROM records WHERE id = ?').get(id);
  if (!existing) return sendJSON(res, 404, { error: 'Not found' });

  let form;
  try { form = await parseForm(req); } catch (e) { return sendJSON(res, 400, { error: e.message }); }
  const b = form.fields;

  const updates = {};
  for (const f of FIELDS) {
    if (b[f] !== undefined) updates[f] = b[f] === '' ? null : b[f];
  }
  if (b.business_name !== undefined && !String(b.business_name).trim()) {
    return sendJSON(res, 400, { error: 'Business Name cannot be empty' });
  }

  try {
    if (form.files.logo) { removeFile(existing.logo); updates.logo = saveFile(form.files.logo[0]); }
    if (form.files.owner_photo) { removeFile(existing.owner_photo); updates.owner_photo = saveFile(form.files.owner_photo[0]); }
    if (form.files.document) { removeFile(existing.document); updates.document = saveFile(form.files.document[0]); }

    let keep = [];
    try { keep = JSON.parse(b.existing_images || '[]'); } catch { keep = []; }
    let current = [];
    try { current = JSON.parse(existing.images || '[]'); } catch { current = []; }
    current.filter((img) => !keep.includes(img)).forEach(removeFile);
    const added = form.files.images ? form.files.images.map(saveFile).filter(Boolean) : [];
    updates.images = JSON.stringify([...keep, ...added]);
  } catch (e) { return sendJSON(res, 400, { error: e.message }); }

  updates.updated_at = nowISO();

  const cols = Object.keys(updates);
  const sql = `UPDATE records SET ${cols.map((c) => `${c} = @${c}`).join(', ')} WHERE id = @id`;
  db.prepare(sql).run({ ...updates, id });
  const row = db.prepare('SELECT * FROM records WHERE id = ?').get(id);
  sendJSON(res, 200, rowToRecord(row));
}

function handleDelete(res, id) {
  const row = db.prepare('SELECT * FROM records WHERE id = ?').get(id);
  if (!row) return sendJSON(res, 404, { error: 'Not found' });
  removeFile(row.logo);
  removeFile(row.owner_photo);
  removeFile(row.document);
  try { JSON.parse(row.images || '[]').forEach(removeFile); } catch { /* ignore */ }
  db.prepare('DELETE FROM records WHERE id = ?').run(id);
  sendJSON(res, 200, { ok: true });
}

function handleStats(res) {
  const total = db.prepare('SELECT COUNT(*) c FROM records').get().c;
  const byType = db.prepare('SELECT type, COUNT(*) c FROM records GROUP BY type').all();
  const byStatus = db.prepare('SELECT status, COUNT(*) c FROM records GROUP BY status').all();
  const byCategory = db.prepare(
    `SELECT COALESCE(NULLIF(category,''),'Uncategorised') category, COUNT(*) c
     FROM records GROUP BY category ORDER BY c DESC LIMIT 10`
  ).all();
  const recent = db.prepare('SELECT * FROM records ORDER BY created_at DESC LIMIT 5')
    .all().map(rowToRecord);
  sendJSON(res, 200, { total, byType, byStatus, byCategory, recent });
}

function handleExport(res, url) {
  const type = url.searchParams.get('type');
  const rows = type
    ? db.prepare('SELECT * FROM records WHERE type = ? ORDER BY created_at DESC').all(type)
    : db.prepare('SELECT * FROM records ORDER BY created_at DESC').all();

  const cols = ['id', 'type', 'business_name', 'owner_name', 'contact_no', 'email',
    'location', 'category', 'business_type', 'gst_no', 'timings', 'menu_services',
    'deal', 'status', 'description', 'start_date', 'closed_days', 'mobility',
    'notes', 'created_at', 'updated_at'];
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.join(',')];
  for (const r of rows) lines.push(cols.map((c) => esc(r[c])).join(','));

  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="ideioworld-${type || 'all'}-${Date.now()}.csv"`,
  });
  res.end(lines.join('\n'));
}

/* ------------------------------------------------------------------ *
 * Static + routing
 * ------------------------------------------------------------------ */
const PUBLIC_PATHS = new Set(['/login.html']);

function handleStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);

  // Uploaded files require auth.
  if (pathname.startsWith('/uploads/')) {
    if (!getSession(req)) { res.writeHead(302, { Location: '/login.html' }); res.end(); return; }
    const fp = safeJoin(config.paths.uploads, pathname.slice('/uploads/'.length));
    if (!fp) { res.writeHead(400); res.end('Bad path'); return; }
    return serveFile(res, fp);
  }

  // Pre-auth public assets: login page, css, js.
  const isPublicAsset = PUBLIC_PATHS.has(pathname)
    || pathname.startsWith('/css/') || pathname.startsWith('/js/')
    || pathname.startsWith('/img/');

  if (!isPublicAsset && !getSession(req)) {
    res.writeHead(302, { Location: '/login.html' });
    res.end();
    return;
  }

  if (pathname === '/') pathname = '/index.html';
  const fp = safeJoin(config.paths.public, pathname);
  if (!fp) { res.writeHead(400); res.end('Bad path'); return; }

  fs.stat(fp, (err, stat) => {
    if (err || !stat.isFile()) {
      // Fallback to app shell for unknown routes (still requires auth, checked above).
      return serveFile(res, path.join(config.paths.public, 'index.html'));
    }
    serveFile(res, fp);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      return await handleApi(req, res, url);
    }
    return handleStatic(req, res, url);
  } catch (e) {
    if (!res.headersSent) sendJSON(res, 500, { error: e.message || 'Server error' });
    else res.end();
  }
});

server.listen(config.port, () => {
  console.log('\n  ┌───────────────────────────────────────────┐');
  console.log('  │   Ideioworld Panel is running             │');
  console.log('  └───────────────────────────────────────────┘');
  console.log(`  →  http://localhost:${config.port}`);
  console.log(`  login:  ${config.auth.username} / ${config.auth.password}\n`);
});
