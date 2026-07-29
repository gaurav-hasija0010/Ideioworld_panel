'use strict';

/* ================================================================
 * Ideioworld Panel — front-end app
 * ================================================================ */

const state = {
  view: 'dashboard',        // dashboard | business | mobile_hut
  options: { categories: [], businessTypes: [], statuses: [], mobility: [] },
  filters: { q: '', category: '', status: '', business_type: '' },
  editImages: [],           // existing images kept while editing
};

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, props = {}, kids = []) => {
  const n = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) n.setAttribute(k, v);
  });
  (Array.isArray(kids) ? kids : [kids]).forEach((c) => {
    if (c == null) return;
    n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return n;
};
const esc = (s) => (s == null ? '' : String(s).replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));
const uploadUrl = (name) => '/uploads/' + encodeURIComponent(name);

function toast(msg, kind = 'ok') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `toast show ${kind}`;
  setTimeout(() => { t.className = 'toast'; }, 2600);
}

async function api(url, opts = {}) {
  const res = await fetch(url, opts);
  if (res.status === 401) { window.location.href = '/login.html'; throw new Error('unauth'); }
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || `Request failed (${res.status})`);
  }
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : res.text();
}

const TYPE_LABEL = { business: 'Business', mobile_hut: 'Mobile Hut' };
const statusClass = (s) => ({
  'New Lead': 's-new', 'Contacted': 's-contacted', 'Interested': 's-interested',
  'Onboarded': 's-onboarded', 'Not Interested': 's-not',
}[s] || 's-new');

/* ---------------- Field definitions (per type) ---------------- */
const FORMS = {
  business: [
    { section: 'Basic details' },
    { name: 'business_name', label: 'Business Name', required: true },
    { name: 'owner_name', label: 'Owner Name' },
    { name: 'contact_no', label: 'Contact No.' },
    { name: 'email', label: 'Email ID', type: 'email' },
    { name: 'location', label: 'Location', full: true },
    { name: 'description', label: 'Description', textarea: true, full: true,
      placeholder: 'Short description of the business…' },
    { section: 'Classification' },
    { name: 'category', label: 'Category', kind: 'category' },
    { name: 'business_type', label: 'Business Type', kind: 'businessType' },
    { name: 'gst_no', label: 'GST No.' },
    { name: 'status', label: 'Lead Status', kind: 'status' },
    { name: 'timings', label: 'Timings', placeholder: 'e.g. Mon–Sat, 10am–8pm' },
    { section: 'Offering' },
    { name: 'menu_services', label: 'Menu / Services', textarea: true, full: true },
    { name: 'deal', label: 'Any Deal / Offer', textarea: true, full: true },
    { name: 'notes', label: 'Follow-up Notes', textarea: true, full: true },
    { section: 'Media & documents' },
    { name: 'logo', label: 'Business Logo / Photo', file: 'image' },
    { name: 'document', label: 'Business Document', file: 'doc' },
    { name: 'images', label: 'Business Images (up to 12)', file: 'images' },
  ],
  mobile_hut: [
    { section: 'Mobile Hut details' },
    { name: 'business_name', label: 'Mobile Hut Name', required: true },
    { name: 'owner_name', label: 'Owner Name' },
    { name: 'contact_no', label: 'Phone Number' },
    { name: 'business_type', label: 'Type', placeholder: 'e.g. Recharge, Repair, Accessories' },
    { name: 'location', label: 'Location', full: true },
    { name: 'description', label: 'Description', textarea: true, full: true,
      placeholder: 'Short description of the mobile hut…' },
    { section: 'Operations' },
    { name: 'timings', label: 'Open / Close Timing', placeholder: 'e.g. 9am – 9pm' },
    { name: 'start_date', label: 'Start Date', type: 'date' },
    { name: 'closed_days', label: 'Closed Days', placeholder: 'e.g. Sunday' },
    { name: 'mobility', label: 'Permanent or Move Around', kind: 'mobility' },
    { name: 'status', label: 'Lead Status', kind: 'status' },
    { section: 'Services' },
    { name: 'menu_services', label: 'Services / Menu', textarea: true, full: true },
    { name: 'notes', label: 'Follow-up Notes', textarea: true, full: true },
    { section: 'Photos & logo' },
    { name: 'owner_photo', label: 'Owner Photo', file: 'image' },
    { name: 'logo', label: 'Mobile Hut Logo', file: 'image' },
    { name: 'images', label: 'Mobile Hut Photos (up to 12)', file: 'images' },
  ],
};

