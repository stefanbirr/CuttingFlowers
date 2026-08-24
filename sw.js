/* Offline shell.

   One cache generation per deploy, written whole by install() and never
   touched again. That matters more than it sounds: the game ships as a
   graph of ES modules that only works if every file comes from the same
   build. An earlier stale-while-revalidate scheme refreshed files one at a
   time, so a load could mix a new module with an old one and die on a call
   that did not exist yet. Serving strictly from the current generation
   makes that impossible — updates arrive by bumping VERSION, all at once. */

const VERSION = 'bloom-blade-v28';
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
  'js/coach.js',
  'js/replay.js',
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
      // 'reload' skips the HTTP cache, so a generation is the deploy that
      // is live right now and not whatever the browser held on to.
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
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

  // Navigations: fresh when we can reach the network, shell when we can't.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(() => caches.open(VERSION)
        .then((c) => c.match('index.html', { ignoreSearch: true }).then((r) => r || c.match('.')))),
    );
    return;
  }

  e.respondWith(
    caches.open(VERSION)
      .then((c) => c.match(req, { ignoreSearch: true }))
      .then((hit) => hit || fetch(req)),
  );
});
