import { overLimit } from '../../../../src/rate-limit.js';

// Twenty lookups in ten minutes is far more than finding your own whispers
// ever needs, and far less than sweeping a dictionary of likely names.
const MAX_LOOKUPS = 20;

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
export async function onRequestGet({ request, params, env }) {
  const code = (params.code || '').toString().trim().toLowerCase();
  if (!code) return json({ error: 'empty_code' }, 400);

  // A name is masked to its first two characters everywhere it is shown, so it
  // cannot be read off the sky — but two characters and unlimited guesses is
  // not a lock. This does not make the list private; it makes sweeping for
  // other people's names cost something.
  if (await overLimit(env, 'bycode', request, MAX_LOOKUPS)) {
    return json({ error: 'too_many_lookups' }, 429);
  }

  const { results } = await env.DB.prepare(
    `SELECT id, type, content, lang, warmth, crisis_flag, hidden, created_at
       FROM bubbles WHERE code = ? ORDER BY created_at DESC`
  )
    .bind(code)
    .all();

  if (!results || results.length === 0) return json({ error: 'not_found', bubbles: [] }, 404);

  // Same rule as GET /api/bubbles?code=: hidden whispers stay unreadable even
  // for their author, but are listed as `removed` rather than disappearing.
  return json({
    bubbles: results.map((b) =>
      b.hidden ? { id: b.id, type: b.type, created_at: b.created_at, removed: 1 } : b
    ),
  });
}