/* ---------------- Navigation ---------------- */
document.querySelectorAll('.nav-item').forEach((item) => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));
    item.classList.add('active');
    state.view = item.dataset.view;
    state.filters = { q: '', category: '', status: '', business_type: '' };
    render();
  });
});

$('#logoutBtn').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' });
  window.location.href = '/login.html';
});

/* ---------------- Render dispatcher ---------------- */
async function render() {
  if (state.view === 'dashboard') return renderDashboard();
  return renderList(state.view);
}

/* ---------------- Dashboard ---------------- */
async function renderDashboard() {
  const main = $('#main');
  main.innerHTML = '';
  main.appendChild(el('div', { class: 'page-head' }, [
    el('div', {}, [
      el('h1', {}, 'Dashboard'),
      el('div', { class: 'sub' }, 'Overview of your Ideioworld data collection'),
    ]),
  ]));

  let stats;
  try { stats = await api('/api/stats'); } catch (e) { return toast(e.message, 'err'); }

  const typeCount = (t) => (stats.byType.find((x) => x.type === t) || {}).c || 0;
  const statusCount = (s) => (stats.byStatus.find((x) => x.status === s) || {}).c || 0;

  main.appendChild(el('div', { class: 'grid stat-grid' }, [
    statCard('Total Records', stats.total, true),
    statCard('Businesses', typeCount('business')),
    statCard('Mobile Hut', typeCount('mobile_hut')),
    statCard('Onboarded', statusCount('Onboarded')),
  ]));

  const two = el('div', { class: 'grid', style: 'grid-template-columns: 1fr 1fr;' });

  const pipe = el('div', { class: 'card' }, [el('h3', {}, 'Lead pipeline')]);
  const maxStatus = Math.max(1, ...state.options.statuses.map(statusCount));
  state.options.statuses.forEach((s) => pipe.appendChild(barRow(s, statusCount(s), maxStatus)));
  two.appendChild(pipe);

  const cat = el('div', { class: 'card' }, [el('h3', {}, 'Top categories')]);
  if (!stats.byCategory.length) cat.appendChild(el('div', { class: 'hint' }, 'No data yet.'));
  const maxCat = Math.max(1, ...stats.byCategory.map((c) => c.c));
  stats.byCategory.forEach((c) => cat.appendChild(barRow(c.category, c.c, maxCat)));
  two.appendChild(cat);

  main.appendChild(two);

  const recent = el('div', { class: 'card', style: 'margin-top:16px' }, [el('h3', {}, 'Recently added')]);
  if (!stats.recent.length) recent.appendChild(el('div', { class: 'hint' }, 'Nothing added yet — start with Business Data or Mobile Hut.'));
  stats.recent.forEach((r) => {
    recent.appendChild(el('div', { class: 'bar-row', style: 'cursor:pointer', onclick: () => openDetail(r.id) }, [
      el('span', { class: 'name', style: 'width:auto;font-weight:700' }, r.business_name),
      el('span', { class: 'badge type' }, TYPE_LABEL[r.type] || r.type),
      el('span', { class: `badge ${statusClass(r.status)}` }, r.status || 'New Lead'),
      el('span', { class: 'num', style: 'width:auto;margin-left:auto' }, r.location || ''),
    ]));
  });
  main.appendChild(recent);
}

