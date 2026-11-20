/* Smart Attendance - optional PIN lock.
   This is local convenience protection for a shared phone or computer. It is NOT server-grade security:
   anyone with full access to the device and browser tools can still reach the stored data.
   PINs and the recovery code are never stored as plain text (PBKDF2-SHA256 with a random salt). */
const SEC = { on: false, min: 5, locked: false, last: Date.now(), fails: 0, until: 0, res: null, p: null };
const PIN_ITER = 150000;
const b64 = u => btoa(String.fromCharCode(...u));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const pinOk = () => !!(window.crypto && crypto.subtle && window.isSecureContext);
const getPin = () => DB.getSetting('pinData', null);
const normRec = s => String(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
const pinErr = (a, b) => !/^\d{4,8}$/.test(a) ? 'Use 4 to 8 digits.' : a !== b ? 'The two PINs do not match.' : '';

async function pbk(secret, salt, iter) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, k, 256));
}
async function makeHash(secret) { const salt = crypto.getRandomValues(new Uint8Array(16)); return { salt: b64(salt), hash: b64(await pbk(secret, salt, PIN_ITER)), iter: PIN_ITER }; }
async function checkHash(secret, rec) {
  if (!rec) return false;
  const h = await pbk(secret, unb64(rec.salt), rec.iter), e = unb64(rec.hash); let d = h.length ^ e.length;
  for (let i = 0; i < h.length && i < e.length; i++) d |= h[i] ^ e[i];
  return d === 0;
}
function newRecovery() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', out = [];
  while (out.length < 16) for (const x of crypto.getRandomValues(new Uint8Array(32))) if (x < 224 && out.length < 16) out.push(A[x % 32]);
  return out.join('').replace(/(.{4})(?=.)/g, '$1-');
}
/* Too many wrong tries only pause for a while (30 s, then longer). Nothing is ever locked permanently. */
const gate = () => Math.max(0, Math.ceil((SEC.until - Date.now()) / 1000));
const failed = () => { SEC.fails++; if (SEC.fails % 5 === 0) SEC.until = Date.now() + Math.min(300, 30 * 2 ** (SEC.fails / 5 - 1)) * 1000; };
const waitMsg = () => `Too many wrong tries. Try again in ${gate()} seconds.`;

async function refreshSecurity() {
  SEC.on = !!(await getPin()); SEC.min = Number(await DB.getSetting('autoLockMin', 5)) || 0;
  const b = document.getElementById('lock-side'); if (b) b.hidden = !SEC.on;
}

