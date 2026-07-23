import { containsAbusive, containsCrisisKeyword, maskContactInfo } from '../../../../src/filters.js';

const MAX_CONTENT_LEN = 300;

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

  const { content, lang } = body || {};
  if (typeof content !== 'string' || !content.trim()) {
    return json({ error: 'empty_content' }, 400);
  }
  if (content.length > MAX_CONTENT_LEN) {
    return json({ error: 'content_too_long', max: MAX_CONTENT_LEN }, 400);
  }

  const trimmed = content.trim();
  if (containsAbusive(trimmed)) {
    return json({ error: 'blocked_abusive' }, 400);
  }

  const { text: safeContent, masked } = maskContactInfo(trimmed);
  const crisisFlag = containsCrisisKeyword(trimmed) ? 1 : 0;
  const safeLang = typeof lang === 'string' ? lang.slice(0, 10) : null;
  const now = Date.now();

  const result = await env.DB.prepare(
    `INSERT INTO replies (bubble_id, content, lang, report_count, hidden, crisis_flag, created_at)
     VALUES (?, ?, ?, 0, 0, ?, ?)`
  )
    .bind(bubbleId, safeContent, safeLang, crisisFlag, now)
    .run();

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