function statCard(label, value, grad = false) {
  return el('div', { class: 'card stat' }, [
    el('div', { class: 'label' }, label),
    el('div', { class: `value ${grad ? 'grad' : ''}` }, String(value)),
  ]);
}
function barRow(name, num, max) {
  const pct = Math.round((num / max) * 100);
  return el('div', { class: 'bar-row' }, [
    el('span', { class: 'name' }, name),
    el('div', { class: 'bar-track' }, [el('div', { class: 'bar-fill', style: `width:${pct}%` })]),
    el('span', { class: 'num' }, String(num)),
  ]);
}

/* ---------------- List view ---------------- */
async function renderList(type) {
  const main = $('#main');
  main.innerHTML = '';
  const isHut = type === 'mobile_hut';
  const title = isHut ? 'Mobile Hut' : 'Business Data';
  const icon = isHut ? '📱' : '🏬';

  main.appendChild(el('div', { class: 'page-head' }, [
    el('div', {}, [
      el('h1', {}, `${icon} ${title}`),
      el('div', { class: 'sub' }, 'Add, view, edit, search and export records'),
    ]),
    el('div', { class: 'head-actions' }, [
      el('a', { class: 'btn ghost', href: `/api/export.csv?type=${type}` }, '⬇ Export CSV'),
      el('button', { class: 'btn', onclick: () => openForm(type) }, '+ Add ' + (isHut ? 'Mobile Hut' : 'Business')),
    ]),
  ]));

  const search = el('input', { placeholder: 'Search name, owner, phone, location…', value: state.filters.q });
  search.addEventListener('input', debounce((e) => { state.filters.q = e.target.value; loadRows(type); }, 250));

  const tools = [el('div', { class: 'search' }, [search])];
  if (!isHut) {
    tools.push(selectFilter(['', ...state.options.categories], state.filters.category, 'All categories',
      (v) => { state.filters.category = v; loadRows(type); }));
  }
  tools.push(selectFilter(['', ...state.options.statuses], state.filters.status, 'All statuses',
    (v) => { state.filters.status = v; loadRows(type); }));
  main.appendChild(el('div', { class: 'toolbar' }, tools));

  main.appendChild(el('div', { id: 'rows' }));
  loadRows(type);
}

function selectFilter(values, current, placeholder, onChange) {
  const sel = el('select', { onchange: (e) => onChange(e.target.value) });
  values.forEach((v) => {
    const opt = el('option', { value: v }, v === '' ? placeholder : v);
    if (v === current) opt.selected = true;
    sel.appendChild(opt);
  });
  return sel;
}

async function loadRows(type) {
  const wrap = $('#rows');
  if (!wrap) return;
  const isHut = type === 'mobile_hut';
  const params = new URLSearchParams({ type });
  ['q', 'category', 'status', 'business_type'].forEach((k) => {
    if (state.filters[k]) params.set(k, state.filters[k]);
  });
  let rows;
  try { rows = await api('/api/records?' + params.toString()); }
  catch (e) { return toast(e.message, 'err'); }

  if (!rows.length) {
    wrap.innerHTML = '';
    wrap.appendChild(el('div', { class: 'card empty' }, [
      el('div', { class: 'big' }, isHut ? '📱' : '🏬'),
      el('div', {}, state.filters.q || state.filters.category || state.filters.status
        ? 'No records match your search.'
        : 'No records yet. Click “Add” to create your first one.'),
    ]));
    return;
  }

  const kindCol = isHut ? 'Type' : 'Category';
  const table = el('table', {}, [
    el('thead', {}, el('tr', {}, [
      th(isHut ? 'Mobile Hut' : 'Business'), th('Owner'), th(isHut ? 'Phone' : 'Contact'),
      th('Location'), th(kindCol), th('Status'), th('', 'text-align:right'),
    ])),
  ]);
  const tbody = el('tbody');
  rows.forEach((r) => tbody.appendChild(rowEl(r, isHut)));
  table.appendChild(tbody);
  wrap.innerHTML = '';
  wrap.appendChild(el('div', { class: 'table-wrap' }, [table]));
}

const th = (t, style) => el('th', style ? { style } : {}, t);

