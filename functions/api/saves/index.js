import { cleanSecret, hashSecret } from '../../../src/identity.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

// Saving needs the secret, not the hash.
//
// It writes something down about a person — a small something, but the shelf is
// theirs — so it goes through the same door as publishing and deleting rather
// than the one ordinary reads use.
async function owner(request) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    return { body: {}, hash: null };
  }
  const secret = cleanSecret(body.secret);
  return { body, hash: secret ? await hashSecret(secret) : null };
}

function target(body) {
  const itemType = body.itemType === 'reply' ? 'reply' : body.itemType === 'bubble' ? 'bubble' : null;
  const itemId = parseInt(body.itemId, 10);
  return itemType && Number.isFinite(itemId) ? { itemType, itemId } : null;
}

export async function onRequestPost({ request, env }) {
  const { body, hash } = await owner(request);
  if (!hash) return json({ error: 'no_secret' }, 400);
  const item = target(body);
  if (!item) return json({ error: 'invalid_target' }, 400);

  // Saving something that is already gone would put a permanently empty slot on
  // somebody's shelf. Hidden counts as gone.
  const table = item.itemType === 'bubble' ? 'bubbles' : 'replies';
  const row = await env.DB.prepare(`SELECT id FROM ${table} WHERE id = ? AND hidden = 0`)
    .bind(item.itemId)
    .first();
  if (!row) return json({ error: 'not_found' }, 404);

  await env.DB.prepare(
    `INSERT OR IGNORE INTO saves (author_hash, item_type, item_id, created_at)
     VALUES (?, ?, ?, ?)`
  )
    .bind(hash, item.itemType, item.itemId, Date.now())
    .run();

  return json({ ok: true, saved: true });
}

export async function onRequestDelete({ request, env }) {
  const { body, hash } = await owner(request);
  if (!hash) return json({ error: 'no_secret' }, 400);
  const item = target(body);
  if (!item) return json({ error: 'invalid_target' }, 400);

  await env.DB.prepare(
    `DELETE FROM saves WHERE author_hash = ? AND item_type = ? AND item_id = ?`
  )
    .bind(hash, item.itemType, item.itemId)
    .run();

  return json({ ok: true, saved: false });
}
