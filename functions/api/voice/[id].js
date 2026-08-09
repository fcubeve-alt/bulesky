import { voiceHash, pickVoice, synthesize, providerFor, auraModel } from '../../../src/tts.js';

// Read a whisper aloud. Returns audio, never JSON on success.
//
// Generated lazily and kept forever. Publishing a whisper costs nothing — the
// text is simply stored — and a whisper nobody ever presses Listen on is never
// synthesised at all. The first listener pays for it once; everyone after them
// is served the same bytes out of the database.
//
// So cost is bounded by the shape of the thing rather than by a rate limiter: a
// whisper can only ever be paid for once no matter how many people press play
// or how often, and the set of whispers is finite, so the total is too. Nothing
// here scales with traffic — only with how many distinct whispers have ever
// been listened to.
//
// A hidden whisper is not readable here either — same rule as the detail
// endpoint, so a reported-and-removed whisper cannot be laundered back into
// earshot through the audio route.
// Nothing in here may crash the worker.
//
// An unhandled throw does not reach the client as an error we wrote — it
// reaches it as Cloudflare's own HTML error page with a 502, which tells the
// listener nothing and told me nothing for three rounds. Whatever goes wrong,
// it comes back as JSON naming itself.
export async function onRequestGet(context) {
  try {
    return await readAloud(context);
  } catch (e) {
    try {
      const note = noteFailure(context.env, 'crash', String((e && e.message) || e));
      if (typeof context.waitUntil === 'function') context.waitUntil(note);
    } catch {
      /* nothing left to try */
    }
    return new Response(
      JSON.stringify({
        error: 'crashed',
        detail: String((e && e.message) || e).slice(0, 300),
        where: String((e && e.stack) || '').split('\n').slice(0, 3).join(' | ').slice(0, 300),
      }),
      { status: 500, headers: { 'content-type': 'application/json; charset=utf-8' } }
    );
  }
}

// What the environment actually looks like from inside the worker, for when a
// failure needs explaining rather than guessing at. Says nothing secret: which
// bindings exist, not what is in them.
async function probe(env) {
  // The last few failures, straight from the database. Three rounds of "still
  // no sound" have been spent guessing at what the error was, because a failure
  // that falls back silently leaves no trace anyone can read afterwards.
  let recentFailures = [];
  try {
    const { results } = await env.DB.prepare(
      `SELECT at, provider, detail FROM voice_errors ORDER BY at DESC LIMIT 8`
    ).all();
    recentFailures = (results || []).map((r) => ({
      when: new Date(r.at).toISOString().replace('T', ' ').slice(0, 19) + 'Z',
      provider: r.provider,
      detail: r.detail,
    }));
  } catch (e) {
    recentFailures = [{ detail: `could not read voice_errors: ${String(e.message || e)}` }];
  }

  let cached = null;
  try {
    cached = await env.DB.prepare(
      `SELECT COUNT(DISTINCT hash) AS readings, COUNT(*) AS chunks, SUM(LENGTH(data)) AS bytes FROM voice_chunks`
    ).first();
  } catch (e) {
    cached = { error: String(e.message || e) };
  }

  return new Response(
    JSON.stringify({
      cached,
      recentFailures,
      hasDB: Boolean(env && env.DB),
      hasAI: Boolean(env && env.AI),
      hasElevenLabsKey: Boolean(env && env.ELEVENLABS_API_KEY),
      hasOpenAIKey: Boolean(env && env.OPENAI_API_KEY),
      provider: providerFor(env),
      model: auraModel(env),
    }, null, 1),
    { headers: { 'content-type': 'application/json; charset=utf-8' } }
  );
}

// Best effort. Diagnostics must never become the thing that breaks it.
async function noteFailure(env, provider, detail) {
  try {
    await env.DB.prepare(`INSERT INTO voice_errors (at, provider, detail) VALUES (?, ?, ?)`)
      .bind(Date.now(), String(provider || 'none'), String(detail).slice(0, 400))
      .run();
  } catch {
    /* nothing to do */
  }
}

