// Network-first service worker — and the way out of a stale install.
//
// ---- why this file is the escape hatch -------------------------------------
//
// An installed home-screen app on iOS pinned one copy of the site for four
// days. Three correct fixes were deployed, went green, and were never seen. The
// page carried a build stamp and app.js knew how to throw a stale install away
// when the stamp did not match the server's — but that code is IN the page, and
// the page is what would not update. Worse, the pinned copy predated the stamp
// entirely, and the check began:
//
//     if (!mine) return;   // no stamp on this page
//
// so on precisely the phones that needed it, the self-heal did nothing at all.
// A page cannot be trusted to rescue itself.
//
// This file can. A service worker script is the one thing a browser refetches
// out of band: it is checked on navigation and at least daily, and it is
// fetched bypassing the HTTP cache. So whatever else is pinned, a NEW sw.js
// arrives. That makes this the only reliable channel to a phone that has
// stopped listening, and the activate handler below uses it: everything cached
// is deleted, and any window still showing the old copy is navigated to a fresh
// one.
//
// ⚠️ The reload is deliberately conditional. It happens only when this
// activation actually deleted a cache from an older version — a phone that is
// already current has nothing to delete and is left alone. Do not make it
// unconditional to be safe: that is a reload for every visitor on every deploy,
// including whoever is halfway through writing a whisper.

const CACHE_NAME = 'bulesky-runtime-v51';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      const stale = keys.filter((k) => k !== CACHE_NAME);
      await Promise.all(stale.map((k) => caches.delete(k).catch(() => {})));
      await self.clients.claim();

      // Nothing was stale, so nothing is showing an old copy.
      if (!stale.length) return;

      // Something was. Whatever those windows are rendering, it is from before
      // this deploy — and it may be from long before it. Put them on the
      // current one. The query string is what stops the very cache we just
      // cleared from being re-created by a navigation the browser considers a
      // repeat of one it already has.
      const clients = await self.clients.matchAll({ type: 'window' });
      await Promise.all(
        clients.map((client) => {
          try {
            const url = new URL(client.url);
            url.searchParams.set('fresh', String(Date.now()));
            return client.navigate ? client.navigate(url.toString()).catch(() => {}) : null;
          } catch {
            return null;
          }
        })
      );
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never cache the API — the shared sky must always be live.
  if (request.method !== 'GET' || url.pathname.startsWith('/api/')) return;

  // Stay out of the way of video and music entirely. Two reasons, both real:
  // the Cache API cannot store the 206 Partial Content responses a <video>
  // asks for, so the put below just fails; and the revalidation added further
  // down would force every byte range of an 88MB video library back to the
  // network. The browser's own HTTP cache handles media properly — this is one
  // place where doing nothing is faster than helping.
  if (url.pathname.startsWith('/video/') || url.pathname.startsWith('/music/')) return;

  // The page itself is never served from a cache while there is a network.
  //
  // 'reload' bypasses the HTTP cache outright rather than revalidating it, and
  // that difference is the whole of the four days: 'no-cache' asks the browser
  // to check with the server, and an installed iOS web app can decline to.
  // Everything else — CSS, JS, icons — revalidates, which 304s keep cheap.
  const navigating = request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html');
  const req =
    url.origin === self.location.origin
      ? new Request(request, { cache: navigating ? 'reload' : 'no-cache' })
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
      // Offline. A cached copy of the page is much better than nothing — this
      // is the only path on which one is served.
      .catch(() => caches.match(request).then((cached) => cached || caches.match('/index.html')))
  );
});
