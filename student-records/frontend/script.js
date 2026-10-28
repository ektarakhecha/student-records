/* ================= Helpers ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (n) => `<svg class="i" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const initials = (n) => (n || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
const dash = (v) => (v === undefined || v === null || v === '' ? '—' : v);
const fmtDate = (d, utc = false) =>
  d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', ...(utc ? { timeZone: 'UTC' } : {}) }) : '—';
const badge = (s) => `<span class="badge ${esc(s)}">${esc(s)}</span>`;

function timeAgo(d) {
  const sec = Math.max(1, Math.floor((Date.now() - new Date(d)) / 1000));
  const units = [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [name, s] of units) if (sec >= s) { const n = Math.floor(sec / s); return `${n} ${name}${n > 1 ? 's' : ''} ago`; }
  return 'just now';
}

async function api(path, options = {}) {
  let res;
  try {
    res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  } catch {
    throw Object.assign(new Error('Cannot reach the server. Make sure it is running (npm start).'), { network: true });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status}).`), { status: res.status, fields: data.fields || {} });
  return data;
}

function toast(type, message) {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.innerHTML = `${icon(type === 'error' ? 'alert' : 'check')}<span>${esc(message)}</span>`;
  $('#toasts').append(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 260); }, 4200);
}

const skeletonRows = (n) => Array.from({ length: n }, () => '<div class="list-row"><span class="skeleton sk-line"></span></div>').join('');

/* ================= State ================= */
const state = { page: 1, limit: 10, search: '', status: '', course: '', sort: 'newest', total: 0, pages: 1 };
let currentView = 'dashboard';
let dbOk = null;
let reqId = 0;

/* ================= Theme & sidebar ================= */
$('#theme-toggle').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('theme', next); } catch {}
});
const closeSidebar = () => { $('#sidebar').classList.remove('open'); $('#scrim').classList.remove('show'); };
$('#menu-btn').addEventListener('click', () => { $('#sidebar').classList.add('open'); $('#scrim').classList.add('show'); });
$('#scrim').addEventListener('click', closeSidebar);

/* ================= Database status ================= */
function setDb(ok) {
  dbOk = ok;
  $('#db-status').className = 'db-status ' + (ok ? 'ok' : 'bad');
  $('#db-label').textContent = ok ? 'Connected' : 'Disconnected';
  const v = $('#db-card-value');
  v.textContent = ok ? 'Connected' : 'Disconnected';
  v.className = 'stat-value small ' + (ok ? 'ok' : 'bad');
  $('#db-card-sub').textContent = ok ? 'MongoDB Atlas is reachable' : 'Check Atlas Network Access & the server logs';
}
async function checkHealth() {
  let ok = false;
  try { const r = await fetch('/api/health'); ok = r.ok && (await r.json()).database === 'connected'; } catch {}
  setDb(ok);
  return ok;
}

/* ================= Routing ================= */
const views = { dashboard: { title: 'Dashboard', load: loadDashboard }, students: { title: 'Students', load: loadStudents } };

function route() {
  const name = location.hash.replace('#/', '');
  currentView = Object.hasOwn(views, name) ? name : 'dashboard';
  $$('.view').forEach((v) => (v.hidden = v.id !== 'view-' + currentView));
  $$('.nav-link').forEach((a) => a.classList.toggle('active', a.dataset.view === currentView));
  $('#page-title').textContent = views[currentView].title;
  closeSidebar();
  views[currentView].load();
}
window.addEventListener('hashchange', route);

/* ================= Courses (filter + datalist) ================= */
function syncCourses(list) {
  const sel = $('#filter-course');
  const keep = state.course;
  sel.innerHTML = '<option value="">All courses</option>' + list.map((c) => `<option>${esc(c)}</option>`).join('');
  if (list.includes(keep)) sel.value = keep; else state.course = '';
  $('#course-options').innerHTML = list.map((c) => `<option value="${esc(c)}"></option>`).join('');
}
const refreshCourses = () => api('/api/stats').then((s) => syncCourses(s.courses)).catch(() => {});

