// Re-read the sky in the AYA brand voice, on the machine that has VoiceStudio.
//
// This has to run on the Windows box, because VoiceStudio listens on
// 127.0.0.1:3900 and that address exists only there. Nothing in the cloud can
// reach it — not this repo's CI, not the site, not me.
//
// What it does, per whisper: ask VoiceStudio for a WAV, run the brand EQ and
// de-esser over it, encode to AAC, and write it into a folder you can listen to
// — and, with --upload, send it to the site so that it becomes the reading
// everyone gets. Without --upload it touches nothing live, which is the
// default on purpose: hear the result before the whole library is re-read in
// it.
//
//   node tools/revoice.mjs                  # five whispers, to audition
//   node tools/revoice.mjs --all            # every whisper the sky returns
//   node tools/revoice.mjs --limit 20
//   node tools/revoice.mjs --id 482         # one specific whisper
//   node tools/revoice.mjs --text "试一句"   # no site needed at all
//
// And, once the audition sounds right, the whole point of it:
//
//   node tools/revoice.mjs --all --upload   # read the entire sky, in our voice
//
// --upload sends each finished reading to /api/voice/backfill, where it becomes
// what everyone hears when they press Listen. It needs VOICE_UPLOAD_TOKEN (or
// --token). Nothing is uploaded without it — the default is still an audition
// that touches nothing.
//
// It is safe to stop it and run it again. Every reading that lands is recorded
// in <out>/read.json, and a second run skips what is already done. It also
// notices when the RECIPE or the ffmpeg chain below has changed and re-reads
// what was made with the old one, so the library can never end up half in one
// voice and half in another.
//
// Options worth knowing:
//   --studio http://127.0.0.1:3900   where VoiceStudio is
//   --site   https://cubewithin.com  where the whispers come from
//   --out    voice-out               folder to write into
//   --token  <secret>                VOICE_UPLOAD_TOKEN, for --upload
//   --force                          re-read whispers already done
//   --raw                            keep the untouched WAV beside the AAC,
//                                    so the EQ can be judged against it
//   --no-post                        skip ffmpeg entirely
//
// ⚠️ The EQ and de-esser below are my reading of "EQ + 去齿音" and are almost
// certainly not your exact chain. Replace FILTER with the one from the
// VoiceStudio doc — it is one string, and it is part of the voice, not a
// detail.
//
// Replacing it is safe now, and this is how: RECIPE and FILTER are hashed
// together into a recipe id, and that id is written next to every reading in
// <out>/read.json. Change either one and the next run treats everything made
// under the old id as unread and does it again. So the honest answer to "what
// happens if the chain turns out to be wrong" is: fix the string, run the same
// command, walk away. What cannot happen is the thing that would have been
// unfixable — a library where half the whispers are in one timbre and half in
// another with no way to tell which is which.

import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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
const LIMIT = has('all') || has('setup') ? 100000 : Number(opt('limit', 5));
const KEEP_RAW = has('raw');
const POST = !has('no-post');
// --setup is what the desktop runner passes. It means: this is somebody's own
// machine, do everything that machine needs doing — find the token, install
// what is missing, arrange to run again tomorrow — and then read the whole sky.
//
// All of it lives here rather than in revoice.bat on purpose. The batch file
// tried to do the token prompt itself once, in a nest of parenthesised IF
// blocks, written by someone with no Windows to test on. It fell through to the
// end without ever asking. This file can be run; that is the whole argument.
const SETUP = has('setup');
const UPLOAD = has('upload') || SETUP;
const FORCE = has('force');
const HERE = dirname(fileURLToPath(import.meta.url));
const TOKEN_FILE = join(HERE, 'token.txt');
let TOKEN = opt('token', process.env.VOICE_UPLOAD_TOKEN || '');

// What made a reading, as one short id. RECIPE and FILTER are one thing, not
// two: both change how a whisper sounds, and a library is only consistent if
// every file in it was made by the same pair. Written beside each reading in
// the ledger below, and compared on the next run.
const RECIPE_ID = createHash('sha256')
  .update(JSON.stringify(RECIPE))
  .update(POST ? FILTER : 'no-post')
  .update(AAC_BITRATE)
  .digest('hex')
  .slice(0, 12);

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