/* ---------- lock screen ---------- */
function showLock() {
  if (SEC.locked) return SEC.p;
  SEC.locked = true; if (typeof stopScanner === 'function') stopScanner();
  const el = document.createElement('div'); el.id = 'lock'; el.className = 'lock'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'App locked');
  el.innerHTML = `<div class="lockbox"><div class="mark">SA</div><h2>${esc((institution && institution.name) || 'Smart Attendance')}</h2>
    <form id="lf"><p class="note">Enter your PIN to open the app.</p><input id="lp" type="password" inputmode="numeric" autocomplete="off" maxlength="8" aria-label="PIN" class="pinin">
    <div class="err" id="le" aria-live="polite"></div><button class="btn" id="lb" type="submit" style="width:100%;margin-top:10px">Unlock</button>
    <button class="btn ghost" id="lf1" type="button" style="width:100%;margin-top:8px">Forgot PIN?</button></form>
    <form id="rf2" hidden><p class="note">Enter the recovery code that was shown when you created the PIN, then choose a new PIN.</p>
    <label for="rc2">Recovery code</label><input id="rc2" autocomplete="off" maxlength="24"><label for="rn1">New PIN</label><input id="rn1" type="password" inputmode="numeric" maxlength="8" autocomplete="off"><label for="rn2">Confirm new PIN</label><input id="rn2" type="password" inputmode="numeric" maxlength="8" autocomplete="off">
    <div class="err" id="re2" aria-live="polite"></div><button class="btn" type="submit" style="width:100%;margin-top:10px">Reset PIN</button><button class="btn ghost" id="rb" type="button" style="width:100%;margin-top:8px">Back</button>
    <p class="note" style="margin-top:12px">Lost the code too? Your records are still on this device. Clearing this site's data in the browser removes the lock but also erases the records, so you would then restore a backup (backups do not contain the PIN).</p></form></div>`;
  document.body.appendChild(el); document.getElementById('app').inert = true;
  SEC.p = new Promise(r => { SEC.res = r; });
  const $l = s => el.querySelector(s), unlock = () => { el.remove(); document.getElementById('app').inert = false; SEC.locked = false; SEC.last = Date.now(); SEC.fails = 0; SEC.until = 0; const r = SEC.res; SEC.res = null; r && r(); };
  let tm = 0; const tick = () => { clearInterval(tm); const run = () => { const w = gate(); if (w > 0) { $l('#le').textContent = waitMsg(); $l('#lb').disabled = true; } else { $l('#le').textContent = ''; $l('#lb').disabled = false; clearInterval(tm); } }; run(); tm = setInterval(run, 1000); };
  $l('#lf1').onclick = () => { $l('#lf').hidden = true; $l('#rf2').hidden = false; $l('#rc2').focus(); };
  $l('#rb').onclick = () => { $l('#rf2').hidden = true; $l('#lf').hidden = false; $l('#lp').focus(); };
  $l('#lf').onsubmit = async e => {
    e.preventDefault(); if (gate() > 0) return tick();
    if (!pinOk()) { $l('#le').textContent = 'PIN checking needs a secure (HTTPS) page. Open the app from its https:// address.'; return; }
    try {
      if (await checkHash($l('#lp').value, await getPin())) { clearInterval(tm); unlock(); return; }
      failed(); $l('#lp').value = ''; $l('#le').textContent = gate() > 0 ? waitMsg() : 'That PIN is not correct.'; if (gate() > 0) tick();
    } catch (err) { $l('#le').textContent = 'Could not check the PIN: ' + err.message; }
  };
  $l('#rf2').onsubmit = async e => {
    e.preventDefault(); const er = $l('#re2'); er.textContent = '';
    if (gate() > 0) { er.textContent = waitMsg(); return; }
    const pe = pinErr($l('#rn1').value, $l('#rn2').value); if (pe) { er.textContent = pe; return; }
    try {
      const d = await getPin();
      if (!await checkHash(normRec($l('#rc2').value), d && d.rec)) { failed(); er.textContent = gate() > 0 ? waitMsg() : 'That recovery code is not correct.'; return; }
      await DB.setSetting('pinData', { ...d, ...(await makeHash($l('#rn1').value)) }); toast('PIN changed.', 'ok'); clearInterval(tm); unlock();
    } catch (err) { er.textContent = 'Could not reset the PIN: ' + err.message; }
  };
  setTimeout(() => $l('#lp').focus(), 50); return SEC.p;
}

