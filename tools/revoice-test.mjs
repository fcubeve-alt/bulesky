// The whole sky, re-read in our own voice — exercised end to end, here.
//
// The reading itself happens on one Windows machine: VoiceStudio listens on
// 127.0.0.1:3900 and nothing in the cloud can reach it, so the one thing this
// cannot check is how the voice sounds. Everything AROUND that is checkable and
// is checked here, because the alternative is finding out during a run that
// takes a night on a GPU.
//
// Three parts:
//   1. the door  — functions/api/voice/backfill.js against fake D1 and R2
//   2. Listen    — that an uploaded reading is what a listener actually gets
//   3. the pass  — tools/revoice.mjs against a fake VoiceStudio and a fake site
//
//   node tools/revoice-test.mjs

import { createServer } from 'node:http';
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, writeFileSync, readFileSync, chmodSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brandVoiceHash, BRAND_PREFIX } from '../src/tts.js';
import { readVoice } from '../src/voice-store.js';
import { onRequestGet, onRequestPost, onRequestHead } from '../functions/api/voice/backfill.js';
import { onRequestGet as listen } from '../functions/api/voice/[id].js';

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` (${detail})` : ''}`);
}

const TOKEN = 'a-token-that-is-not-the-admin-password';

// ---- fakes ------------------------------------------------------------------
const SKY = [
  { id: 1, type: 'pain', content: '我还是会偷偷跟你说话。', hidden: 0 },
  { id: 2, type: 'wish', content: 'I hope the morning is kind to you.', hidden: 0 },
  { id: 3, type: 'pain', content: '这条被藏起来了', hidden: 1 },
  { id: 4, type: 'wish', content: '第四条,用来跨过分页边界。', hidden: 0 },
  { id: 5, type: 'pain', content: '   ', hidden: 0 },
];

function makeEnv({ token = TOKEN } = {}) {
  const r2 = new Map();
  const db = {
    prepare(sql) {
      const st = {
        bind(...a) { st.args = a; return st; },
        async all() {
          if (/FROM bubbles/.test(sql)) {
            const [after, limit] = st.args;
            const rows = SKY.filter((b) => !b.hidden && b.content.trim() && b.id > after)
              .sort((x, y) => x.id - y.id)
              .slice(0, limit);
            return { results: rows };
          }
          return { results: [] };
        },
        async first() {
          if (/COUNT\(\*\) AS n FROM bubbles/.test(sql)) {
            return { n: SKY.filter((b) => !b.hidden && b.content.trim()).length };
          }
          if (/COUNT\(DISTINCT hash\)/.test(sql)) return { n: 0 };
          if (/FROM bubbles WHERE id = \?/.test(sql)) {
            return SKY.find((b) => b.id === st.args[0] && !b.hidden) || null;
          }
          return null;
        },
      };
      return st;
    },
  };
  return {
    DB: db,
    VOICE_UPLOAD_TOKEN: token,
    VOICE_BUCKET: {
      _map: r2,
      async put(key, bytes, opts) { r2.set(key, { bytes, opts }); },
      async get(key) {
        const o = r2.get(key);
        if (!o) return null;
        return {
          arrayBuffer: async () => o.bytes.buffer.slice(o.bytes.byteOffset, o.bytes.byteOffset + o.bytes.byteLength),
          httpMetadata: o.opts.httpMetadata,
          customMetadata: o.opts.customMetadata,
        };
      },
      async list({ prefix }) {
        return { objects: [...r2.keys()].filter((k) => k.startsWith(prefix)).map((k) => ({ key: k })), truncated: false };
      },
    },
  };
}

const req = (url, init = {}) => new Request(`https://cubewithin.com${url}`, init);
const withToken = (t = TOKEN) => ({ 'x-voice-token': t });

