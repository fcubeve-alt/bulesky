function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

// Click-to-read: fetch a single bubble plus its visible replies, used when
// a user taps any bubble/shooting star in the shared sky.
export async function onRequestGet({ params, env }) {
  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id)) return json({ error: 'invalid_id' }, 400);

  const bubble = await env.DB.prepare(
    `SELECT id, type, content, code, lang, warmth, hidden, created_at
       FROM bubbles WHERE id = ? AND hidden = 0`
  )
    .bind(id)
    .first();

  if (!bubble) return json({ error: 'not_found' }, 404);

  const { results: replies } = await env.DB.prepare(
    `SELECT id, content, code, lang, created_at
       FROM replies
      WHERE bubble_id = ? AND hidden = 0
      ORDER BY created_at ASC`
  )
    .bind(id)
    .all();

  return json({ bubble, replies });
}
