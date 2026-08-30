import { brandVoiceHash, brandVoiceKey, BRAND_PREFIX } from '../../../src/tts.js';
import { readVoice, writeVoice, deleteVoice, voiceStore, sniffAudioMime } from '../../../src/voice-store.js';

// The door the site's own voice comes in through.
//
// Everything else about Listen is lazy on purpose: a whisper nobody presses
// Listen on is never synthesised, and that is what keeps the cost of this
// feature bounded by the shape of the site rather than by its traffic. Nothing
// here changes that. Publishing still generates nothing.
//
// What this is for is the other half — reading the sky that already exists in
// one deliberate pass, in the voice the site is supposed to have. That pass
// cannot run on Cloudflare: the voice comes out of VoiceStudio, which listens
// on 127.0.0.1:3900 on one Windows machine and is not reachable from anywhere
// else. So the generating happens there (tools/revoice.mjs) and the finished
// audio is posted back in here.
//
//   GET  /api/voice/backfill?after=0&limit=100   which whispers there are
//   POST /api/voice/backfill?id=123              the audio for one of them
//
// ---- why the caller does not choose the key --------------------------------
//
// The obvious shape for this is "here is a hash, here are some bytes", and it
// is the wrong one. Readings are keyed on the TEXT, so that shape lets anyone
// holding the token attach any audio to any words — a gentle whisper read back
// in something cruel, and the author with no way to see it. So the caller sends
// an id and the bytes, and the key is derived HERE, from that whisper's own
// text as the database currently holds it. The worst a leaked token can do is
// replace a reading with another reading.
//
// It is also its own secret, VOICE_UPLOAD_TOKEN, and not the admin password: it
// is going to live in a shell history and a script on a desktop machine, and it
// has to be revocable on its own without locking the owner out of moderation.

const MIN_BYTES = 2048; // the same floor the synthesis path uses: never store
                        // something that will not play
const MAX_BYTES = 8_000_000;
const MAX_PAGE = 200;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

// Length-independent enough for a shared secret compared once per request.
function tokenMatches(given, expected) {
  if (!expected || !given) return false;
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    diff |= (a[i % a.length] || 0) ^ (b[i % b.length] || 0);
  }
  return diff === 0;
}

function authed(request, env) {
  const token = request.headers.get('x-voice-token') || '';
  return tokenMatches(token, env && env.VOICE_UPLOAD_TOKEN);
}

// How much of the sky is already in the site's own voice. Counted rather than
// estimated, because the alternative to knowing is generating a library twice.
// Two numbers, not one, and the difference between them is the whole story of
// one confusing evening.
//
// `made` counts readings under the current key, one per whisper — upload the
// same id twice and it stays the same number, because the second write replaces
// the first. `legacy` counts what is left under the older text-hash key: files
// that are still on the shelf, are never read (the id key is tried first), and
// are only waiting to be swept.
//
// Reported separately because reporting them together is what made a single
// count go from 84 to 169 after a re-read and look like uploads were piling up.
// Nothing was piling up. The key had changed underneath, so the same eighty-odd
// whispers were being counted in two places at once.
async function countReadings(env) {
  const current = `voice/${brandVoiceKey('')}`; // voice/aya-id-
  if (env && env.VOICE_BUCKET) {
    let made = 0;
    let all = 0;
    let cursor;
    do {
      const page = await env.VOICE_BUCKET.list({ prefix: `voice/${BRAND_PREFIX}`, cursor });
      all += page.objects.length;
      made += page.objects.filter((o) => o.key.startsWith(current)).length;
      cursor = page.truncated ? page.cursor : null;
    } while (cursor);
    return { made, legacy: all - made };
  }
  const row = await env.DB.prepare(
    `SELECT
       COUNT(DISTINCT CASE WHEN hash LIKE ? THEN hash END) AS made,
       COUNT(DISTINCT CASE WHEN hash LIKE ? AND hash NOT LIKE ? THEN hash END) AS legacy
     FROM voice_chunks`
  )
    .bind(`${brandVoiceKey('')}%`, `${BRAND_PREFIX}%`, `${brandVoiceKey('')}%`)
    .first();
  return { made: (row && row.made) || 0, legacy: (row && row.legacy) || 0 };
}

// Throw away the copy under the old key, once the new one is safely written.
//
// Every re-upload cleans up after itself, so a library that is read again is
// tidy by the time the run ends, and the ?sweep=1 pass below is only for the
// whispers nobody is going to read again.
async function dropLegacy(env, text, type) {
  try {
    await deleteVoice(env, await brandVoiceHash(text, type));
  } catch {
    /* an orphan nothing reads is not worth failing an upload over */
  }
}

// ---- clearing out what the key change left behind ---------------------------
//
// Readings made before the key became the whisper's id are still on the shelf
// under a hash of the words. Nothing reads them — the id key is tried first —
// so they are pure storage, and they are what made a single count jump from 84
// to 169 and look like duplicates.
//
// Paged on purpose. A Worker has a ceiling on how many outside calls one request
// may make, and a sweep is two of them per whisper; doing a whole library in one
// request is how this would work in testing and die on the real site.
async function sweep(env, after, limit) {
  const { results } = await env.DB.prepare(
    `SELECT id, type, content FROM bubbles
      WHERE hidden = 0 AND id > ? AND LENGTH(TRIM(content)) > 0
      ORDER BY id ASC LIMIT ?`
  )
    .bind(after, Math.min(limit, 50))
    .all();

  const rows = results || [];
  let removed = 0;
  for (const b of rows) {
    const text = String(b.content || '').trim();
    // Only ever delete the old copy of a whisper that HAS a current one. A
    // whisper still living on its legacy reading keeps it until it is re-read.
    if (!(await readVoice(env, brandVoiceKey(b.id)))) continue;
    const legacy = await brandVoiceHash(text, b.type);
    if (!(await readVoice(env, legacy))) continue;
    await deleteVoice(env, legacy);
    removed += 1;
  }

  return json({
    swept: rows.length,
    removed,
    next: rows.length === Math.min(limit, 50) ? rows[rows.length - 1].id : null,
    ...(await countReadings(env)),
  });
}

