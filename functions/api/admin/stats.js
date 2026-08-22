import { isAuthed, unauthorized } from '../../../src/admin-auth.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

// How many people are actually here.
//
// The honest answer is that nothing here can tell you, and the number below is
// an UPPER BOUND — "at most this many people" — not a headcount.
//
// A NAME cannot answer it and never could: names are free text, anyone can type
// a new one, and two people can pick the same one. Counting distinct names would
// count moods, not people.
//
// `author_hash` gets closer: SHA-256 of the secret one browser minted for
// itself. But a browser is not a phone. On the web the secret lives in
// localStorage, which is scoped to one browser profile on one origin — so the
// same phone produces a fresh identity in Safari, another in Chrome, another in
// a private window, and another again in a page added to the home screen. One
// person can hold ten of these without trying, and the site cannot tell. The
// only techniques that could are fingerprinting ones, which this project will
// not use — they are what the privacy promise is against, and they would not
// survive App Store review either.
//
// So: a hash is a WRITING IDENTITY. The count never undercounts people (writing
// requires an identity) and can badly overcount them. Restoring with a recovery
// code merges identities back down, and inside the App there is one WebView and
// one storage, so an App install really is one device.
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