/* ---------- dialogs used by Settings ---------- */
function pinModal(title, note, fields, check) {
  return new Promise(res => {
    const m = modal(`<h2>${esc(title)}</h2>${note ? `<p class="note">${esc(note)}</p>` : ''}${fields.map(([id, lab]) => `<label for="pm-${id}">${esc(lab)}</label><input id="pm-${id}" type="${id === 'rec' ? 'text' : 'password'}" inputmode="${id === 'rec' ? 'text' : 'numeric'}" autocomplete="off" maxlength="${id === 'rec' ? 24 : 8}">`).join('')}<div class="err" id="pm-e"></div><div class="actions"><button class="btn" data-k="1" type="button">Continue</button><button class="btn ghost" data-k="0" type="button">Cancel</button></div>`);
    const go = async () => {
      const vals = {}; fields.forEach(([id]) => { vals[id] = m.querySelector('#pm-' + id).value; });
      let er = ''; try { er = await check(vals); } catch (err) { er = err.message; }
      if (er) { m.querySelector('#pm-e').textContent = er; return; } m.remove(); res(vals);
    };
    m.onclick = e => { const b = e.target.closest('[data-k]'); if (!b) return; if (b.dataset.k === '1') go(); else { m.remove(); res(null); } };
    m.onkeydown = e => { if (e.key === 'Enter') go(); };
    setTimeout(() => m.querySelector('input').focus(), 50);
  });
}
const verifyCur = async x => { if (gate() > 0) return waitMsg(); if (await checkHash(x.cur, await getPin())) { SEC.fails = 0; return ''; } failed(); return gate() > 0 ? waitMsg() : 'That PIN is not correct.'; };
function showRecovery(code) {
  return new Promise(res => {
    const m = modal(`<h2>Save your recovery code</h2><p>If you forget your PIN, this code lets you set a new one. Write it down and keep it somewhere safe, away from this device. It is shown only once.</p>
      <p class="reccode">${esc(code)}</p><div class="actions"><button class="btn ghost" data-k="copy" type="button">Copy</button></div>
      <label class="chk2"><input type="checkbox" id="rcs"> I have saved the recovery code</label><div class="actions"><button class="btn" data-k="done" type="button" id="rcd" disabled>Done</button></div>`);
    m.onchange = e => { if (e.target.id === 'rcs') m.querySelector('#rcd').disabled = !e.target.checked; };
    m.onclick = async e => { const b = e.target.closest('[data-k]'); if (!b) return; if (b.dataset.k === 'copy') { try { await navigator.clipboard.writeText(code); toast('Copied.', 'ok'); } catch (x) { toast('Could not copy. Write the code down instead.', 'err'); } } else { m.remove(); res(); } };
  });
}
function needSecure() { if (pinOk()) return false; toast('PIN lock needs a secure (HTTPS) page and a browser that supports it.', 'err'); return true; }
async function setPinFlow() {
  if (needSecure()) return false;
  const v = await pinModal('Create a PIN', 'Use 4 to 8 digits that are not easy to guess.', [['a', 'New PIN'], ['b', 'Confirm PIN']], async x => pinErr(x.a, x.b)); if (!v) return false;
  const rec = newRecovery();
  await DB.setSetting('pinData', { ...(await makeHash(v.a)), rec: await makeHash(normRec(rec)), createdAt: new Date().toISOString() });
  await refreshSecurity(); await showRecovery(rec); toast('PIN lock is on.', 'ok'); return true;
}
async function changePinFlow() {
  if (needSecure()) return false;
  const v = await pinModal('Change PIN', '', [['cur', 'Current PIN'], ['a', 'New PIN'], ['b', 'Confirm new PIN']], async x => (await verifyCur(x)) || pinErr(x.a, x.b)); if (!v) return false;
  await DB.setSetting('pinData', { ...(await getPin()), ...(await makeHash(v.a)) }); toast('PIN changed.', 'ok'); return true;
}
async function disablePinFlow() {
  if (needSecure()) return false;
  const v = await pinModal('Turn off PIN lock', 'Enter your PIN to confirm.', [['cur', 'Current PIN']], verifyCur); if (!v) return false;
  await run('settings', 'readwrite', tx => wrap(tx.objectStore('settings').delete('pinData'))); await refreshSecurity(); toast('PIN lock is off.', 'ok'); return true;
}
async function newRecoveryFlow() {
  if (needSecure()) return false;
  const v = await pinModal('New recovery code', 'Enter your PIN. The old recovery code will stop working.', [['cur', 'Current PIN']], verifyCur); if (!v) return false;
  const rec = newRecovery(); await DB.setSetting('pinData', { ...(await getPin()), rec: await makeHash(normRec(rec)) }); await showRecovery(rec); return true;
}

/* ---------- startup, idle lock ---------- */
function idleCheck() {
  if (!SEC.on || SEC.locked || !SEC.min) return;
  if (typeof ATT !== 'undefined' && ATT.running) { SEC.last = Date.now(); return; } // the camera is in use
  if (Date.now() - SEC.last > SEC.min * 60000) showLock();
}
async function startSecurity() {
  await refreshSecurity();
  ['pointerdown', 'keydown', 'touchstart', 'scroll', 'wheel'].forEach(ev => addEventListener(ev, () => { SEC.last = Date.now(); }, { passive: true, capture: true }));
  setInterval(idleCheck, 5000); document.addEventListener('visibilitychange', () => { if (!document.hidden) idleCheck(); });
  const b = document.getElementById('lock-side'); if (b) b.onclick = () => showLock();
  if (SEC.on) await showLock();
}
