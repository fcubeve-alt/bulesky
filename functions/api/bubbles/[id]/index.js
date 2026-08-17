import { cleanHash, cleanSecret, hashSecret, ownsRow } from '../../../../src/identity.js';
import { voiceHash } from '../../../../src/tts.js';
import { deleteVoice } from '../../../../src/voice-store.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

// Click-to-read: fetch a single bubble plus its visible replies, used when
// a user taps any bubble/shooting star in the shared sky.
//
// `mine` answers "may I delete this?" without the client having to reveal
// anything that could delete it. The reader sends the HASH of their secret in a
// header; the server compares and answers yes or no. The secret itself only
// ever travels on the two requests that change something — publishing and
// deleting — so an ordinary read cannot leak the thing that grants control.
export async function onRequestGet({ request, params, env }) {
  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id)) return json({ error: 'invalid_id' }, 400);

  const bubble = await env.DB.prepare(
    `SELECT id, type, content, code, lang, warmth, lights, hidden, created_at, author_hash
       FROM bubbles WHERE id = ? AND hidden = 0`
  )
    .bind(id)
    .first();

  if (!bubble) return json({ error: 'not_found' }, 404);

  const { results: replies } = await env.DB.prepare(
    `SELECT id, content, code, lang, created_at, author_hash
       FROM replies
      WHERE bubble_id = ? AND hidden = 0
      ORDER BY created_at ASC`
  )
    .bind(id)
    .all();

  const hash = cleanHash(request.headers.get('x-author'));
  const mine = ownsRow(bubble, hash);

  // Whether it is already on this reader's shelf, so the button can say "kept"
  // instead of offering to keep it twice.
  let saved = false;
  if (hash) {
    const row = await env.DB.prepare(
      `SELECT 1 AS yes FROM saves WHERE author_hash = ? AND item_type = 'bubble' AND item_id = ?`
    )
      .bind(hash, id)
      .first();
    saved = Boolean(row);
  }

  // Never hand an author_hash back out. It is not a secret, but it is a
  // fingerprint: with it, anyone could tell which whispers in the sky were
  // written by the same person, and this place is built on nobody being able
  // to do that.
  const { author_hash, ...safeBubble } = bubble;
  const safeReplies = (replies || []).map(({ author_hash: replyAuthor, ...r }) => ({
    ...r,
    mine: ownsRow({ author_hash: replyAuthor }, hash),
  }));

  return json({ bubble: { ...safeBubble, mine, saved }, replies: safeReplies });
}

// Take it back.
//
// The author's own copy is the only one that has ever mattered here: nothing is
// published elsewhere, so deleting really does mean gone. What it must reach:
//
//   the sky and the reading view   — `hidden = 1`, which every read already filters
//   the reading aloud              — the cached audio is deleted, not orphaned
//   anyone's saved copy            — nothing to do yet; saving stores a reference
//
// `deleted_at` is what separates this from a whisper hidden after reports. The
// row stays, because a moderation queue that cannot see what was removed cannot
// answer a complaint about it, and because the replies other people wrote
// underneath are their words, not the author's, and are not theirs to erase.
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
    `SELECT id, type, content, author_hash, hidden FROM bubbles WHERE id = ?`
  )
    .bind(id)
    .first();
  if (!row) return json({ error: 'not_found' }, 404);

  const hash = await hashSecret(secret);
  // Same answer for "someone else's" and "written before author identity
  // existed". Telling them apart would let a stranger probe the sky for
  // whispers that are unprotected.
  if (!ownsRow(row, hash)) return json({ error: 'not_yours' }, 403);

  const now = Date.now();
  await env.DB.prepare(`UPDATE bubbles SET hidden = 1, deleted_at = ? WHERE id = ?`)
    .bind(now, id)
    .run();

  // The audio is a copy of the words, so it goes too. Best effort: a whisper
  // that is already hidden everywhere must not stay up because a cache row
  // would not delete.
  try {
    const voice = await voiceHash(String(row.content || ''), row.type, env);
    await deleteVoice(env, voice);
  } catch {
    /* the reading is unreachable anyway — the whisper is hidden */
  }

  return json({ ok: true, deleted: id });
}
