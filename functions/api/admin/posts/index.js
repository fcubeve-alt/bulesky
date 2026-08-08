import { isAuthed, unauthorized } from '../../../../src/admin-auth.js';

const MAX_TITLE = 200;
const MAX_DESCRIPTION = 400;
const MAX_BODY = 60000;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

// "How to get through the night" → "how-to-get-through-the-night". Falls back
// to a timestamp so a title in a script we don't transliterate still gets a
// usable URL.
export function slugify(input) {
  const s = String(input || '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return s || `post-${Date.now()}`;
}

export function validate(body) {
  const title = String(body?.title || '').trim();
  const text = String(body?.body || '').trim();
  if (!title) return { error: 'empty_title' };
  if (title.length > MAX_TITLE) return { error: 'title_too_long' };
  if (!text) return { error: 'empty_body' };
  if (text.length > MAX_BODY) return { error: 'body_too_long' };
  const description = String(body?.description || '').trim().slice(0, MAX_DESCRIPTION);
  return { title, text, description, slug: slugify(body?.slug || title), published: body?.published ? 1 : 0 };
}

// Every post, drafts included — this is the admin's own list.
export async function onRequestGet({ request, env }) {
  if (!(await isAuthed(request, env))) return unauthorized();
  const { results } = await env.DB.prepare(
    `SELECT id, slug, title, description, published, created_at, updated_at
       FROM posts ORDER BY created_at DESC`
  ).all();
  return json({ posts: results || [] });
}

export async function onRequestPost({ request, env }) {
  if (!(await isAuthed(request, env))) return unauthorized();

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const v = validate(body);
  if (v.error) return json({ error: v.error }, 400);

  const clash = await env.DB.prepare(`SELECT id FROM posts WHERE slug = ?`).bind(v.slug).first();
  if (clash) return json({ error: 'slug_taken' }, 409);

  const now = Date.now();
  const res = await env.DB.prepare(
    `INSERT INTO posts (slug, title, description, body, published, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(v.slug, v.title, v.description, v.text, v.published, now, now)
    .run();

  return json({ ok: true, id: res.meta?.last_row_id, slug: v.slug }, 201);
}