async function readAloud({ request, params, env, waitUntil }) {
  if (request && new URL(request.url).searchParams.get('probe') === '1') return await probe(env);

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

  const hash = await voiceHash(text, bubble.type, env);

  const { results: parts } = await env.DB.prepare(
    `SELECT mime, data FROM voice_chunks WHERE hash = ? ORDER BY part ASC`
  )
    .bind(hash)
    .all();
  if (parts && parts.length) return audio(join(parts.map((p) => p.data)), parts[0].mime, request);

  // No provider at all — not even the Workers AI binding — so say so plainly and
  // let the browser fall back to its own speech synthesis. This must never look
  // like a broken button.
  if (!providerFor(env)) {
    return new Response(JSON.stringify({ error: 'not_configured' }), {
      status: 503,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  // Only reached on a cache miss, so the narrator is chosen once per whisper —
  // same budget as the audio itself.
  const narrator = await pickVoice(text, env);

  let out;
  try {
    out = await synthesize(text, bubble.type, narrator, env);
  } catch (e) {
    // Same posture as the AI moderation call: the provider having a bad day is
    // not a reason for the reader to get nothing. The client falls back.
    const detail = String((e && e.message) || e);
    if (typeof waitUntil === 'function') waitUntil(noteFailure(env, providerFor(env), detail));
    return new Response(JSON.stringify({ error: 'tts_failed', detail }), {
      status: 502,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  // Never cache something that is not going to play. A provider that answers
  // with an error body instead of audio would otherwise be stored once and
  // served as a permanently broken reading — the cache is forever, so what goes
  // into it has to be checked once here.
  if (!out.bytes || out.bytes.length < 2048) {
    const short = `empty audio: ${out.bytes ? out.bytes.length : 0} bytes`;
    if (typeof waitUntil === 'function') waitUntil(noteFailure(env, providerFor(env), short));
    return new Response(JSON.stringify({ error: 'tts_empty', bytes: out.bytes ? out.bytes.length : 0 }), {
      status: 502,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  // Hand the audio over FIRST and cache afterwards.
  //
  // Slicing a few megabytes into rows and writing them to D1 is the heaviest
  // thing this endpoint does, and doing it before replying put it inside the
  // request's resource budget. A worker killed for exceeding that budget does
  // not throw — it is terminated, the try/catch wrapping this never runs, and
  // what reaches the listener is Cloudflare's own HTML error page. Which is
  // exactly what was coming back.
  //
  // With waitUntil the response is already on its way before any of that
  // happens, so the worst a failed cache can do is make the next listener pay
  // for the synthesis again. Nobody is left in silence for it.
  const store = cacheReading(env, hash, out, narrator);
  if (typeof waitUntil === 'function') waitUntil(store);
  else store.catch(() => {});

  return audio(out.bytes, out.mime, request);
}

async function cacheReading(env, hash, out, narrator) {
  try {
    const now = Date.now();
    const rows = [];
    for (let i = 0, part = 0; i < out.bytes.length; i += CHUNK_BYTES, part += 1) {
      rows.push(
        env.DB.prepare(
          `INSERT OR IGNORE INTO voice_chunks (hash, part, mime, data, created_at, voice)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).bind(hash, part, out.mime, out.bytes.slice(i, i + CHUNK_BYTES), now, narrator)
      );
    }
    // One batch, so a reading is either fully cached or not cached at all —
    // half a reading in the table would be served as truncated audio forever.
    await env.DB.batch(rows);
  } catch {
    /* the next listener pays for it again; nobody goes without */
  }
}

// D1 caps a single BLOB — and a single row — at 2,000,000 bytes. A minute of
// speech is more than that, so readings are split rather than risking an insert
// that fails silently and quietly re-bills every play. Left well short of the
// cap to leave room for the rest of the row.
const CHUNK_BYTES = 900_000;

function join(chunks) {
  const parts = chunks.map((c) => (c instanceof Uint8Array ? c : new Uint8Array(c)));
  if (parts.length === 1) return parts[0];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

// Serve the audio, honouring Range.
//
// Safari on iOS will not play media from a URL unless the server answers byte
// ranges — it asks for a couple of bytes first and gives up on a plain 200.
// The player currently loads through a Blob and so never asks, but a media URL
// that only works when nobody treats it as one is a trap for the next person
// to point an <audio> at it. The bytes are already in memory here, so this is
// a slice.
function audio(data, mime, request) {
  const body = data instanceof Uint8Array ? data : new Uint8Array(data);
  const headers = {
    'content-type': mime || 'audio/mpeg',
    'accept-ranges': 'bytes',
    // The hash covers the text and the delivery, so a given whisper's audio
    // is stable for as long as its words are.
    'cache-control': 'public, max-age=86400',
  };

  const range = request && request.headers ? request.headers.get('range') : null;
  const m = range && /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (m && (m[1] || m[2])) {
    const size = body.length;
    let start = m[1] ? parseInt(m[1], 10) : NaN;
    let end = m[2] ? parseInt(m[2], 10) : NaN;
    if (Number.isNaN(start)) {
      // "bytes=-N" means the last N bytes.
      start = Math.max(0, size - (Number.isNaN(end) ? size : end));
      end = size - 1;
    } else if (Number.isNaN(end)) {
      end = size - 1;
    }
    end = Math.min(end, size - 1);
    if (start > end || start >= size) {
      return new Response(null, {
        status: 416,
        headers: { ...headers, 'content-range': `bytes */${size}` },
      });
    }
    const slice = body.subarray(start, end + 1);
    return new Response(slice, {
      status: 206,
      headers: {
        ...headers,
        'content-range': `bytes ${start}-${end}/${size}`,
        'content-length': String(slice.length),
      },
    });
  }

  return new Response(body, { headers: { ...headers, 'content-length': String(body.length) } });
}
