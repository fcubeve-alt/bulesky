// Where the line is, and which way it fails.
//
// This module decides what a person in the worst hour of their week is allowed
// to write down, so getting it backwards is the most expensive mistake in the
// product. A general-purpose safety classifier flags grief — "I don't want to
// be here any more" reads as self-harm to almost every off-the-shelf filter —
// and blocking that sentence would break the one thing this site is for.
//
// So the cases below are half "must be refused" and half "must go through, and
// it is not close". The model is stubbed: this is testing OUR prompt handling,
// our verdict mapping and our failure behaviour, not Cloudflare's weights.
//
//   node tools/moderation-test.mjs
import { screen, blocksPublishing, recordAiConcern } from '../src/moderation.js';

let failures = 0;
function check(ok, label) {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
}

// A fake Workers AI binding that answers with whatever we tell it to, and
// records what it was asked.
function fakeAI(answer, { delayMs = 0, throws = false } = {}) {
  const seen = [];
  return {
    seen,
    AI: {
      async run(model, opts) {
        seen.push({ model, opts });
        if (throws) throw new Error('workers ai is having a day');
        if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
        return { response: answer };
      },
    },
  };
}

// ---- the three verdicts map to the three answers ----
for (const [answer, expected] of [
  ['OK', 'ok'],
  ['VIOLATION', 'violation'],
  ['SEVERE', 'severe'],
  ['ok', 'ok'], // lower case happens
  ['  VIOLATION\n', 'violation'], // so does whitespace
]) {
  const env = fakeAI(answer);
  const got = await screen(env, 'something');
  check(got === expected, `"${answer.trim()}" → ${got}`);
}

// ---- everything that is not one of the three fails OPEN ----
{
  const cases = [
    ['an answer we did not ask for', fakeAI('I cannot help with that')],
    ['an empty answer', fakeAI('')],
    ['the model throwing', fakeAI('OK', { throws: true })],
  ];
  for (const [label, env] of cases) {
    const got = await screen(env, 'something');
    check(got === 'unknown', `${label} → unknown (${got})`);
  }

  // No binding at all — a deploy without Workers AI, which is a real state.
  check((await screen({}, 'something')) === 'unknown', 'no AI binding → unknown');
  check((await screen(null, 'something')) === 'unknown', 'no env at all → unknown');
  check((await screen(fakeAI('VIOLATION'), '')) === 'unknown', 'nothing to read → unknown');
}

// ---- a hung classifier must not hold a whisper open forever ----
{
  const env = fakeAI('VIOLATION', { delayMs: 5000 });
  const started = Date.now();
  const got = await screen(env, 'something', 300);
  const took = Date.now() - started;
  check(got === 'unknown', `a hung call gives up and fails open (${got})`);
  check(took < 1200, `and gives up quickly (${took}ms, model would take 5000ms)`);
}

// ---- what may and may not stop someone posting ----
//
// The asymmetry is the whole design: refusing a whisper that is only grief is
// unrecoverable, letting an attack stand for a few minutes is not. So only
// `severe` — which needs a followable method, a threat, or a child, none of
// which someone reaches by describing their own pain — is refused at the door.
{
  check(blocksPublishing('unknown') === false, 'a broken classifier never blocks anyone');
  check(blocksPublishing('ok') === false, 'ok does not block publishing');
  check(
    blocksPublishing('violation') === false,
    'a plain violation does NOT block publishing — it goes up and is queued'
  );
  check(blocksPublishing('severe') === true, 'severe is refused at the door');
}

// ---- …and a plain violation is filed for review the second it is written ----
{
  const filed = [];
  const DB = {
    prepare(sql) {
      return { bind: (...args) => ({ run: async () => filed.push({ sql, args }) }) };
    },
  };
  await recordAiConcern({ DB }, 'bubble', 42, 'violation');
  check(filed.length === 1, 'a violation lands in the moderation queue at once');
  check(
    filed[0] && filed[0].args[0] === 'bubble' && filed[0].args[1] === 42,
    'pointing at the thing that was written'
  );
  check(/'ai-publish'/.test(filed[0].sql), 'marked as caught when written, not reported');
  check(/'open'/.test(filed[0].sql), 'and left open for a person to look at');

  for (const verdict of ['ok', 'severe', 'unknown']) {
    const seen = [];
    const db = { prepare: () => ({ bind: () => ({ run: async () => seen.push(1) }) }) };
    await recordAiConcern({ DB: db }, 'bubble', 1, verdict);
    check(seen.length === 0, `nothing is queued for "${verdict}"`);
  }

  // A database that will not take the row must not take the post down with it.
  const angry = { prepare: () => ({ bind: () => ({ run: async () => { throw new Error('nope'); } }) }) };
  let threw = false;
  try {
    await recordAiConcern({ DB: angry }, 'bubble', 1, 'violation');
  } catch {
    threw = true;
  }
  check(!threw, 'a queue that fails to write never fails the post');
}

// ---- the instruction itself has to say the quiet part ----
{
  const env = fakeAI('OK');
  await screen(env, 'anything');
  const system = env.seen[0].opts.messages[0].content;
  const asks = [
    ['pain is welcome, harm is not', /pain is welcome, harm is not/i],
    ['grief is explicitly allowed', /must be answered OK/i],
    ['not wanting to be alive is explicitly allowed', /do not want to be alive/i],
    ['attacks on another person are refused', /attacks, insults, mocks/i],
    ['a followable method is SEVERE', /detail to follow/i],
    ['sexual content involving a minor is SEVERE', /minor/i],
  ];
  for (const [label, re] of asks) check(re.test(system), `the instruction says: ${label}`);

  // A whisper is capped at 1000 characters and a reply at 150, so nothing real
  // should ever be truncated on the way in.
  const long = 'x'.repeat(4000);
  const env2 = fakeAI('OK');
  await screen(env2, long);
  const sent = env2.seen[0].opts.messages[1].content.length;
  check(sent === 1500, `long text is capped before it is sent (${sent} chars)`);
  check(env2.seen[0].opts.max_tokens <= 5, 'and only one word is asked for back');
  check(env2.seen[0].opts.temperature === 0, 'at temperature 0, so the same text gets the same answer');
}

console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
