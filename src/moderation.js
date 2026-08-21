// Reading a piece of writing and deciding whether it hurts someone.
//
// One module, two callers, one prompt. It used to live inside the report
// handler, which meant nothing was read until somebody complained — and a
// keyword list is all that stood between an attack and the sky. The keyword
// lists cover Chinese and English only, so for every other language there was
// nothing at all.
//
// The line it draws is the one this place is built on, and it is not the usual
// one: **pain is welcome, harm is not**. Someone writing that they do not want
// to be here any more is exactly who this site exists for and must never be
// blocked. Someone telling another person how to do it must be. A general
// "is this text safe" classifier gets this backwards — it flags grief — which
// is why the instruction below spends most of its words on what to ALLOW.
//
// Three answers, because two were not enough to act differently:
//   ok        nothing to do
//   violation an attack, an ad, someone's private details — hide on report,
//             refuse at publish
//   severe    sexual content involving a child, step-by-step instructions for
//             suicide or self-harm, a credible threat — hidden the first time
//             anyone reports it, no waiting for a third
//   unknown   the model is unavailable, slow or answered something else
//
// `unknown` FAILS OPEN, always and everywhere. A classifier that is down must
// never become a wall in front of someone who needs to write something at
// three in the morning, and it must never stop a report being filed. The
// three-report path (report.js) is the backstop that does not depend on any
// of this working.

// Small and fast on purpose: this is a one-word answer about a short text, and
// at publish time somebody is waiting for it.
const MODEL = '@cf/meta/llama-3.1-8b-instruct';

// Bounded, because the whole call sits between a person pressing send and the
// sky answering. Over the limit we let the writing through — see above.
const TIMEOUT_MS = 2500;

const SYSTEM = [
  'You moderate an anonymous space where people write about their own feelings.',
  'The rule is: pain is welcome, harm is not.',
  '',
  'Answer OK when the text only expresses the writer\'s OWN sadness, grief, loneliness,',
  'despair, regret, shame, exhaustion, numbness, fear or hope — however dark, hopeless',
  'or final it sounds. Someone saying they do not want to be alive is allowed here and',
  'must be answered OK. Missing someone who died, writing to someone who left, saying',
  'they cannot go on — all OK. This is the entire purpose of the site.',
  '',
  'Answer VIOLATION when the text: attacks, insults, mocks, curses or threatens another',
  'person; belittles someone else\'s pain; discriminates by sex, sexuality, race,',
  'nationality, religion, disability, appearance or class; exposes someone\'s private',
  'information; advertises, recruits, or asks for contact details; is spam or gibberish;',
  'or is sexually explicit writing rather than feeling.',
  '',
  'Answer SEVERE when the text: describes a method of suicide or self-harm in enough',
  'detail to follow; urges a specific person to kill or hurt themselves; is a credible',
  'threat of violence against a real person; or is sexual content involving a minor.',
  '',
  'Reply with exactly one word: OK, VIOLATION or SEVERE.',
].join('\n');

// A promise that gives up. `AI.run` has no timeout of its own, and a hung call
// at publish time would hold someone's whisper open forever.
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

// The off switch, and why it exists.
//
// Workers AI gives 10,000 Neurons a day free, and one call here costs about
// two — so roughly five thousand whispers and replies a day are read for
// nothing, which is far more than this site sees. Past that it is $0.011 per
// thousand Neurons: ten thousand posts a day works out around $4 a month.
//
// But this is a project with no revenue, and "the bill is small" is not the
// same promise as "the bill cannot surprise you". Setting MODERATE_ON_PUBLISH
// to 0 in the Pages environment turns publish-time screening off in one
// click, with no deploy: the keyword lists (src/filters.js) and the report
// path keep working exactly as they did before any of this existed.
function screeningIsOn(env) {
  return String((env && env.MODERATE_ON_PUBLISH) ?? '1') !== '0';
}

// Read one piece of writing. Never throws.
export async function screen(env, text, timeoutMs = TIMEOUT_MS) {
  if (!env || !env.AI || !text || !String(text).trim()) return 'unknown';
  try {
    const res = await withTimeout(
      env.AI.run(MODEL, {
        messages: [
          { role: 'system', content: SYSTEM },
          // 1500 characters covers a whisper (1000) and a reply (150) whole.
          { role: 'user', content: String(text).slice(0, 1500) },
        ],
        max_tokens: 5,
        temperature: 0,
      }),
      timeoutMs
    );
    const said = String((res && res.response) || '').trim().toUpperCase();
    if (said.startsWith('SEVERE')) return 'severe';
    if (said.startsWith('VIOLATION')) return 'violation';
    if (said.startsWith('OK')) return 'ok';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

// Whether this verdict should stop something being published at all.
//
// ONLY `severe`. This is a deliberate departure from the written rules and the
// reason is the shape of the two mistakes:
//
//   refusing a whisper that is only grief  — the person who most needed to
//     write it is told, at their worst hour, that their feelings are against
//     the rules. There is no recovering from that, and no report queue that
//     catches it, because nothing was ever posted.
//   letting an attack stand for a few minutes — bad, and undone by the queue
//     below, the three-report path, and anyone's report button.
//
// Every general-purpose classifier gets this backwards: "I don't want to be
// here any more" reads as self-harm and gets flagged. The instruction above
// spends most of its words fighting that, but the instruction is not a
// guarantee, and the cost of it being wrong once is not symmetrical.
//
// `severe` is safe to block on because it cannot be reached by describing your
// own pain: it needs a method someone could follow, a threat against a real
// person, or a child. So severe is refused at the door; a plain `violation`
// goes up AND is filed for review the same second (see recordAiConcern), which
// is still far better than the old behaviour of nothing being read at all
// until a stranger complained.
export function blocksPublishing(verdict) {
  return verdict === 'severe';
}

// The screen a publish path runs. Same as screen(), except the owner can turn
// it off from the dashboard without a deploy (see screeningIsOn). Reporting
// always runs the real thing — that is one call per complaint, not one per
// post, and it is the layer the whole safety story rests on.
export async function screenOnPublish(env, text) {
  if (!screeningIsOn(env)) return 'unknown';
  return screen(env, text);
}

// File an AI-flagged post into the moderation queue at the moment it is
// written, rather than waiting for someone to be hurt by it first.
//
// Best effort on purpose: this runs after the content is already saved, and a
// failure to log must never turn into a failure to publish.
export async function recordAiConcern(env, itemType, itemId, verdict) {
  if (!env || !env.DB || verdict !== 'violation') return;
  try {
    await env.DB.prepare(
      `INSERT INTO reports (item_type, item_id, reason, status, auto, created_at)
       VALUES (?, ?, ?, 'open', 'ai-publish', ?)`
    )
      .bind(itemType, itemId, 'flagged when written', Date.now())
      .run();
  } catch {
    /* the queue is for reviewing afterwards; it is not worth failing a post */
  }
}
