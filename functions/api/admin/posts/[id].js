import { isAuthed, unauthorized } from '../../../../src/admin-auth.js';
import { validate } from './index.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

// One post, body included — what the editor loads.
export async function onRequestGet({ request, params, env }) {
  if (!(await isAuthed(request, env))) return unauthorized();
  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id)) return json({ error: 'invalid_id' }, 400);

  const post = await env.DB.prepare(
    `SELECT id, slug, title, description, body, published, created_at, updated_at
       FROM posts WHERE id = ?`
  )
    .bind(id)
    .first();

  if (!post) return json({ error: 'not_found' }, 404);
  return json({ post });
}

export async function onRequestPut({ request, params, env }) {
  if (!(await isAuthed(request, env))) return unauthorized();
  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id)) return json({ error: 'invalid_id' }, 400);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const v = validate(body);
  if (v.error) return json({ error: v.error }, 400);

  const existing = await env.DB.prepare(`SELECT id FROM posts WHERE id = ?`).bind(id).first();
  if (!existing) return json({ error: 'not_found' }, 404);

  const clash = await env.DB.prepare(`SELECT id FROM posts WHERE slug = ? AND id != ?`)
    .bind(v.slug, id)
    .first();
  if (clash) return json({ error: 'slug_taken' }, 409);

  await env.DB.prepare(
    `UPDATE posts SET slug = ?, title = ?, description = ?, body = ?, published = ?, updated_at = ?
      WHERE id = ?`
  )
    .bind(v.slug, v.title, v.description, v.text, v.published, Date.now(), id)
    .run();

  return json({ ok: true, slug: v.slug });
}

export async function onRequestDelete({ request, params, env }) {
  if (!(await isAuthed(request, env))) return unauthorized();
  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id)) return json({ error: 'invalid_id' }, 400);

  await env.DB.prepare(`DELETE FROM posts WHERE id = ?`).bind(id).run();
  return json({ ok: true });
}
