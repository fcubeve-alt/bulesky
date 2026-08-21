// Nothing stays here forever.
//
// A whisper written at three in the morning two years ago is not the same
// object as the person who wrote it. They have moved on; the sentence has not,
// and it is still sitting in a public sky under a name they may still use. So
// everything ages out after a year, and the site says so on the Principles
// page — which is the reason this file exists rather than the promise sitting
// there unimplemented.
//
// HOW, given Pages Functions have no cron.
//
// The same trick as the rate limiter: sweep lazily, on roughly one write in
// fifty, so the work rides along with traffic that is already happening and
// there is no scheduled job to set up, pay for, or forget to monitor. A site
// with no visitors does no sweeping, and a site with no visitors is also not
// showing anyone anything.
//
// WHAT IS ACTUALLY DELETED. The row, and the words in it — this is a real
// delete, not `hidden = 1`. Hiding would leave the text in the database
// forever while telling people it was gone, which is the kind of promise that
// is worse than no promise at all. Replies go with the whisper they hang from:
// they were written to that person about that whisper and mean nothing on
// their own. Saves pointing at a deleted whisper simply stop matching, the
// same as when an author takes something back (see /api/me).
//
// Bounded on purpose: a few hundred rows per sweep. This runs inside somebody
// else's request, and a request that publishes a whisper must not also wait on
// a year's worth of housekeeping.
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const SWEEP_ODDS = 50;
const BATCH = 200;

export function cutoff(now = Date.now()) {
  return now - YEAR_MS;
}

// Delete one batch of expired whispers and their replies. Returns how many
// whispers went. Never throws: housekeeping must not fail somebody's post.
export async function sweepExpired(env, now = Date.now()) {
  if (!env || !env.DB) return 0;
  const before = cutoff(now);
  try {
    const { results } = await env.DB.prepare(
      `SELECT id FROM bubbles WHERE created_at < ? LIMIT ?`
    )
      .bind(before, BATCH)
      .all();
    const ids = (results || []).map((r) => r.id);
    if (!ids.length) return 0;

    const list = ids.join(',');
    // One batch, so a failure halfway cannot leave replies orphaned from a
    // whisper that is already gone.
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM replies WHERE bubble_id IN (${list})`),
      env.DB.prepare(`DELETE FROM reports WHERE item_type = 'bubble' AND item_id IN (${list})`),
      env.DB.prepare(`DELETE FROM saves WHERE item_type = 'bubble' AND item_id IN (${list})`),
      env.DB.prepare(`DELETE FROM bubbles WHERE id IN (${list})`),
    ]);
    return ids.length;
  } catch {
    return 0;
  }
}

// Call this from write paths. Sweeps on about one call in fifty.
export async function maybeSweep(env, now = Date.now()) {
  if (Math.floor(Math.random() * SWEEP_ODDS) !== 0) return 0;
  return sweepExpired(env, now);
}
