import { isAuthed, unauthorized } from '../../../../src/admin-auth.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

// Three decisions, and they are the only three.
//
//   keep    the report was wrong. The content comes back if the automatic
//           paths had already taken it down — which is the point of having a
//           person look: "pain is welcome, harm is not" is a line a model gets
//           wrong in both directions, and three strangers can be wrong too.
//   hide    it stays up in the database and out of the sky.
//   delete  the same, plus the words are cleared. For the cases nobody should
//           be able to read again, including whoever has the admin password.
//
// The row is never removed. A queue that forgets what it decided cannot answer
// "why is my whisper gone" a week later.
const ACTIONS = new Set(['keep', 'hide', 'delete']);

export async function onRequestPost({ request, params, env }) {
  if (!(await isAuthed(request, env))) return unauthorized();

  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id)) return json({ error: 'invalid_id' }, 400);

  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const action = String(body.action || '');
  if (!ACTIONS.has(action)) return json({ error: 'invalid_action' }, 400);

  const report = await env.DB.prepare(`SELECT * FROM reports WHERE id = ?`).bind(id).first();
  if (!report) return json({ error: 'not_found' }, 404);

  const table = report.item_type === 'bubble' ? 'bubbles' : 'replies';
  const now = Date.now();

  if (action === 'keep') {
    // Only un-hide what moderation hid. A whisper its own author deleted stays
    // deleted — that decision was never ours to reverse.
    await env.DB.prepare(
      `UPDATE ${table} SET hidden = 0 WHERE id = ? AND deleted_at IS NULL`
    )
      .bind(report.item_id)
      .run();
  } else {
    await env.DB.prepare(`UPDATE ${table} SET hidden = 1 WHERE id = ?`)
      .bind(report.item_id)
      .run();
  }

  if (action === 'delete') {
    await env.DB.prepare(`UPDATE ${table} SET content = '' WHERE id = ?`)
      .bind(report.item_id)
      .run();
  }

  await env.DB.prepare(
    `UPDATE reports SET status = ?, note = ?, handled_at = ? WHERE id = ?`
  )
    .bind(
      action === 'keep' ? 'kept' : action === 'hide' ? 'hidden' : 'deleted',
      String(body.note || '').slice(0, 400) || null,
      now,
      id
    )
    .run();

  // Every open report about the same item is about the same decision. Leaving
  // them behind means reviewing one whisper five times.
  await env.DB.prepare(
    `UPDATE reports SET status = ?, handled_at = ?
      WHERE item_type = ? AND item_id = ? AND status = 'open' AND id != ?`
  )
    .bind(action === 'keep' ? 'kept' : action === 'hide' ? 'hidden' : 'deleted', now, report.item_type, report.item_id, id)
    .run();

  return json({ ok: true, action });
}