// ---- the ledger ------------------------------------------------------------
//
// Which whispers have been read, and by which recipe. It lives in the output
// folder rather than anywhere clever because that is where the audio is: throw
// the folder away and the run starts over, which is the behaviour anyone would
// expect from a folder called voice-out.
//
// Keyed on the whisper's id, and that is now the whole of it. The site files a
// brand reading under the id too (brandVoiceKey), so the id is the identity of
// the audio rather than a label on it — and an author can edit nothing after
// posting, so there is no text to drift out from under it.
//
// This used to also compare a hash of the words. Dropping that is what stops the
// change of key from re-reading eighty-four whispers on a GPU for no reason: the
// readings already uploaded are already the right readings.
const LEDGER = join(OUT, 'read.json');

function loadLedger() {
  try {
    const data = JSON.parse(readFileSync(LEDGER, 'utf8'));
    return data && data.done ? data : { version: 1, done: {} };
  } catch {
    return { version: 1, done: {} };
  }
}

function saveLedger(ledger) {
  writeFileSync(LEDGER, JSON.stringify(ledger, null, 2));
}

function alreadyRead(ledger, w) {
  if (FORCE) return false;
  const seen = ledger.done[String(w.id)];
  return !!seen && seen.recipe === RECIPE_ID;
}

// ---- talking to the site ---------------------------------------------------
function siteHeaders() {
  return { 'x-voice-token': TOKEN };
}

// Every whisper on the site, in id order.
//
// Deliberately not /api/bubbles: that is the sky feed — a per-viewer weighted
// sample with a cap on it (docs/SKY_FEED.md). Reading "everything it returns"
// would quietly miss most of the site, and miss a different part of it on every
// run, which is the worst possible failure for a job whose whole purpose is
// leaving nothing out.
async function everyWhisper() {
  const all = [];
  let after = 0;
  let total = null;
  let made = null;
  for (;;) {
    const res = await fetch(`${SITE}/api/voice/backfill?after=${after}&limit=200`, {
      headers: siteHeaders(),
    });
    if (res.status === 401) throw new Error('the site did not accept the token (VOICE_UPLOAD_TOKEN)');
    if (res.status === 503) throw new Error('the site has no VOICE_UPLOAD_TOKEN set — see docs/ROADMAP.md §7f');
    if (!res.ok) throw new Error(`could not list the sky: ${res.status}`);
    const page = await res.json();
    if (total === null) { total = page.total; made = page.made; }
    all.push(...(page.bubbles || []).map((b) => ({ ...b, content: b.text })));
    if (!page.next || all.length >= LIMIT) break;
    after = page.next;
  }
  return { list: all.slice(0, LIMIT), total, made };
}

