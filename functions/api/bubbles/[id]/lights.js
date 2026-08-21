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

  // One statement, not two. The SELECT that used to run first was asking the
  // same question the UPDATE already answers — RETURNING gives back nothing at
  // all when the row is missing or hidden — so it was a second round trip to
  // the database on the most-tapped write in the product, for nothing.
  const row = await env.DB.prepare(
    `UPDATE bubbles SET lights = lights + 1 WHERE id = ? AND hidden = 0 RETURNING lights`
  )
    .bind(id)
    .first();
  if (!row) return json({ error: 'not_found' }, 404);

  return json({ id, lights: row.lights }, 201);
}
