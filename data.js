/* Smart Attendance - Phase 4 (part 1): backup, restore and database health check. */
const BK_FORMAT = 'smart-attendance-backup';
const STORE_NAMES = Object.keys(SCHEMA);
const KEEP_ON_RESTORE = k => String(k).startsWith('pin'); // PIN data is never exported or overwritten by a restore
const STATUSES = ['Present', 'Late', 'Absent'];

function downloadFile(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type: type || 'application/octet-stream' }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
const stamp = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()); };

async function buildBackup() {
  const stores = await DB.snapshot();
  stores.settings = stores.settings.filter(r => !KEEP_ON_RESTORE(r.key));
  const counts = {}; STORE_NAMES.forEach(s => { counts[s] = stores[s].length; });
  const inst = stores.institution[0];
  return { format: BK_FORMAT, appVersion: APP_VERSION, schemaVersion: DB_VERSION, createdAt: new Date().toISOString(), institutionName: inst ? inst.name : '', counts, stores };
}
async function exportBackup() {
  const b = await buildBackup();
  downloadFile(`smart-attendance-backup-${stamp()}.json`, JSON.stringify(b), 'application/json');
  try { await DB.setSetting('lastBackupAt', new Date().toISOString()); } catch (e) { /* not critical */ }
  return b;
}

/* Returns { errors, warnings }. Any error blocks restoring. */
function validateBackup(b) {
  const errors = [], warnings = [], add = (arr, m) => { if (arr.length < 40) arr.push(m); };
  if (!b || typeof b !== 'object' || Array.isArray(b) || b.format !== BK_FORMAT) { errors.push('This file is not a Smart Attendance backup.'); return { errors, warnings }; }
  if (typeof b.schemaVersion !== 'number' || b.schemaVersion < 1) errors.push('The backup has no valid database version.');
  else if (b.schemaVersion > DB_VERSION) errors.push(`This backup was made by a newer version of the app (database version ${b.schemaVersion}). Update the app first. This app uses version ${DB_VERSION}.`);
  else if (b.schemaVersion < DB_VERSION) warnings.push(`The backup uses an older database version (${b.schemaVersion}). It is compatible.`);
  if (!b.stores || typeof b.stores !== 'object') { errors.push('The backup has no data section.'); return { errors, warnings }; }
  const st = b.stores, ids = {};
  for (const s of STORE_NAMES) {
    if (!Array.isArray(st[s])) { errors.push(`The backup is missing the "${s}" section.`); continue; }
    const kp = SCHEMA[s][0], seen = new Set(); ids[s] = seen;
    st[s].forEach((r, i) => {
      if (!r || typeof r !== 'object') { add(errors, `${s} record ${i + 1} is not valid.`); return; }
      const k = r[kp]; if (typeof k !== 'string' || !k) { add(errors, `${s} record ${i + 1} has no ${kp}.`); return; }
      if (seen.has(k)) add(errors, `${s} has a duplicate ${kp}: ${k}.`); seen.add(k);
    });
  }
  if (errors.length) return { errors, warnings };
  if (st.institution.length > 1) add(errors, 'The backup contains more than one institution.');
  if (!st.institution.length) warnings.push('The backup has no institution profile. You will need to set it up again.');
  const uniq = (store, fn, label) => { const m = new Set(); st[store].forEach(r => { const v = fn(r); if (v == null || v === '') return; if (m.has(v)) add(errors, `Duplicate ${label}: ${v}.`); m.add(v); }); };
  uniq('students', r => r.qrId, 'QR identifier'); uniq('students', r => r.rollKey, 'roll number in a class'); uniq('students', r => r.regNo, 'registration number');
  uniq('classes', r => r.name, 'class name'); uniq('users', r => r.username, 'username'); uniq('attendance', r => r.sessionId + '|' + r.studentId, 'attendance entry for a student in a session');
  const need = (store, field, target, label) => { let n = 0; st[store].forEach(r => { if (r[field] && !ids[target].has(r[field])) n++; }); if (n) add(errors, `${n} ${label} point to a missing ${target.replace(/s$/, '')}.`); };
  need('students', 'classId', 'classes', 'students'); need('students', 'sectionId', 'sections', 'students'); need('sections', 'classId', 'classes', 'sections');
  need('sessions', 'classId', 'classes', 'sessions'); need('attendance', 'studentId', 'students', 'attendance records'); need('attendance', 'sessionId', 'sessions', 'attendance records');
  const badSt = st.attendance.filter(r => !STATUSES.includes(r.status)).length; if (badSt) add(errors, `${badSt} attendance records have an unknown status.`);
  return { errors, warnings };
}

