// Network-first service worker.
//
// The previous version was cache-first, which meant a phone could keep
// running old cached JS for a long time even after a new deploy — that's
// why fixes appeared "not to work". Network-first always tries the live
// version first and only falls back to cache when offline, so updates reach
// users immediately while the app still works without a connection.

const CACHE_NAME = 'bulesky-runtime-v5';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never cache the API — the shared sky must always be live.
  if (request.method !== 'GET' || url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res && res.ok && url.origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(request).then((cached) => cached || caches.match('/index.html'))
      )
  );
});
