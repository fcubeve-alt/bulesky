const HIDE_THRESHOLD = 3;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

// Community self-cleaning: N reports auto-hide content, no manual review
// queue. Anyone can report, no auth — this is the accepted trade-off for a
// fully anonymous product.
export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const { targetType, targetId } = body || {};
  const id = parseInt(targetId, 10);
  if ((targetType !== 'bubble' && targetType !== 'reply') || !Number.isFinite(id)) {
    return json({ error: 'invalid_target' }, 400);
  }

  const table = targetType === 'bubble' ? 'bubbles' : 'replies';

  const row = await env.DB.prepare(`SELECT id FROM ${table} WHERE id = ?`).bind(id).first();
  if (!row) return json({ error: 'not_found' }, 404);

  await env.DB.prepare(`UPDATE ${table} SET report_count = report_count + 1 WHERE id = ?`)
    .bind(id)
    .run();

  const updated = await env.DB.prepare(`SELECT report_count FROM ${table} WHERE id = ?`)
    .bind(id)
    .first();

  if (updated.report_count >= HIDE_THRESHOLD) {
    await env.DB.prepare(`UPDATE ${table} SET hidden = 1 WHERE id = ?`).bind(id).run();
  }

  return json({ ok: true, hidden: updated.report_count >= HIDE_THRESHOLD });
}