/* Read-only checks of the live database. Nothing is changed or deleted. */
async function healthCheck() {
  const d = await DB.snapshot(), issues = [], today = todayStr();
  const ids = s => new Set(d[s].map(r => r.id)), cls = ids('classes'), sec = ids('sections'), stu = ids('students'), ses = ids('sessions');
  const push = (sev, title, list, fix) => { if (list.length) issues.push({ sev, title, n: list.length, ex: list.slice(0, 5), fix }); };
  const nm = r => r.name || r.id;
  if (!d.institution.length) issues.push({ sev: 'warn', title: 'No institution profile saved', n: 1, ex: [], fix: 'Open Institution Profile and save your details.' });
  push('error', 'Students with missing required details', d.students.filter(r => !r.name || !r.roll || !r.classId).map(nm), 'Open the student in Students and complete the details.');
  push('error', 'Students without a QR identifier', d.students.filter(r => !r.qrId).map(nm), 'Open the student profile and use Regenerate QR.');
  push('error', 'Students linked to a class that no longer exists', d.students.filter(r => r.classId && !cls.has(r.classId)).map(nm), 'Edit each student and choose the class again, or restore a recent backup.');
  push('error', 'Students linked to a missing section', d.students.filter(r => r.sectionId && !sec.has(r.sectionId)).map(nm), 'Edit each student and choose the section again.');
  push('error', 'Sessions linked to a missing class', d.sessions.filter(r => r.classId && !cls.has(r.classId)).map(nm), 'Restore a recent backup if these sessions matter.');
  push('warn', 'Sessions left open from an earlier day', d.sessions.filter(r => (r.status === 'Active' || r.status === 'Paused') && r.date < today).map(r => `${r.name} (${r.date})`), 'Open QR Attendance, open the session and close it.');
  push('error', 'Attendance records for a missing student', d.attendance.filter(r => !stu.has(r.studentId)).map(r => r.id.slice(0, 8)), 'Restore a recent backup. Records are kept, not deleted.');
  push('error', 'Attendance records for a missing session', d.attendance.filter(r => !ses.has(r.sessionId)).map(r => r.id.slice(0, 8)), 'Restore a recent backup. Records are kept, not deleted.');
  push('error', 'Attendance records with an unknown status or no date', d.attendance.filter(r => !STATUSES.includes(r.status) || !r.date).map(r => r.id.slice(0, 8)), 'Correct them in Attendance Records.');
  const sd = new Map(d.sessions.map(r => [r.id, r.date]));
  push('warn', 'Attendance records whose date differs from their session date', d.attendance.filter(r => sd.has(r.sessionId) && sd.get(r.sessionId) !== r.date).map(r => r.id.slice(0, 8)), 'Review these records in Attendance Records.');
  const sm = new Map(d.students.map(r => [r.id, r]));
  push('info', 'Attendance for students who are now inactive', d.attendance.filter(r => sm.get(r.studentId) && sm.get(r.studentId).status === 'Inactive').map(r => sm.get(r.studentId).name).filter((x, i, a) => a.indexOf(x) === i), 'No action needed. History is kept.');
  return { issues, counts: Object.fromEntries(STORE_NAMES.map(s => [s, d[s].length])) };
}

