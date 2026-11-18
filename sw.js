// Offline cache. Bump VERSION when files change so phones pick up the update.
const VERSION = 'build-calc-v1';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/store.js', 'js/voice.js',
  'js/engine/expr.js', 'js/engine/format.js', 'js/engine/dim.js', 'js/engine/units.js',
  'js/engine/construction.js', 'js/engine/solve.js', 'js/engine/words.js',
  'js/export/zip.js', 'js/export/documents.js',
  'js/ui/common.js', 'js/ui/input.js', 'js/ui/pretty.js', 'js/ui/basic.js', 'js/ui/construction.js',
  'js/ui/scientific.js', 'js/ui/sketch.js', 'js/ui/jobs.js', 'js/ui/settings.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Same-origin only: cache-first, fall back to network and keep a copy (e.g. vendor/vosk.js on first voice use).
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match('index.html'))),
  );
});
