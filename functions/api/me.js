import { cleanHash } from '../../src/identity.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // Never let a shared cache hold one person's shelf.
      'cache-control': 'no-store',
    },
  });
}

const LIMIT = 100;

// My Sky: what I wrote, and what I kept.
//
// This is the private replacement for looking yourself up by name. A name is
// printed under every whisper (masked to two characters) and typed into a box
// anyone can use; the hash sent here belongs to one device and is not written
// down anywhere a reader can see. Nothing about a person needs to be public for
// them to find their own words any more.
//
// The hash alone is enough because reading is all this does. Deleting and
// saving still require the secret.
export async function onRequestGet({ request, env }) {
  const hash = cleanHash(request.headers.get('x-author'));
  // Not an error — a device that has never written anything simply has an empty
  // sky, and the panel says so rather than showing a failure.
  if (!hash) return json({ mine: [], saved: [] });

  const { results: mine } = await env.DB.prepare(
    `SELECT id, type, content, warmth, lights, created_at
       FROM bubbles
      WHERE author_hash = ? AND hidden = 0
      ORDER BY created_at DESC
      LIMIT ?`
  )
    .bind(hash, LIMIT)
    .all();

  // The join is what makes a save a reference rather than a copy: the words
  // come from the whisper itself, every time. An author's deletion sets
  // `hidden`, so the row simply stops matching and the shelf slot disappears —
  // no cleanup job, nothing to forget to run.
  const { results: savedBubbles } = await env.DB.prepare(
    `SELECT b.id, b.type, b.content, b.code, b.warmth, b.lights, b.created_at, s.created_at AS saved_at
       FROM saves s JOIN bubbles b ON b.id = s.item_id
      WHERE s.author_hash = ? AND s.item_type = 'bubble' AND b.hidden = 0
      ORDER BY s.created_at DESC
      LIMIT ?`
  )
    .bind(hash, LIMIT)
    .all();

  const { results: savedReplies } = await env.DB.prepare(
    `SELECT r.id, r.content, r.code, r.bubble_id, r.created_at, s.created_at AS saved_at
       FROM saves s JOIN replies r ON r.id = s.item_id
      WHERE s.author_hash = ? AND s.item_type = 'reply' AND r.hidden = 0
      ORDER BY s.created_at DESC
      LIMIT ?`
  )
    .bind(hash, LIMIT)
    .all();

  // How many saves point at something that is no longer there. Not an error to
  // fix — it is the design working — but a shelf that silently shrinks is
  // unsettling, so the interface can say "one of the stories you kept has left
  // the sky" instead of just losing it.
  const gone = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM saves s
      WHERE s.author_hash = ?
        AND ((s.item_type = 'bubble'
              AND NOT EXISTS (SELECT 1 FROM bubbles b WHERE b.id = s.item_id AND b.hidden = 0))
          OR (s.item_type = 'reply'
              AND NOT EXISTS (SELECT 1 FROM replies r WHERE r.id = s.item_id AND r.hidden = 0)))`
  )
    .bind(hash)
    .first();

  return json({
    mine: mine || [],
    saved: [
      ...(savedBubbles || []).map((b) => ({ ...b, itemType: 'bubble' })),
      ...(savedReplies || []).map((r) => ({ ...r, itemType: 'reply', type: 'reply' })),
    ].sort((a, b) => b.saved_at - a.saved_at),
    gone: (gone && gone.n) || 0,
  });
}
