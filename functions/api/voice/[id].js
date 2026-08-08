import { voiceHash, synthesize } from '../../../src/tts.js';

// Read a whisper aloud. Returns audio, never JSON on success.
//
// Cost is bounded by design rather than by a rate limiter: a reading is cached
// under a hash of its own text, so a whisper can only ever be paid for once no
// matter how many people press play or how often. The set of whispers is
// finite, so the total bill is too.
//
// A hidden whisper is not readable here either — same rule as the detail
// endpoint, so a reported-and-removed whisper cannot be laundered back into
// earshot through the audio route.
export async function onRequestGet({ params, env }) {
  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id)) {
    return new Response(JSON.stringify({ error: 'invalid_id' }), {
      status: 400,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  const bubble = await env.DB.prepare(
    `SELECT id, type, content FROM bubbles WHERE id = ? AND hidden = 0`
  )
    .bind(id)
    .first();

  if (!bubble) {
    return new Response(JSON.stringify({ error: 'not_found' }), {
      status: 404,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  const text = String(bubble.content || '').trim();
  if (!text) {
    return new Response(JSON.stringify({ error: 'empty' }), {
      status: 404,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  const hash = await voiceHash(text, bubble.type);

  const cached = await env.DB.prepare(`SELECT mime, data FROM voice WHERE hash = ?`)
    .bind(hash)
    .first();
  if (cached) return audio(cached.data, cached.mime);

  // No key configured → say so plainly and let the browser fall back to its own
  // speech synthesis. A missing key must never look like a broken button.
  if (!env.OPENAI_API_KEY) {
    return new Response(JSON.stringify({ error: 'not_configured' }), {
      status: 503,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  let out;
  try {
    out = await synthesize(text, bubble.type, env.OPENAI_API_KEY);
  } catch (e) {
    // Same posture as the AI moderation call: the provider having a bad day is
    // not a reason for the reader to get nothing. The client falls back.
    return new Response(JSON.stringify({ error: 'tts_failed', detail: String(e.message || e) }), {
      status: 502,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  // Store before responding so the next listener is free. A failed insert (a
  // race with another listener inserting the same hash) must not cost the
  // reader their audio.
  try {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO voice (hash, mime, data, bytes, created_at) VALUES (?, ?, ?, ?, ?)`
    )
      .bind(hash, out.mime, out.bytes, out.bytes.length, Date.now())
      .run();
  } catch {
    /* cached next time */
  }

  return audio(out.bytes, out.mime);
}

function audio(data, mime) {
  return new Response(data, {
    headers: {
      'content-type': mime || 'audio/mpeg',
      // The hash covers the text and the delivery, so a given whisper's audio
      // is stable for as long as its words are.
      'cache-control': 'public, max-age=86400',
    },
  });
}
