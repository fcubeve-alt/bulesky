import { isAuthed, unauthorized } from '../../../src/admin-auth.js';

// Generous for a downscaled photo, small enough that a stray full-resolution
// upload is refused rather than parked in the database forever.
const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

// Upload one image for use in a post. The editor sends a data URL because it
// has already re-encoded the file in a canvas to cap its size — whatever the
// photo was on disk, what arrives here is web-sized.
export async function onRequestPost({ request, env }) {
  if (!(await isAuthed(request, env))) return unauthorized();

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const dataUrl = String(body?.dataUrl || '');
  const m = dataUrl.match(/^data:([a-z]+\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!m) return json({ error: 'invalid_image' }, 400);

  const mime = m[1].toLowerCase();
  if (!ALLOWED.has(mime)) return json({ error: 'unsupported_type' }, 415);

  const binary = atob(m[2]);
  if (binary.length > MAX_BYTES) return json({ error: 'too_large' }, 413);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const now = Date.now();
  const res = await env.DB.prepare(
    `INSERT INTO images (mime, data, bytes, created_at) VALUES (?, ?, ?, ?)`
  )
    .bind(mime, bytes, bytes.length, now)
    .run();

  const id = res.meta?.last_row_id;
  return json({ ok: true, id, url: `/media/${id}`, bytes: bytes.length }, 201);
}