// ---- 1. the door ------------------------------------------------------------
{
  const env = makeEnv();

  // A token that is its own secret, and refuses everything without it. It ends
  // up in a shell history on a desktop machine; the admin password must not.
  const anon = await onRequestGet({ request: req('/api/voice/backfill'), env });
  check('the door is shut without the upload token', anon.status === 401);

  const wrong = await onRequestGet({ request: req('/api/voice/backfill', { headers: withToken('nope') }), env });
  check('and shut for the wrong one', wrong.status === 401);

  const unset = await onRequestGet({
    request: req('/api/voice/backfill', { headers: withToken() }),
    env: makeEnv({ token: '' }),
  });
  check('and says so plainly when the site has no token set', unset.status === 503);

  // The list is the whole library, in id order — not the sky feed, which is a
  // weighted per-viewer sample and would leave most of the site unread.
  const page1 = await (await onRequestGet({
    request: req('/api/voice/backfill?after=0&limit=2', { headers: withToken() }),
    env,
  })).json();
  check('it lists whispers in id order, a page at a time', page1.bubbles.map((b) => b.id).join(',') === '1,2', page1.bubbles.map((b) => b.id).join(','));
  check('and says where to carry on from', page1.next === 2, String(page1.next));
  check('and how many there are in total', page1.total === 3, String(page1.total));

  const page2 = await (await onRequestGet({
    request: req(`/api/voice/backfill?after=${page1.next}&limit=2`, { headers: withToken() }),
    env,
  })).json();
  const seen = [...page1.bubbles, ...page2.bubbles].map((b) => b.id);
  check('paging reaches the end and stops', page2.next === null && seen.join(',') === '1,2,4', seen.join(','));
  // Hidden whispers are refused a voice by /api/voice/{id}; generating one for
  // them behind the site's back would be the same mistake, later.
  check('a hidden whisper is never offered for reading', !seen.includes(3));
  check('and neither is an empty one', !seen.includes(5));

  // The key is derived here, from the whisper's own text. The caller sends an
  // id and bytes and cannot choose what words its audio ends up attached to.
  const audio = new Uint8Array(4096).fill(7);
  const sent = await (await onRequestPost({
    request: req('/api/voice/backfill?id=1', { method: 'POST', headers: { ...withToken(), 'content-type': 'audio/aac' }, body: audio }),
    env,
  })).json();
  const expected = await brandVoiceHash(SKY[0].content, SKY[0].type);
  check('an upload is filed under the whisper it names, keyed by that whisper\'s own words', sent.ok && sent.hash === expected);
  check('and the key says out loud that it is ours, so the shelf can be counted', expected.startsWith(BRAND_PREFIX));

  const stored = await readVoice(env, expected);
  check('and it is where Listen looks for it', !!stored && stored.bytes.length === 4096 && stored.voice === 'aya');

  const after = await (await onRequestGet({ request: req('/api/voice/backfill', { headers: withToken() }), env })).json();
  check('the count of what has been read goes up', after.made === 1, String(after.made));

  const head = await onRequestHead({ request: req('/api/voice/backfill?id=1', { headers: withToken() }), env });
  const head2 = await onRequestHead({ request: req('/api/voice/backfill?id=2', { headers: withToken() }), env });
  check('one whisper can be asked about without downloading it', head.status === 200 && head2.status === 404);

  // Never store something that will not play. The synthesis path has had this
  // floor since a provider answered with an error body and it was cached
  // forever as a permanently broken reading.
  const tiny = await onRequestPost({
    request: req('/api/voice/backfill?id=2', { method: 'POST', headers: { ...withToken(), 'content-type': 'audio/aac' }, body: new Uint8Array(10) }),
    env,
  });
  check('audio too short to be a reading is refused', tiny.status === 400);

  const notAudio = await onRequestPost({
    request: req('/api/voice/backfill?id=2', { method: 'POST', headers: { ...withToken(), 'content-type': 'application/json' }, body: '{}' }),
    env,
  });
  check('and so is anything that is not audio at all', notAudio.status === 415);

  const gone = await onRequestPost({
    request: req('/api/voice/backfill?id=3', { method: 'POST', headers: { ...withToken(), 'content-type': 'audio/aac' }, body: audio }),
    env,
  });
  check('a hidden whisper cannot be given a voice through the back door', gone.status === 404);
}

