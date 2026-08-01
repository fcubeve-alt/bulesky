// Network-first service worker.
//
// The previous version was cache-first, which meant a phone could keep
// running old cached JS for a long time even after a new deploy — that's
// why fixes appeared "not to work". Network-first always tries the live
// version first and only falls back to cache when offline, so updates reach
// users immediately while the app still works without a connection.

const CACHE_NAME = 'bulesky-runtime-v17';

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

  // Revalidate same-origin assets with the server ('no-cache') instead of
  // trusting the browser's HTTP cache. Otherwise a long-lived cached JS module
  // (or one of its imports) can keep running old code after a new deploy even
  // though we're "network-first" — which is exactly how a shipped fix can look
  // like it didn't take. 304s keep this cheap.
  const req = url.origin === self.location.origin
    ? new Request(request, { cache: 'no-cache' })
    : request;

  event.respondWith(
    fetch(req)
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
