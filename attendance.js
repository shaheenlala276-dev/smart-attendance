/* Smart Attendance - Phase 3: sessions, QR scanner, manual attendance, records, audit trail.
   Uses existing IndexedDB stores: sessions, attendance, auditLogs, students, classes, sections. */
const ATT = { stream: null, timer: 0, gen: 0, running: false, busy: false, devs: [], devId: '', last: { p: '', t: 0 }, ac: null, sound: true, pt: 0 };
const PAGE_A = 25, FULL = ['Present', 'Late', 'Absent'];
const stCls = { Present: 'ok', Late: 'warn', Absent: 'bad', Active: 'ok', Paused: 'warn' };
const pill = (t, c) => `<span class="pill ${c !== undefined ? c : stCls[t] || ''}">${esc(t)}</span>`;
const hm = iso => iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-';
const nowHM = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
const addHour = t => { const [h, m] = t.split(':').map(Number); return String((h + 1) % 24).padStart(2, '0') + ':' + String(m).padStart(2, '0'); };
const shiftDay = (s, n) => { const [y, m, d] = s.split('-').map(Number), x = new Date(y, m - 1, d + n); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
const byRoll = (a, b) => String(a.roll).localeCompare(String(b.roll), undefined, { numeric: true });
const recAud = (action, entity, id, details) => ({ store: 'auditLogs', value: { id: uid(), at: new Date().toISOString(), action, entity, entityId: id, details, by: 'admin' } });
const sLabel = (X, s) => X.cn(s.classId) + (s.sectionId ? ' ' + X.sn(s.sectionId) : '');
const overlap = (a, b) => a.classId === b.classId && (!a.sectionId || !b.sectionId || a.sectionId === b.sectionId);
const activeConflict = (X, s) => X.sessions.find(o => o.id !== s.id && o.status === 'Active' && overlap(o, s));
const roster = (X, s) => X.students.filter(t => t.status === 'Active' && t.classId === s.classId && (!s.sectionId || t.sectionId === s.sectionId)).sort(byRoll);

async function aLoad() {
  const [students, classes, sections, sessions] = await Promise.all(['students', 'classes', 'sections', 'sessions'].map(s => DB.getAll(s)));
  const cm = new Map(classes.map(c => [c.id, c.name])), sm = new Map(sections.map(s => [s.id, s.name]));
  return { students, classes, sections, sessions, stu: new Map(students.map(s => [s.id, s])), cn: id => cm.get(id) || '-', sn: id => sm.get(id) || '' };
}

/* ---------- sound / camera ---------- */
function beep(ok) {
  if (!ATT.sound) return;
  try {
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    ATT.ac = ATT.ac || new C();
    const o = ATT.ac.createOscillator(), g = ATT.ac.createGain();
    o.frequency.value = ok ? 880 : 260; g.gain.value = 0.08; o.connect(g); g.connect(ATT.ac.destination); o.start(); o.stop(ATT.ac.currentTime + 0.12);
  } catch (e) { /* sound is optional */ }
  try { navigator.vibrate && navigator.vibrate(ok ? 40 : [60, 40, 60]); } catch (e) { /* optional */ }
}
function stopScanner() {
  ATT.gen++; clearTimeout(ATT.timer); ATT.running = false; ATT.busy = false;
  if (ATT.stream) { ATT.stream.getTracks().forEach(t => t.stop()); ATT.stream = null; }
  const vid = document.getElementById('cam'); if (vid) vid.srcObject = null;
  const box = document.querySelector('.cam'); if (box) box.classList.remove('live');
  const st = document.getElementById('camst'); if (st) st.textContent = 'Camera is off.';
}
let _bd = null;
async function decodeFrame(vid) {
  if (_bd === null) { try { _bd = ('BarcodeDetector' in window) ? new BarcodeDetector({ formats: ['qr_code'] }) : false; } catch (e) { _bd = false; } }
  if (_bd) { const r = await _bd.detect(vid); return r[0] ? r[0].rawValue : ''; }
  if (typeof jsQR === 'undefined') throw new Error('NODECODER');
  const w = 480, h = Math.max(1, Math.round(w * vid.videoHeight / vid.videoWidth)), cv = decodeFrame.cv || (decodeFrame.cv = document.createElement('canvas'));
  cv.width = w; cv.height = h; const x = cv.getContext('2d', { willReadFrequently: true }); x.drawImage(vid, 0, 0, w, h);
  const r = jsQR(x.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' }); return r ? r.data : '';
}
async function startCam() {
  if (ATT.running) return;
  const st = $('#camst'), vid = $('#cam');
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { st.textContent = 'Camera is not available here. Camera access needs HTTPS or an installed app. Use manual entry below.'; return; }
  stopScanner(); const gen = ATT.gen;
  try {
    st.textContent = 'Starting camera...';
    ATT.stream = await navigator.mediaDevices.getUserMedia({ video: ATT.devId ? { deviceId: { exact: ATT.devId } } : { facingMode: { ideal: 'environment' } }, audio: false });
    if (gen !== ATT.gen) { ATT.stream.getTracks().forEach(t => t.stop()); ATT.stream = null; return; }
    vid.srcObject = ATT.stream; await vid.play();
    ATT.running = true; document.querySelector('.cam').classList.add('live'); st.textContent = 'Scanning. Hold the ID card QR inside the frame.';
    try { ATT.devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput'); } catch (e) { ATT.devs = []; }
    const tick = async () => {
      if (gen !== ATT.gen || !ATT.running) return;
      if (vid.readyState >= 2 && !ATT.busy) {
        ATT.busy = true;
        try { const t = await decodeFrame(vid); if (t && gen === ATT.gen) await onScan(t); }
        catch (e) { if (e.message === 'NODECODER') { stopScanner(); $('#camst').textContent = 'This browser cannot read QR codes from the camera and lib/jsQR.js is missing. Use manual entry.'; return; } }
        ATT.busy = false;
      }
      ATT.timer = setTimeout(tick, 140);
    };
    tick();
  } catch (e) {
    stopScanner();
    st.textContent = e.name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access in the browser settings, or use manual entry.'
      : e.name === 'NotFoundError' || e.name === 'OverconstrainedError' ? 'No usable camera was found. Use manual entry.' : 'Camera error: ' + (e.message || e.name) + '. Use manual entry.';
  }
}
async function switchCam() {
  try { if (!ATT.devs.length) ATT.devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput'); } catch (e) { /* ignore */ }
  if (ATT.devs.length < 2) { toast('Only one camera was found.'); return; }
  const cur = ATT.stream && ATT.stream.getVideoTracks()[0] ? ATT.stream.getVideoTracks()[0].getSettings().deviceId : '';
  const i = ATT.devs.findIndex(d => d.deviceId === cur);
  ATT.devId = ATT.devs[(i + 1) % ATT.devs.length].deviceId; await startCam();
}
document.addEventListener('visibilitychange', () => { if (document.hidden && ATT.running) stopScanner(); });

/* ---------- hub: sessions list + new session ---------- */
async function viewAttendanceHub(v, args) {
  if (args && args[0]) return viewSession(v, args[0]);
  const X = await aLoad(), cnt = new Map();
  (await DB.getAll('attendance')).forEach(r => { if (r.status !== 'Absent') cnt.set(r.sessionId, (cnt.get(r.sessionId) || 0) + 1); });
  const list = X.sessions.slice().sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime)).slice(0, 15);
  const subs = [...new Set(X.sessions.map(s => s.subject).filter(Boolean))];
  const row = s => `<a class="sess" href="#scanner/${s.id}"><div><b>${esc(s.name)}</b><span>${esc(sLabel(X, s))}${s.subject ? ', ' + esc(s.subject) : ''}</span><span>${esc(s.date)} ${esc(s.startTime || '')}-${esc(s.endTime || '')}</span></div><div class="tags">${pill(s.status)}<span class="pill">${cnt.get(s.id) || 0} present</span></div></a>`;
  v.innerHTML = `<h1>QR Attendance</h1><p class="sub">Create a session, scan ID cards, then close the session.</p>
  ${X.classes.length ? `<form class="card" id="nf" novalidate><h2>New attendance session</h2>
    <div class="row"><div><label for="c">Class *</label><select id="c">${X.classes.slice().sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
    <div><label for="sc">Section</label><select id="sc"></select></div></div>
    <div class="row"><div><label for="sb">Subject (optional)</label><input id="sb" maxlength="60" list="dl-sb" autocomplete="off"></div><div><label for="nm">Session name (optional)</label><input id="nm" maxlength="80" placeholder="Created automatically"></div></div>
    <datalist id="dl-sb">${subs.map(s => `<option value="${esc(s)}">`).join('')}</datalist>
    <div class="row"><div><label for="dt">Date *</label><input id="dt" type="date" value="${todayStr()}"></div>
    <div class="row2"><div><label for="t1">Start</label><input id="t1" type="time" value="${nowHM()}"></div><div><label for="t2">End</label><input id="t2" type="time" value="${addHour(nowHM())}"></div></div></div>
    <div class="err" id="nerr"></div>
    <div class="actions"><button class="btn" data-go="1" type="submit">Create and start</button><button class="btn ghost" data-go="0" type="button" id="sched">Schedule only</button></div></form>`
    : `<div class="card empty"><h2>No classes yet</h2><p>Classes are created when you register students.</p><a class="btn" href="#students">Add students</a></div>`}
  <h2 style="margin-top:18px">Recent sessions</h2>
  ${list.length ? list.map(row).join('') : '<div class="card empty"><p>No sessions yet. Create your first one above.</p></div>'}`;
  const nf = $('#nf'); if (!nf) return;
  const fillSec = () => { $('#sc').innerHTML = '<option value="">Whole class</option>' + X.sections.filter(s => s.classId === $('#c').value).map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join(''); };
  $('#c').onchange = fillSec; fillSec();
  const go = async start => {
    const er = $('#nerr'); er.textContent = '';
    const classId = $('#c').value, sectionId = $('#sc').value, date = $('#dt').value, t1 = $('#t1').value, t2 = $('#t2').value, subject = clean($('#sb').value);
    if (!classId || !date || !t1) { er.textContent = 'Choose the class, date and start time.'; return; }
    if (t2 && t2 <= t1) { er.textContent = 'The end time must be after the start time.'; return; }
    const now = new Date().toISOString();
    const s = { id: uid(), classId, sectionId, subject, date, startTime: t1, endTime: t2, status: start ? 'Active' : 'Scheduled', createdAt: now, updatedAt: now, startedAt: start ? now : null, closedAt: null, teacherId: null, createdBy: 'admin' };
    s.name = clean($('#nm').value) || `${sLabel(X, s)} ${subject || 'Lecture'} ${t1}`;
    if (!roster(X, s).length) { er.textContent = 'This class has no active students.'; return; }
    if (X.sessions.some(o => o.classId === classId && (o.sectionId || '') === sectionId && o.date === date && o.startTime === t1)) { er.textContent = 'A session for this class already exists at that date and time.'; return; }
    const c = start && activeConflict(X, s); if (c) { er.textContent = `"${c.name}" is already active for this class. Close it first.`; return; }
    try { await DB.putMany([{ store: 'sessions', value: s }, recAud('session_create', 'session', s.id, { session: s.name })]); location.hash = '#scanner/' + s.id; }
    catch (e) { toast('Could not create the session: ' + e.message, 'err'); }
  };
  nf.onsubmit = e => { e.preventDefault(); go(true); };
  $('#sched').onclick = () => go(false);
}

/* ---------- session screen ---------- */
let SES = null;
async function viewSession(v, id) {
  const X = await aLoad(), sess = X.sessions.find(s => s.id === id);
  if (!sess) { toast('Session not found.', 'err'); location.hash = '#scanner'; return; }
  const recs = new Map((await DB.getAllByIndex('attendance', 'sessionId', id)).map(r => [r.studentId, r]));
  ATT.sound = await DB.getSetting('sound', true);
  SES = { X, sess, recs, ros: roster(X, sess), q: '', f: '' };
  drawSession(v);
}
function drawSession(v) {
  const { X, sess } = SES, st = sess.status;
  v.innerHTML = `<div class="head"><div><h1>${esc(sess.name)}</h1><p class="sub">${pill(st)} ${esc(sLabel(X, sess))}${sess.subject ? ', ' + esc(sess.subject) : ''}, ${esc(sess.date)} ${esc(sess.startTime)}${sess.endTime ? '-' + esc(sess.endTime) : ''}</p></div><a class="btn ghost" href="#scanner">All sessions</a></div>
  <div class="grid" id="sstats"></div><div class="bar"><i id="sbar"></i></div>
  <div class="actions" style="margin:0 0 14px">${st === 'Scheduled' ? '<button class="btn" data-ctl="Active" type="button">Start session</button>' : ''}${st === 'Active' ? '<button class="btn ghost" data-ctl="Paused" type="button">Pause</button>' : ''}${st === 'Paused' ? '<button class="btn" data-ctl="Active" type="button">Resume</button>' : ''}${st === 'Active' || st === 'Paused' ? '<button class="btn danger" data-ctl="close" type="button">Close session</button>' : ''}${st === 'Completed' ? '<a class="btn ghost" href="#history">View records</a>' : ''}</div>
  ${st === 'Active' ? `<div class="card"><h2>Scan ID cards</h2><div class="cam" id="camwrap"><video id="cam" playsinline muted></video><div class="frame"></div><div class="scanline"></div><div class="rpanel" id="rp" aria-live="polite"></div></div>
    <p class="note" id="camst" style="text-align:center">Camera is off.</p>
    <div class="actions" style="justify-content:center;margin-top:8px"><button class="btn" data-cam="start" type="button">Start camera</button><button class="btn ghost" data-cam="stop" type="button">Stop</button><button class="btn ghost" data-cam="switch" type="button">Switch camera</button></div>
    <form id="mf" class="row2" style="margin-top:14px;align-items:end"><div><label for="mi">Manual entry: roll number</label><input id="mi" maxlength="40" autocomplete="off" inputmode="text"></div><button class="btn" type="submit">Mark present</button></form>
    <label class="chk2"><input type="checkbox" id="snd" ${ATT.sound ? 'checked' : ''}> Confirmation sound</label></div>`
    : `<div class="card"><p class="note" style="margin:0">${st === 'Scheduled' ? 'Start the session to open the scanner.' : st === 'Paused' ? 'Scanning is paused. Resume the session to scan. You can still mark students below.' : 'This session is closed. Use Attendance Records to correct entries.'}</p></div>`}
  <div class="card"><h2>Students</h2><div class="toolbar2"><input id="rq" type="search" placeholder="Search name or roll number" aria-label="Search students"><select id="rf" aria-label="Filter"><option value="">All</option><option>Unmarked</option><option>Present</option><option>Late</option><option>Absent</option></select></div>
    <p class="note">P = Present, L = Late, A = Absent. Changing an existing mark asks for a reason and is saved in the audit history.</p><div id="rl"></div></div>`;
  v.onclick = sesClick;
  v.onsubmit = e => { if (e.target.id === 'mf') { e.preventDefault(); manualEntry(); } };
  v.oninput = e => { if (e.target.id === 'rq') { SES.q = e.target.value; drawRoster(); } };
  v.onchange = e => {
    if (e.target.id === 'rf') { SES.f = e.target.value; drawRoster(); }
    if (e.target.id === 'snd') { ATT.sound = e.target.checked; DB.setSetting('sound', ATT.sound); }
  };
  refresh();
}
function refresh() {
  if (!SES || !$('#sstats')) return;
  const { ros, recs } = SES, vals = [...recs.values()], n = s => vals.filter(r => r.status === s).length;
  const p = n('Present'), l = n('Late'), a = n('Absent'), rem = ros.filter(s => !recs.has(s.id)).length, tile = (x, t, c) => `<div class="stat ${c || ''}"><b>${x}</b><span>${t}</span></div>`;
  $('#sstats').innerHTML = tile(ros.length, 'Enrolled') + tile(p, 'Present', 'ok') + tile(l, 'Late', 'warn') + tile(a, 'Absent', 'bad') + tile(rem, 'Not marked');
  $('#sbar').style.width = (ros.length ? Math.min(100, Math.round((p + l) / ros.length * 100)) : 0) + '%';
  drawRoster();
}
function drawRoster() {
  const el = $('#rl'); if (!el) return;
  const { ros, recs, q, f } = SES, ql = low(q);
  const rows = ros.filter(s => (!ql || low(s.name).includes(ql) || low(s.roll).includes(ql)) && (!f || (f === 'Unmarked' ? !recs.has(s.id) : (recs.get(s.id) || {}).status === f)));
  if (!rows.length) { el.innerHTML = `<div class="empty">${ros.length ? 'No students match.' : 'No active students in this class.'}</div>`; return; }
  const live = SES.sess.status !== 'Scheduled';
  el.innerHTML = rows.map(s => { const r = recs.get(s.id);
    return `<div class="srow ro"><div class="av">${s.photo ? `<img src="${s.photo}" alt="">` : esc(initials(s.name))}</div>
    <div class="si"><b>${esc(s.name)}</b><span>Roll ${esc(s.roll)}</span><span>${r ? pill(r.status) + ' ' + (r.time ? hm(r.time) : '') + ' ' + esc(r.method === 'QR' ? 'QR' : r.method === 'Auto' ? 'Closed as absent' : 'Manual') : '<span class="pill">Not marked</span>'}</span></div>
    <div class="acts">${live ? FULL.map(x => `<button class="btn sm ${r && r.status === x ? '' : 'ghost'}" data-mark="${x}" data-sid="${s.id}" type="button" aria-label="${x}: ${esc(s.name)}">${x[0]}</button>`).join('') : ''}</div></div>`; }).join('');
}
async function sesClick(e) {
  const b = e.target.closest('[data-ctl],[data-cam],[data-mark]'); if (!b) return;
  try {
    if (b.dataset.cam) { const c = b.dataset.cam; return c === 'start' ? startCam() : c === 'stop' ? stopScanner() : switchCam(); }
    if (b.dataset.mark) return await doMark(b.dataset.sid, b.dataset.mark);
    if (b.dataset.ctl === 'close') return await closeSession();
    return await setStatus(b.dataset.ctl);
  } catch (err) { toast('Something went wrong: ' + (err.message || err), 'err'); }
}
async function setStatus(to) {
  const { sess, X } = SES;
  if (to === 'Active') { const c = activeConflict(X, sess); if (c) { toast(`"${c.name}" is already active for this class. Close it first.`, 'err'); return; } }
  const now = new Date().toISOString(), n = { ...sess, status: to, updatedAt: now };
  if (to === 'Active' && !sess.startedAt) n.startedAt = now;
  await DB.putMany([{ store: 'sessions', value: n }, recAud('session_' + to.toLowerCase(), 'session', sess.id, { session: sess.name })]);
  SES.sess = n; X.sessions = X.sessions.map(s => s.id === n.id ? n : s);
  if (to !== 'Active') stopScanner();
  toast(to === 'Active' ? 'Session is active.' : 'Session paused.', 'ok'); drawSession($('#view'));
}
async function closeSession() {
  const { sess, X, ros, recs } = SES, left = ros.filter(s => !recs.has(s.id));
  if (!await confirmBox('Close this session?', `${left.length} student${left.length === 1 ? '' : 's'} not marked will be recorded as Absent. You can correct any entry later in Attendance Records.`, 'Close session', true)) return;
  const now = new Date().toISOString(), n = { ...sess, status: 'Completed', closedAt: now, updatedAt: now };
  const add = left.map(s => ({ id: uid(), sessionId: sess.id, studentId: s.id, classId: s.classId, date: sess.date, status: 'Absent', time: null, method: 'Auto', note: '', teacherId: null, history: [], createdAt: now, updatedAt: now }));
  await DB.putMany([{ store: 'sessions', value: n }, ...add.map(value => ({ store: 'attendance', value })), recAud('session_completed', 'session', sess.id, { session: sess.name, absent: add.length })]);
  add.forEach(r => recs.set(r.studentId, r)); SES.sess = n; X.sessions = X.sessions.map(s => s.id === n.id ? n : s);
  stopScanner(); toast('Session closed.', 'ok'); drawSession($('#view'));
}

/* ---------- marking ---------- */
function correctionModal(name, from, to) {
  return new Promise(res => {
    const m = modal(`<h2>Change attendance?</h2><p>${esc(name)}: <b>${esc(from)}</b>${to ? ' to <b>' + esc(to) + '</b>' : ''}</p>
      ${to ? '' : `<label for="ns">New status</label><select id="ns">${FULL.filter(x => x !== from).map(x => `<option>${x}</option>`).join('')}</select>`}
      <label for="rs">Reason *</label><input id="rs" maxlength="120" autocomplete="off"><label for="nt">Note (optional)</label><input id="nt" maxlength="200" autocomplete="off">
      <div class="err" id="rse"></div><div class="actions"><button class="btn" data-r="1" type="button">Save change</button><button class="btn ghost" data-r="0" type="button">Cancel</button></div>`);
    m.onclick = e => {
      const b = e.target.closest('[data-r]'); if (!b && e.target !== m) return;
      if (b && b.dataset.r === '1') {
        const reason = clean($('#rs').value); if (!reason) { $('#rse').textContent = 'Enter a reason for this change.'; return; }
        const r = { to: to || $('#ns').value, reason, note: clean($('#nt').value) }; m.remove(); return res(r);
      }
      m.remove(); res(null);
    };
    setTimeout(() => { const f = $('#rs'); f && f.focus(); }, 50);
  });
}
async function applyChange(cur, to, reason, note, stu, sessName) {
  const now = new Date().toISOString();
  const n = { ...cur, status: to, note: note || cur.note || '', time: cur.status !== 'Absent' && cur.time ? cur.time : (to === 'Absent' ? cur.time : now), updatedAt: now, history: [...(cur.history || []), { at: now, from: cur.status, to, reason, by: 'admin' }] };
  await DB.putMany([{ store: 'attendance', value: n }, recAud('attendance_correct', 'attendance', cur.id, { student: stu.name, session: sessName, from: cur.status, to, reason })]);
  return n;
}
async function createRec(stu, status, method) {
  const { sess, recs } = SES, now = new Date().toISOString();
  const rec = { id: uid(), sessionId: sess.id, studentId: stu.id, classId: stu.classId, date: sess.date, status, time: now, method, note: '', teacherId: null, history: [], createdAt: now, updatedAt: now };
  try { await DB.put('attendance', rec); }
  catch (e) {
    if (e && e.name === 'ConstraintError') { const ex = await DB.getOneByIndex('attendance', 'sessionStudent', [sess.id, stu.id]); if (ex) { recs.set(stu.id, ex); refresh(); return { dup: ex }; } }
    throw e;
  }
  recs.set(stu.id, rec); refresh(); return { rec };
}
async function doMark(stuId, to) {
  const { X, sess, recs } = SES, stu = X.stu.get(stuId); if (!stu) return;
  if (sess.status === 'Scheduled') { toast('Start the session first.', 'err'); return; }
  const cur = recs.get(stuId);
  if (!cur) { const r = await createRec(stu, to, 'Manual'); toast(r.dup ? `${stu.name} was already marked ${r.dup.status}.` : `${stu.name}: ${to}`, r.dup ? '' : 'ok'); return; }
  if (cur.status === to) { toast(`Already marked ${to}.`); return; }
  const r = await correctionModal(stu.name, cur.status, to); if (!r) return;
  const n = await applyChange(cur, to, r.reason, r.note, stu, sess.name); recs.set(stuId, n); refresh(); toast('Attendance corrected.', 'ok');
}

/* ---------- scanning pipeline ---------- */
function panel(kind, title, lines, stu) {
  const el = $('#rp'); if (!el) return;
  el.className = 'rpanel show ' + kind;
  el.innerHTML = `${stu && stu.photo ? `<img src="${stu.photo}" alt="">` : `<div class="rav">${kind === 'ok' ? '&#10003;' : kind === 'warn' ? '!' : '&#10007;'}</div>`}<div><b>${esc(title)}</b>${lines.map(l => `<span>${esc(l)}</span>`).join('')}</div>`;
  clearTimeout(ATT.pt); ATT.pt = setTimeout(() => el.classList.remove('show'), 2600);
}
async function onScan(text) {
  if (!SES || SES.sess.status !== 'Active') { toast('Session is not active.', 'err'); return; }
  const now = Date.now(); if (text === ATT.last.p && now - ATT.last.t < 2500) return; ATT.last = { p: text, t: now };
  if (!/^[0-9a-f]{32}$/.test(text)) { panel('err', 'Invalid QR code', ['This is not a Smart Attendance ID card.']); beep(false); return; }
  const stu = await DB.getOneByIndex('students', 'qrId', text);
  if (!stu) { panel('err', 'Unknown student', ['This QR code is not registered here.']); beep(false); return; }
  await accept(SES.X.stu.get(stu.id) || stu, 'QR');
}
async function accept(stu, method) {
  const { sess, recs, X } = SES;
  if (stu.status !== 'Active') { panel('err', 'Student is inactive', [stu.name, 'Not recorded.'], stu); beep(false); return; }
  if (stu.classId !== sess.classId || (sess.sectionId && stu.sectionId !== sess.sectionId)) { panel('err', 'Different class', [stu.name, X.cn(stu.classId) + ' ' + X.sn(stu.sectionId) + ' is not in this session.'], stu); beep(false); return; }
  const cur = recs.get(stu.id);
  if (cur && cur.status !== 'Absent') { panel('warn', 'Already marked', [stu.name, cur.status + ' at ' + hm(cur.time)], stu); beep(false); return; }
  let rec;
  if (cur) { rec = await applyChange(cur, 'Present', 'Scanned after being marked absent', '', stu, sess.name); recs.set(stu.id, rec); refresh(); }
  else { const r = await createRec(stu, 'Present', method); if (r.dup) { panel('warn', 'Already marked', [stu.name, r.dup.status + ' at ' + hm(r.dup.time)], stu); beep(false); return; } rec = r.rec; }
  panel('ok', stu.name, ['Roll ' + stu.roll + ', ' + sLabel(X, { classId: stu.classId, sectionId: stu.sectionId }), 'Present at ' + hm(rec.time)], stu); beep(true);
}
async function manualEntry() {
  const inp = $('#mi'), t = clean(inp.value); if (!t) return;
  const { sess, ros } = SES;
  if (sess.status !== 'Active') { toast('Session is not active.', 'err'); return; }
  const stu = ros.find(s => low(s.roll) === low(t));
  if (!stu) { toast(`No active student with roll number ${t} in this class.`, 'err'); return; }
  await accept(stu, 'Manual'); inp.value = ''; inp.focus();
}

/* ---------- attendance records + audit history ---------- */
const RS = { tab: 'rec', q: '', cls: '', from: '', to: '', st: '', ses: '', sort: 'new', page: 1, X: null, rows: [], aud: [] };
async function viewRecords(v) { RS.X = await aLoad(); await loadRecs(); RS.aud = (await DB.getAll('auditLogs')).filter(a => a.entity === 'attendance' || a.entity === 'session').sort((a, b) => b.at.localeCompare(a.at)); drawRecords(v); }
async function loadRecs() { RS.rows = (RS.from || RS.to) ? await DB.getRange('attendance', 'date', RS.from || '0000-00-00', RS.to || '9999-12-31') : await DB.getAll('attendance'); }
function pagerHtml(total, page) {
  const n = Math.max(1, Math.ceil(total / PAGE_A));
  return n > 1 ? `<button class="btn ghost sm" data-pg="-1" type="button" ${page === 1 ? 'disabled' : ''}>Previous</button><span>Page ${page} of ${n}</span><button class="btn ghost sm" data-pg="1" type="button" ${page === n ? 'disabled' : ''}>Next</button>` : `<span class="note">${total} item${total === 1 ? '' : 's'}</span>`;
}
function drawRecords(v) {
  const X = RS.X, sess = X.sessions.slice().sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime));
  v.innerHTML = `<h1>Attendance Records</h1><p class="sub">Every saved attendance entry, with corrections and audit history.</p>
  <div class="tabs"><button class="tab ${RS.tab === 'rec' ? 'on' : ''}" data-tab="rec" type="button">Records</button><button class="tab ${RS.tab === 'aud' ? 'on' : ''}" data-tab="aud" type="button">Audit history</button></div>
  ${RS.tab === 'rec' ? `<div class="card toolbar2">
    <input id="fq" type="search" placeholder="Search name or roll" value="${esc(RS.q)}" aria-label="Search">
    <select id="fc" aria-label="Class"><option value="">All classes</option>${X.classes.map(c => `<option value="${c.id}" ${RS.cls === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
    <select id="fse" aria-label="Session"><option value="">All sessions</option>${sess.map(s => `<option value="${s.id}" ${RS.ses === s.id ? 'selected' : ''}>${esc(s.date + ' ' + s.name)}</option>`).join('')}</select>
    <select id="fst" aria-label="Status"><option value="">Any status</option>${FULL.map(s => `<option ${RS.st === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
    <label class="dl">From <input id="ff" type="date" value="${RS.from}"></label><label class="dl">To <input id="ft" type="date" value="${RS.to}"></label>
    <select id="so" aria-label="Sort"><option value="new" ${RS.sort === 'new' ? 'selected' : ''}>Newest first</option><option value="old" ${RS.sort === 'old' ? 'selected' : ''}>Oldest first</option><option value="name" ${RS.sort === 'name' ? 'selected' : ''}>Student name</option></select></div>` : ''}
  <div id="rlist"></div><div class="pager" id="rpg"></div>`;
  v.onclick = e => {
    const t = e.target.closest('[data-tab],[data-pg],[data-fix]'); if (!t) return;
    if (t.dataset.tab) { RS.tab = t.dataset.tab; RS.page = 1; return drawRecords(v); }
    if (t.dataset.pg) { RS.page += +t.dataset.pg; return drawRList(); }
    fixRec(t.dataset.fix);
  };
  v.onchange = v.oninput = async e => {
    const id = e.target.id, val = e.target.value;
    const map = { fq: 'q', fc: 'cls', fse: 'ses', fst: 'st', so: 'sort', ff: 'from', ft: 'to' };
    if (!map[id]) return; RS[map[id]] = val; RS.page = 1;
    if (id === 'ff' || id === 'ft') { try { await loadRecs(); } catch (err) { toast('Could not load records: ' + err.message, 'err'); } }
    drawRList();
  };
  drawRList();
}
function recFiltered() {
  const X = RS.X, q = low(RS.q), nm = a => (X.stu.get(a.studentId) || {}).name || '';
  const r = RS.rows.filter(a => { const s = X.stu.get(a.studentId) || {};
    return (!RS.cls || a.classId === RS.cls) && (!RS.st || a.status === RS.st) && (!RS.ses || a.sessionId === RS.ses) && (!q || low(s.name).includes(q) || low(s.roll).includes(q)); });
  const key = a => a.date + (a.time || '');
  r.sort(RS.sort === 'name' ? (a, b) => nm(a).localeCompare(nm(b)) || key(b).localeCompare(key(a)) : RS.sort === 'old' ? (a, b) => key(a).localeCompare(key(b)) : (a, b) => key(b).localeCompare(key(a)));
  return r;
}
function drawRList() {
  const X = RS.X, el = $('#rlist'); if (!el) return;
  let total, html;
  if (RS.tab === 'aud') {
    total = RS.aud.length; const pages = Math.max(1, Math.ceil(total / PAGE_A)); if (RS.page > pages) RS.page = pages;
    const lab = a => { const d = a.details || {}; return { attendance_correct: `${d.student}: ${d.from} to ${d.to}. Reason: ${d.reason}. Session: ${d.session}`, session_create: `Session created: ${d.session}`, session_active: `Session started or resumed: ${d.session}`, session_paused: `Session paused: ${d.session}`, session_completed: `Session closed: ${d.session} (${d.absent || 0} recorded absent)` }[a.action] || a.action; };
    html = RS.aud.slice((RS.page - 1) * PAGE_A, RS.page * PAGE_A).map(a => `<div class="rrow"><div><b>${a.action === 'attendance_correct' ? 'Correction' : 'Session'}</b><span>${esc(lab(a))}</span></div><div class="tags"><span class="pill">${esc(new Date(a.at).toLocaleString())}</span><span class="pill">${esc(a.by || 'admin')}</span></div></div>`).join('');
    if (!total) html = '<div class="card empty"><h2>No audit entries</h2><p>Corrections and session changes appear here.</p></div>';
  } else {
    const all = recFiltered(); total = all.length; const pages = Math.max(1, Math.ceil(total / PAGE_A)); if (RS.page > pages) RS.page = pages;
    html = all.slice((RS.page - 1) * PAGE_A, RS.page * PAGE_A).map(a => { const s = X.stu.get(a.studentId) || { name: '(removed student)', roll: '-' }, se = X.sessions.find(x => x.id === a.sessionId);
      return `<div class="rrow"><div><b>${esc(s.name)}</b><span>Roll ${esc(s.roll)}, ${esc(X.cn(a.classId))} ${esc(X.sn(s.sectionId))}</span><span>${esc(a.date)} ${a.time ? hm(a.time) : ''}, ${esc(se ? se.name : 'Session')}</span>${a.note ? `<span>Note: ${esc(a.note)}</span>` : ''}${(a.history || []).length ? `<span>Corrected ${a.history.length} time${a.history.length > 1 ? 's' : ''}</span>` : ''}</div>
      <div class="tags">${pill(a.status)}<span class="pill">${esc(a.method === 'Auto' ? 'Closed as absent' : a.method)}</span><button class="btn ghost sm" data-fix="${a.id}" type="button">Correct</button></div></div>`; }).join('');
    if (!total) html = `<div class="card empty"><h2>${RS.rows.length ? 'No records match' : 'No attendance records yet'}</h2><p>${RS.rows.length ? 'Change the search or filters.' : 'Records appear here after you scan or mark students in a session.'}</p></div>`;
  }
  el.innerHTML = html; $('#rpg').innerHTML = pagerHtml(total, RS.page);
}
async function fixRec(id) {
  const a = RS.rows.find(x => x.id === id), stu = a && RS.X.stu.get(a.studentId); if (!a || !stu) return;
  const se = RS.X.sessions.find(x => x.id === a.sessionId);
  const r = await correctionModal(stu.name, a.status, null); if (!r) return;
  try { const n = await applyChange(a, r.to, r.reason, r.note, stu, se ? se.name : ''); RS.rows = RS.rows.map(x => x.id === id ? n : x);
    RS.aud = (await DB.getAll('auditLogs')).filter(x => x.entity === 'attendance' || x.entity === 'session').sort((p, q) => q.at.localeCompare(p.at));
    toast('Attendance corrected.', 'ok'); drawRList(); } catch (e) { toast('Could not save: ' + e.message, 'err'); }
}

/* ---------- main dashboard block ---------- */
async function attendanceDashHtml() {
  const today = todayStr(), from = shiftDay(today, -7);
  const [students, sessions, classes, recent] = await Promise.all([DB.getAll('students'), DB.getAll('sessions'), DB.getAll('classes'), DB.getRange('attendance', 'date', from, today)]);
  const cn = new Map(classes.map(c => [c.id, c.name])), sm = new Map(students.map(s => [s.id, s]));
  const td = recent.filter(r => r.date === today), n = s => td.filter(r => r.status === s).length;
  const p = n('Present'), l = n('Late'), a = n('Absent'), pct = td.length ? Math.round((p + l) / td.length * 100) + '%' : '-';
  const tile = (x, t, c) => `<div class="stat ${c || ''}"><b>${x}</b><span>${t}</span></div>`;
  const live = sessions.filter(s => s.status === 'Active' || s.status === 'Paused').sort((x, y) => (y.date + y.startTime).localeCompare(x.date + x.startTime)).slice(0, 2);
  let liveHtml = '';
  for (const s of live) {
    const recs = await DB.getAllByIndex('attendance', 'sessionId', s.id), enrolled = students.filter(t => t.status === 'Active' && t.classId === s.classId && (!s.sectionId || t.sectionId === s.sectionId)).length;
    const pr = recs.filter(r => r.status !== 'Absent').length, w = enrolled ? Math.min(100, Math.round(pr / enrolled * 100)) : 0;
    liveHtml += `<a class="card sess live" href="#scanner/${s.id}"><div><b>${esc(s.name)}</b><span>${esc(cn.get(s.classId) || '-')}${s.subject ? ', ' + esc(s.subject) : ''}, ${esc(s.date)}</span><span>${pr} of ${enrolled} present</span><div class="bar"><i style="width:${w}%"></i></div></div><div class="tags">${pill(s.status)}<span class="pill ok">Open</span></div></a>`;
  }
  const act = recent.slice().sort((x, y) => ((y.updatedAt || '') + y.id).localeCompare((x.updatedAt || '') + x.id)).slice(0, 8);
  return `<h2 style="margin:6px 0 10px">Attendance today, ${esc(today)}</h2>
  <div class="grid">${tile(students.length, 'Registered students') + tile(p, 'Present', 'ok') + tile(l, 'Late', 'warn') + tile(a, 'Absent', 'bad') + tile(pct, 'Attendance today')}</div>
  <div style="margin-top:14px">${liveHtml || '<div class="card empty" style="padding:16px"><p style="margin:0 0 10px">No active session right now.</p><a class="btn" href="#scanner">Start attendance</a></div>'}</div>
  <div class="card"><h2>Recent activity</h2>${act.length ? act.map(r => { const s = sm.get(r.studentId) || { name: '(removed)' }; return `<div class="act"><span><b>${esc(s.name)}</b> ${pill(r.status)}</span><span class="note">${esc(r.date)} ${r.time ? hm(r.time) : ''}</span></div>`; }).join('') : '<p class="note" style="margin:0">No attendance recorded in the last 7 days.</p>'}</div>`;
}
