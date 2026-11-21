/* Smart Attendance - Phase 1 app shell: dashboard, institution setup, theme, PWA. */
const NAV = [
  ['dashboard', 'Dashboard', 'Home', 1], ['setup', 'Institution Profile', 'Profile', 1],
  ['students', 'Students', 'Students', 2], ['teachers', 'Teachers', 'Teachers', 3],
  ['classes', 'Classes and Sections', 'Classes', 3], ['subjects', 'Subjects', 'Subjects', 3],
  ['assignments', 'Teacher Assignments', 'Assign', 3], ['idcards', 'ID Cards and QR Codes', 'ID Cards', 2],
  ['scanner', 'Take Attendance', 'Attendance', 4], ['history', 'Attendance Records', 'Records', 4],
  ['reports', 'Reports', 'Reports', 5], ['backup', 'Backup and Restore', 'Backup', 6],
  ['settings', 'Settings', 'Settings', 1], ['about', 'About and Help', 'About', 1], ['more', 'All sections', 'More', 1], ['start', 'Start Here', 'Start', 1]
];
const BOTTOM = [['dashboard', 'Home'], ['students', 'Students'], ['scanner', 'Attendance'], ['history', 'Records'], ['more', 'More']];
const GROUPS = [['', ['start', 'dashboard']], ['Daily work', ['scanner', 'history']], ['People', ['students', 'idcards']], ['Reports and data', ['reports', 'backup']], ['Setup and help', ['setup', 'settings', 'about']], ['Coming later', ['teachers', 'classes', 'subjects', 'assignments']]];
const IC = {
  dashboard: '<path d="M3 11l9-8 9 8"/><path d="M5 9.5V20h14V9.5"/>',
  students: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.5-4 3.2-6 6.5-6s6 2 6.5 6"/><path d="M16 4.5a3.5 3.5 0 010 7M18 14c2 .6 3.3 2.6 3.5 6"/>',
  scanner: '<path d="M4 8V5a1 1 0 011-1h3M16 4h3a1 1 0 011 1v3M20 16v3a1 1 0 01-1 1h-3M8 20H5a1 1 0 01-1-1v-3"/><path d="M4 12h16"/>',
  history: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4v2h6V4M9 12h6M9 16h4"/>',
  reports: '<path d="M4 20V4M4 20h16"/><path d="M8 16v-5M12 16V8M16 16v-3"/>',
  idcards: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6 16c.4-1.6 1.6-2.4 3-2.4s2.6.8 3 2.4M14 10h4M14 14h3"/>',
  backup: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>',
  settings: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  about: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  setup: '<path d="M4 21V9l8-5 8 5v12"/><path d="M9 21v-6h6v6M3 21h18"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  start: '<path d="M5 21V4"/><path d="M5 4h11l-2.5 4 2.5 4H5"/>',
  soon: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
};
const ico = id => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${IC[id] || IC.soon}</svg>`;
const LOADING = '<div class="loading" role="status"><span class="spin"></span><span>Loading...</span></div>';
const LIVE = ['dashboard', 'setup', 'students', 'idcards', 'settings', 'about'];
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let institution = null;

function toast(msg, kind) {
  const t = document.createElement('div');
  t.className = 'toast ' + (kind || '');
  t.textContent = (kind === 'ok' ? '\u2713 ' : kind === 'err' ? '! ' : '') + msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), kind === 'err' ? 6000 : 3000);
}

function renderNav(cur) {
  const nav = id => NAV.find(n => n[0] === id), cp = cur === 'scanner' ? 'scanner' : cur;
  const link = n => `<a class="nl ${n[3] > 2 && ['teachers', 'classes', 'subjects', 'assignments'].includes(n[0]) ? 'soon' : ''}" href="#${n[0]}" ${n[0] === cp ? 'aria-current="page"' : ''}>${ico(n[0])}<span>${esc(n[1])}</span></a>`;
  $('#nav-side').innerHTML = GROUPS.map(([t, ids]) => (t ? `<div class="ng">${esc(t)}</div>` : '') + ids.map(id => link(nav(id))).join('')).join('');
  const bc = BOTTOM.some(b => b[0] === cur) ? cur : 'more';
  $('#nav-bottom').innerHTML = BOTTOM.map(([id, label]) => `<a class="nl" href="#${id}" ${id === bc ? 'aria-current="page"' : ''}>${ico(id)}<span>${esc(label)}</span></a>`).join('');
  const t = $('#top-title'), n = nav(cur); if (t && n) t.textContent = n[1];
}

async function applyTheme() {
  let t = await DB.getSetting('theme', null);
  if (!t) t = 'dark';
  document.documentElement.dataset.theme = t;
  document.documentElement.dataset.fs = await DB.getSetting('fontSize', 'normal');
  document.querySelector('meta[name=theme-color]').content = t === 'dark' ? '#080D0C' : '#16423c';
}
async function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  await DB.setSetting('theme', next);
  applyTheme();
}

async function route() {
  if (typeof stopScanner === 'function') stopScanner();
  const parts = (location.hash || '#dashboard').slice(1).split('/'), id = parts[0], args = parts.slice(1);
  const known = NAV.some(n => n[0] === id);
  let page = known ? id : 'dashboard';
  if (!institution && page !== 'setup' && page !== 'about') page = 'setup';
  renderNav(page);
  const v = $('#view');
  v.onclick = v.onchange = v.oninput = v.onsubmit = null;
  const lt = setTimeout(() => { v.innerHTML = LOADING; }, 180);
  try {
    if (page === 'dashboard') await viewDashboard(v);
    else if (page === 'setup') await viewSetup(v);
    else if (page === 'students') await viewStudents(v);
    else if (page === 'idcards') await viewIdCards(v);
    else if (page === 'scanner') await viewAttendanceHub(v, args);
    else if (page === 'history') await viewRecords(v);
    else if (page === 'backup') await viewBackup(v);
    else if (page === 'reports') await viewReports(v);
    else if (page === 'settings') await viewSettings(v);
    else if (page === 'about') viewAbout(v);
    else if (page === 'more') viewMore(v);
    else if (page === 'start') await viewStart(v);
    else viewSoon(v, page);
  } catch (e) {
    v.innerHTML = `<div class="card"><h2>Something went wrong</h2><p>${esc(e.message)}</p><p class="note">Your saved data was not changed. Reload the page and try again.</p><a class="btn" href="#dashboard">Go to Dashboard</a></div>`;
  }
  clearTimeout(lt);
  $('#main').focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

function viewSoon(v, id) {
  const n = NAV.find(x => x[0] === id);
  v.innerHTML = `<h1>${esc(n[1])}</h1><div class="card empty">${ico('soon')}<h2>Coming in a later update</h2><p>This section is planned but is not available yet. Everything else works as normal.</p><a class="btn" href="#dashboard">Back to Dashboard</a></div>`;
}

function viewMore(v) {
  const D = { start: ['Start Here', 'Step-by-step guide for new users'], scanner: ['Take Attendance', 'Start a class and scan ID cards'], history: ['Attendance Records', 'See, search and correct attendance'], students: ['Students', 'Add, edit and search students'], idcards: ['ID Cards and QR Codes', 'View QR codes and print ID cards'], reports: ['Reports', 'Daily, weekly and monthly reports'], backup: ['Backup and Restore', 'Save or restore all your data'], setup: ['Institution Profile', 'Name, logo and contact details'], settings: ['Settings', 'Theme, PIN lock and preferences'], about: ['About and Help', 'Help and app information'] };
  const item = id => `<a class="mgi" href="#${id}">${ico(id)}<div><b>${esc(D[id][0])}</b><span>${esc(D[id][1])}</span></div></a>`;
  v.innerHTML = `<h1>All sections</h1><p class="sub">Everything in Smart Attendance in one place.</p>` +
    [['New here?', ['start']], ['Daily work', ['scanner', 'history']], ['People', ['students', 'idcards']], ['Reports and data', ['reports', 'backup']], ['Setup and help', ['setup', 'settings', 'about']]].map(([t, ids]) => `<h2 class="gh">${t}</h2><div class="mg">${ids.map(item).join('')}</div>`).join('') +
    '<p class="note" style="margin-top:18px">Coming in later updates: teacher accounts, class and subject management, and teacher assignments.</p>';
}

async function viewDashboard(v) {
  const c = await DB.counts();
  const logo = institution.logo ? `<img src="${institution.logo}" alt="Institution logo">` : `<div class="logo-ph">No logo</div>`;
  const stat = (n, l) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`;
  const att = typeof attendanceDashHtml === 'function' ? await attendanceDashHtml() : '';
  const qa = (href, id, t) => `<a class="qa" href="${href}">${ico(id)}<span>${t}</span></a>`;
  const qas = `<h2 class="gh">What would you like to do?</h2><div class="qas">${qa('#scanner', 'scanner', 'Take attendance') + qa('#students', 'students', 'Add or find students') + qa('#reports', 'reports', 'View reports') + qa('#idcards', 'idcards', 'Print ID cards')}</div>`;
  const start = typeof guideCardHtml === 'function' ? await guideCardHtml(c) : '';
  v.innerHTML = `
    <div class="card hero">${logo}<div><h1>${esc(institution.name)}</h1>
    <p class="sub" style="margin:0">${esc(institution.type)}${institution.city ? ' - ' + esc(institution.city) : ''}${institution.session ? ' - ' + esc(institution.session) : ''}</p><a href="#setup" class="note">Edit profile</a></div></div>
    ${start}${qas}
    ${att}
    <h2 class="gh">Totals</h2><div class="grid">${stat(c.students, 'Students') + stat(c.classes, 'Classes') + stat(c.sessions, 'Class sessions') + stat(c.attendance, 'Attendance records')}</div>
    <div class="card" style="margin-top:14px"><h2>App status</h2>
      <p><span class="pill ${navigator.onLine ? '' : 'ok'}">${navigator.onLine ? 'Online' : 'Offline'}</span>
      <span class="pill ${'serviceWorker' in navigator && navigator.serviceWorker.controller ? 'ok' : ''}" id="sw-pill">${'serviceWorker' in navigator && navigator.serviceWorker.controller ? 'Ready to work offline' : 'Offline mode not ready yet. Open the app once while online.'}</span>
      <span class="pill ok">Data saved on this device</span></p>
      <p class="note">All data is stored only on this device. Download a backup regularly from <a href="#backup">Backup and Restore</a>.</p></div>`;
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
  v.innerHTML = `<h1>Institution Profile</h1><p class="sub">${institution ? 'Edit your institution details. They appear on ID cards and printed reports.' : 'Enter your institution details to begin. You can change them later.'}</p>
  <form class="card" id="f" novalidate>
    <label for="name">Institution name *</label><input id="name" required maxlength="120" value="${esc(i.name)}" autocomplete="off">
    <div class="row"><div><label for="type">Type</label><select id="type">${types.map(t => `<option ${i.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
    <div><label for="city">City</label><input id="city" maxlength="80" value="${esc(i.city)}"></div></div>
    <label for="address">Address</label><input id="address" maxlength="200" value="${esc(i.address)}">
    <div class="row"><div><label for="phone">Phone</label><input id="phone" type="tel" maxlength="30" value="${esc(i.phone)}"></div>
    <div><label for="email">Email</label><input id="email" type="email" maxlength="120" value="${esc(i.email)}"></div></div>
    <div class="row"><div><label for="principal">Principal or administrator</label><input id="principal" maxlength="100" value="${esc(i.principal)}"></div>
    <div><label for="session">Academic year</label><input id="session" maxlength="20" placeholder="e.g. 2026-27" value="${esc(i.session)}"></div></div>
    <label for="desc">Description (optional)</label><textarea id="desc" rows="3" maxlength="300">${esc(i.description)}</textarea>
    <label for="logo">Logo (optional)</label><input id="logo" type="file" accept="image/*">
    <p class="note" id="logo-note">${logo ? 'A logo is saved. Choose a new file to replace it.' : 'The logo appears on ID cards and reports.'}</p>
    ${logo ? '<label class="chk2"><input type="checkbox" id="rmlogo"> Remove the current logo</label>' : ''}
    <div class="err" id="ferr" aria-live="polite"></div>
    <div class="actions"><button class="btn" id="save" type="submit">Save profile</button></div>
  </form>`;
  $('#logo').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { logo = await readLogo(f); $('#logo-note').textContent = 'Logo ready. Save to keep it.'; const r = $('#rmlogo'); if (r) r.checked = false; }
    catch (err) { toast(err.message, 'err'); e.target.value = ''; }
  };
  $('#f').onsubmit = async (e) => {
    e.preventDefault();
    const er = $('#ferr'); er.textContent = '';
    const g = id => $('#' + id).value.trim(), name = g('name'), phone = g('phone'), email = g('email'), year = g('session');
    const bad = name.length < 2 ? ['name', 'Enter the institution name (at least 2 characters).'] :
      phone && !/^[+\d\s()-]{5,25}$/.test(phone) ? ['phone', 'Enter a valid phone number, for example +92 300 1234567.'] :
      email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? ['email', 'Enter a valid email address.'] :
      year && year.length < 4 ? ['session', 'Enter the academic year, for example 2026-27.'] : null;
    if (bad) { er.textContent = bad[1]; $('#' + bad[0]).focus(); return; }
    const btn = $('#save'); btn.disabled = true; btn.textContent = 'Saving...';
    try {
      const now = new Date().toISOString(), rm = $('#rmlogo');
      const rec = { ...i, id: i.id || uid(), name, type: $('#type').value, city: g('city'), address: g('address'), phone, email, principal: g('principal'), session: year, description: g('desc'),
        logo: rm && rm.checked ? '' : logo, createdAt: i.createdAt || now, updatedAt: now };
      await DB.putMany([{ store: 'institution', value: rec },
        { store: 'auditLogs', value: { id: uid(), at: now, action: institution ? 'update' : 'create', entity: 'institution', entityId: rec.id, details: null, by: 'admin' } }]);
      const first = !institution; institution = rec;
      toast('Institution profile saved.', 'ok');
      location.hash = first ? '#start' : '#dashboard';
      route();
    } catch (err) { toast('Could not save: ' + err.message, 'err'); }
    finally { btn.disabled = false; btn.textContent = 'Save profile'; }
  };
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
  if (typeof startSecurity === 'function') await startSecurity();
  $('#theme-side').onclick = toggleTheme;
  addEventListener('hashchange', route);
  setupPWA();
  route();
})();
