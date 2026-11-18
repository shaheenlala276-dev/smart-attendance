/* Smart Attendance - Phase 2: students, permanent QR codes, ID cards.
   Uses the existing IndexedDB stores: students, classes, sections, auditLogs, attendance. */
const PAGE_SIZE = 20;
const ST = { q: '', cls: '', sec: '', status: '', page: 1, sel: new Set() };
let D = null; // cached {students, classes, sections, cn, sn}
const clean = s => String(s == null ? '' : s).trim().replace(/\s+/g, ' ');
const low = s => clean(s).toLowerCase();
const rollKey = (classId, roll) => classId + '|' + low(roll);
const auditOp = (action, id) => ({ store: 'auditLogs', value: { id: uid(), at: new Date().toISOString(), action, entity: 'student', entityId: id, details: null, by: 'admin' } });
const todayStr = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

async function loadAll() {
  const [students, classes, sections] = await Promise.all([DB.getAll('students'), DB.getAll('classes'), DB.getAll('sections')]);
  const cm = new Map(classes.map(c => [c.id, c])), sm = new Map(sections.map(s => [s.id, s]));
  const cn = id => (cm.get(id) || {}).name || '-', sn = id => (sm.get(id) || {}).name || '-';
  students.sort((a, b) => cn(a.classId).localeCompare(cn(b.classId), undefined, { numeric: true }) || sn(a.sectionId).localeCompare(sn(b.sectionId)) || String(a.roll).localeCompare(String(b.roll), undefined, { numeric: true }));
  return { students, classes, sections, cn, sn };
}
const newQr = () => { const used = new Set(D.students.map(s => s.qrId)); let q; do { q = uid(); } while (used.has(q)); return q; };

