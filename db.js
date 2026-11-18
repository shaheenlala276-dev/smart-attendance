/* Smart Attendance - IndexedDB layer (schema v1).
   Upgrades only ever ADD stores/indexes. Existing records are never deleted. */
const DB_NAME = 'smart-attendance';
const DB_VERSION = 1;
const APP_VERSION = '0.2.0';

// name: [keyPath, [[indexName, keyPath, unique], ...]]
const SCHEMA = {
  institution: ['id', []],
  users: ['id', [['username', 'username', true], ['role', 'role', false]]],
  students: ['id', [['qrId', 'qrId', true], ['classId', 'classId', false], ['sectionId', 'sectionId', false], ['rollKey', 'rollKey', true], ['regNo', 'regNo', true]]],
  teachers: ['id', [['userId', 'userId', false]]],
  classes: ['id', [['name', 'name', true]]],
  sections: ['id', [['classId', 'classId', false]]],
  subjects: ['id', [['name', 'name', false]]],
  teacherAssignments: ['id', [['teacherId', 'teacherId', false], ['classId', 'classId', false], ['subjectId', 'subjectId', false]]],
  sessions: ['id', [['date', 'date', false], ['teacherId', 'teacherId', false], ['classId', 'classId', false]]],
  attendance: ['id', [['sessionId', 'sessionId', false], ['studentId', 'studentId', false], ['sessionStudent', ['sessionId', 'studentId'], true]]],
  settings: ['key', []],
  auditLogs: ['id', [['at', 'at', false], ['entity', 'entity', false]]]
};

let _db = null;

function uid() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
}

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('This browser does not support IndexedDB.'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result, tx = req.transaction;
      for (const [name, [keyPath, idx]] of Object.entries(SCHEMA)) {
        const store = db.objectStoreNames.contains(name) ? tx.objectStore(name) : db.createObjectStore(name, { keyPath });
        for (const [iname, ipath, unique] of idx) {
          if (!store.indexNames.contains(iname)) store.createIndex(iname, ipath, { unique });
        }
      }
    };
    req.onsuccess = () => {
      _db = req.result;
      _db.onversionchange = () => { _db.close(); _db = null; };
      resolve(_db);
    };
    req.onerror = () => reject(req.error || new Error('Could not open the database.'));
    req.onblocked = () => reject(new Error('Database is blocked by another open tab. Close other Smart Attendance tabs and reload.'));
  });
}

function run(storeNames, mode, fn) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted.'));
    Promise.resolve(fn(tx)).then(r => { result = r; }).catch(err => { try { tx.abort(); } catch (_) {} reject(err); });
  }));
}
const wrap = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

const DB = {
  get: (store, key) => run(store, 'readonly', tx => wrap(tx.objectStore(store).get(key))),
  getAll: (store) => run(store, 'readonly', tx => wrap(tx.objectStore(store).getAll())),
  count: (store) => run(store, 'readonly', tx => wrap(tx.objectStore(store).count())),
  put: (store, value) => run(store, 'readwrite', tx => wrap(tx.objectStore(store).put(value))),
  /* Save/delete several records across stores in ONE transaction: all or nothing.
     ops = [{store, value}, ...] */
  /* ops: {store, value} saves a record, {store, del: key} deletes one. */
  putMany: (ops) => run([...new Set(ops.map(o => o.store))], 'readwrite', tx => Promise.all(ops.map(o => wrap(o.del !== undefined ? tx.objectStore(o.store).delete(o.del) : tx.objectStore(o.store).put(o.value))))),
  countByIndex: (store, index, key) => run(store, 'readonly', tx => wrap(tx.objectStore(store).index(index).count(key))),
  async audit(action, entity, entityId, details) {
    return DB.put('auditLogs', { id: uid(), at: new Date().toISOString(), action, entity, entityId, details: details || null, by: 'admin' });
  },
  async getSetting(key, fallback) {
    const r = await DB.get('settings', key);
    return r ? r.value : fallback;
  },
  setSetting: (key, value) => DB.put('settings', { key, value }),
  async counts() {
    const out = {};
    for (const s of Object.keys(SCHEMA)) out[s] = await DB.count(s);
    return out;
  }
};
