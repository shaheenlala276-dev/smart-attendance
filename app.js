/* Smart Attendance - Phase 1 app shell: dashboard, institution setup, theme, PWA. */
const NAV = [
  ['dashboard', 'Dashboard', 'Home', 1], ['setup', 'Institution Setup', 'Setup', 1],
  ['students', 'Students', 'Students', 2], ['teachers', 'Teachers', 'Teachers', 3],
  ['classes', 'Classes and Sections', 'Classes', 3], ['subjects', 'Subjects', 'Subjects', 3],
  ['assignments', 'Teacher Assignments', 'Assign', 3], ['idcards', 'QR Codes and ID Cards', 'ID Cards', 2],
  ['scanner', 'QR Attendance', 'Scan', 4], ['history', 'Attendance History', 'History', 4],
  ['reports', 'Reports', 'Reports', 5], ['backup', 'Backup and Restore', 'Backup', 6],
  ['settings', 'Settings', 'Settings', 1], ['about', 'About', 'About', 1]
];
const BOTTOM = ['dashboard', 'students', 'scanner', 'reports', 'setup'];
const LIVE = ['dashboard', 'setup', 'students', 'idcards', 'settings', 'about'];
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let institution = null;

function toast(msg, kind) {
  const t = document.createElement('div');
  t.className = 'toast ' + (kind || '');
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), kind === 'err' ? 6000 : 3000);
}

function renderNav(cur) {
  const link = n => `<a class="nl" href="#${n[0]}" ${n[0] === cur ? 'aria-current="page"' : ''}>${esc(n[1])}</a>`;
  $('#nav-side').innerHTML = NAV.map(link).join('');
  $('#nav-bottom').innerHTML = BOTTOM.map(id => NAV.find(n => n[0] === id)).map(n =>
    `<a class="nl" href="#${n[0]}" ${n[0] === cur ? 'aria-current="page"' : ''}>${esc(n[2])}</a>`).join('');
}

async function applyTheme() {
  let t = await DB.getSetting('theme', null);
  if (!t) t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name=theme-color]').content = t === 'dark' ? '#0f1715' : '#16423c';
}
async function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  await DB.setSetting('theme', next);
  applyTheme();
}