async function upload(id, path, mime = 'audio/aac') {
  const res = await fetch(`${SITE}/api/voice/backfill?id=${id}`, {
    method: 'POST',
    headers: { ...siteHeaders(), 'content-type': mime },
    body: readFileSync(path),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) {
    throw new Error(`upload rejected (${res.status}) ${body.error || ''}`.trim());
  }
  return body;
}

async function whispers() {
  if (ONE_TEXT) return { list: [{ id: 'sample', type: 'pain', content: ONE_TEXT }] };
  if (ONE_ID) {
    const res = await fetch(`${SITE}/api/bubbles/${ONE_ID}`);
    if (!res.ok) throw new Error(`could not fetch whisper ${ONE_ID}: ${res.status}`);
    const data = await res.json();
    return { list: [data.bubble] };
  }
  // Uploading reads the whole library, so it needs the whole library. An
  // audition is allowed to be a handful off the front page.
  if (UPLOAD) return await everyWhisper();
  const res = await fetch(`${SITE}/api/bubbles?limit=${LIMIT}`);
  if (!res.ok) throw new Error(`could not fetch the sky: ${res.status}`);
  const data = await res.json();
  return { list: (data.bubbles || []).slice(0, LIMIT) };
}

// ---- setting a machine up, once ---------------------------------------------
//
// Everything in this section used to be attempted in revoice.bat. It is here
// because this file can be executed and checked and that one could not.

const TASK_NAME = 'Are you alright - read new whispers';

async function askOnce(question) {
  // A scheduled run has no console attached. Asking there would hang the task
  // until the machine reboots, and every following night would be skipped.
  if (!process.stdin.isTTY) return '';
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

// --token, then the environment, then what was saved last time, then a person.
// Saved beside this file rather than anywhere clever: delete the folder and the
// setup is gone, which is what anyone would expect of a folder they made.
async function resolveToken() {
  if (TOKEN) return TOKEN;
  if (existsSync(TOKEN_FILE)) {
    const saved = readFileSync(TOKEN_FILE, 'utf8').trim();
    if (saved) return saved;
  }
  console.log('This needs the upload token, once.');
  console.log('It is the value of the GitHub secret VOICE_UPLOAD_TOKEN.\n');
  const typed = await askOnce('  Paste it here and press Enter: ');
  if (!typed) return '';
  writeFileSync(TOKEN_FILE, typed);
  console.log(`\n  Saved to ${TOKEN_FILE}. It will not ask again.\n`);
  return typed;
}

// Returns 'ok' | 'installed-restart' | 'missing'.
//
// 'installed-restart' is its own answer because a freshly installed ffmpeg is
// not on THIS process's PATH — the environment was inherited before it existed.
// Carrying on would look like the install had failed.
function ensureFfmpeg() {
  if (ffmpegAvailable()) return 'ok';
  if (process.platform !== 'win32') return 'missing';
  console.log('ffmpeg is missing. Installing it, once...\n');
  try {
    execFileSync(
      'winget',
      ['install', '--id', 'Gyan.FFmpeg', '-e', '--accept-source-agreements', '--accept-package-agreements'],
      { stdio: 'inherit' }
    );
  } catch {
    /* reported by the caller */
  }
  return ffmpegAvailable() ? 'ok' : 'installed-restart';
}

// The answer to "do I have to do this every time". Registered once; the guard
// is a query rather than /f alone, so repeated runs do not pile up tasks.
function scheduleNightly() {
  if (process.platform !== 'win32') return 'not-windows';
  const bat = join(HERE, 'read-the-sky.bat');
  if (!existsSync(bat)) return 'no-runner';
  try {
    execFileSync('schtasks', ['/query', '/tn', TASK_NAME], { stdio: 'ignore' });
    return 'already';
  } catch {
    /* not registered yet */
  }
  try {
    execFileSync(
      'schtasks',
      ['/create', '/tn', TASK_NAME, '/tr', `"${bat}" --scheduled`, '/sc', 'daily', '/st', '03:00', '/f'],
      { stdio: 'ignore' }
    );
    return 'created';
  } catch {
    return 'failed';
  }
}

if (SETUP) {
  TOKEN = await resolveToken();
  if (!TOKEN) {
    console.error('No token, so nothing could be uploaded. Run this again and paste it.');
    process.exit(1);
  }

  const ff = ensureFfmpeg();
  if (ff === 'installed-restart') {
    console.log('ffmpeg is installed. Close this window and open it again — that is');
    console.log('the only way this run can see it. Nothing else will need doing.');
    process.exit(0);
  }
  if (ff === 'missing') {
    console.error('ffmpeg is not installed and could not be installed automatically.');
    console.error('Install it once from https://www.gyan.dev/ffmpeg/builds/ and run this again.');
    process.exit(1);
  }

  const when = scheduleNightly();
  if (when === 'created') console.log('Scheduled: new whispers are read every night at 3am.\n');
  if (when === 'failed') console.log('[note] could not schedule the nightly run; open this whenever you like.\n');
}

// ---- run -------------------------------------------------------------------
if (POST && !ffmpegAvailable()) {
  console.error('ffmpeg is not on PATH. Install it, or pass --no-post to write raw WAVs.');
  process.exit(1);
}
// A WAV is about seventeen times the size of the AAC of the same reading.
// Uploading one would multiply the storage bill by that, permanently, for audio
// nobody can hear the difference in over a phone speaker.
if (UPLOAD && !POST) {
  console.error('--upload needs the ffmpeg pass: raw WAV is ~17x the size for no audible gain.');
  process.exit(1);
}
if (UPLOAD && !TOKEN) {
  console.error('--upload needs VOICE_UPLOAD_TOKEN (or --token). Nothing was sent.');
  process.exit(1);
}
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

console.log(`studio : ${STUDIO}`);
console.log(`source : ${ONE_TEXT ? '(--text)' : SITE}`);
console.log(`out    : ${OUT}`);
console.log(`recipe : ${RECIPE.voice} · ${RECIPE.instruct} · speed ${RECIPE.speed} · guidance ${RECIPE.guidance_scale} · seed ${RECIPE.seed}  [${RECIPE_ID}]`);
console.log(`post   : ${POST ? FILTER : '(skipped)'}`);
console.log(`upload : ${UPLOAD ? `${SITE}/api/voice/backfill` : 'no — nothing live is touched'}\n`);

let list;
let sky = {};
try {
  sky = await whispers();
  list = sky.list;
} catch (e) {
  console.error(`Could not get anything to read: ${e.message}`);
  process.exit(1);
}
if (!list.length) {
  console.error('Nothing to read.');
  process.exit(1);
}
if (UPLOAD && sky.total != null) {
  console.log(`the sky holds ${sky.total} whispers; ${sky.made} are already in our voice\n`);
}

const ledger = loadLedger();

let ok = 0;
let skipped = 0;
let uploaded = 0;
const failures = [];
let wavBytes = 0;
let aacBytes = 0;

for (const [i, w] of list.entries()) {
  const text = String(w.content || '').trim();
  if (!text) continue;
  const head = `[${i + 1}/${list.length}] #${w.id} ${languageOf(text)} ${text.length} chars`;

  // Resuming is the normal case, not the exception: reading a whole sky on one
  // GPU takes long enough that it will be interrupted.
  if (UPLOAD && alreadyRead(ledger, w)) {
    skipped += 1;
    continue;
  }

  const name = `${String(w.id).padStart(4, '0')}_${slug(text)}`;
  const wavPath = join(OUT, `${name}.wav`);
  const aacPath = join(OUT, `${name}.m4a`);

  try {
    const started = Date.now();
    const wav = await speak(text);
    writeFileSync(wavPath, wav);
    wavBytes += wav.length;
    const secs = ((Date.now() - started) / 1000).toFixed(1);

    let line;
    if (POST) {
      post(wavPath, aacPath);
      const { size } = statSync(aacPath);
      aacBytes += size;
      if (!KEEP_RAW) unlinkSync(wavPath);
      line = `${head} → ${(size / 1024).toFixed(0)}KB, ${duration(aacPath).toFixed(1)}s, ${secs}s to make`;
    } else {
      line = `${head} → ${(wav.length / 1024).toFixed(0)}KB wav, ${secs}s to make`;
    }

    if (UPLOAD) {
      // Recorded only after the site has confirmed it, and saved immediately.
      // A ledger written ahead of the upload would let a crash lose a reading
      // and claim it was done — the one failure a resume cannot recover from.
      const sent = await upload(w.id, aacPath);
      ledger.done[String(w.id)] = { recipe: RECIPE_ID, hash: sent.hash, bytes: sent.bytes, at: Date.now() };
      saveLedger(ledger);
      uploaded += 1;
      line += ` → sent (${sent.store})`;
    }

    console.log(line);
    ok += 1;
  } catch (e) {
    failures.push({ id: w.id, why: e.message });
    console.log(`${head} → FAILED: ${e.message}`);
  }
}

console.log(`\n${ok}/${list.length} read${skipped ? `, ${skipped} already done` : ''}`);
if (POST && aacBytes) {
  console.log(`wav ${(wavBytes / 1048576).toFixed(1)}MB → aac ${(aacBytes / 1048576).toFixed(1)}MB (${(wavBytes / aacBytes).toFixed(1)}x smaller)`);
  console.log(`average ${(aacBytes / ok / 1024).toFixed(0)}KB a reading — the site's current average is 169KB`);
}
if (failures.length) {
  console.log('\nfailed:');
  for (const f of failures) console.log(`  #${f.id}: ${f.why}`);
  console.log('\nRun the same command again — what succeeded is recorded and will be skipped.');
}
if (UPLOAD) {
  console.log(`\n${uploaded} sent. They are what Listen plays from now on.`);
} else {
  console.log(`\nListen to what is in ${OUT}/ before anything is uploaded anywhere.`);
  console.log('When it sounds right: node tools/revoice.mjs --all --upload');
}
process.exit(failures.length && !ok ? 1 : 0);
