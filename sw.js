/* Smart Attendance service worker.
   To release an update: change CACHE_VERSION. Old caches are removed; IndexedDB is never touched. */
const CACHE_VERSION = 'v1';
const CACHE = 'smart-attendance-' + CACHE_VERSION;
const ASSETS = ['./', 'index.html', 'style.css', 'db.js', 'app.js', 'manifest.json', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('smart-attendance-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(caches.match(r, { ignoreSearch: true }).then(hit => hit || fetch(r).catch(() => r.mode === 'navigate' ? caches.match('index.html') : Response.error())));
});

