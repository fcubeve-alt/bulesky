import { cleanSecret, hashSecret, ownsRow } from '../../../src/identity.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

// A reply is somebody's words too, and its writer may take it back.
//
// The whisper's author cannot delete replies left underneath it — those belong
// to the people who wrote them. Only reports and the site owner can remove
// somebody else's words, which is what the moderation path is for.
export async function onRequestDelete({ request, params, env }) {
  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id)) return json({ error: 'invalid_id' }, 400);

  let body = {};
  try {
    body = await request.json();
  } catch {
    /* an empty body simply fails the ownership check below */
  }

  const secret = cleanSecret(body && body.secret);
  if (!secret) return json({ error: 'no_secret' }, 400);

  const row = await env.DB.prepare(
    `SELECT id, bubble_id, author_hash, hidden FROM replies WHERE id = ?`
  )
    .bind(id)
    .first();
  if (!row) return json({ error: 'not_found' }, 404);

  const hash = await hashSecret(secret);
  if (!ownsRow(row, hash)) return json({ error: 'not_yours' }, 403);

  const now = Date.now();
  await env.DB.prepare(`UPDATE replies SET hidden = 1, deleted_at = ? WHERE id = ?`)
    .bind(now, id)
    .run();

  // Warmth counts the replies a whisper is carrying, and it drives the colour
  // and the tail length in the sky. Leaving it counting a reply that is gone
  // would make a whisper look warmer than it is.
  if (!row.hidden) {
    await env.DB.prepare(
      `UPDATE bubbles SET warmth = CASE WHEN warmth > 0 THEN warmth - 1 ELSE 0 END WHERE id = ?`
    )
      .bind(row.bubble_id)
      .run();
  }

  return json({ ok: true, deleted: id });
}
