/* Trainingslogboek service worker — offline-first app-shell (stale-while-revalidate) */
const CACHE = 'hevylog-v5';
const ASSETS = [
  './',
  'index.html',
  'styles.css?v=4',
  'app.js?v=4',
  'manifest.webmanifest',
  'vendor/papaparse.min.js',
  'vendor/chart.umd.min.js',
  'icons/favicon.svg',
  'icons/favicon-32.png',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-192.png',
  'icons/icon-maskable-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // allSettled: één ontbrekend asset mag de installatie niet breken
    await Promise.allSettled(ASSETS.map(a => c.add(a)));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    let cached = await cache.match(req);
    if (!cached && req.mode === 'navigate') cached = await cache.match('index.html');

    const fromNet = fetch(req).then(res => {
      // cache geslaagde én opaque (Google Fonts) responses voor offline gebruik
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()).catch(() => {});
      return res;
    }).catch(() => null);

    if (cached) { e.waitUntil(fromNet); return cached; }          // direct serveren, op achtergrond verversen
    const net = await fromNet;
    if (net) return net;
    if (req.mode === 'navigate') { const idx = await cache.match('index.html'); if (idx) return idx; }
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  })());
});
