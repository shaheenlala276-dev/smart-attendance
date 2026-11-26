/* Smart Attendance - reports, CSV export and printing.
   "Conducted classes" = closed (Completed) sessions. Late counts as attended.
   Attendance % = (Present + Late) / Conducted x 100. */
const REP = { last: null };
const csvCell = x => {
  let s = x == null ? '' : String(x);
  if (/^[=@\t\r]/.test(s) || (/^[+-]/.test(s) && !/^[+-]?[\d\s()-]+$/.test(s))) s = "'" + s; // stop spreadsheet formulas
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const toCsv = rows => '\ufeff' + rows.map(r => r.map(csvCell).join(',')).join('\r\n');
const fmtPct = p => p == null ? '-' : (Math.round(p * 10) / 10) + '%';
const lastDay = ym => { const [y, m] = ym.split('-').map(Number); return ym + '-' + String(new Date(y, m, 0).getDate()).padStart(2, '0'); };

async function buildReport(o) {
  const X = await aLoad(), recs = await DB.getRange('attendance', 'date', o.from, o.to);
  const inCls = id => !o.classId || id === o.classId;
  const sess = X.sessions.filter(s => s.date >= o.from && s.date <= o.to && inCls(s.classId));
  const done = sess.filter(s => s.status === 'Completed'), rs = new Map(recs.map(r => [r.sessionId + '|' + r.studentId, r])), has = new Set(recs.map(r => r.studentId));
  const studs = X.students.filter(s => inCls(s.classId) && (!o.studentId || s.id === o.studentId) && (s.status === 'Active' || has.has(s.id)))
    .sort((a, b) => X.cn(a.classId).localeCompare(X.cn(b.classId), undefined, { numeric: true }) || byRoll(a, b));
  const days = new Map(), subs = new Map(); const tot = { c: 0, p: 0, l: 0 };
  const rows = studs.map(st => {
    let p = 0, l = 0, c = 0;
    done.forEach(s => {
      if (s.classId !== st.classId || (s.sectionId && s.sectionId !== st.sectionId)) return;
      c++; const r = rs.get(s.id + '|' + st.id), k = r && r.status === 'Present' ? 'p' : r && r.status === 'Late' ? 'l' : 'a';
      if (k === 'p') p++; if (k === 'l') l++;
      const d = days.get(s.date) || { n: new Set(), c: 0, p: 0, l: 0 }; d.n.add(s.id); d.c++; if (k !== 'a') d[k]++; days.set(s.date, d);
      const sb = s.subject || '(No subject)', u = subs.get(sb) || { n: new Set(), c: 0, p: 0, l: 0 }; u.n.add(s.id); u.c++; if (k !== 'a') u[k]++; subs.set(sb, u);
    });
    tot.c += c; tot.p += p; tot.l += l;
    return { st, c, p, l, a: c - p - l, pct: c ? (p + l) / c * 100 : null };
  }).filter(r => r.c || o.studentId);
  const sm = new Map(X.sessions.map(s => [s.id, s]));
  const hist = recs.filter(r => inCls(r.classId) && (!o.studentId || r.studentId === o.studentId)).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  return { o, X, rows, days, subs, tot, hist, sm, nDone: done.length, nOpen: sess.length - done.length };
}

function reportHtml(R) {
  const { o, X, rows, days, subs, tot, hist, sm } = R, cl = o.classId ? X.cn(o.classId) : 'All classes', stu = o.studentId ? X.stu.get(o.studentId) : null;
  const tile = (n, t, c) => `<div class="stat ${c || ''}"><b>${n}</b><span>${t}</span></div>`, a = tot.c - tot.p - tot.l;
  const pc = (c, p, l) => { const v = c ? (p + l) / c * 100 : null; return `<td class="n ${v != null && v < 75 ? 'low' : ''}">${fmtPct(v)}</td>`; };
  const inst = institution || {};
  let h = `<div class="rep"><div class="ph">${inst.logo ? `<img src="${inst.logo}" alt="">` : ''}<h2>${esc(inst.name || 'Smart Attendance')}</h2><div>${esc([inst.address, inst.phone].filter(Boolean).join(' | '))}</div>
    <b>${esc(o.title)}</b><div>${esc(o.from)}${o.from !== o.to ? ' to ' + esc(o.to) : ''} | ${esc(stu ? stu.name + ' (Roll ' + stu.roll + ')' : cl)} | Generated ${esc(new Date().toLocaleString())}</div></div>
    <h2 class="no-print">${esc(o.title)}: ${esc(o.from)}${o.from !== o.to ? ' to ' + esc(o.to) : ''}</h2>
    <div class="grid">${tile(R.nDone, 'Classes conducted') + tile(tot.p, 'Present', 'ok') + tile(tot.l, 'Late', 'warn') + tile(a, 'Absent', 'bad') + tile(fmtPct(tot.c ? (tot.p + tot.l) / tot.c * 100 : null), 'Attendance')}</div>
    ${R.nOpen ? `<p class="note">${R.nOpen} session${R.nOpen > 1 ? 's are' : ' is'} not closed yet and not counted.</p>` : ''}`;
  if (!R.nDone && !hist.length) return h + '<div class="card empty"><h2>No attendance found</h2><p>There are no closed sessions or records for these choices.</p></div></div>';
  if (!stu && rows.length) h += `<div class="card"><h2>Students</h2><div class="tw"><table class="rt"><tr><th>Roll</th><th>Name</th><th>Class</th><th class="n">Conducted</th><th class="n">Present</th><th class="n">Late</th><th class="n">Absent</th><th class="n">%</th></tr>${rows.map(r => `<tr><td>${esc(r.st.roll)}</td><td>${esc(r.st.name)}</td><td>${esc(sLabel(X, r.st))}</td><td class="n">${r.c}</td><td class="n">${r.p}</td><td class="n">${r.l}</td><td class="n">${r.a}</td>${pc(r.c, r.p, r.l)}</tr>`).join('')}</table></div></div>`;
  if (days.size > 1) h += `<div class="card"><h2>Day by day</h2><div class="tw"><table class="rt"><tr><th>Date</th><th class="n">Sessions</th><th class="n">Present</th><th class="n">Late</th><th class="n">Absent</th><th class="n">%</th></tr>${[...days].sort((x, y) => x[0].localeCompare(y[0])).map(([d, v]) => `<tr><td>${esc(d)}</td><td class="n">${v.n.size}</td><td class="n">${v.p}</td><td class="n">${v.l}</td><td class="n">${v.c - v.p - v.l}</td>${pc(v.c, v.p, v.l)}</tr>`).join('')}</table></div></div>`;
  if ([...subs.keys()].some(k => k !== '(No subject)')) h += `<div class="card"><h2>By subject</h2><div class="tw"><table class="rt"><tr><th>Subject</th><th class="n">Sessions</th><th class="n">Present</th><th class="n">Late</th><th class="n">Absent</th><th class="n">%</th></tr>${[...subs].sort().map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${v.n.size}</td><td class="n">${v.p}</td><td class="n">${v.l}</td><td class="n">${v.c - v.p - v.l}</td>${pc(v.c, v.p, v.l)}</tr>`).join('')}</table></div></div>`;
  if (stu) h += `<div class="card"><h2>Attendance history</h2>${hist.length ? `<div class="tw"><table class="rt"><tr><th>Date</th><th>Time</th><th>Session</th><th>Subject</th><th>Status</th><th>How</th><th>Note</th></tr>${hist.map(r => { const s = sm.get(r.sessionId) || {}; return `<tr><td>${esc(r.date)}</td><td>${r.time ? hm(r.time) : '-'}</td><td>${esc(s.name || '')}</td><td>${esc(s.subject || '')}</td><td>${esc(r.status)}</td><td>${esc(r.method === 'Auto' ? 'Closed as absent' : r.method)}</td><td>${esc(r.note || '')}</td></tr>`; }).join('')}</table></div>` : '<p class="note">No records for this student in this period.</p>'}</div>`;
  return h + '</div>';
}

function attendanceCsv(R) {
  const { X, hist, sm } = R, head = ['Date', 'Time', 'Roll number', 'Student', 'Class', 'Section', 'Session', 'Subject', 'Status', 'Recorded by', 'Note'];
  return toCsv([head, ...hist.map(r => { const s = X.stu.get(r.studentId) || {}, se = sm.get(r.sessionId) || {}; return [r.date, r.time ? new Date(r.time).toLocaleTimeString() : '', s.roll, s.name, X.cn(r.classId), X.sn(s.sectionId), se.name, se.subject, r.status, r.method === 'Auto' ? 'Closed as absent' : r.method, r.note]; })]);
}
function summaryCsv(R) {
  return toCsv([['Roll number', 'Student', 'Class', 'Section', 'Classes conducted', 'Present', 'Late', 'Absent', 'Attendance %'], ...R.rows.map(r => [r.st.roll, r.st.name, R.X.cn(r.st.classId), R.X.sn(r.st.sectionId), r.c, r.p, r.l, r.a, r.pct == null ? '' : Math.round(r.pct * 10) / 10])]);
}

async function viewReports(v) {
  const X = await aLoad(), t = todayStr(), m0 = t.slice(0, 8) + '01', byName = X.students.slice().sort((a, b) => a.name.localeCompare(b.name));
  const clsOpts = X.classes.slice().sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  v.innerHTML = `<h1>Reports and Export</h1><p class="sub">Reports use closed sessions. Late counts as attended.</p>
  <form class="card no-print" id="rf" novalidate><div class="row"><div><label for="rt">Report</label><select id="rt"><option value="daily">Daily</option><option value="weekly">Weekly (7 days)</option><option value="monthly">Monthly</option><option value="range">Date range</option><option value="student">Individual student</option></select></div>
    <div><label for="rc">Class</label><select id="rc"><option value="">All classes</option>${clsOpts}</select></div></div>
    <div class="row"><div data-for="daily weekly"><label for="rd">Date (last day for weekly)</label><input id="rd" type="date" value="${t}"></div>
    <div data-for="monthly"><label for="rm">Month</label><input id="rm" type="month" value="${t.slice(0, 7)}"></div>
    <div data-for="range student"><label for="r1">From</label><input id="r1" type="date" value="${m0}"></div><div data-for="range student"><label for="r2">To</label><input id="r2" type="date" value="${t}"></div>
    <div data-for="student"><label for="rs">Student</label><select id="rs"><option value="">Choose a student</option>${byName.map(s => `<option value="${s.id}">${esc(s.name)} (Roll ${esc(s.roll)}, ${esc(X.cn(s.classId))})</option>`).join('')}</select></div></div>
    <div class="err" id="re"></div><div class="actions"><button class="btn" type="submit">Show report</button></div></form>
  <div id="rout"></div>
  <div class="card no-print"><h2>Export students</h2><p class="note">Saves the student list as a CSV file. This is not a full backup. Use Backup and Data for that.</p>
    <div class="row"><div><label for="sc2">Class</label><select id="sc2"><option value="">All classes</option>${clsOpts}</select></div><div><label for="ss2">Status</label><select id="ss2"><option value="">Any</option><option>Active</option><option>Inactive</option></select></div></div>
    <div class="actions"><button class="btn ghost" id="sx" type="button">Download students CSV</button></div></div>`;
  const sync = () => v.querySelectorAll('[data-for]').forEach(e => { e.hidden = !e.dataset.for.split(' ').includes($('#rt').value); });
  $('#rt').onchange = sync; sync();
  $('#rf').onsubmit = async e => {
    e.preventDefault(); const er = $('#re'); er.textContent = '';
    const k = $('#rt').value, o = { classId: $('#rc').value, studentId: '', title: { daily: 'Daily report', weekly: 'Weekly report', monthly: 'Monthly report', range: 'Attendance report', student: 'Student attendance report' }[k] };
    if (k === 'daily') o.from = o.to = $('#rd').value;
    else if (k === 'weekly') { o.to = $('#rd').value; o.from = o.to && shiftDay(o.to, -6); }
    else if (k === 'monthly') { const m = $('#rm').value; o.from = m && m + '-01'; o.to = m && lastDay(m); }
    else { o.from = $('#r1').value; o.to = $('#r2').value; if (k === 'student') { o.studentId = $('#rs').value; if (!o.studentId) { er.textContent = 'Choose a student.'; return; } } }
    if (!o.from || !o.to) { er.textContent = 'Choose the date.'; return; }
    if (o.from > o.to) { er.textContent = 'The start date must not be after the end date.'; return; }
    try {
      const R = await buildReport(o); REP.last = R;
      $('#rout').innerHTML = `<div class="actions no-print" style="margin:0 0 12px"><button class="btn" data-x="print" type="button">Print</button><button class="btn ghost" data-x="att" type="button">Attendance CSV</button><button class="btn ghost" data-x="sum" type="button">Summary CSV</button></div>` + reportHtml(R);
    } catch (err) { toast('Could not build the report: ' + err.message, 'err'); }
  };
  v.onclick = e => {
    const b = e.target.closest('[data-x]'); if (!b || !REP.last) return;
    const R = REP.last, name = `${b.dataset.x === 'sum' ? 'summary' : 'attendance'}-${R.o.from}${R.o.from !== R.o.to ? '-to-' + R.o.to : ''}.csv`;
    if (b.dataset.x === 'print') return window.print();
    if (b.dataset.x === 'sum' && !R.rows.length) return toast('There is no summary to export.', 'err');
    if (b.dataset.x === 'att' && !R.hist.length) return toast('There are no attendance records to export.', 'err');
    downloadFile(name, b.dataset.x === 'sum' ? summaryCsv(R) : attendanceCsv(R), 'text/csv;charset=utf-8'); toast('CSV downloaded.', 'ok');
  };
  $('#sx').onclick = () => {
    const c = $('#sc2').value, s = $('#ss2').value, rows = X.students.filter(x => (!c || x.classId === c) && (!s || x.status === s)).sort((a, b) => X.cn(a.classId).localeCompare(X.cn(b.classId), undefined, { numeric: true }) || byRoll(a, b));
    if (!rows.length) return toast('No students match.', 'err');
    downloadFile(`students-${stamp()}.csv`, toCsv([['Name', 'Father name', 'Roll number', 'Registration number', 'Class', 'Section', 'Phone', 'Email', 'Address', 'Admission date', 'Status'], ...rows.map(x => [x.name, x.fatherName, x.roll, x.regNo, X.cn(x.classId), X.sn(x.sectionId), x.phone, x.email, x.address, x.admissionDate, x.status])]), 'text/csv;charset=utf-8');
    toast(`${rows.length} students exported.`, 'ok');
  };
}