/* ================= Dashboard ================= */
function renderTrend(trend) {
  const W = 600, H = 230, pad = { t: 22, r: 8, b: 28, l: 30 };
  const max = Math.max(...trend.map((t) => t.count), 0);
  const top = max <= 4 ? 4 : Math.ceil(max / 4) * 4;
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b, bw = iw / trend.length;
  let svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Students registered per month">`;
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + ih - (ih * i) / 4;
    svg += `<line class="grid-line" x1="${pad.l}" x2="${W - pad.r}" y1="${y}" y2="${y}"/><text class="axis" x="${pad.l - 6}" y="${y + 4}" text-anchor="end">${(top * i) / 4}</text>`;
  }
  trend.forEach((t, i) => {
    const h = (ih * t.count) / top;
    const x = pad.l + i * bw + bw * 0.2, w = bw * 0.6, y = pad.t + ih - h;
    if (t.count) svg += `<rect class="bar" x="${x}" y="${y}" width="${w}" height="${h}" rx="5"><title>${esc(t.label)} ${t.year}: ${t.count}</title></rect><text class="val" x="${x + w / 2}" y="${y - 6}" text-anchor="middle">${t.count}</text>`;
    svg += `<text class="axis" x="${x + w / 2}" y="${H - 8}" text-anchor="middle">${esc(t.label)}</text>`;
  });
  const empty = trend.every((t) => t.count === 0);
  return svg + '</svg>' + (empty ? '<p class="empty-sm">No registrations in the last 6 months yet.</p>' : '');
}

function renderMetricRows(items, total) {
  return items.map((it) => `
    <div class="metric"><div class="metric-top"><span>${it.html}</span><strong>${it.count}</strong></div>
    <div class="bar-track"><div class="bar-fill" style="width:${total ? Math.round((it.count / total) * 100) : 0}%"></div></div></div>`).join('');
}

async function loadDashboard() {
  $('#dash-error').hidden = true;
  ['stat-total', 'stat-month', 'stat-active'].forEach((id) => ($('#' + id).innerHTML = '<span class="skeleton sk-num"></span>'));
  $('#trend').innerHTML = '<span class="skeleton sk-block"></span>';
  $('#recent').innerHTML = skeletonRows(4);
  $('#status-list').innerHTML = skeletonRows(3);
  $('#course-list').innerHTML = skeletonRows(3);
  checkHealth();
  try {
    const s = await api('/api/stats');
    $('#stat-total').textContent = s.total;
    $('#stat-month').textContent = s.thisMonth;
    $('#stat-active').textContent = s.byStatus.Active;
    $('#trend').innerHTML = renderTrend(s.trend);
    $('#status-list').innerHTML = renderMetricRows(
      ['Active', 'Inactive', 'Graduated'].map((k) => ({ html: badge(k), count: s.byStatus[k] })), s.total);
    $('#course-list').innerHTML = s.byCourse.length
      ? renderMetricRows(s.byCourse.map((c) => ({ html: esc(c.course), count: c.count })), s.total)
      : '<p class="empty-sm">No students yet.</p>';
    $('#recent').innerHTML = s.recent.length
      ? s.recent.map((r) => `<button class="row-btn" data-action="view" data-id="${esc(r._id)}">
          <span class="avatar">${esc(initials(r.name))}</span>
          <span class="grow" style="flex:1;min-width:0"><div class="name">${esc(r.name)}</div><div class="sub">${esc(r.email)}</div></span>
          <span class="sub">${timeAgo(r.createdAt)}</span></button>`).join('')
      : '<p class="empty-sm">No students yet. Use “Add student” to create the first one.</p>';
    syncCourses(s.courses);
  } catch (e) {
    if (e.status === 503 || e.network) setDb(false);
    ['stat-total', 'stat-month', 'stat-active'].forEach((id) => ($('#' + id).textContent = '—'));
    ['trend', 'status-list', 'course-list', 'recent'].forEach((id) => ($('#' + id).innerHTML = '<p class="empty-sm">Unavailable</p>'));
    $('#dash-error-text').textContent = e.message;
    $('#dash-error').hidden = false;
  }
}