async function viewBackup(v) {
  const cur = await DB.counts(), keys = ['students', 'classes', 'sections', 'sessions', 'attendance', 'auditLogs'], lab = { students: 'Students', classes: 'Classes', sections: 'Sections', sessions: 'Sessions', attendance: 'Attendance records', auditLogs: 'Audit entries' };
  v.innerHTML = `<h1>Backup and Data</h1><p class="sub">Keep a copy of your data outside this device.</p>
  <div class="card"><h2>Export backup</h2><p>Saves every record (${cur.students} students, ${cur.attendance} attendance records, institution profile, settings and audit history) in one JSON file.</p>
    <p class="note">The file contains student information and photos. Store it safely. PIN lock data is never included. CSV exports are separate and are not complete backups.</p>
    <div class="actions" style="margin-top:10px"><button class="btn" id="bx" type="button">Download backup</button></div></div>
  <div class="card"><h2>Restore backup</h2><p class="note">Restoring replaces all data on this device with the contents of the backup. You will see a preview first, and nothing changes until you confirm.</p>
    <label for="bf">Backup file (.json)</label><input id="bf" type="file" accept=".json,application/json"><div id="bp"></div></div>
  <div class="card"><h2>Data health check</h2><p class="note">Looks for broken links and inconsistent records. It only reads your data and never changes or deletes anything.</p>
    <div class="actions" style="margin-top:10px"><button class="btn ghost" id="hc" type="button">Run health check</button></div><div id="hr"></div></div>`;
  $('#bx').onclick = async e => { e.target.disabled = true; try { const b = await exportBackup(); toast(`Backup downloaded (${b.counts.students} students, ${b.counts.attendance} attendance records).`, 'ok'); } catch (err) { toast('Backup failed: ' + err.message, 'err'); } e.target.disabled = false; };
  $('#hc').onclick = async e => {
    e.target.disabled = true; $('#hr').innerHTML = '<p class="note">Checking...</p>';
    try {
      const r = await healthCheck();
      $('#hr').innerHTML = (r.issues.length ? r.issues.map(i => `<div class="issue ${i.sev}"><b>${esc(i.title)} (${i.n})</b><span>${esc(i.ex.join(', '))}${i.n > i.ex.length ? ', ...' : ''}</span><span>${esc(i.fix)}</span></div>`).join('') +
        '<p class="note">Nothing was changed. Download a backup before you fix anything. If the data looks badly damaged, restore your most recent backup.</p>' : '<p><span class="pill ok">No problems found</span></p>') +
        `<p class="note">Checked ${r.counts.students} students, ${r.counts.sessions} sessions and ${r.counts.attendance} attendance records.</p>`;
    } catch (err) { $('#hr').innerHTML = `<p class="err">Health check failed: ${esc(err.message)}</p>`; }
    e.target.disabled = false;
  };
  $('#bf').onchange = async e => {
    const f = e.target.files[0], box = $('#bp'); if (!f) return;
    box.innerHTML = '<p class="note">Reading file...</p>';
    let b; try { b = JSON.parse(await f.text()); } catch (err) { box.innerHTML = '<p class="err">This file could not be read. It is not valid JSON, so nothing was changed.</p>'; return; }
    const { errors, warnings } = validateBackup(b);
    if (errors.length) { box.innerHTML = `<div class="issue error"><b>This backup cannot be restored</b>${errors.slice(0, 12).map(x => `<span>${esc(x)}</span>`).join('')}${errors.length > 12 ? `<span>and ${errors.length - 12} more problems</span>` : ''}</div><p class="note">Your current data was not changed.</p>`; return; }
    box.innerHTML = `<div class="card" style="margin:12px 0 0"><h2>Backup preview</h2><dl><dt>File</dt><dd>${esc(f.name)}</dd><dt>Created</dt><dd>${esc(new Date(b.createdAt).toLocaleString())}</dd><dt>App version</dt><dd>${esc(b.appVersion || '-')}</dd><dt>Database version</dt><dd>${b.schemaVersion}</dd><dt>Institution</dt><dd>${esc(b.institutionName || '-')}</dd></dl>
      <div class="cmp" style="margin-top:12px"><b>Record type</b><b>Backup</b><b>Now</b>${keys.map(k => `<span>${lab[k]}</span><span>${b.stores[k].length}</span><span>${cur[k]}</span>`).join('')}</div>
      ${warnings.map(w => `<div class="issue warn"><span>${esc(w)}</span></div>`).join('')}
      <label class="chk2"><input type="checkbox" id="pre" checked> Download a backup of my current data first</label>
      <div class="actions"><button class="btn danger" id="rs" type="button">Restore this backup</button></div></div>`;
    $('#rs').onclick = async () => {
      if (!await confirmBox('Replace all current data?', `This device currently has ${cur.students} students and ${cur.attendance} attendance records. They will be replaced by the backup (${b.stores.students.length} students, ${b.stores.attendance.length} attendance records). This cannot be undone.`, 'Replace data', true)) return;
      const btn = $('#rs'); btn.disabled = true; btn.textContent = 'Restoring...';
      try {
        if ($('#pre').checked) await exportBackup();
        const keep = (await DB.getAll('settings')).filter(r => KEEP_ON_RESTORE(r.key)), data = { ...b.stores, settings: [...b.stores.settings.filter(r => !KEEP_ON_RESTORE(r.key)), ...keep] };
        await DB.replaceAll(data);
        institution = (await DB.getAll('institution'))[0] || null; await applyTheme();
        toast('Backup restored.', 'ok'); location.hash = institution ? '#dashboard' : '#setup'; route();
      } catch (err) { toast('Restore failed. Your current data is unchanged. ' + (err.message || ''), 'err'); btn.disabled = false; btn.textContent = 'Restore this backup'; }
    };
  };
}
