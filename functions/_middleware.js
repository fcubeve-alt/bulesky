// Letting the App talk to the site.
//
// Inside the App the pages are files on the phone — `capacitor://localhost` on
// iOS, `http://localhost` on Android — so every call to cubewithin.com is
// cross-origin, and without these headers the browser refuses them before the
// worker ever sees the request. Nothing about the App works until this does.
//
// An allowlist rather than `*`, and the reason is the admin API. `*` cannot be
// combined with credentials, but a future mistake could, and "the moderation
// queue is readable from any web page that asks" is not a mistake worth leaving
// room for. Two app origins and the site itself; anything else gets no CORS
// headers at all, which is what a browser needs to hear to refuse the call.
const ALLOWED = new Set([
  'capacitor://localhost',
  'http://localhost',
  'https://localhost',
  'https://cubewithin.com',
  'https://www.cubewithin.com',
]);

// The admin API is cookie-authenticated and is used from one page on the site
// itself. It has no business answering another origin, App included: moderation
// happens on a desktop browser, and keeping it same-origin means a stolen
// session cookie cannot be spent from anywhere else.
function isAdmin(url) {
  return new URL(url).pathname.startsWith('/api/admin/');
}

function allow(origin) {
  return origin && ALLOWED.has(origin) ? origin : null;
}

export async function onRequest(context) {
  const { request, next } = context;
  const origin = request.headers.get('origin');
  const permitted = isAdmin(request.url) ? null : allow(origin);

  // The preflight. Browsers send it before anything that is not a simple GET —
  // which here means every publish, every delete, and every read that carries
  // the x-author header. Answering it is not optional and it never reaches the
  // endpoint itself, so it is answered here.
  if (request.method === 'OPTIONS') {
    if (!permitted) return new Response(null, { status: 204 });
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': permitted,
        'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
        'access-control-allow-headers': 'content-type, x-author',
        'access-control-max-age': '86400',
        vary: 'origin',
      },
    });
  }

  const response = await next();
  if (!permitted) return response;

  // Headers on a Response are immutable until it is copied.
  const headers = new Headers(response.headers);
  headers.set('access-control-allow-origin', permitted);
  // Without this, a cache that saw one origin's answer would serve it to
  // another and the browser would refuse a response that was actually fine.
  headers.append('vary', 'origin');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
