/* Trainingslogboek service worker — offline-first app-shell (stale-while-revalidate) */
const CACHE = 'hevylog-v10';
const ASSETS = [
  './',
  'index.html',
  'styles.css?v=10',
  'app.js?v=10',
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

  // Paginanavigatie: NETWERK EERST → altijd verse HTML wanneer online, val offline terug op cache.
  // (Voorkomt dat een gedeployde update onzichtbaar blijft door een oude gecachte pagina.)
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put('index.html', copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req).then(r => r || caches.match('index.html')))
    );
    return;
  }

  // Overige GET (css/js/vendor/icons/fonts): stale-while-revalidate.
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    const fromNet = fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()).catch(() => {});
      return res;
    }).catch(() => null);
    if (cached) { e.waitUntil(fromNet); return cached; }
    const net = await fromNet;
    if (net) return net;
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  })());
});
