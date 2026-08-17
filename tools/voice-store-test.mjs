// Both shelves, in memory: R2 present and absent, plus the fallback read.
//
// Storage swaps are the kind of change that looks fine and loses everything
// somebody already paid to generate, and this one cannot be tried out on the
// live site — the bucket has to exist first. So the two stores are exercised
// against fakes here, with the case that actually matters kept honest: a
// reading written before the bucket existed must still play after it is bound.
//
//   node tools/voice-store-test.mjs
import { readVoice, writeVoice, deleteVoice, voiceStore } from '../src/voice-store.js';

// A D1 double that actually records inserts, so the fallback path is real.
function makeDB() {
  const store = new Map();
  return {
    store,
    prepare(sql) {
      const st = {
        bind(...a) { st.args = a; return st; },
        async all() {
          if (/SELECT mime, data, voice/.test(sql)) return { results: store.get(st.args[0]) || [] };
          return { results: [] };
        },
        async run() {
          if (/DELETE FROM voice_chunks/.test(sql)) store.delete(st.args[0]);
          return {};
        },
        sql,
      };
      return st;
    },
    async batch(stmts) {
      for (const s of stmts) {
        if (/DELETE FROM voice_chunks/.test(s.sql)) store.delete(s.args[0]);
        if (/INSERT INTO voice_chunks/.test(s.sql)) {
          const [hash, part, mime, data, , voice] = s.args;
          const rows = store.get(hash) || [];
          rows[part] = { mime, data, voice };
          store.set(hash, rows);
        }
      }
    },
  };
}

function makeBucket() {
  const objects = new Map();
  return {
    objects,
    async put(key, bytes, opts) { objects.set(key, { bytes, opts }); },
    async get(key) {
      const o = objects.get(key);
      if (!o) return null;
      return {
        async arrayBuffer() { return o.bytes.buffer.slice(o.bytes.byteOffset, o.bytes.byteOffset + o.bytes.byteLength); },
        httpMetadata: { contentType: o.opts.httpMetadata.contentType },
        customMetadata: o.opts.customMetadata,
      };
    },
    async delete(key) { objects.delete(key); },
  };
}

const bytes = new Uint8Array(1_500_000).fill(7); // bigger than one D1 row
// 1. No bucket → D1, split across rows, read back whole.
{
  const env = { DB: makeDB() };
  console.log(voiceStore(env) === 'd1' ? 'PASS  no bucket → D1' : 'FAIL  store name');
  await writeVoice(env, 'h1', bytes, 'audio/mpeg', 'warm_female');
  const rows = env.DB.store.get('h1');
  const back = await readVoice(env, 'h1');
  console.log(rows.length === 2 ? 'PASS  D1 splits a long reading into rows' : `FAIL  rows=${rows.length}`);
  console.log(back && back.bytes.length === bytes.length && back.from === 'd1' ? 'PASS  D1 reads back whole' : 'FAIL  D1 read');
}

// 2. Bucket bound → R2, one object, no D1 writes at all.
{
  const env = { DB: makeDB(), VOICE_BUCKET: makeBucket() };
  console.log(voiceStore(env) === 'r2' ? 'PASS  bucket bound → R2' : 'FAIL  store name');
  await writeVoice(env, 'h2', bytes, 'audio/aac', 'gentle_male');
  const back = await readVoice(env, 'h2');
  console.log(env.VOICE_BUCKET.objects.size === 1 && env.DB.store.size === 0 ? 'PASS  R2 keeps audio out of the database' : 'FAIL  wrote to D1 anyway');
  console.log(back && back.from === 'r2' && back.mime === 'audio/aac' && back.voice === 'gentle_male' ? 'PASS  R2 read keeps mime and narrator' : 'FAIL  R2 read');
}

// 3. Written before the bucket existed → still plays after it is bound.
{
  const env = { DB: makeDB() };
  await writeVoice(env, 'old', bytes, 'audio/mpeg', 'warm_female');
  env.VOICE_BUCKET = makeBucket(); // the day the bucket is switched on
  const back = await readVoice(env, 'old');
  console.log(back && back.from === 'd1' ? 'PASS  old readings still play after the switch' : 'FAIL  lost the old reading');
}

// 4. Deleting a whisper clears both shelves.
{
  const env = { DB: makeDB(), VOICE_BUCKET: makeBucket() };
  await writeVoice(env, 'x', bytes, 'audio/mpeg', 'warm_female');
  env.DB.store.set('x', [{ mime: 'audio/mpeg', data: bytes, voice: 'warm_female' }]); // a stale D1 copy
  await deleteVoice(env, 'x');
  const back = await readVoice(env, 'x');
  console.log(!back ? 'PASS  delete clears R2 and D1' : `FAIL  still readable from ${back.from}`);
}
