import { containsAbusive, containsCrisisKeyword, maskContactInfo } from '../../../../src/filters.js';
import { cleanSecret, hashSecret } from '../../../../src/identity.js';
import { blocksPublishing, recordAiConcern, screen } from '../../../../src/moderation.js';

// 150, down from 300. A reply here is meant to be "I read this" — the safety
// rules ask for 100-150 deliberately, because length is what a long put-down
// needs and what a short kindness does not. It costs the rare thoughtful long
// reply; that trade is the point.
const MAX_CONTENT_LEN = 150;
const MAX_CODE_LEN = 30;

// How many times one device may reply to the SAME whisper. Following someone
// down a thread is its own kind of harm even when no single message crosses a
// line, and the person being followed is the one who just wrote down the worst
// thing in their week. Three is enough for a real exchange.
const MAX_REPLIES_PER_WHISPER = 3;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

// A reply is either a "warm reply" (on a pain bubble) or a "blessing"
// (on a wish bubble) — same storage, the framing is purely presentational.
export async function onRequestPost({ request, params, env }) {
  const bubbleId = parseInt(params.id, 10);
  if (!Number.isFinite(bubbleId)) return json({ error: 'invalid_id' }, 400);

  const bubble = await env.DB.prepare(`SELECT id, type FROM bubbles WHERE id = ? AND hidden = 0`)
    .bind(bubbleId)
    .first();
  if (!bubble) return json({ error: 'not_found' }, 404);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const { content, code, lang } = body || {};
  if (typeof content !== 'string' || !content.trim()) {
    return json({ error: 'empty_content' }, 400);
  }
  if (content.length > MAX_CONTENT_LEN) {
    return json({ error: 'content_too_long', max: MAX_CONTENT_LEN }, 400);
  }
  // Optional author handle; anonymous when omitted.
  const safeCode = typeof code === 'string' && code.trim()
    ? code.trim().toLowerCase().slice(0, MAX_CODE_LEN)
    : null;

  const trimmed = content.trim();
  if (containsAbusive(trimmed)) {
    return json({ error: 'blocked_abusive' }, 400);
  }

  // A reply lands on someone who has just written down the worst thing in
  // their week, so this side of the wall matters more than the other. Same
  // screen, same rules (src/moderation.js): severe is refused outright, a
  // plain violation goes up and is queued for review immediately.
  const verdict = await screen(env, trimmed);
  if (blocksPublishing(verdict)) return json({ error: 'blocked_guidelines' }, 400);

  const { text: safeContent, masked } = maskContactInfo(trimmed);
  const crisisFlag = containsCrisisKeyword(trimmed) ? 1 : 0;
  const safeLang = typeof lang === 'string' ? lang.slice(0, 10) : null;
  const now = Date.now();

  // Same as a whisper: whoever wrote this may take it back later, and the
  // server needs something better than a list in a browser to believe them.
  const secret = cleanSecret(body.secret);
  const authorHash = secret ? await hashSecret(secret) : null;

  // …and it is also what makes "stop replying to this person" enforceable.
  // Only for a device that has an identity: without one there is nothing to
  // count, which is the same gap the whole anonymous design has and is covered
  // by reporting rather than by pretending otherwise.
  if (authorHash) {
    const mine = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM replies WHERE bubble_id = ? AND author_hash = ? AND hidden = 0`
    )
      .bind(bubbleId, authorHash)
      .first();
    if (mine && mine.n >= MAX_REPLIES_PER_WHISPER) {
      return json({ error: 'too_many_replies', max: MAX_REPLIES_PER_WHISPER }, 429);
    }
  }

  const result = await env.DB.prepare(
    `INSERT INTO replies (bubble_id, content, code, lang, report_count, hidden, crisis_flag, created_at, author_hash)
     VALUES (?, ?, ?, ?, 0, 0, ?, ?, ?)`
  )
    .bind(bubbleId, safeContent, safeCode, safeLang, crisisFlag, now, authorHash)
    .run();

  await recordAiConcern(env, 'reply', result.meta.last_row_id, verdict);

  await env.DB.prepare(`UPDATE bubbles SET warmth = warmth + 1 WHERE id = ?`).bind(bubbleId).run();

  return json(
    {
      id: result.meta.last_row_id,
      bubbleId,
      content: safeContent,
      contactMasked: masked,
      createdAt: now,
    },
    201
  );
}
