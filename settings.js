/* Smart Attendance - Settings and About screens. */
async function viewSettings(v) {
  const [theme, fs, sound, pin, min, last] = await Promise.all([DB.getSetting('theme', 'dark'), DB.getSetting('fontSize', 'normal'), DB.getSetting('sound', true), getPin(), DB.getSetting('autoLockMin', 5), DB.getSetting('lastBackupAt', '')]);
  const persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false;
  const opt = (arr, cur) => arr.map(([a, b]) => `<option value="${a}" ${String(cur) === String(a) ? 'selected' : ''}>${b}</option>`).join('');
  v.innerHTML = `<h1>Settings</h1><p class="sub">Preferences are saved on this device.</p>
  <div class="card"><h2>Display</h2><div class="row"><div><label for="st">Theme</label><select id="st">${opt([['dark', 'Dark black and emerald'], ['light', 'Light']], theme)}</select></div>
    <div><label for="sf">Text size</label><select id="sf">${opt([['normal', 'Normal'], ['large', 'Large']], fs)}</select></div></div></div>
  <div class="card"><h2>Attendance scanner</h2><label class="chk2" style="margin:0"><input type="checkbox" id="ss" ${sound ? 'checked' : ''}> Play a sound and vibrate after each scan</label></div>
  <div class="card"><h2>Security</h2><p>PIN lock: ${pin ? '<span class="pill ok">On</span>' : '<span class="pill">Off</span>'}</p>
    <p class="note">A PIN keeps casual users out of the app on a shared device. It is not server-grade security: someone with full access to the device and browser tools can still reach the stored data.</p>
    <div class="actions" style="margin:10px 0 14px">${pin ? '<button class="btn" data-a="lock" type="button">Lock now</button><button class="btn ghost" data-a="chg" type="button">Change PIN</button><button class="btn ghost" data-a="rec" type="button">New recovery code</button><button class="btn ghost" data-a="off" type="button">Turn off PIN</button>' : '<button class="btn" data-a="set" type="button">Set a PIN</button>'}</div>
    <label for="sl">Lock automatically after no activity</label><select id="sl" ${pin ? '' : 'disabled'}>${opt([[0, 'Never'], [1, '1 minute'], [2, '2 minutes'], [5, '5 minutes'], [10, '10 minutes'], [15, '15 minutes'], [30, '30 minutes']], min)}</select>
    <p class="note">The app does not lock while the scanner camera is running.</p></div>
  <div class="card"><h2>School and data</h2><div class="actions" style="margin:0 0 10px"><a class="btn ghost" href="#setup">School details</a><a class="btn ghost" href="#backup">Backup and restore</a><a class="btn ghost" href="#backup">Data health check</a><a class="btn ghost" href="#reports">Reports and export</a></div>
    <p class="note">Last backup downloaded from this device: ${last ? esc(new Date(last).toLocaleString()) : 'never'}.</p>
    <p>Persistent storage: <span class="pill ${persisted ? 'ok' : ''}">${persisted ? 'Granted' : 'Not granted'}</span></p><p class="note">Asks the browser not to clear your data when the phone is low on space. Clearing browser data still erases records, so keep backups.</p>
    <button class="btn ghost" data-a="persist" type="button">Request persistent storage</button></div>
  <div class="card"><h2>Application</h2><dl><dt>Version</dt><dd>${APP_VERSION}</dd><dt>Database version</dt><dd>${DB_VERSION}</dd></dl><div class="actions"><a class="btn ghost" href="#start">Steps to get started</a><a class="btn ghost" href="#about">About and help</a></div></div>`;
  const again = () => viewSettings(v);
  v.onchange = async e => {
    const id = e.target.id, val = e.target.value;
    try {
      if (id === 'st') { await DB.setSetting('theme', val); await applyTheme(); }
      else if (id === 'sf') { await DB.setSetting('fontSize', val); document.documentElement.dataset.fs = val; }
      else if (id === 'ss') { await DB.setSetting('sound', e.target.checked); ATT.sound = e.target.checked; }
      else if (id === 'sl') { await DB.setSetting('autoLockMin', Number(val)); await refreshSecurity(); toast('Saved.', 'ok'); }
    } catch (err) { toast('Could not save: ' + err.message, 'err'); }
  };
  v.onclick = async e => {
    const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a;
    try {
      if (a === 'lock') { await showLock(); return; }
      if (a === 'persist') { const ok = navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false; toast(ok ? 'Persistent storage granted.' : 'The browser did not grant it. Installing the app often helps.', ok ? 'ok' : ''); return again(); }
      const done = a === 'set' ? await setPinFlow() : a === 'chg' ? await changePinFlow() : a === 'off' ? await disablePinFlow() : await newRecoveryFlow();
      if (done) again();
    } catch (err) { toast('Something went wrong: ' + (err.message || err), 'err'); }
  };
}

function viewAbout(v) {
  const i = institution || {}, contact = [i.principal, i.phone, i.email].filter(Boolean);
  const feats = ['School details with logo', 'Student registration with photos, search and filters', 'Permanent random QR codes and printable ID cards', 'QR attendance sessions with a camera scanner and manual marking', 'Attendance records with corrections and an audit history', 'Daily, weekly, monthly, date range and student reports with print and CSV export', 'Full JSON backup, safe restore and a database health check', 'Optional PIN lock with automatic locking'];
  const help = [['Getting started', '1. Fill in the School Details. 2. Add students in Students (classes appear automatically). 3. Print ID cards. 4. Open Take Attendance, pick the class and start a session. 5. Scan the cards, then close the session. 6. Open Reports.'],
    ['Scanning tips', 'Use good light and hold the card steady inside the frame. If the camera will not open, check the browser camera permission. Camera access needs HTTPS or the installed app. You can always type a roll number instead.'],
    ['Backups', 'Download a backup from Backup and Restore often, and keep copies outside this device. Clearing browser data erases records. CSV files are reports, not backups.'],
    ['PIN lock', 'Set a PIN in Settings. Save the recovery code it shows. The PIN only keeps casual users out and is not server-grade security.'],
    ['Install and offline use', 'Open the app address once while online, then use your browser menu to install it or add it to the home screen. After that it works without internet. Updates arrive when you next open it online and your records are kept.']];
  v.innerHTML = `<h1>About Smart Attendance</h1>
  <div class="card"><dl><dt>Application</dt><dd>Smart Attendance</dd><dt>Version</dt><dd>${APP_VERSION}</dd><dt>Database version</dt><dd>${DB_VERSION}</dd><dt>Development</dt><dd>Phase 4, part 2 of 4</dd><dt>Developer</dt><dd>Shaheen Waziri</dd><dt>Storage</dt><dd>IndexedDB on this device only</dd><dt>Internet use</dt><dd>None needed after installation</dd></dl>
    <p style="margin-bottom:0">An offline QR attendance system for schools. All data stays on the device where it is installed.</p></div>
  <div class="card"><h2>Features available</h2><ul>${feats.map(f => `<li>${esc(f)}</li>`).join('')}</ul></div>
  <div class="card"><h2>Help</h2>${help.map(([t, x]) => `<details><summary>${esc(t)}</summary><p>${esc(x)}</p></details>`).join('')}</div>
  <div class="card"><h2>Support contact</h2>${contact.length ? `<p>${contact.map(esc).join('<br>')}</p>` : '<p class="note" style="margin:0">No contact details are set. Add a phone or email in the <a href="#setup">School Details</a> to show it here.</p>'}</div>`;
}