function rowEl(r, isHut) {
  const logo = r.logo
    ? el('img', { class: 'avatar', src: uploadUrl(r.logo), alt: '' })
    : el('div', { class: 'avatar ph' }, (r.business_name || '?').charAt(0).toUpperCase());
  const kind = isHut ? r.business_type : r.category;

  return el('tr', {}, [
    el('td', {}, el('div', { class: 'cell-flex' }, [
      logo,
      el('div', {}, [
        el('div', { class: 'cell-main' }, r.business_name),
        kind ? el('div', { class: 'cell-sub' }, kind) : null,
      ]),
    ])),
    el('td', {}, r.owner_name || '—'),
    el('td', {}, r.contact_no || '—'),
    el('td', {}, r.location || '—'),
    el('td', {}, kind || '—'),
    el('td', {}, el('span', { class: `badge ${statusClass(r.status)}` }, r.status || 'New Lead')),
    el('td', {}, el('div', { class: 'row-actions' }, [
      el('button', { class: 'icon-btn', title: 'View', onclick: () => openDetail(r.id) }, '👁'),
      el('button', { class: 'icon-btn', title: 'Edit', onclick: () => openForm(r.type, r) }, '✏️'),
      el('button', { class: 'icon-btn del', title: 'Delete', onclick: () => deleteRecord(r) }, '🗑'),
    ])),
  ]);
}

async function deleteRecord(r) {
  if (!confirm(`Delete “${r.business_name}”? This cannot be undone.`)) return;
  try {
    await api(`/api/records/${r.id}`, { method: 'DELETE' });
    toast('Record deleted');
    render();
  } catch (e) { toast(e.message, 'err'); }
}

/* ---------------- Form (add / edit) ---------------- */
function openForm(type, record = null) {
  const isEdit = !!record;
  state.editImages = record ? [...(record.images || [])] : [];

  $('#formTitle').textContent = isEdit
    ? `Edit ${TYPE_LABEL[type]} record`
    : `Add ${TYPE_LABEL[type]} record`;
  $('#saveBtn').textContent = isEdit ? 'Update record' : 'Save record';

  const wrap = $('#formFields');
  wrap.innerHTML = '';
  (FORMS[type] || FORMS.business).forEach((f) => {
    if (f.section) { wrap.appendChild(el('div', { class: 'section-label' }, f.section)); return; }
    wrap.appendChild(renderField(f, record));
  });

  const form = $('#recordForm');
  form.dataset.type = type;
  form.dataset.id = record ? record.id : '';
  showModal('formModal');
}

