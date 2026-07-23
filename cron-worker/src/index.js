// Scheduled data retention cleanup (PRD section 4.5): old content is
// deleted, both to keep storage within free-tier limits and so that
// years-old confessions can't be dug back up and re-read by strangers.

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(cleanup(env));
  },

  // Manual trigger for local testing: `wrangler dev` exposes this as a
  // normal HTTP fetch handler.
  async fetch(_request, env) {
    const result = await cleanup(env);
    return new Response(JSON.stringify(result), {
      headers: { 'content-type': 'application/json' },
    });
  },
};

async function cleanup(env) {
  const retentionDays = parseInt(env.RETENTION_DAYS, 10) || 180;
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

  const staleBubbles = await env.DB.prepare(`SELECT id FROM bubbles WHERE created_at < ?`)
    .bind(cutoff)
    .all();
  const ids = staleBubbles.results.map((r) => r.id);

  if (ids.length === 0) {
    return { deletedBubbles: 0, deletedReplies: 0 };
  }

  // Batch to stay well under D1/SQLite's bound-parameter limit.
  const BATCH_SIZE = 500;
  let deletedReplies = 0;
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const placeholders = batch.map(() => '?').join(',');
    const result = await env.DB.prepare(`DELETE FROM replies WHERE bubble_id IN (${placeholders})`)
      .bind(...batch)
      .run();
    deletedReplies += result.meta.changes;
  }

  const bubblesResult = await env.DB.prepare(`DELETE FROM bubbles WHERE created_at < ?`)
    .bind(cutoff)
    .run();

  return {
    deletedBubbles: bubblesResult.meta.changes,
    deletedReplies,
  };
}
