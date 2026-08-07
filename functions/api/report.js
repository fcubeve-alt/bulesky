const HIDE_THRESHOLD = 3;

// A small, fast instruct model: this is a yes/no call on one short text, run
// only when somebody actually reports something (≈ the number of reports, not
// the number of posts), so there is no reason to pay for a large one.
const MODERATION_MODEL = '@cf/meta/llama-3.1-8b-instruct';

const MODERATION_SYSTEM = [
  'You moderate an anonymous space where people write about their own feelings.',
  'The rule is: pain is welcome, harm is not.',
  'Answer OK when the text only expresses the writer\'s own sadness, grief, loneliness,',
  'despair, regret or hope — however dark or hopeless it sounds. That is allowed here.',
  'Answer VIOLATION when the text attacks, insults, mocks, threatens, harasses or',
  'discriminates against another person; encourages someone to hurt themselves;',
  'describes suicide methods in detail; exposes private information; or is spam,',
  'advertising or solicitation.',
  'Reply with exactly one word: OK or VIOLATION.',
].join(' ');

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

// One moderation call on the reported text. Language-agnostic on purpose: the
// keyword filters only cover English, so for every other language this is the
// layer that actually reads the content.
//
// Fails open (returns false) whenever the model is unavailable, slow to the
// point of throwing, or answers something unexpected. That is deliberate: a
// broken AI must never break reporting, and the count path below still hides
// anything three people flag.
async function violatesGuidelines(env, text) {
  if (!env.AI || !text) return false;
  try {
    const res = await env.AI.run(MODERATION_MODEL, {
      messages: [
        { role: 'system', content: MODERATION_SYSTEM },
        { role: 'user', content: String(text).slice(0, 1500) },
      ],
      max_tokens: 5,
      temperature: 0,
    });
    return String(res?.response || '').trim().toUpperCase().startsWith('VIOLATION');
  } catch {
    return false;
  }
}

// Community self-cleaning, on two independent paths:
//   1. AI — every report (not just the first) runs one moderation call. A
//      confirmed violation is hidden immediately, however few reports it has.
//   2. Count — HIDE_THRESHOLD reports hide the content regardless of what the
//      AI said, so a wrong or missing verdict can never keep it up.
// Either path is enough. Anyone can report, no auth — the accepted trade-off
// for a fully anonymous product. Bubbles and replies are counted separately:
// hiding a whisper does not touch its replies, or the other way round.
export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const { targetType, targetId } = body || {};
  const id = parseInt(targetId, 10);
  if ((targetType !== 'bubble' && targetType !== 'reply') || !Number.isFinite(id)) {
    return json({ error: 'invalid_target' }, 400);
  }

  const table = targetType === 'bubble' ? 'bubbles' : 'replies';

  const row = await env.DB.prepare(`SELECT id, content, hidden FROM ${table} WHERE id = ?`)
    .bind(id)
    .first();
  if (!row) return json({ error: 'not_found' }, 404);
  if (row.hidden) return json({ ok: true, hidden: true });

  await env.DB.prepare(`UPDATE ${table} SET report_count = report_count + 1 WHERE id = ?`)
    .bind(id)
    .run();

  const updated = await env.DB.prepare(`SELECT report_count FROM ${table} WHERE id = ?`)
    .bind(id)
    .first();

  const enoughReports = updated.report_count >= HIDE_THRESHOLD;
  const hide = enoughReports || (await violatesGuidelines(env, row.content));

  if (hide) {
    await env.DB.prepare(`UPDATE ${table} SET hidden = 1 WHERE id = ?`).bind(id).run();
  }

  return json({ ok: true, hidden: hide });
}
