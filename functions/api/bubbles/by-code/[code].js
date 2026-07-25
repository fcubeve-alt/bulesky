function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

// Owner retrieval by NAME: a name is a personal handle, so this lists every
// whisper posted under it (newest first). Content is already publicly
// browsable — this is a convenience shortcut back to "my" whispers, not an
// access-control gate. Kept in sync with GET /api/bubbles?code=.
export async function onRequestGet({ params, env }) {
  const code = (params.code || '').toString().trim().toLowerCase();
  if (!code) return json({ error: 'empty_code' }, 400);

  const { results } = await env.DB.prepare(
    `SELECT id, type, content, lang, warmth, crisis_flag, created_at
       FROM bubbles WHERE code = ? AND hidden = 0 ORDER BY created_at DESC`
  )
    .bind(code)
    .all();

  if (!results || results.length === 0) return json({ error: 'not_found', bubbles: [] }, 404);

  return json({ bubbles: results });
}
