import { containsAbusive, containsCrisisKeyword, maskContactInfo } from '../../../src/filters.js';

const MAX_CONTENT_LEN = 1000;
const MAX_CODE_LEN = 30;
const LIST_LIMIT_DEFAULT = 60;
const LIST_LIMIT_MAX = 120;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

// Hidden content is invisible to EVERYONE, including whoever wrote it: an
// author who could still read the abuse aimed at them (or screenshot it) is a
// risk we don't want to carry. The row is still listed, though, marked
// `removed` and stripped of its text — vanishing silently would just make the
// author think the lookup is broken and try again.
function redactIfHidden(b) {
  if (!b.hidden) return b;
  return { id: b.id, type: b.type, created_at: b.created_at, removed: 1 };
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);

  // Owner lookup by NAME. A name is a personal handle, not a per-post secret:
  // one person can post many whispers under the same name, so this returns the
  // whole list (newest first). Served from the main (non-dynamic) route so it
  // can never be affected by nested dynamic-route resolution.
  const codeParam = url.searchParams.get('code');
  if (codeParam !== null) {
    const code = codeParam.trim().toLowerCase();
    if (!code) return json({ error: 'empty_code' }, 400);
    const { results } = await env.DB.prepare(
      `SELECT id, type, content, lang, warmth, crisis_flag, hidden, created_at
         FROM bubbles WHERE code = ? ORDER BY created_at DESC`
    )
      .bind(code)
      .all();
    if (!results || results.length === 0) return json({ error: 'not_found', bubbles: [] }, 404);
    return json({ bubbles: results.map(redactIfHidden) });
  }

  const type = url.searchParams.get('type');
  const limitParam = parseInt(url.searchParams.get('limit') || '', 10);
  const limit = Math.min(
    LIST_LIMIT_MAX,
    Number.isFinite(limitParam) && limitParam > 0 ? limitParam : LIST_LIMIT_DEFAULT
  );
  const before = parseInt(url.searchParams.get('before') || '', 10);

  const clauses = ['hidden = 0'];
  const params = [];
  if (type === 'pain' || type === 'wish') {
    clauses.push('type = ?');
    params.push(type);
  }
  if (Number.isFinite(before)) {
    clauses.push('created_at < ?');
    params.push(before);
  }

  // The drifting sky is a per-request weighted-random SAMPLE, not "the newest
  // N". Two effects, both deliberate:
  //  1. Every request re-rolls RANDOM(), so different viewers (and refreshes)
  //     get different whispers — with a large corpus, the crowd collectively
  //     witnesses far more of it than any one screen could hold.
  //  2. The random key is nudged by weights so the sky still feels alive and
  //     kind: hotter (more-replied) whispers surface more, brand-new ones get a
  //     lift, and whispers with zero replies get a deliberate boost so the ones
  //     that most need a first reply keep getting seen.
  // Smaller sort value = more likely to be picked (ASC, then LIMIT).
  // ABS(RANDOM() % 1000) stays in 0..999 (avoids the INT64 overflow that bare
  // ABS(RANDOM()) can hit). This full-scan sample is fine at our scale; the API
  // shape lets the sampling strategy grow (random-key ranges, etc.) later
  // without touching the client.
  const freshCutoff = Date.now() - 24 * 60 * 60 * 1000;
  const stmt = env.DB.prepare(
    `SELECT id, type, content, lang, warmth, lights, created_at
       FROM bubbles
      WHERE ${clauses.join(' AND ')}
      ORDER BY (
        ABS(RANDOM() % 1000)
        - MIN(warmth, 12) * 45
        - (CASE WHEN warmth = 0 THEN 120 ELSE 0 END)
        - (CASE WHEN created_at > ? THEN 200 ELSE 0 END)
      ) ASC
      LIMIT ?`
  ).bind(...params, freshCutoff, limit);

  const { results } = await stmt.all();
  return json({ bubbles: results });
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const { type, content, code, lang } = body || {};

  if (type !== 'pain' && type !== 'wish') {
    return json({ error: 'invalid_type' }, 400);
  }
  if (typeof content !== 'string' || !content.trim()) {
    return json({ error: 'empty_content' }, 400);
  }
  if (content.length > MAX_CONTENT_LEN) {
    return json({ error: 'content_too_long', max: MAX_CONTENT_LEN }, 400);
  }
  if (typeof code !== 'string' || !code.trim()) {
    return json({ error: 'empty_code' }, 400);
  }
  if (code.length > MAX_CODE_LEN) {
    return json({ error: 'code_too_long', max: MAX_CODE_LEN }, 400);
  }

  const trimmedContent = content.trim();
  if (containsAbusive(trimmedContent) || containsAbusive(code)) {
    return json({ error: 'blocked_abusive' }, 400);
  }

  const { text: safeContent, masked } = maskContactInfo(trimmedContent);
  const crisisFlag = type === 'pain' && containsCrisisKeyword(trimmedContent) ? 1 : 0;
  const safeLang = typeof lang === 'string' ? lang.slice(0, 10) : null;
  const now = Date.now();

  // Mobile keyboards auto-capitalize text inputs by default, so the exact
  // casing a user typed when creating a bubble can easily differ from what
  // they type later when searching for it. Normalize to lowercase so
  // lookups aren't case-sensitive by accident.
  const finalCode = code.trim().toLowerCase();

  try {
    const result = await env.DB.prepare(
      `INSERT INTO bubbles (code, type, content, lang, warmth, report_count, hidden, crisis_flag, created_at)
       VALUES (?, ?, ?, ?, 0, 0, 0, ?, ?)`
    )
      .bind(finalCode, type, safeContent, safeLang, crisisFlag, now)
      .run();

    return json(
      {
        id: result.meta.last_row_id,
        code: finalCode,
        type,
        content: safeContent,
        contactMasked: masked,
        crisisFlag: !!crisisFlag,
        createdAt: now,
      },
      201
    );
  } catch {
    // A name is a personal handle now, shared across a person's own whispers —
    // duplicates are expected and fine, so there is no uniqueness error.
    return json({ error: 'server_error' }, 500);
  }
}