// ---- what there is to read -------------------------------------------------
//
// Straight from the table, in id order, paged with `after`. Deliberately NOT
// /api/bubbles: that is a per-viewer weighted sample of the sky with a cap on
// it (docs/SKY_FEED.md), so reading "everything it returns" would quietly miss
// most of the site and miss a different part of it every run.
//
// Hidden whispers are skipped, for the same reason /api/voice/{id} refuses
// them: something taken down should not be given a voice, and it must not have
// audio generated for it after the fact.
export async function onRequestGet({ request, env }) {
  if (!(env && env.VOICE_UPLOAD_TOKEN)) return json({ error: 'not_configured' }, 503);
  if (!authed(request, env)) return json({ error: 'unauthorized' }, 401);

  const url = new URL(request.url);
  const after = Number(url.searchParams.get('after') || 0) || 0;
  const limit = Math.min(Number(url.searchParams.get('limit') || 100) || 100, MAX_PAGE);

  if (url.searchParams.get('sweep') === '1') return await sweep(env, after, limit);

  const { results } = await env.DB.prepare(
    `SELECT id, type, content FROM bubbles
      WHERE hidden = 0 AND id > ? AND LENGTH(TRIM(content)) > 0
      ORDER BY id ASC LIMIT ?`
  )
    .bind(after, limit)
    .all();

  const rows = results || [];
  const bubbles = await Promise.all(
    rows.map(async (b) => {
      const text = String(b.content || '').trim();
      return { id: b.id, type: b.type, text, hash: brandVoiceKey(b.id) };
    })
  );

  const total = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM bubbles WHERE hidden = 0 AND LENGTH(TRIM(content)) > 0`
  ).first();

  return json({
    bubbles,
    next: bubbles.length === limit ? bubbles[bubbles.length - 1].id : null,
    total: (total && total.n) || 0,
    ...(await countReadings(env)),
    store: voiceStore(env),
  });
}

// ---- one finished reading --------------------------------------------------
//
// Body is the audio itself, not JSON — a few hundred kilobytes of AAC does not
// want to be base64 in an object, and the id is in the query string where it is
// cheap to read before the body is touched.
export async function onRequestPost({ request, env }) {
  if (!(env && env.VOICE_UPLOAD_TOKEN)) return json({ error: 'not_configured' }, 503);
  if (!authed(request, env)) return json({ error: 'unauthorized' }, 401);

  const url = new URL(request.url);
  const id = Number(url.searchParams.get('id'));
  if (!Number.isFinite(id)) return json({ error: 'invalid_id' }, 400);

  const declared = String(request.headers.get('content-type') || '').split(';')[0].trim();
  if (!declared.startsWith('audio/')) return json({ error: 'not_audio', mime: declared }, 415);

  // The key comes from the whisper as it stands now, never from the caller.
  const bubble = await env.DB.prepare(
    `SELECT id, type, content FROM bubbles WHERE id = ? AND hidden = 0`
  )
    .bind(id)
    .first();
  if (!bubble) return json({ error: 'not_found' }, 404);

  const text = String(bubble.content || '').trim();
  if (!text) return json({ error: 'empty' }, 404);

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length < MIN_BYTES) return json({ error: 'too_short', bytes: bytes.length }, 400);
  if (bytes.length > MAX_BYTES) return json({ error: 'too_large', bytes: bytes.length }, 413);

  // What was sent, not what it was called. `ffmpeg -c:a aac` into a .m4a is an
  // MP4 container and the first batch was posted as `audio/aac`; Safari would
  // not decode it and the page fell back to the phone's own voice, which is a
  // failure that reports itself nowhere.
  const mime = sniffAudioMime(bytes, declared);

  // Keyed on the id. See brandVoiceKey — a hash of the text is one silent miss
  // away from a library that plays nothing it contains.
  // Same id, same key: R2 replaces the object and the D1 path clears the hash
  // in the same batch before inserting. Re-reading a whisper overwrites it; it
  // never accumulates.
  const hash = brandVoiceKey(id);
  const store = await writeVoice(env, hash, bytes, mime, 'aya');

  // And the copy this one supersedes, from before the key was the id.
  await dropLegacy(env, text, bubble.type);

  return json({ ok: true, id, hash, bytes: bytes.length, mime, declared, store });
}

// Whether one whisper has been read already, without downloading it twice over
// a phone line. Used by the uploader when its own record of what it has done is
// missing or suspect.
export async function onRequestHead({ request, env }) {
  if (!(env && env.VOICE_UPLOAD_TOKEN)) return new Response(null, { status: 503 });
  if (!authed(request, env)) return new Response(null, { status: 401 });

  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isFinite(id)) return new Response(null, { status: 400 });

  const bubble = await env.DB.prepare(
    `SELECT id, type, content FROM bubbles WHERE id = ? AND hidden = 0`
  )
    .bind(id)
    .first();
  if (!bubble) return new Response(null, { status: 404 });

  const found =
    (await readVoice(env, brandVoiceKey(bubble.id))) ||
    (await readVoice(env, await brandVoiceHash(String(bubble.content || '').trim(), bubble.type)));
  return new Response(null, { status: found ? 200 : 404 });
}
