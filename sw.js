/* Offline shell. Cache-first for the game's own files, with a network
   fallback and a stale-while-revalidate refresh so updates land quietly. */

const VERSION = 'bloom-blade-v7';
const SHELL = [
  '.',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/main.js',
  'js/game.js',
  'js/config.js',
  'js/species.js',
  'js/flower.js',
  'js/draw.js',
  'js/gesture.js',
  'js/scoring.js',
  'js/bouquet.js',
  'js/scene.js',
  'js/particles.js',
  'js/audio.js',
  'js/storage.js',
  'js/i18n.js',
  'js/ui.js',
  'js/util.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-192.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: serve the shell so deep links work offline.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(() => caches.match('index.html', { ignoreSearch: true })
        .then((r) => r || caches.match('.'))),
    );
    return;
  }

  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      const live = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || live;
    }),
  );
});