// ---- 2. Listen --------------------------------------------------------------
//
// The assertion the whole backfill rests on. Everything else can be right — the
// door open, the audio filed, the ledger honest — and it is all dead weight if
// /api/voice/{id} does not look for the brand reading before it reaches for a
// machine one. If this breaks, a library that took a night on a GPU is silently
// never played and nothing anywhere says so.
//
// Proved by taking every provider away. With no relay key and no Workers AI
// binding the endpoint has exactly one way to answer with audio, and that is
// the reading we put there.
{
  const env = makeEnv();
  const bubble = SKY[0];
  const bytes = new Uint8Array(4096).fill(9);
  await onRequestPost({
    request: req('/api/voice/backfill?id=1', { method: 'POST', headers: { ...withToken(), 'content-type': 'audio/aac' }, body: bytes }),
    env,
  });

  const heard = await listen({ request: req('/api/voice/1'), params: { id: '1' }, env });
  const type = heard.headers.get('content-type') || '';
  check('a whisper we have read is answered with our reading, with no provider configured',
    heard.status === 200 && type.startsWith('audio/'), `${heard.status} ${type}`);
  check('and it is the bytes that were uploaded', (await heard.arrayBuffer()).byteLength === 4096);

  // The client decides what it got by content-type (CLAUDE.md), so a whisper we
  // have NOT read must still say so as JSON rather than as a broken button.
  const notYet = await listen({ request: req('/api/voice/2'), params: { id: '2' }, env });
  check('and one we have not read still degrades politely instead of breaking',
    notYet.status === 200 && /json/.test(notYet.headers.get('content-type') || ''),
    (await notYet.json()).error);
}

// ---- 3. the pass ------------------------------------------------------------
// A fake VoiceStudio, a fake site, and a stand-in ffmpeg. What is being checked
// is the orchestration — everything reached, nothing done twice, nothing lost
// on a crash, a changed recipe re-read — not the sound.
const work = mkdtempSync(join(tmpdir(), 'revoice-'));
const bin = join(work, 'bin');
execFileSync('mkdir', ['-p', bin]);

// Enough of a WAV to satisfy the tool's own sanity checks.
const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVEfmt '), Buffer.alloc(8192, 1)]);

// -version has to answer, because that is how the tool decides ffmpeg exists.
// Otherwise: copy whatever followed -i to the last argument, which is the shape
// of the real call and enough to carry a file through the pass.
writeFileSync(
  join(bin, 'ffmpeg'),
  '#!/bin/sh\ncase "$1" in -version) echo stub; exit 0;; esac\nfor a in "$@"; do p="$l"; l="$a"; [ "$p" = "-i" ] && i="$a"; done\ncp "$i" "$l"\n'
);
writeFileSync(join(bin, 'ffprobe'), '#!/bin/sh\necho 3.2\n');
chmodSync(join(bin, 'ffmpeg'), 0o755);
chmodSync(join(bin, 'ffprobe'), 0o755);

