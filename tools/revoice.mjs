// Re-read the sky in the AYA brand voice, on the machine that has VoiceStudio.
//
// This has to run on the Windows box, because VoiceStudio listens on
// 127.0.0.1:3900 and that address exists only there. Nothing in the cloud can
// reach it — not this repo's CI, not the site, not me.
//
// What it does, per whisper: ask VoiceStudio for a WAV, run the brand EQ and
// de-esser over it, encode to AAC, and write it into a folder you can listen to.
// It does NOT upload anything and does NOT touch the live site. That is
// deliberate: the point of this pass is to hear the result before deciding
// whether the whole library gets re-read.
//
//   node tools/revoice.mjs                  # five whispers, to audition
//   node tools/revoice.mjs --all            # every whisper the sky returns
//   node tools/revoice.mjs --limit 20
//   node tools/revoice.mjs --id 482         # one specific whisper
//   node tools/revoice.mjs --text "试一句"   # no site needed at all
//
// Options worth knowing:
//   --studio http://127.0.0.1:3900   where VoiceStudio is
//   --site   https://cubewithin.com  where the whispers come from
//   --out    voice-out               folder to write into
//   --raw                            keep the untouched WAV beside the AAC,
//                                    so the EQ can be judged against it
//   --no-post                        skip ffmpeg entirely
//
// ⚠️ The EQ and de-esser below are my reading of "EQ + 去齿音" and are almost
// certainly not your exact chain. Replace FILTER with the one from the
// VoiceStudio doc — it is one string, and it is part of the voice, not a
// detail: if it changes later, every reading made before it sounds different.

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

// ---- the AYA Brand Voice recipe -------------------------------------------
// Fixed, and fixed together. Changing any one of these changes how every
// whisper sounds, so they are named in one place rather than scattered through
// the calls below.
const RECIPE = {
  model: 'omnivoice',
  voice: 'bf4d23ca',
  response_format: 'wav',
  speed: 1.2,
  seed: 42,
  guidance_scale: 2.0,
  instruct: 'moderate pitch',
};

// EQ + de-ess. Placeholder — see the warning above.
const FILTER = [
  // gentle low cut, so the close-mic warmth does not turn into rumble
  'highpass=f=70',
  // a little body back at 200Hz, a small presence lift at 4k
  'equalizer=f=200:t=q:w=1.0:g=1.5',
  'equalizer=f=4000:t=q:w=1.2:g=1.5',
  // de-esser: pull down the 5-8k band where sibilance lives
  'equalizer=f=6500:t=q:w=2.0:g=-4',
  // catch stray peaks without squashing the quiet parts
  'acompressor=threshold=-18dB:ratio=2:attack=5:release=120',
].join(',');

const AAC_BITRATE = '48k'; // what the site stores; speech, one quiet voice

// ---- arguments -------------------------------------------------------------
const argv = process.argv.slice(2);
function opt(name, fallback = null) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
}
const has = (name) => argv.includes(`--${name}`);

const STUDIO = (opt('studio', 'http://127.0.0.1:3900')).replace(/\/$/, '');
const SITE = (opt('site', 'https://cubewithin.com')).replace(/\/$/, '');
const OUT = opt('out', 'voice-out');
const ONE_TEXT = opt('text');
const ONE_ID = opt('id');
const LIMIT = has('all') ? 500 : Number(opt('limit', 5));
const KEEP_RAW = has('raw');
const POST = !has('no-post');

// ---- helpers ---------------------------------------------------------------
function slug(s, n = 40) {
  return String(s).replace(/\s+/g, ' ').trim().slice(0, n).replace(/[^\p{L}\p{N} ]/gu, '').replace(/ /g, '_');
}

