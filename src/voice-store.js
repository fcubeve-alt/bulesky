// Where a finished reading lives.
//
// It has lived in D1 until now, sliced into 900,000-byte rows, and that was
// always the wrong shelf for it. D1 is the same database the sky and the
// reading view query on every tap, and this project has already been through
// one round of "the whole site got slow" that turned out to be audio sitting
// next to the whispers (ROADMAP §7f). At 55 readings and 9.3MB it is fine. At
// App scale it is the thing that breaks first.
//
// So: R2 when the bucket is bound, D1 when it is not, decided per call.
//
// The fallback is not politeness — it is what lets this ship before anyone
// touches the Cloudflare dashboard. Declaring a binding that does not exist
// fails the deploy, and a deploy that fails because of a storage change is how
// a working site goes dark over a performance improvement. Bind the bucket and
// new readings move; do nothing and everything keeps working exactly as before.
//
// Reads try both, always: readings written before the bucket existed stay
// playable, and nothing has to be migrated on a particular day.

const PREFIX = 'voice/';

// D1 caps a single BLOB — and a single row — at 2,000,000 bytes. A minute of
// speech is more than that, so a D1-stored reading is split. Left well short of
// the cap to leave room for the rest of the row.
const CHUNK_BYTES = 900_000;

// What these bytes actually are, regardless of what anyone called them.
//
// This exists because of one wasted evening. Readings made on the owner's
// machine are `ffmpeg -c:a aac` into a .m4a, which is an MP4 CONTAINER, and they
// were posted as `audio/aac` — the type for a bare ADTS stream. The label and
// the bytes disagreed, Safari would not decode it, and app.js does the right
// thing with audio it cannot decode: it falls back to the phone's own voice. So
// eighty-four readings uploaded perfectly, were served perfectly, and came out
// as the robot voice, with nothing anywhere reporting an error.
//
// A caller does not get to decide this any more. The bytes do.
export function sniffAudioMime(bytes, fallback = 'audio/mpeg') {
  const b = bytes;
  if (!b || b.length < 12) return fallback;
  // ISO base media (MP4, M4A): an 'ftyp' box, four bytes in.
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return 'audio/mp4';
  // ADTS AAC: twelve sync bits, then a layer of 00. Checked before MP3 because
  // both begin 0xFF and only this mask separates them.
  if (b[0] === 0xff && (b[1] & 0xf6) === 0xf0) return 'audio/aac';
  if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) return 'audio/mpeg'; // ID3
  if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) return 'audio/mpeg'; // MPEG frame
  if (b[0] === 0x4f && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53) return 'audio/ogg';
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'audio/webm';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46) return 'audio/wav';
  return fallback;
}

export function voiceStore(env) {
  return env && env.VOICE_BUCKET ? 'r2' : 'd1';
}

export async function readVoice(env, hash) {
  if (env && env.VOICE_BUCKET) {
    try {
      const object = await env.VOICE_BUCKET.get(PREFIX + hash);
      if (object) {
        return {
          bytes: new Uint8Array(await object.arrayBuffer()),
          mime: (object.httpMetadata && object.httpMetadata.contentType) || 'audio/mpeg',
          voice: (object.customMetadata && object.customMetadata.voice) || null,
          from: 'r2',
        };
      }
    } catch {
      // A bucket having a bad minute must not make a whisper unreadable when
      // the old copy is still sitting in D1.
    }
  }

  const { results } = await env.DB.prepare(
    `SELECT mime, data, voice FROM voice_chunks WHERE hash = ? ORDER BY part ASC`
  )
    .bind(hash)
    .all();
  if (!results || !results.length) return null;

  return {
    bytes: join(results.map((r) => r.data)),
    mime: results[0].mime,
    voice: results[0].voice || null,
    from: 'd1',
  };
}

export async function writeVoice(env, hash, bytes, mime, narrator) {
  if (env && env.VOICE_BUCKET) {
    await env.VOICE_BUCKET.put(PREFIX + hash, bytes, {
      httpMetadata: { contentType: mime },
      customMetadata: { voice: String(narrator || '') },
    });
    return 'r2';
  }

  // Clear the hash first, in the same batch. Two listeners can miss the cache
  // on the same whisper at once, and `INSERT OR IGNORE` on (hash, part) let the
  // loser fill in every part the winner did not have — which served the front
  // of one reading joined to the tail of another. A batch is a transaction, so
  // one racer wins outright. (R2 needs none of this: a put replaces the whole
  // object, which is the same guarantee for free.)
  const now = Date.now();
  const rows = [env.DB.prepare(`DELETE FROM voice_chunks WHERE hash = ?`).bind(hash)];
  for (let i = 0, part = 0; i < bytes.length; i += CHUNK_BYTES, part += 1) {
    rows.push(
      env.DB.prepare(
        `INSERT INTO voice_chunks (hash, part, mime, data, created_at, voice)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(hash, part, mime, bytes.slice(i, i + CHUNK_BYTES), now, narrator)
    );
  }
  await env.DB.batch(rows);
  return 'd1';
}

// Both stores, always — a whisper being deleted must not leave its reading
// behind in whichever one it happens to be in.
export async function deleteVoice(env, hash) {
  if (env && env.VOICE_BUCKET) {
    try {
      await env.VOICE_BUCKET.delete(PREFIX + hash);
    } catch {
      /* the D1 copy below is the one that would otherwise still be served */
    }
  }
  await env.DB.prepare(`DELETE FROM voice_chunks WHERE hash = ?`).bind(hash).run();
}

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
