import { isAuthed, unauthorized } from '../../../src/admin-auth.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

// How many people are actually here.
//
// A NAME cannot answer this and never could: names are free text, anyone can
// type a new one, and two people can pick the same one. Counting distinct names
// would count moods, not people.
//
// `author_hash` can. It is SHA-256 of the secret one device minted for itself,
// so one hash is one device that has written something — which is the closest
// thing to "a user" that exists in a product with no accounts, and it is honest
// about its own limits: a person with a phone and a laptop is two, and a person
// who restored from a recovery code onto a new phone is still one.
//
// Rows written before authorship existed have no hash at all. They are counted
// separately rather than folded in, because they are content without a person
// attached and quietly adding them to "users" would inflate the only number
// here anybody would make a decision on.
export async function onRequestGet({ request, env }) {
  if (!isAuthed(request, env)) return unauthorized();

  const day = 24 * 60 * 60 * 1000;
  const now = Date.now();

  const one = async (sql, ...binds) => {
    try {
      const row = await env.DB.prepare(sql).bind(...binds).first();
      return row ? Object.values(row)[0] : 0;
    } catch {
      return null;
    }
  };

  const [
    writers,
    writersWeek,
    writersMonth,
    whispers,
    whispersWeek,
    replies,
    lights,
    ownerless,
    hidden,
    openReports,
    oldest,
  ] = await Promise.all([
    one(`SELECT COUNT(DISTINCT author_hash) AS n FROM bubbles WHERE author_hash IS NOT NULL`),
    one(`SELECT COUNT(DISTINCT author_hash) AS n FROM bubbles WHERE author_hash IS NOT NULL AND created_at > ?`, now - 7 * day),
    one(`SELECT COUNT(DISTINCT author_hash) AS n FROM bubbles WHERE author_hash IS NOT NULL AND created_at > ?`, now - 30 * day),
    one(`SELECT COUNT(*) AS n FROM bubbles WHERE hidden = 0`),
    one(`SELECT COUNT(*) AS n FROM bubbles WHERE hidden = 0 AND created_at > ?`, now - 7 * day),
    one(`SELECT COUNT(*) AS n FROM replies WHERE hidden = 0`),
    one(`SELECT COALESCE(SUM(lights), 0) AS n FROM bubbles WHERE hidden = 0`),
    one(`SELECT COUNT(*) AS n FROM bubbles WHERE author_hash IS NULL`),
    one(`SELECT COUNT(*) AS n FROM bubbles WHERE hidden = 1`),
    one(`SELECT COUNT(*) AS n FROM reports WHERE status = 'open'`),
    one(`SELECT MIN(created_at) AS n FROM bubbles`),
  ]);

  return json({
    writers,
    writersWeek,
    writersMonth,
    whispers,
    whispersWeek,
    replies,
    lights,
    ownerless,
    hidden,
    openReports,
    // What a whisper's whole life looks like from here: everything is deleted a
    // year after it was written (src/retention.js), so this says how close the
    // oldest thing on the site is to that.
    oldestDays: oldest ? Math.floor((now - oldest) / day) : 0,
  });
}
