// Admin session: one password, one signed cookie, no user table.
//
// The cookie is `<expiry>.<HMAC-SHA256(expiry)>` keyed on ADMIN_PASSWORD, so
// there is only one secret to manage and a stolen cookie dies on its own. The
// password itself is never stored anywhere — not in the cookie, not in D1.

const COOKIE = 'sky_admin';
const TTL_MS = 14 * 24 * 60 * 60 * 1000; // two weeks

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Length-independent comparison, so a wrong password can't be found by timing.
function timingSafeEqual(a, b) {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    diff |= (x[i] || 0) ^ (y[i] || 0);
  }
  return diff === 0;
}

export async function issueCookie(secret) {
  const exp = Date.now() + TTL_MS;
  const token = `${exp}.${await hmac(secret, String(exp))}`;
  return `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${Math.floor(TTL_MS / 1000)}`;
}

export function clearCookie() {
  return `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

export function checkPassword(env, password) {
  const expected = env.ADMIN_PASSWORD;
  if (!expected) return false; // not configured → nobody gets in
  return timingSafeEqual(String(password || ''), expected);
}

// True only for a cookie this server signed that hasn't expired yet.
export async function isAuthed(request, env) {
  const secret = env.ADMIN_PASSWORD;
  if (!secret) return false;
  const raw = request.headers.get('cookie') || '';
  const hit = raw.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${COOKIE}=`));
  if (!hit) return false;
  const [exp, sig] = hit.slice(COOKIE.length + 1).split('.');
  if (!exp || !sig || !(parseInt(exp, 10) > Date.now())) return false;
  return timingSafeEqual(sig, await hmac(secret, exp));
}

export function unauthorized() {
  return new Response(JSON.stringify({ error: 'unauthorized' }), {
    status: 401,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