const uploads = [];
let studioCalls = 0;
const studio = createServer((rq, rs) => {
  studioCalls += 1;
  rs.writeHead(200, { 'content-type': 'audio/wav' });
  rs.end(wav);
});
const site = createServer((rq, rs) => {
  const url = new URL(rq.url, 'http://x');
  if (rq.headers['x-voice-token'] !== TOKEN) { rs.writeHead(401).end('{}'); return; }
  if (rq.method === 'GET') {
    const after = Number(url.searchParams.get('after') || 0);
    const limit = Number(url.searchParams.get('limit') || 100);
    const rows = SKY.filter((b) => !b.hidden && b.content.trim() && b.id > after).slice(0, limit);
    Promise.all(rows.map(async (b) => ({ id: b.id, type: b.type, text: b.content, hash: await brandVoiceHash(b.content, b.type) })))
      .then((bubbles) => {
        rs.writeHead(200, { 'content-type': 'application/json' });
        rs.end(JSON.stringify({ bubbles, next: bubbles.length === limit ? bubbles.at(-1).id : null, total: 3, made: uploads.length, store: 'r2' }));
      });
    return;
  }
  const body = [];
  rq.on('data', (c) => body.push(c));
  rq.on('end', async () => {
    const bytes = Buffer.concat(body);
    const id = Number(url.searchParams.get('id'));
    const b = SKY.find((x) => x.id === id);
    uploads.push({ id, bytes: bytes.length, mime: rq.headers['content-type'] });
    rs.writeHead(200, { 'content-type': 'application/json' });
    // The real endpoint files under the key it derives from the whisper's own
    // words and reports that key back. The uploader records it and compares it
    // to the listing on the next run, so a fake that invented a key here would
    // make resuming look broken when it is not.
    rs.end(JSON.stringify({ ok: true, hash: await brandVoiceHash(b.content, b.type), bytes: bytes.length, store: 'r2' }));
  });
});
await new Promise((r) => studio.listen(0, r));
await new Promise((r) => site.listen(0, r));
const STUDIO = `http://127.0.0.1:${studio.address().port}`;
const SITE = `http://127.0.0.1:${site.address().port}`;
const OUT = join(work, 'voice-out');

// Asynchronously, and that is not a style preference: the fake VoiceStudio and
// the fake site are HTTP servers in THIS process. execFileSync blocks the event
// loop, so a synchronous child would sit waiting for answers that cannot be
// sent until it exits. It deadlocks, silently, and looks like a slow GPU.
const exec = promisify(execFile);
async function run(args, env = {}) {
  const opts = {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, ...env },
  };
  try {
    const { stdout } = await exec('node', ['tools/revoice.mjs', '--studio', STUDIO, '--site', SITE, '--out', OUT, ...args], opts);
    return stdout;
  } catch (e) {
    // A non-zero exit is an outcome worth asserting on, not a crash.
    e.output = `${e.stdout || ''}${e.stderr || ''}`;
    throw e;
  }
}

try {
  // Nothing live is touched unless it is asked for. The default is an audition.
  let out = '';
  try { out = await run(['--all', '--upload']); } catch (e) { out = e.output; }
  check('--upload without a token sends nothing and says why', uploads.length === 0 && /VOICE_UPLOAD_TOKEN/.test(out));

  out = await run(['--all', '--upload', '--token', TOKEN]);
  check('every whisper in the library is read, hidden and empty ones left out',
    uploads.map((u) => u.id).join(',') === '1,2,4', uploads.map((u) => u.id).join(','));
  check('and each arrives as audio, not as a wall of base64',
    uploads.every((u) => u.mime === 'audio/aac' && u.bytes > 2048));
  check('and the run says what it did', /3 sent/.test(out));

  // The normal case, not the exception: a sky takes long enough to read that
  // the run will be interrupted.
  const before = uploads.length;
  const callsBefore = studioCalls;
  out = await run(['--all', '--upload', '--token', TOKEN]);
  check('running it again sends nothing and asks the GPU for nothing',
    uploads.length === before && studioCalls === callsBefore, `${uploads.length - before} sent`);
  check('and says how much it skipped', /3 already done/.test(out));

  // The one that makes the guessed EQ chain safe to replace: change what made a
  // reading, and it stops counting as done.
  const ledgerPath = join(OUT, 'read.json');
  const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));
  for (const k of Object.keys(ledger.done)) ledger.done[k].recipe = 'an-older-recipe';
  writeFileSync(ledgerPath, JSON.stringify(ledger));
  await run(['--all', '--upload', '--token', TOKEN]);
  check('a changed recipe re-reads what the old one made, so two timbres cannot coexist',
    uploads.length === before + 3, `${uploads.length - before} re-sent`);

  // Uploading a WAV would multiply the storage bill by ~17 for no audible gain.
  let refused = '';
  try { await run(['--all', '--upload', '--no-post', '--token', TOKEN]); } catch (e) { refused = e.output; }
  check('raw WAV is never uploaded', /needs the ffmpeg pass/.test(refused));

  check('the ledger is written where the audio is, so throwing it away starts over', existsSync(ledgerPath));
} finally {
  // The fakes stay up: section 4 runs the setup path against them too, and
  // closing here left it fetching a port nobody was listening on.
}