/* ---------- QR (uses lib/qrcode.js = qrcode-generator by Kazuhiko Arase) ---------- */
function qrSvg(text) {
  if (typeof qrcode === 'undefined') throw new Error('QR library not found. Add lib/qrcode.js to the project (see the setup steps).');
  const q = qrcode(0, 'M'); q.addData(text); q.make();
  const n = q.getModuleCount(), m = 3; let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + m} ${r + m}h1v1h-1z`;
  const w = n + 2 * m;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${w}" shape-rendering="crispEdges" role="img" aria-label="Student QR code"><rect width="${w}" height="${w}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

/* ---------- small UI helpers ---------- */
function modal(html) {
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div class="mbox" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(m); return m;
}
function confirmBox(title, msg, ok, danger) {
  return new Promise(res => {
    const m = modal(`<h2>${esc(title)}</h2><p>${esc(msg)}</p><div class="actions"><button class="btn ${danger ? 'danger' : ''}" data-r="1" type="button">${esc(ok)}</button><button class="btn ghost" data-r="0" type="button">Cancel</button></div>`);
    m.onclick = e => { const b = e.target.closest('[data-r]'); if (b || e.target === m) { m.remove(); res(!!b && b.dataset.r === '1'); } };
  });
}
function readPhoto(file) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return reject(new Error('Use a JPG, PNG or WebP photo.'));
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, 400 / Math.max(img.width, img.height)), cv = document.createElement('canvas');
      cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
      const x = cv.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, cv.width, cv.height); x.drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url); resolve(cv.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That photo could not be read.')); };
    img.src = url;
  });
}
const initials = n => clean(n).split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
const backToList = v => (location.hash === '#idcards' ? viewIdCards(v) : viewStudents(v));

/* ---------- list page (also used for the ID cards page) ---------- */
async function viewStudents(v) { D = await loadAll(); drawPage(v, 'students'); }
async function viewIdCards(v) { D = await loadAll(); drawPage(v, 'cards'); }

function filtered() {
  const q = low(ST.q);
  return D.students.filter(s => (!ST.cls || s.classId === ST.cls) && (!ST.sec || s.sectionId === ST.sec) && (!ST.status || s.status === ST.status) &&
    (!q || low(s.name).includes(q) || low(s.roll).includes(q) || low(s.fatherName).includes(q)));
}
function secOptions() {
  return D.sections.filter(s => !ST.cls || s.classId === ST.cls).map(s => `<option value="${s.id}" ${ST.sec === s.id ? 'selected' : ''}>${esc(ST.cls ? s.name : D.cn(s.classId) + ' ' + s.name)}</option>`).join('');
}

function drawPage(v, mode) {
  const st = D.students, act = st.filter(s => s.status === 'Active').length;
  const stat = (n, l) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`;
  const byClass = D.classes.map(c => [c.name, st.filter(s => s.classId === c.id).length]).filter(x => x[1]).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
  const cards = mode === 'cards';
  v.innerHTML = `<div class="head"><div><h1>${cards ? 'QR Codes and ID Cards' : 'Students'}</h1>
    <p class="sub">${cards ? 'Select students, preview their ID cards, then print.' : 'Register students, view QR codes and print ID cards.'}</p></div>
    ${cards ? '' : '<button class="btn" data-act="add" type="button">Add student</button>'}</div>
    ${cards ? '' : `<div class="grid">${stat(st.length, 'Total')}${stat(act, 'Active')}${stat(st.length - act, 'Inactive')}</div>
    <div class="chips" style="margin-top:12px">${byClass.map(c => `<span class="pill">${esc(c[0])}: ${c[1]}</span>`).join('')}</div>`}
    <div class="card toolbar">
      <input id="q" type="search" placeholder="Search name, father or roll number" value="${esc(ST.q)}" aria-label="Search students">
      <select id="fc" aria-label="Filter by class"><option value="">All classes</option>${D.classes.map(c => `<option value="${c.id}" ${ST.cls === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
      <select id="fs" aria-label="Filter by section"><option value="">All sections</option>${secOptions()}</select>
      <select id="ft" aria-label="Filter by status"><option value="">Any status</option><option ${ST.status === 'Active' ? 'selected' : ''}>Active</option><option ${ST.status === 'Inactive' ? 'selected' : ''}>Inactive</option></select>
    </div>
    <div class="actions" id="bulk" style="margin:0 0 12px"></div>
    <div id="list"></div><div class="pager" id="pager"></div>`;
  v.onclick = e => handleAct(v, e);
  v.onchange = e => {
    const c = e.target.closest('[data-sel]');
    if (c) { c.checked ? ST.sel.add(c.dataset.sel) : ST.sel.delete(c.dataset.sel); drawBulk(cards); }
  };
  $('#q').oninput = e => { ST.q = e.target.value; ST.page = 1; drawList(cards); };
  $('#fc').onchange = e => { ST.cls = e.target.value; ST.sec = ''; ST.page = 1; $('#fs').innerHTML = '<option value="">All sections</option>' + secOptions(); drawList(cards); };
  $('#fs').onchange = e => { ST.sec = e.target.value; ST.page = 1; drawList(cards); };
  $('#ft').onchange = e => { ST.status = e.target.value; ST.page = 1; drawList(cards); };
  drawList(cards);
}

function drawBulk(cards) {
  const n = ST.sel.size;
  $('#bulk').innerHTML = `<button class="btn" data-act="printsel" type="button" ${n ? '' : 'disabled'}>Preview and print ID cards (${n})</button>
    <button class="btn ghost" data-act="selall" type="button">Select all shown</button>
    ${n ? '<button class="btn ghost" data-act="clrsel" type="button">Clear selection</button>' : ''}
    ${cards ? '<p class="note" style="width:100%;margin:0">Cards of inactive students are printable, but the scanner will reject them.</p>' : ''}`;
}

function drawList(cards) {
  const all = filtered(), pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  if (ST.page > pages) ST.page = pages;
  const rows = all.slice((ST.page - 1) * PAGE_SIZE, ST.page * PAGE_SIZE);
  drawBulk(cards);
  if (!rows.length) {
    $('#list').innerHTML = `<div class="card empty"><h2>${D.students.length ? 'No students match' : 'No students yet'}</h2><p>${D.students.length ? 'Change the search or filters.' : 'Add your first student to create their permanent QR code.'}</p></div>`;
    $('#pager').innerHTML = ''; return;
  }
  $('#list').innerHTML = rows.map(s => `<div class="srow">
    <label class="chk"><input type="checkbox" data-sel="${s.id}" aria-label="Select ${esc(s.name)}" ${ST.sel.has(s.id) ? 'checked' : ''}></label>
    <div class="av">${s.photo ? `<img src="${s.photo}" alt="">` : esc(initials(s.name))}</div>
    <div class="si"><b>${esc(s.name)}</b><span>Father: ${esc(s.fatherName)}</span><span>Roll ${esc(s.roll)}, ${esc(D.cn(s.classId))} ${esc(D.sn(s.sectionId))}${s.department ? ', ' + esc(s.department) : ''}</span></div>
    <div class="tags"><span class="pill ${s.status === 'Active' ? 'ok' : 'bad'}">${esc(s.status)}</span><span class="pill ${s.qrId ? 'ok' : 'bad'}">${s.qrId ? 'QR ready' : 'No QR'}</span></div>
    <div class="acts"><button class="btn ghost sm" data-act="view" data-id="${s.id}" type="button">View</button>
    ${cards ? '' : `<button class="btn ghost sm" data-act="edit" data-id="${s.id}" type="button">Edit</button>`}
    <button class="btn ghost sm" data-act="qr" data-id="${s.id}" type="button">QR</button>
    <button class="btn ghost sm" data-act="card" data-id="${s.id}" type="button">ID card</button>
    ${cards ? '' : `<button class="btn ghost sm" data-act="del" data-id="${s.id}" type="button">Delete</button>`}</div></div>`).join('');
  $('#pager').innerHTML = pages > 1 ? `<button class="btn ghost sm" data-act="prev" type="button" ${ST.page === 1 ? 'disabled' : ''}>Previous</button><span>Page ${ST.page} of ${pages}</span><button class="btn ghost sm" data-act="next" type="button" ${ST.page === pages ? 'disabled' : ''}>Next</button>` : `<span class="note">${all.length} student${all.length === 1 ? '' : 's'}</span>`;
}

async function handleAct(v, e) {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act, id = b.dataset.id, cards = location.hash === '#idcards';
  try {
    if (a === 'add') return viewForm(v, null);
    if (a === 'edit') return viewForm(v, id);
    if (a === 'view') return viewProfile(v, id);
    if (a === 'qr') return showQr(v, id);
    if (a === 'card') return previewCards(v, [id]);
    if (a === 'del') return doDelete(v, id);
    if (a === 'prev') { ST.page--; return drawList(cards); }
    if (a === 'next') { ST.page++; return drawList(cards); }
    if (a === 'clrsel') { ST.sel.clear(); return drawList(cards); }
    if (a === 'selall') { filtered().forEach(s => ST.sel.add(s.id)); return drawList(cards); }
    if (a === 'printsel') return previewCards(v, [...ST.sel]);
  } catch (err) { toast(err.message, 'err'); }
}

/* ---------- add / edit form ---------- */
async function viewForm(v, id) {
  D = await loadAll();
  const s = id ? D.students.find(x => x.id === id) : null;
  if (id && !s) { toast('Student not found.', 'err'); return viewStudents(v); }
  const i = s || {}; let photo = i.photo || '';
  const fld = (k, label, val, attrs) => `<div><label for="${k}">${label}</label><input id="${k}" value="${esc(val)}" ${attrs || ''}><div class="err" id="e-${k}"></div></div>`;
  const phHtml = () => photo ? `<img src="${photo}" alt="Student photo">` : 'No photo';
  v.innerHTML = `<h1>${s ? 'Edit student' : 'Add student'}</h1><p class="sub">${s ? 'The QR code stays the same when you save changes.' : 'A permanent QR code is created when you save.'}</p>
  <form class="card" id="sf" novalidate>
    <div class="row">${fld('n', 'Full name *', i.name, 'maxlength="100" autocomplete="off"')}${fld('fa', "Father's name *", i.fatherName, 'maxlength="100" autocomplete="off"')}</div>
    <div class="row">${fld('roll', 'Roll number *', i.roll, 'maxlength="20" autocomplete="off"')}${fld('reg', 'Registration number', i.regNo, 'maxlength="40" autocomplete="off"')}</div>
    <div class="row">${fld('cls', 'Class *', s ? D.cn(s.classId) : '', 'maxlength="40" list="dl-c" placeholder="e.g. 9 or BS-CS" autocomplete="off"')}${fld('sec', 'Section *', s ? D.sn(s.sectionId) : '', 'maxlength="20" list="dl-s" placeholder="e.g. A" autocomplete="off"')}</div>
    <datalist id="dl-c">${D.classes.map(c => `<option value="${esc(c.name)}">`).join('')}</datalist>
    <datalist id="dl-s">${[...new Set(D.sections.map(x => x.name))].map(n => `<option value="${esc(n)}">`).join('')}</datalist>
    <div class="row">${fld('dep', 'Department (if applicable)', i.department, 'maxlength="60"')}
      <div><label for="adm">Admission date *</label><input id="adm" type="date" value="${esc(i.admissionDate || todayStr())}"><div class="err" id="e-adm"></div></div></div>
    <div class="row">${fld('phone', 'Phone', i.phone, 'type="tel" maxlength="20"')}${fld('em', 'Email', i.email, 'type="email" maxlength="100"')}</div>
    ${fld('ad', 'Address', i.address, 'maxlength="200"')}
    <div class="row"><div><label for="st">Status</label><select id="st"><option ${i.status !== 'Inactive' ? 'selected' : ''}>Active</option><option ${i.status === 'Inactive' ? 'selected' : ''}>Inactive</option></select></div>
      <div><label for="photo">Photo (optional)</label><input id="photo" type="file" accept="image/jpeg,image/png,image/webp"><div class="err" id="e-photo"></div></div></div>
    <div style="display:flex;gap:12px;align-items:center;margin-top:10px"><div class="pf-photo" id="phv" style="width:70px;height:90px">${phHtml()}</div><button class="btn ghost sm" id="rmph" type="button">Remove photo</button></div>
    <div class="actions"><button class="btn" id="save" type="submit">${s ? 'Save changes' : 'Save student'}</button><button class="btn ghost" data-act="cancel" type="button">Cancel</button></div>
  </form>`;
  v.onchange = null;
  v.onclick = e => { if (e.target.closest('[data-act=cancel]')) backToList(v); };
  $('#rmph').onclick = () => { photo = ''; $('#phv').innerHTML = phHtml(); $('#photo').value = ''; };
  $('#photo').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { photo = await readPhoto(f); $('#phv').innerHTML = phHtml(); $('#e-photo').textContent = ''; }
    catch (err) { $('#e-photo').textContent = err.message; e.target.value = ''; }
  };
  $('#sf').onsubmit = async e => {
    e.preventDefault();
    const g = k => clean($('#' + k).value);
    const f = { n: g('n'), fa: g('fa'), roll: g('roll'), reg: g('reg'), cls: g('cls'), sec: g('sec'), dep: g('dep'), adm: $('#adm').value, st: $('#st').value, phone: g('phone'), em: g('em'), ad: g('ad') };
    const btn = $('#save'); btn.disabled = true;
    try {
      D = await loadAll();
      const er = {};
      if (!f.n) er.n = 'Enter the full name.';
      if (!f.fa) er.fa = "Enter the father's name.";
      if (!f.roll) er.roll = 'Enter the roll number.';
      if (!f.cls) er.cls = 'Enter the class.';
      if (!f.sec) er.sec = 'Enter the section.';
      if (!f.adm) er.adm = 'Choose the admission date.';
      if (f.em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.em)) er.em = 'Enter a valid email address.';
      if (f.phone && !/^[0-9+\-\s()]{7,20}$/.test(f.phone)) er.phone = 'Enter a valid phone number.';
      const ec = D.classes.find(c => low(c.name) === low(f.cls));
      const classId = ec ? ec.id : uid();
      if (ec) {
        if (f.roll && D.students.some(x => x.id !== i.id && x.classId === classId && low(x.roll) === low(f.roll))) er.roll = `Roll number ${f.roll} is already used in class ${ec.name}.`;
        if (f.n && f.fa && D.students.some(x => x.id !== i.id && x.classId === classId && low(x.name) === low(f.n) && low(x.fatherName) === low(f.fa))) er.n = "A student with this name and father's name already exists in this class.";
      }
      if (f.reg && D.students.some(x => x.id !== i.id && x.regNo && low(x.regNo) === low(f.reg))) er.reg = 'This registration number is already used.';
      document.querySelectorAll('.err').forEach(x => x.textContent = '');
      const keys = Object.keys(er);
      if (keys.length) { keys.forEach(k => { const el = $('#e-' + k); if (el) el.textContent = er[k]; }); const first = $('#' + keys[0]); if (first) first.focus(); toast('Fix the highlighted fields.', 'err'); return; }
      const now = new Date().toISOString(), ops = [];
      if (!ec) ops.push({ store: 'classes', value: { id: classId, name: f.cls, createdAt: now } });
      let sec = ec ? D.sections.find(x => x.classId === classId && low(x.name) === low(f.sec)) : null;
      if (!sec) { sec = { id: uid(), classId, name: f.sec, createdAt: now }; ops.push({ store: 'sections', value: sec }); }
      const rec = { id: i.id || uid(), qrId: i.qrId || newQr(), name: f.n, fatherName: f.fa, roll: f.roll, rollKey: rollKey(classId, f.roll), regNo: f.reg || null,
        classId, sectionId: sec.id, department: f.dep, admissionDate: f.adm, phone: f.phone, email: f.em, address: f.ad, photo, status: f.st,
        createdAt: i.createdAt || now, updatedAt: now, qrCreatedAt: i.qrCreatedAt || now };
      ops.push({ store: 'students', value: rec }, auditOp(s ? 'update' : 'create', rec.id));
      await DB.putMany(ops);
      toast(s ? 'Changes saved.' : 'Student saved. QR code created.', 'ok');
      backToList(v);
    } catch (err) {
      toast(err && err.name === 'ConstraintError' ? 'This roll number, registration number or QR already exists. Nothing was saved.' : 'Could not save: ' + (err.message || err), 'err');
    } finally { btn.disabled = false; }
  };
}

/* ---------- profile, QR, delete ---------- */
async function viewProfile(v, id) {
  D = await loadAll();
  const s = D.students.find(x => x.id === id); if (!s) return viewStudents(v);
  const row = (k, val) => val ? `<dt>${k}</dt><dd>${esc(val)}</dd>` : '';
  v.innerHTML = `<h1>${esc(s.name)}</h1><div class="card"><div style="display:flex;gap:16px;flex-wrap:wrap"><div class="pf-photo">${s.photo ? `<img src="${s.photo}" alt="Student photo">` : 'No photo'}</div>
    <dl>${row('Father', s.fatherName)}${row('Roll number', s.roll)}${row('Registration', s.regNo)}${row('Class', D.cn(s.classId))}${row('Section', D.sn(s.sectionId))}${row('Department', s.department)}${row('Admitted', s.admissionDate)}${row('Phone', s.phone)}${row('Email', s.email)}${row('Address', s.address)}${row('Status', s.status)}${row('QR created', new Date(s.qrCreatedAt).toLocaleDateString())}</dl></div>
    <div class="actions">${location.hash === '#idcards' ? '' : '<button class="btn" data-act="edit" data-id="' + s.id + '" type="button">Edit</button>'}<button class="btn ghost" data-act="qr" data-id="${s.id}" type="button">View QR</button><button class="btn ghost" data-act="card" data-id="${s.id}" type="button">ID card</button><button class="btn ghost" data-act="back" type="button">Back</button></div></div>`;
  v.onchange = null;
  v.onclick = e => { const b = e.target.closest('[data-act]'); if (!b) return; if (b.dataset.act === 'back') backToList(v); else handleAct(v, e); };
}

function showQr(v, id) {
  const s = D.students.find(x => x.id === id); if (!s) return;
  const m = modal(`<h2>${esc(s.name)}</h2><div class="qrbox">${qrSvg(s.qrId)}</div>
    <p class="note">This QR holds only a random ID. Editing the profile never changes it.</p>
    <div class="actions"><button class="btn" data-m="card" type="button">Print ID card</button><button class="btn ghost" data-m="regen" type="button">Regenerate QR</button><button class="btn ghost" data-m="x" type="button">Close</button></div>`);
  m.onclick = async e => {
    const b = e.target.closest('[data-m]'); if (!b && e.target !== m) return;
    const k = b ? b.dataset.m : 'x';
    if (k === 'x') return m.remove();
    if (k === 'card') { m.remove(); return previewCards(v, [id]); }
    if (k === 'regen') {
      if (!await confirmBox('Regenerate QR code?', 'The old QR code and any printed ID card will stop working. Print a new card afterwards.', 'Regenerate', true)) return;
      try {
        D = await loadAll();
        const cur = D.students.find(x => x.id === id);
        await DB.putMany([{ store: 'students', value: { ...cur, qrId: newQr(), qrCreatedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } }, auditOp('regenerate_qr', id)]);
        toast('New QR code created.', 'ok'); m.remove(); route();
      } catch (err) { toast('Could not regenerate: ' + err.message, 'err'); }
    }
  };
}

async function doDelete(v, id) {
  const s = D.students.find(x => x.id === id); if (!s) return;
  const n = await DB.countByIndex('attendance', 'studentId', id);
  if (n > 0) { toast(`${s.name} has ${n} attendance record(s). Mark the student Inactive instead of deleting.`, 'err'); return; }
  if (!await confirmBox('Delete student?', `${s.name} will be deleted permanently and their QR code will stop working. This cannot be undone.`, 'Delete', true)) return;
  await DB.putMany([{ store: 'students', del: id }, auditOp('delete', id)]);
  ST.sel.delete(id); toast('Student deleted.', 'ok'); viewStudents(v);
}

/* ---------- ID cards ---------- */
function cardHtml(s) {
  const inst = institution || {}, contact = [inst.address, inst.phone].filter(Boolean).join(', ');
  const line = (k, val) => val ? `<div><b>${k}:</b> ${esc(val)}</div>` : '';
  return `<div class="idc"><div class="idc-h">${inst.logo ? `<img src="${inst.logo}" alt="">` : ''}<div><b>${esc(inst.name || 'Institution')}</b>${contact ? `<small>${esc(contact)}</small>` : ''}</div></div>
    <div class="idc-b"><div class="idc-p">${s.photo ? `<img src="${s.photo}" alt="">` : '<svg viewBox="0 0 24 24" width="60%" fill="#999" aria-hidden="true"><circle cx="12" cy="8" r="4.5"/><path d="M3 22c0-5 4-8 9-8s9 3 9 8z"/></svg>'}</div>
    <div class="idc-d"><span class="nm">${esc(s.name)}</span>${line('Father', s.fatherName)}${line('Roll', s.roll)}${line('Reg', s.regNo)}${line('Class', D.cn(s.classId) + ' ' + D.sn(s.sectionId))}${line('Dept', s.department)}</div>
    <div class="idc-q">${qrSvg(s.qrId)}<small>Scan for Attendance</small></div></div></div>`;
}

async function previewCards(v, ids) {
  D = await loadAll();
  const list = ids.map(id => D.students.find(s => s.id === id)).filter(Boolean);
  if (!list.length) { toast('Select at least one student.', 'err'); return; }
  let html; try { html = list.map(cardHtml).join(''); } catch (err) { toast(err.message, 'err'); return; }
  v.innerHTML = `<div class="head no-print"><div><h1>ID card preview</h1><p class="sub">${list.length} card${list.length === 1 ? '' : 's'}. Print on A4 or card stock at 100% scale.</p></div>
    <div class="actions" style="margin:0"><button class="btn" data-act="print" type="button">Print</button><button class="btn ghost" data-act="back" type="button">Back</button></div></div><div class="sheet">${html}</div>`;
  v.onchange = null;
  v.onclick = e => { const b = e.target.closest('[data-act]'); if (!b) return; if (b.dataset.act === 'print') window.print(); if (b.dataset.act === 'back') backToList(v); };
  window.scrollTo(0, 0);
}
