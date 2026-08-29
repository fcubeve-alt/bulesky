import { brandVoiceHash, BRAND_PREFIX } from '../../../src/tts.js';
import { readVoice, writeVoice, voiceStore } from '../../../src/voice-store.js';

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
async function readingsMade(env) {
  if (env && env.VOICE_BUCKET) {
    let count = 0;
    let cursor;
    do {
      const page = await env.VOICE_BUCKET.list({ prefix: `voice/${BRAND_PREFIX}`, cursor });
      count += page.objects.length;
      cursor = page.truncated ? page.cursor : null;
    } while (cursor);
    return count;
  }
  const row = await env.DB.prepare(
    `SELECT COUNT(DISTINCT hash) AS n FROM voice_chunks WHERE hash LIKE ?`
  )
    .bind(`${BRAND_PREFIX}%`)
    .first();
  return (row && row.n) || 0;
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
      return { id: b.id, type: b.type, text, hash: await brandVoiceHash(text, b.type) };
    })
  );

  const total = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM bubbles WHERE hidden = 0 AND LENGTH(TRIM(content)) > 0`
  ).first();

  return json({
    bubbles,
    next: bubbles.length === limit ? bubbles[bubbles.length - 1].id : null,
    total: (total && total.n) || 0,
    made: await readingsMade(env),
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

  const mime = String(request.headers.get('content-type') || '').split(';')[0].trim();
  if (!mime.startsWith('audio/')) return json({ error: 'not_audio', mime }, 415);

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

  const hash = await brandVoiceHash(text, bubble.type);
  const store = await writeVoice(env, hash, bytes, mime, 'aya');

  return json({ ok: true, id, hash, bytes: bytes.length, store });
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

  const hash = await brandVoiceHash(String(bubble.content || '').trim(), bubble.type);
  const found = await readVoice(env, hash);
  return new Response(null, { status: found ? 200 : 404 });
}
