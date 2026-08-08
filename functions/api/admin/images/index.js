import { isAuthed, unauthorized } from '../../../../src/admin-auth.js';

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

// Every uploaded image, with the posts that reference it. The bytes are never
// sent here — only what is needed to decide whether one can go.
export async function onRequestGet({ request, env }) {
  if (!(await isAuthed(request, env))) return unauthorized();

  const { results } = await env.DB.prepare(
    `SELECT id, mime, bytes, created_at FROM images ORDER BY created_at DESC`
  ).all();

  const images = [];
  for (const img of results || []) {
    // Which posts embed it? Deleting one that is live would leave a broken
    // picture in a published article, so the admin gets told before it does.
    const { results: used } = await env.DB.prepare(
      `SELECT title, slug, published FROM posts WHERE body LIKE ?`
    )
      .bind(`%](/media/${img.id})%`)
      .all();
    images.push({ ...img, url: `/media/${img.id}`, usedIn: used || [] });
  }

  return json({ images });
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