function ffmpegAvailable() {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Which language to ask for. VoiceStudio takes a hint, and the hint matters —
// a Chinese whisper read as English comes out with an accent that is worse than
// any amount of EQ.
function languageOf(text) {
  return /[㐀-鿿぀-ヿ]/.test(text) ? 'zh' : 'en';
}

async function speak(text) {
  const body = { ...RECIPE, input: text, language: languageOf(text) };
  const res = await fetch(`${STUDIO}/v1/audio/speech`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`VoiceStudio ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1000) throw new Error(`suspiciously small response (${buf.length} bytes)`);
  // A WAV starts "RIFF....WAVE". Anything else means the endpoint answered with
  // something that is not audio, and encoding it would fail later and more
  // confusingly.
  if (buf.slice(0, 4).toString() !== 'RIFF') {
    throw new Error(`not a WAV (starts with ${JSON.stringify(buf.slice(0, 12).toString('latin1'))})`);
  }
  return buf;
}

// WAV in, AAC out, with the brand chain in between.
//
// The size difference is not cosmetic: WAV runs about 2.8MB a minute, AAC about
// 170KB. Uploading WAV would multiply the storage bill by roughly seventeen.
function post(wavPath, outPath) {
  execFileSync(
    'ffmpeg',
    ['-y', '-hide_banner', '-loglevel', 'error', '-i', wavPath, '-af', FILTER, '-c:a', 'aac', '-b:a', AAC_BITRATE, outPath],
    { stdio: ['ignore', 'ignore', 'pipe'] }
  );
}

function duration(path) {
  try {
    const out = execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', path],
      { encoding: 'utf8' }
    );
    return Number(out.trim()) || 0;
  } catch {
    return 0;
  }
}

async function whispers() {
  if (ONE_TEXT) return [{ id: 'sample', type: 'pain', content: ONE_TEXT }];
  if (ONE_ID) {
    const res = await fetch(`${SITE}/api/bubbles/${ONE_ID}`);
    if (!res.ok) throw new Error(`could not fetch whisper ${ONE_ID}: ${res.status}`);
    const data = await res.json();
    return [data.bubble];
  }
  const res = await fetch(`${SITE}/api/bubbles?limit=${LIMIT}`);
  if (!res.ok) throw new Error(`could not fetch the sky: ${res.status}`);
  const data = await res.json();
  return (data.bubbles || []).slice(0, LIMIT);
}

// ---- run -------------------------------------------------------------------
if (POST && !ffmpegAvailable()) {
  console.error('ffmpeg is not on PATH. Install it, or pass --no-post to write raw WAVs.');
  process.exit(1);
}
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

console.log(`studio : ${STUDIO}`);
console.log(`source : ${ONE_TEXT ? '(--text)' : SITE}`);
console.log(`out    : ${OUT}`);
console.log(`recipe : ${RECIPE.voice} · ${RECIPE.instruct} · speed ${RECIPE.speed} · guidance ${RECIPE.guidance_scale} · seed ${RECIPE.seed}`);
console.log(`post   : ${POST ? FILTER : '(skipped)'}\n`);

let list;
try {
  list = await whispers();
} catch (e) {
  console.error(`Could not get anything to read: ${e.message}`);
  process.exit(1);
}
if (!list.length) {
  console.error('Nothing to read.');
  process.exit(1);
}

let ok = 0;
const failures = [];
let wavBytes = 0;
let aacBytes = 0;

for (const [i, w] of list.entries()) {
  const text = String(w.content || '').trim();
  if (!text) continue;
  const name = `${String(w.id).padStart(4, '0')}_${slug(text)}`;
  const wavPath = join(OUT, `${name}.wav`);
  const aacPath = join(OUT, `${name}.m4a`);
  const head = `[${i + 1}/${list.length}] #${w.id} ${languageOf(text)} ${text.length} chars`;

  try {
    const started = Date.now();
    const wav = await speak(text);
    writeFileSync(wavPath, wav);
    wavBytes += wav.length;
    const secs = ((Date.now() - started) / 1000).toFixed(1);

    if (POST) {
      post(wavPath, aacPath);
      const { size } = await import('node:fs').then((fs) => fs.statSync(aacPath));
      aacBytes += size;
      if (!KEEP_RAW) await import('node:fs').then((fs) => fs.unlinkSync(wavPath));
      console.log(`${head} → ${(size / 1024).toFixed(0)}KB, ${duration(aacPath).toFixed(1)}s, ${secs}s to make`);
    } else {
      console.log(`${head} → ${(wav.length / 1024).toFixed(0)}KB wav, ${secs}s to make`);
    }
    ok += 1;
  } catch (e) {
    failures.push({ id: w.id, why: e.message });
    console.log(`${head} → FAILED: ${e.message}`);
  }
}

console.log(`\n${ok}/${list.length} read`);
if (POST && aacBytes) {
  console.log(`wav ${(wavBytes / 1048576).toFixed(1)}MB → aac ${(aacBytes / 1048576).toFixed(1)}MB (${(wavBytes / aacBytes).toFixed(1)}x smaller)`);
  console.log(`average ${(aacBytes / ok / 1024).toFixed(0)}KB a reading — the site's current average is 169KB`);
}
if (failures.length) {
  console.log('\nfailed:');
  for (const f of failures) console.log(`  #${f.id}: ${f.why}`);
}
console.log(`\nListen to what is in ${OUT}/ before anything is uploaded anywhere.`);
process.exit(failures.length && !ok ? 1 : 0);
