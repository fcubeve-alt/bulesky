import { containsAbusive, containsCrisisKeyword, maskContactInfo } from '../../../src/filters.js';
import { cleanSecret, hashSecret } from '../../../src/identity.js';
import { blocksPublishing, recordAiConcern, screenOnPublish } from '../../../src/moderation.js';
import { maybeSweep } from '../../../src/retention.js';

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

// Looking whispers up by the name they were signed with is GONE, deliberately.
//
// It existed as the way back to your own words, and My Sky replaced it: what
// this device wrote is listed there whatever names were used, and the recovery
// code carries that to another phone. What was left was a box that took a
// public string — the name is printed under every whisper — and returned
// everything written under it. Read-only, but still the one place where a name
// stood in for proof, and still a way to sweep the sky for one person's
// writing. Removing it costs nothing anybody still needs.
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);

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

  // Read before it goes up, not after somebody complains.
  //
  // The keyword list above catches a dozen Chinese and English insults; this
  // reads the actual sentence, in any language, which for every language but
  // those two is the only thing that reads it at all. Bounded to 2.5s and
  // failing open (src/moderation.js).
  //
  // Only `severe` is refused here — see blocksPublishing for why the other
  // direction is the expensive mistake. A plain violation goes up and is filed
  // for review in the same breath.
  const verdict = await screenOnPublish(env, trimmedContent);
  if (blocksPublishing(verdict)) return json({ error: 'blocked_guidelines' }, 400);

  const { text: safeContent, masked } = maskContactInfo(trimmedContent);
  const crisisFlag = type === 'pain' && containsCrisisKeyword(trimmedContent) ? 1 : 0;
  const safeLang = typeof lang === 'string' ? lang.slice(0, 10) : null;
  const now = Date.now();

  // Mobile keyboards auto-capitalize text inputs by default, so the exact
  // casing a user typed when creating a bubble can easily differ from what
  // they type later when searching for it. Normalize to lowercase so
  // lookups aren't case-sensitive by accident.
  const finalCode = code.trim().toLowerCase();

  // The one thing that makes this whisper deletable later. A malformed or
  // missing secret is not an error: the whisper still goes up, it simply has no
  // author the server can recognise — same position as everything written
  // before this existed.
  const secret = cleanSecret(body.secret);
  const authorHash = secret ? await hashSecret(secret) : null;

  try {
    const result = await env.DB.prepare(
      `INSERT INTO bubbles (code, type, content, lang, warmth, report_count, hidden, crisis_flag, created_at, author_hash)
       VALUES (?, ?, ?, ?, 0, 0, 0, ?, ?, ?)`
    )
      .bind(finalCode, type, safeContent, safeLang, crisisFlag, now, authorHash)
      .run();

    await recordAiConcern(env, 'bubble', result.meta.last_row_id, verdict);

    // Nothing here stays forever, and there is no cron on Pages — so the
    // year-old whispers go out with the traffic, on about one publish in
    // fifty. See src/retention.js.
    await maybeSweep(env);

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
