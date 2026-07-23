function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

// Owner retrieval: exact-match lookup by the passphrase the user chose at
// creation time. Content is already publicly browsable, so this endpoint
// isn't an access-control gate — it's a convenience shortcut back to "my"
// bubble and its replies.
export async function onRequestGet({ params, env }) {
  const code = (params.code || '').toString().trim().toLowerCase();
  if (!code) return json({ error: 'empty_code' }, 400);

  const bubble = await env.DB.prepare(
    `SELECT id, code, type, content, lang, warmth, hidden, crisis_flag, created_at
       FROM bubbles WHERE code = ?`
  )
    .bind(code)
    .first();

  if (!bubble) return json({ error: 'not_found' }, 404);

  const { results: replies } = await env.DB.prepare(
    `SELECT id, content, lang, created_at
       FROM replies
      WHERE bubble_id = ? AND hidden = 0
      ORDER BY created_at ASC`
  )
    .bind(bubble.id)
    .all();

  return json({ bubble, replies });
}