function renderField(f, record) {
  const val = record ? (record[f.name] || '') : '';
  const field = el('div', { class: 'field' + (f.full ? ' full' : '') });

  if (f.file === 'image') {
    field.appendChild(el('label', {}, f.label));
    const row = el('div', { class: 'file-row' });
    const existing = record ? record[f.name] : null;
    if (existing) row.appendChild(el('img', { class: 'thumb', src: uploadUrl(existing) }));
    row.appendChild(el('input', { type: 'file', name: f.name, accept: 'image/*' }));
    field.appendChild(row);
    if (existing) field.appendChild(el('div', { class: 'hint' }, 'Uploading a new file replaces the current one.'));
    return field;
  }
  if (f.file === 'doc') {
    field.appendChild(el('label', {}, f.label));
    const row = el('div', { class: 'file-row' });
    const existing = record ? record[f.name] : null;
    if (existing) row.appendChild(el('a', { class: 'doc-link', href: uploadUrl(existing), target: '_blank' }, '📄 Current document'));
    row.appendChild(el('input', { type: 'file', name: f.name, accept: '.pdf,.doc,.docx,.jpg,.jpeg,.png' }));
    field.appendChild(row);
    if (existing) field.appendChild(el('div', { class: 'hint' }, 'Uploading a new file replaces the current one.'));
    return field;
  }
  if (f.file === 'images') {
    field.appendChild(el('label', {}, f.label));
    field.appendChild(el('input', { type: 'file', name: 'images', accept: 'image/*', multiple: true }));
    const thumbs = el('div', { class: 'thumbs' });
    state.editImages.forEach((img) => thumbs.appendChild(existingThumb(img)));
    field.appendChild(thumbs);
    return field;
  }

  field.appendChild(el('label', { for: 'f_' + f.name }, f.label + (f.required ? ' *' : '')));
  let input;
  if (f.kind) {
    const list = f.kind === 'category' ? state.options.categories
      : f.kind === 'businessType' ? state.options.businessTypes
        : f.kind === 'mobility' ? state.options.mobility
          : state.options.statuses;
    input = el('select', { id: 'f_' + f.name, name: f.name });
    if (f.kind !== 'status') input.appendChild(el('option', { value: '' }, '— select —'));
    list.forEach((o) => {
      const opt = el('option', { value: o }, o);
      if (o === val || (!val && f.kind === 'status' && o === 'New Lead')) opt.selected = true;
      input.appendChild(opt);
    });
  } else if (f.textarea) {
    input = el('textarea', { id: 'f_' + f.name, name: f.name, placeholder: f.placeholder || '' }, val);
  } else {
    input = el('input', { id: 'f_' + f.name, name: f.name, type: f.type || 'text', placeholder: f.placeholder || '', value: val });
  }
  if (f.required) input.required = true;
  field.appendChild(input);
  return field;
}

function existingThumb(img) {
  const w = el('div', { class: 'thumb-wrap' }, [
    el('img', { class: 'thumb', src: uploadUrl(img) }),
  ]);
  const rm = el('button', { type: 'button', class: 'rm', title: 'Remove' }, '✕');
  rm.addEventListener('click', () => {
    state.editImages = state.editImages.filter((i) => i !== img);
    w.remove();
  });
  w.appendChild(rm);
  return w;
}

$('#recordForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const type = form.dataset.type;
  const id = form.dataset.id;
  const fd = new FormData(form);
  fd.set('type', type);
  fd.set('existing_images', JSON.stringify(state.editImages));

  const btn = $('#saveBtn');
  btn.disabled = true;
  try {
    if (id) {
      await api(`/api/records/${id}`, { method: 'PUT', body: fd });
      toast('Record updated');
    } else {
      await api('/api/records', { method: 'POST', body: fd });
      toast('Record added');
    }
    closeModal('formModal');
    render();
  } catch (err) {
    toast(err.message, 'err');
  } finally {
    btn.disabled = false;
  }
});

