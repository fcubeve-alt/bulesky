function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

// Leave a light on a whisper ("传递微光"). Deliberately tiny: no auth, no body.
// Abuse resistance lives on the client (one-per-device via localStorage) — the
// worst a determined caller can do is nudge a glow that shows no number and
// never ranks anything, so server-side we keep it a single cheap increment.
export async function onRequestPost({ params, env }) {
  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id)) return json({ error: 'invalid_id' }, 400);

  const bubble = await env.DB.prepare(`SELECT id FROM bubbles WHERE id = ? AND hidden = 0`)
    .bind(id)
    .first();
  if (!bubble) return json({ error: 'not_found' }, 404);

  const row = await env.DB.prepare(
    `UPDATE bubbles SET lights = lights + 1 WHERE id = ? RETURNING lights`
  )
    .bind(id)
    .first();

  return json({ id, lights: row ? row.lights : null }, 201);
}