async function route() {
  const id = (location.hash || '#dashboard').slice(1);
  const known = NAV.some(n => n[0] === id);
  let page = known ? id : 'dashboard';
  if (!institution && page !== 'setup' && page !== 'about') page = 'setup';
  renderNav(page);
  const v = $('#view');
  try {
    if (page === 'dashboard') await viewDashboard(v);
    else if (page === 'setup') await viewSetup(v);
    else if (page === 'students') await viewStudents(v);
    else if (page === 'idcards') await viewIdCards(v);
    else if (page === 'settings') await viewSettings(v);
    else if (page === 'about') viewAbout(v);
    else viewSoon(v, page);
  } catch (e) {
    v.innerHTML = `<div class="card"><h2>Something went wrong</h2><p>${esc(e.message)}</p><p class="note">Your saved data was not changed. Reload the page and try again.</p></div>`;
  }
  $('#main').focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

function viewSoon(v, id) {
  const n = NAV.find(x => x[0] === id);
  v.innerHTML = `<h1>${esc(n[1])}</h1><div class="card empty"><h2>Arrives in Phase ${n[3]}</h2><p>This module is not built yet. Foundation first, then each phase in order.</p></div>`;
}

async function viewDashboard(v) {
  const c = await DB.counts();
  const logo = institution.logo ? `<img src="${institution.logo}" alt="Institution logo">` : `<div class="logo-ph">No logo</div>`;
  const stat = (n, l) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`;
  v.innerHTML = `
    <div class="card hero">${logo}<div><h1>${esc(institution.name)}</h1>
    <p class="sub" style="margin:0">${esc(institution.type)}${institution.city ? ' - ' + esc(institution.city) : ''}</p></div></div>
    <div class="grid">${stat(c.students, 'Students') + stat(c.teachers, 'Teachers') + stat(c.classes, 'Classes') + stat(c.subjects, 'Subjects') + stat(c.sessions, 'Sessions') + stat(c.attendance, 'Attendance records')}</div>
    <div class="card" style="margin-top:14px"><h2>System status</h2>
      <p><span class="pill ${navigator.onLine ? '' : 'ok'}">${navigator.onLine ? 'Online' : 'Offline'}</span>
      <span class="pill ${'serviceWorker' in navigator && navigator.serviceWorker.controller ? 'ok' : ''}" id="sw-pill">${'serviceWorker' in navigator && navigator.serviceWorker.controller ? 'Offline cache active' : 'Offline cache not active yet'}</span>
      <span class="pill ok">Database ready</span></p>
      <p class="note">${c.students === 0 ? 'Add your first student in <a href="#students">Students</a>. ' : ''}All data is stored only on this device.</p></div>`;
}

function readLogo(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Choose an image file (PNG or JPG).'));
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, 256 / Math.max(img.width, img.height));
      const cv = document.createElement('canvas');
      cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      resolve(cv.toDataURL('image/png'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That image could not be read.')); };
    img.src = url;
  });
}

async function viewSetup(v) {
  const i = institution || {};
  let logo = i.logo || '';
  const types = ['School', 'College', 'Academy', 'University', 'Other'];
  v.innerHTML = `<h1>Institution Setup</h1><p class="sub">${institution ? 'Update your institution details.' : 'Enter your institution details to begin. You can change them later.'}</p>
  <form class="card" id="f" novalidate>
    <label for="name">Institution name *</label><input id="name" required maxlength="120" value="${esc(i.name)}" autocomplete="off">
    <div class="row"><div><label for="type">Type</label><select id="type">${types.map(t => `<option ${i.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
    <div><label for="city">City</label><input id="city" maxlength="80" value="${esc(i.city)}"></div></div>
    <label for="address">Address</label><input id="address" maxlength="200" value="${esc(i.address)}">
    <div class="row"><div><label for="phone">Phone</label><input id="phone" type="tel" maxlength="30" value="${esc(i.phone)}"></div>
    <div><label for="session">Academic session</label><input id="session" maxlength="30" placeholder="e.g. 2026-27" value="${esc(i.session)}"></div></div>
    <label for="logo">Logo (optional)</label><input id="logo" type="file" accept="image/*">
    <p class="note" id="logo-note">${logo ? 'A logo is saved. Choose a new file to replace it.' : 'The logo appears on ID cards and reports.'}</p>
    <div class="actions"><button class="btn" id="save" type="submit">Save institution</button></div>
  </form>`;
  $('#logo').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { logo = await readLogo(f); $('#logo-note').textContent = 'Logo ready. Save to keep it.'; }
    catch (err) { toast(err.message, 'err'); e.target.value = ''; }
  };
  $('#f').onsubmit = async (e) => {
    e.preventDefault();
    const name = $('#name').value.trim();
    if (!name) { toast('Enter the institution name.', 'err'); $('#name').focus(); return; }
    const btn = $('#save'); btn.disabled = true; btn.textContent = 'Saving...';
    try {
      const now = new Date().toISOString();
      const rec = { id: i.id || uid(), name, type: $('#type').value, city: $('#city').value.trim(), address: $('#address').value.trim(),
        phone: $('#phone').value.trim(), session: $('#session').value.trim(), logo, createdAt: i.createdAt || now, updatedAt: now };
      await DB.putMany([{ store: 'institution', value: rec },
        { store: 'auditLogs', value: { id: uid(), at: now, action: institution ? 'update' : 'create', entity: 'institution', entityId: rec.id, details: null, by: 'admin' } }]);
      institution = rec;
      toast('Institution saved.', 'ok');
      location.hash = '#dashboard';
      route();
    } catch (err) { toast('Could not save: ' + err.message, 'err'); }
    finally { btn.disabled = false; btn.textContent = 'Save institution'; }
  };
}

async function viewSettings(v) {
  const persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false;
  v.innerHTML = `<h1>Settings</h1><p class="sub">Application preferences.</p>
  <div class="card"><h2>Appearance</h2><button class="btn ghost" id="t" type="button">Switch light / dark theme</button></div>
  <div class="card"><h2>Data protection</h2><p>Persistent storage: <span class="pill ${persisted ? 'ok' : ''}">${persisted ? 'Granted' : 'Not granted'}</span></p>
  <p class="note">Persistent storage asks the browser not to clear your data when the phone runs low on space. Full backups arrive in Phase 6; clearing browser data will erase records.</p>
  <button class="btn ghost" id="p" type="button">Request persistent storage</button></div>`;
  $('#t').onclick = toggleTheme;
  $('#p').onclick = async () => {
    const ok = navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false;
    toast(ok ? 'Persistent storage granted.' : 'The browser did not grant it. Installing the app often helps.', ok ? 'ok' : '');
    viewSettings(v);
  };
}

function viewAbout(v) {
  v.innerHTML = `<h1>About Smart Attendance</h1><div class="card"><dl>
  <dt>App version</dt><dd>${APP_VERSION}</dd><dt>Database schema</dt><dd>${DB_VERSION}</dd>
  <dt>Storage</dt><dd>IndexedDB on this device only</dd><dt>Network use</dt><dd>None after installation</dd></dl>
  <p class="note">Camera scanning (Phase 4) needs a secure context such as HTTPS. GitHub Pages provides HTTPS.</p></div>`;
}

function setupPWA() {
  const ob = () => { $('#offline-banner').hidden = navigator.onLine; };
  addEventListener('online', ob); addEventListener('offline', ob); ob();
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w && w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) toast('A new version is ready. Close and reopen the app to update. Your data is safe.');
      });
    });
  }).catch(() => {});
}

(async function init() {
  try {
    await openDB();
    institution = (await DB.getAll('institution'))[0] || null;
    await applyTheme();
  } catch (e) {
    $('#view').innerHTML = `<div class="card"><h2>Database unavailable</h2><p>${esc(e.message)}</p><p class="note">Private browsing modes and some locked-down browsers block local storage. Open the app in a normal browser window.</p></div>`;
    return;
  }
  $('#theme-side').onclick = toggleTheme;
  addEventListener('hashchange', route);
  setupPWA();
  route();
})();
