import { screen } from '../../src/moderation.js';

const HIDE_THRESHOLD = 3;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

// Community self-cleaning, on two independent paths:
//   1. AI — every report (not just the first) runs one moderation call. A
//      confirmed violation is hidden immediately, however few reports it has,
//      and a SEVERE verdict (a method someone could follow, a threat, a child)
//      is the same hide with no waiting either. The severity split exists so
//      the worst category cannot end up sitting behind a queue.
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

  const { targetType, targetId, reason } = body || {};
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
  const verdict = enoughReports ? 'ok' : await screen(env, row.content);
  const byAi = verdict === 'violation' || verdict === 'severe';
  const hide = enoughReports || byAi;

  if (hide) {
    await env.DB.prepare(`UPDATE ${table} SET hidden = 1 WHERE id = ?`).bind(id).run();
  }

  // Write the report down whatever happened.
  //
  // Both automatic paths record which one fired, and a report that hid nothing
  // is still a row: a whisper reported twice and left up is exactly the case
  // somebody should be able to look at before a third report decides it
  // without them. Best effort — the queue is for reviewing afterwards, and a
  // failure to log must not turn reporting itself into a dead button.
  try {
    await env.DB.prepare(
      `INSERT INTO reports (item_type, item_id, reason, status, auto, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind(
        targetType,
        id,
        String(reason || '').slice(0, 200) || null,
        hide ? 'hidden' : 'open',
        // Which path fired, so a weekly look back can tell "three people
        // agreed" from "the classifier caught it" from "the worst kind".
        enoughReports ? 'count' : verdict === 'severe' ? 'ai-severe' : byAi ? 'ai' : null,
        Date.now()
      )
      .run();
  } catch {
    /* the content was already dealt with above; the log is not worth failing on */
  }

  return json({ ok: true, hidden: hide });
}