/* ---------------- Detail view ---------------- */
async function openDetail(id) {
  let r;
  try { r = await api('/api/records/' + id); } catch (e) { return toast(e.message, 'err'); }
  const isHut = r.type === 'mobile_hut';

  $('#detailTitle').textContent = r.business_name;
  const body = $('#detailBody');
  body.innerHTML = '';

  body.appendChild(el('div', { style: 'display:flex;gap:14px;align-items:center;margin-bottom:18px' }, [
    r.logo ? el('img', { class: 'detail-logo', src: uploadUrl(r.logo) })
      : el('div', { class: 'detail-logo avatar ph', style: 'font-size:26px' }, (r.business_name || '?').charAt(0).toUpperCase()),
    el('div', {}, [
      el('div', { style: 'font-size:18px;font-weight:800' }, r.business_name),
      el('div', { style: 'margin-top:5px;display:flex;gap:7px;flex-wrap:wrap' }, [
        el('span', { class: 'badge type' }, TYPE_LABEL[r.type] || r.type),
        el('span', { class: `badge ${statusClass(r.status)}` }, r.status || 'New Lead'),
      ]),
    ]),
  ]));

  const grid = el('div', { class: 'detail-grid' });
  const dl = (k, v, full) => {
    if (!v) return;
    grid.appendChild(el('div', { class: 'dl' + (full ? ' full' : '') }, [
      el('div', { class: 'k' }, k),
      el('div', { class: 'v', html: v }),
    ]));
  };
  const nl2br = (s) => esc(s).replace(/\n/g, '<br>');
  const mapLink = r.location
    ? `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.location)}" target="_blank">${esc(r.location)} ↗</a>`
    : '';
  const phoneLink = r.contact_no ? `<a href="tel:${esc(r.contact_no)}">${esc(r.contact_no)}</a>` : '';
  const mailLink = r.email ? `<a href="mailto:${esc(r.email)}">${esc(r.email)}</a>` : '';

  dl('Owner Name', esc(r.owner_name));
  dl(isHut ? 'Phone Number' : 'Contact No.', phoneLink);
  if (!isHut) dl('Email ID', mailLink);
  dl('Location', mapLink, true);
  dl('Description', nl2br(r.description), true);

  if (isHut) {
    dl('Type', esc(r.business_type));
    dl('Open / Close Timing', esc(r.timings));
    dl('Start Date', esc(fmtDay(r.start_date)));
    dl('Closed Days', esc(r.closed_days));
    dl('Permanent / Move Around', esc(r.mobility));
    dl('Services / Menu', nl2br(r.menu_services), true);
  } else {
    dl('Category', esc(r.category));
    dl('Business Type', esc(r.business_type));
    dl('GST No.', esc(r.gst_no));
    dl('Timings', esc(r.timings));
    dl('Menu / Services', nl2br(r.menu_services), true);
    dl('Any Deal / Offer', nl2br(r.deal), true);
  }
  dl('Follow-up Notes', nl2br(r.notes), true);
  body.appendChild(grid);

  if (r.owner_photo) {
    body.appendChild(mediaBlock('Owner Photo',
      el('img', { class: 'detail-logo', style: 'width:96px;height:96px', src: uploadUrl(r.owner_photo),
        onclick: () => window.open(uploadUrl(r.owner_photo), '_blank') })));
  }
  if (r.document) {
    body.appendChild(mediaBlock('Document',
      el('a', { class: 'doc-link', href: uploadUrl(r.document), target: '_blank' }, '📄 Open document')));
  }
  if (r.images && r.images.length) {
    const gal = el('div', { class: 'gallery' });
    r.images.forEach((img) => gal.appendChild(
      el('img', { src: uploadUrl(img), onclick: () => window.open(uploadUrl(img), '_blank') })));
    body.appendChild(mediaBlock(isHut ? 'Mobile Hut Photos' : 'Business Images', gal));
  }

  body.appendChild(el('div', { class: 'hint', style: 'margin-top:16px' },
    `Added ${fmtDate(r.created_at)} · Updated ${fmtDate(r.updated_at)}`));

  $('#detailEditBtn').onclick = () => { closeModal('detailModal'); openForm(r.type, r); };
  showModal('detailModal');
}

function mediaBlock(label, node) {
  return el('div', { style: 'margin-top:16px' }, [
    el('div', { class: 'k', style: 'font-size:11.5px;text-transform:uppercase;color:var(--muted);font-weight:700;margin-bottom:6px' }, label),
    node,
  ]);
}

function fmtDay(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) +
    ', ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/* ---------------- Modals ---------------- */
function showModal(id) { $('#' + id).classList.add('show'); }
function closeModal(id) { $('#' + id).classList.remove('show'); }
document.querySelectorAll('[data-close]').forEach((b) =>
  b.addEventListener('click', (e) => closeModal(e.target.closest('.modal-back').id)));
document.querySelectorAll('.modal-back').forEach((m) =>
  m.addEventListener('click', (e) => { if (e.target === m) closeModal(m.id); }));

/* ---------------- Utils ---------------- */
function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/* ---------------- Boot ---------------- */
(async function init() {
  try {
    const me = await api('/api/me');
    $('#whoami').textContent = 'Signed in as ' + (me.user?.username || 'admin');
    state.options = await api('/api/options');
  } catch (e) {
    if (e.message !== 'unauth') console.error(e);
    return;
  }
  render();
})();