// ---- 4. the thing that gets double-clicked ----------------------------------
//
// The reading has to happen on the machine VoiceStudio is on; that is a fact
// about where 127.0.0.1 is, not a choice. What is a choice is how much of a
// chore that machine's owner is handed.
//
// The first attempt put the choosing in revoice.bat — a token prompt, an ffmpeg
// install and a scheduled task, in nested parenthesised IF blocks, written by
// someone with no Windows to test on. It fell through to the end without ever
// asking for anything, and the person on the other end got a window that said
// "press any key" and closed. So the logic moved into revoice.mjs, and these
// run it.
{
  const bat = readFileSync(new URL('./revoice.bat', import.meta.url), 'utf8');

  // The batch file is now small enough to be read at a glance and to have
  // nothing in it that can go wrong. Each of these is a construct that broke it.
  const sins = [];
  if (/set \/p/i.test(bat)) sins.push('SET /P');
  if (/enabledelayedexpansion/i.test(bat)) sins.push('delayed expansion');
  if (/^\s*if\b.*\($/im.test(bat)) sins.push('a parenthesised IF block');
  if (/[^\x00-\x7f]/.test(bat)) sins.push('a character outside ASCII');
  check(
    'the batch file contains none of the constructs that broke it',
    sins.length === 0,
    sins.join(', ')
  );
  check(
    'and does only the four things cmd.exe cannot get wrong',
    /where node/.test(bat) && /curl -fsSL/.test(bat) && /node "revoice\.mjs" --setup/.test(bat) && /pause/.test(bat)
  );
  check(
    'and keeps the window open so a failure can be read',
    /if \/i not "%~1"=="--scheduled" pause/.test(bat)
  );
  check(
    'and still has a slot for a token, so no secret is ever committed',
    readFileSync(new URL('./build-voice-runner.mjs', import.meta.url), 'utf8').includes('__VOICE_UPLOAD_TOKEN__')
      ? true
      : !bat.includes('__VOICE_UPLOAD_TOKEN__')
  );

  // ---- and the setup itself, actually run ----------------------------------
  //
  // From a copy of the script in its own folder, which is how it lives on the
  // machine that runs it — the token is saved beside the script, so where the
  // script is matters.
  const { execFile } = await import('node:child_process');
  const { promisify: p2 } = await import('node:util');
  const run2 = p2(execFile);
  const home = mkdtempSync(join(tmpdir(), 'runner-home-'));
  writeFileSync(join(home, 'revoice.mjs'), readFileSync(new URL('./revoice.mjs', import.meta.url)));
  const args = ['--setup', '--site', SITE, '--studio', STUDIO, '--out', join(home, 'voice-out')];
  const opts = { cwd: home, env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, VOICE_UPLOAD_TOKEN: '' } };

  // Nobody at the keyboard and nothing saved: say so and stop, rather than
  // reading a whole library and failing at the last step.
  let refused = '';
  try {
    await run2('node', [join(home, 'revoice.mjs'), ...args], opts);
  } catch (e) {
    refused = `${e.stdout || ''}${e.stderr || ''}`;
  }
  check(
    'with no token it stops and says so, instead of pretending to work',
    /No token/.test(refused),
    refused.split('\n').filter(Boolean).pop()
  );

  // The token as it is after somebody has pasted it once.
  writeFileSync(join(home, 'token.txt'), `${TOKEN}\n`);
  const before = uploads.length;
  const { stdout } = await run2('node', [join(home, 'revoice.mjs'), ...args], opts);
  check(
    'and once it has been pasted, --setup reads the whole sky without asking again',
    uploads.length === before + 3 && /3 sent/.test(stdout),
    `${uploads.length - before} sent`
  );
  rmSync(home, { recursive: true, force: true });
}

studio.close();
site.close();

const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\n${failed.length} failed` : '\nall passed');
process.exit(failed.length ? 1 : 0);
