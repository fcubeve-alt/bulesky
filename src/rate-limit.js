// How often one caller may do something that rewards guessing.
//
// Fails OPEN, deliberately and in the same spirit as the moderation call: a
// database hiccup must never stop someone finding their own whispers. This
// raises the cost of a brute-force sweep; it is not a lock, and nothing that
// must be private should be behind it alone.
const WINDOW_MS = 10 * 60 * 1000;

// Old windows are swept lazily, on roughly one call in fifty, so the table
// cannot grow forever and no cron job has to exist for it.
const SWEEP_ODDS = 50;

export function callerKey(request) {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for') ||
    'unknown'
  ).split(',')[0].trim();
}

// Returns true when the caller is over the limit for this window.
export async function overLimit(env, name, request, max) {
  if (!env?.DB) return false;
  const bucket = `${name}:${callerKey(request)}`;
  const windowStart = Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS;
  try {
    await env.DB.prepare(
      `INSERT INTO rate_limits (bucket, window_start, count) VALUES (?, ?, 1)
       ON CONFLICT(bucket, window_start) DO UPDATE SET count = count + 1`
    )
      .bind(bucket, windowStart)
      .run();

    const row = await env.DB.prepare(
      `SELECT count FROM rate_limits WHERE bucket = ? AND window_start = ?`
    )
      .bind(bucket, windowStart)
      .first();

    if (Math.floor(Math.random() * SWEEP_ODDS) === 0) {
      await env.DB.prepare(`DELETE FROM rate_limits WHERE window_start < ?`)
        .bind(windowStart - WINDOW_MS)
        .run();
    }

    return Boolean(row && row.count > max);
  } catch {
    return false;
  }
}
