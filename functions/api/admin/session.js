import { checkPassword, issueCookie, clearCookie, isAuthed, unauthorized } from '../../../src/admin-auth.js';

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}

// Is this browser still signed in?
export async function onRequestGet({ request, env }) {
  if (!env.ADMIN_PASSWORD) return json({ ok: false, configured: false });
  if (!(await isAuthed(request, env))) return unauthorized();
  return json({ ok: true, configured: true });
}

// Sign in. One password, no accounts — see src/admin-auth.js.
export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  if (!env.ADMIN_PASSWORD) return json({ error: 'not_configured' }, 503);
  if (!checkPassword(env, body?.password)) return json({ error: 'wrong_password' }, 401);

  return json({ ok: true }, 200, { 'set-cookie': await issueCookie(env.ADMIN_PASSWORD) });
}

// Sign out.
export async function onRequestDelete() {
  return json({ ok: true }, 200, { 'set-cookie': clearCookie() });
}