/* ================= Students list ================= */
function showEmpty({ iconName, title, text, actionHtml = '', error = false }) {
  $('#table-wrap').hidden = true;
  $('#pager').hidden = true;
  const box = $('#students-empty');
  box.hidden = false;
  box.innerHTML = `<div class="empty-icon ${error ? 'err' : ''}">${icon(iconName)}</div><h3>${esc(title)}</h3><p>${esc(text)}</p>${actionHtml}`;
}

const rowHtml = (s) => `<tr>
  <td><div class="cell-person"><span class="avatar">${esc(initials(s.name))}</span>
    <div style="min-width:0"><button class="link" data-action="view" data-id="${esc(s._id)}">${esc(s.name)}</button><div class="sub">${esc(s.email)}</div></div></div></td>
  <td class="hide-lg">${esc(dash(s.studentId))}</td>
  <td class="hide-md">${esc(dash(s.course))}</td>
  <td class="hide-md">${esc(dash(s.semester))}</td>
  <td>${badge(s.status)}</td>
  <td class="hide-sm muted">${fmtDate(s.createdAt)}</td>
  <td class="actions">
    <button class="icon-btn" data-action="view" data-id="${esc(s._id)}" aria-label="View ${esc(s.name)}" title="View">${icon('eye')}</button>
    <button class="icon-btn" data-action="edit" data-id="${esc(s._id)}" aria-label="Edit ${esc(s.name)}" title="Edit">${icon('edit')}</button>
    <button class="icon-btn danger" data-action="delete" data-id="${esc(s._id)}" data-name="${esc(s.name)}" aria-label="Delete ${esc(s.name)}" title="Delete">${icon('trash')}</button>
  </td></tr>`;

function filterParams() {
  const q = new URLSearchParams({ sort: state.sort });
  if (state.search) q.set('search', state.search);
  if (state.status) q.set('status', state.status);
  if (state.course) q.set('course', state.course);
  return q;
}

async function loadStudents() {
  const my = ++reqId;
  $('#students-empty').hidden = true;
  $('#table-wrap').hidden = false;
  $('#pager').hidden = false;
  $('#student-rows').innerHTML = Array.from({ length: 5 }, () => '<tr><td colspan="7"><span class="skeleton sk-line"></span></td></tr>').join('');
  try {
    const q = filterParams();
    q.set('page', state.page);
    q.set('limit', state.limit);
    const r = await api('/api/students?' + q);
    if (my !== reqId) return false;
    if (r.data.length === 0 && state.page > 1) { state.page = r.pagination.pages; return loadStudents(); }
    state.total = r.pagination.total;
    state.pages = r.pagination.pages;
    if (r.data.length === 0) {
      const filtered = state.search || state.status || state.course;
      showEmpty(filtered
        ? { iconName: 'search', title: 'No matching students', text: 'Try a different search or clear the filters.', actionHtml: '<button class="btn" data-action="clear-filters">Clear filters</button>' }
        : { iconName: 'users', title: 'No students yet', text: 'Add your first student to get started.', actionHtml: `<button class="btn primary" data-action="add">${icon('plus')} Add student</button>` });
      return true;
    }
    $('#student-rows').innerHTML = r.data.map(rowHtml).join('');
    const start = (state.page - 1) * state.limit + 1;
    $('#page-info').textContent = `Showing ${start}–${Math.min(state.page * state.limit, state.total)} of ${state.total}`;
    $('#page-num').textContent = `Page ${state.page} of ${state.pages}`;
    $('#prev').disabled = state.page <= 1;
    $('#next').disabled = state.page >= state.pages;
    return true;
  } catch (e) {
    if (my !== reqId) return false;
    if (e.status === 503 || e.network) setDb(false);
    showEmpty({ iconName: 'alert', error: true, title: 'Could not load students', text: e.message, actionHtml: '<button class="btn" data-action="reload">Try again</button>' });
    return false;
  }
}

/* toolbar events */
let searchTimer;
$('#search').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.search = e.target.value.trim(); state.page = 1; loadStudents(); }, 300);
});
$('#filter-status').addEventListener('change', (e) => { state.status = e.target.value; state.page = 1; loadStudents(); });
$('#filter-course').addEventListener('change', (e) => { state.course = e.target.value; state.page = 1; loadStudents(); });
$('#sort').addEventListener('change', (e) => { state.sort = e.target.value; state.page = 1; loadStudents(); });
$('#page-size').addEventListener('change', (e) => { state.limit = Number(e.target.value); state.page = 1; loadStudents(); });
$('#prev').addEventListener('click', () => { if (state.page > 1) { state.page--; loadStudents(); } });
$('#next').addEventListener('click', () => { if (state.page < state.pages) { state.page++; loadStudents(); } });
$('#refresh-btn').addEventListener('click', async () => {
  const ok = await loadStudents();
  if (ok) toast('success', 'Records refreshed.'); else toast('error', 'Could not refresh records.');
});

async function exportCsv() {
  try {
    const res = await fetch('/api/students/export/csv?' + filterParams());
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Export failed.');
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `students-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(a); a.click(); a.remove();
    URL.revokeObjectURL(a.href);
    toast('success', 'CSV exported.');
  } catch (e) {
    toast('error', e.network || e instanceof TypeError ? 'Cannot reach the server.' : e.message);
  }
}
$('#export-btn').addEventListener('click', exportCsv);

/* ================= Form (add / edit) ================= */
const FIELDS = ['name', 'email', 'phone', 'studentId', 'course', 'semester', 'enrollmentDate', 'status'];
const form = $('#student-form');

function clearErrors() {
  $$('[data-err]', form).forEach((el) => (el.textContent = ''));
  $$('.invalid', form).forEach((el) => el.classList.remove('invalid'));
}
function showErrors(fields) {
  let first = null;
  for (const [k, msg] of Object.entries(fields)) {
    const el = $(`[data-err="${k}"]`, form);
    if (!el) continue;
    el.textContent = msg;
    const input = form.elements[k];
    if (input) { input.classList.add('invalid'); first = first || input; }
  }
  if (first) first.focus();
}
function validateClient(v) {
  const e = {};
  if (!v.name) e.name = 'Name is required.'; else if (v.name.length > 100) e.name = 'Name must be 100 characters or fewer.';
  if (!v.email) e.email = 'Email is required.'; else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) e.email = 'Please enter a valid email address.';
  if (v.phone && !/^[0-9+\-()\s]{6,20}$/.test(v.phone)) e.phone = 'Use 6–20 digits, spaces, + - ( ).';
  if (v.studentId && !/^[A-Za-z0-9\-_/]{1,30}$/.test(v.studentId)) e.studentId = 'Letters, numbers, - _ / only (max 30).';
  if (v.semester !== '' && (!Number.isInteger(Number(v.semester)) || Number(v.semester) < 1 || Number(v.semester) > 12)) e.semester = 'Enter a whole number from 1 to 12.';
  return e;
}

async function openForm(id) {
  form.reset();
  clearErrors();
  form.dataset.id = id || '';
  $('#form-title').textContent = id ? 'Edit student' : 'Add student';
  $('#save-btn').textContent = id ? 'Save changes' : 'Save student';
  if (id) {
    try {
      const s = await api('/api/students/' + id);
      FIELDS.forEach((k) => {
        let v = s[k] ?? '';
        if (k === 'enrollmentDate' && v) v = String(v).slice(0, 10);
        form.elements[k].value = v;
      });
    } catch (e) { toast('error', e.message); return; }
  }
  $('#form-dialog').showModal();
  form.elements.name.focus();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearErrors();
  const v = Object.fromEntries(FIELDS.map((k) => [k, form.elements[k].value.trim()]));
  const errs = validateClient(v);
  if (Object.keys(errs).length) { showErrors(errs); return; }

  const id = form.dataset.id;
  const btn = $('#save-btn');
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    const s = await api(id ? `/api/students/${id}` : '/api/students', { method: id ? 'PUT' : 'POST', body: JSON.stringify(v) });
    $('#form-dialog').close();
    toast('success', id ? `Updated ${s.name}.` : `Added ${s.name}.`);
    afterChange();
  } catch (err) {
    if (err.fields && Object.keys(err.fields).length) showErrors(err.fields);
    toast('error', err.message);
  } finally {
    btn.disabled = false; btn.textContent = label;
  }
});

function afterChange() {
  refreshCourses();
  views[currentView].load();
}

/* ================= Details & delete ================= */
async function openDetails(id) {
  try {
    const s = await api('/api/students/' + id);
    $('#detail-body').innerHTML = `
      <div class="detail-top"><span class="avatar">${esc(initials(s.name))}</span>
        <div><h3>${esc(s.name)}</h3><div class="muted">${esc(s.email)}</div></div><span style="margin-left:auto">${badge(s.status)}</span></div>
      <dl class="detail-grid">
        <div><dt>Student ID</dt><dd>${esc(dash(s.studentId))}</dd></div>
        <div><dt>Phone</dt><dd>${esc(dash(s.phone))}</dd></div>
        <div><dt>Course / department</dt><dd>${esc(dash(s.course))}</dd></div>
        <div><dt>Semester</dt><dd>${esc(dash(s.semester))}</dd></div>
        <div><dt>Enrollment date</dt><dd>${fmtDate(s.enrollmentDate, true)}</dd></div>
        <div><dt>Added</dt><dd>${fmtDate(s.createdAt)}</dd></div>
        <div><dt>Last updated</dt><dd>${fmtDate(s.updatedAt)}</dd></div>
      </dl>`;
    ['detail-edit', 'detail-delete'].forEach((b) => { $('#' + b).dataset.id = s._id; });
    $('#detail-delete').dataset.name = s.name;
    $('#detail-dialog').showModal();
  } catch (e) { toast('error', e.message); }
}

function confirmDialog(title, text) {
  return new Promise((resolve) => {
    const d = $('#confirm-dialog');
    $('#confirm-title').textContent = title;
    $('#confirm-text').textContent = text;
    d.returnValue = '';
    d.addEventListener('close', () => resolve(d.returnValue === 'yes'), { once: true });
    d.showModal();
  });
}

async function deleteStudent(id, name) {
  const ok = await confirmDialog(`Delete ${name}?`, 'This permanently removes the record from your MongoDB database. This cannot be undone.');
  if (!ok) return;
  try {
    await api('/api/students/' + id, { method: 'DELETE' });
    if ($('#detail-dialog').open) $('#detail-dialog').close();
    toast('success', `Deleted ${name}.`);
    afterChange();
  } catch (e) { toast('error', e.message); }
}

/* ================= Global click handling ================= */
document.addEventListener('click', (e) => {
  const closer = e.target.closest('[data-close]');
  if (closer) { closer.closest('dialog').close(); return; }
  if (e.target instanceof HTMLDialogElement) { e.target.close(); return; } // backdrop click

  const t = e.target.closest('[data-action]');
  if (!t) return;
  const { action, id, name } = t.dataset;
  if (action === 'add') openForm();
  else if (action === 'view') openDetails(id);
  else if (action === 'edit') { if ($('#detail-dialog').open) $('#detail-dialog').close(); openForm(id); }
  else if (action === 'delete') deleteStudent(id, name);
  else if (action === 'reload') loadStudents();
  else if (action === 'retry-dashboard') loadDashboard();
  else if (action === 'clear-filters') {
    Object.assign(state, { search: '', status: '', course: '', page: 1 });
    $('#search').value = ''; $('#filter-status').value = ''; $('#filter-course').value = '';
    loadStudents();
  }
});

/* ================= Boot ================= */
refreshCourses();
setInterval(checkHealth, 30000);
route();