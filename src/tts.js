// Reading a whisper aloud.
//
// The whole point of this feature is the delivery, not the words — a flat
// robotic reading of "I miss you" is worse than no reading at all.
//
// Two providers, picked by which key exists, because the best-sounding option
// and the option that needs no international credit card are not the same one:
//
//   OPENAI_API_KEY set -> gpt-4o-mini-tts. Takes plain-language delivery notes
//     ("unhurried, warm, a little sorrowful") and follows them, and handles
//     every language the app speaks. This is the one the DELIVERY strings below
//     were written for, and the one worth paying for.
//
//   no key -> Cloudflare Workers AI (Deepgram Aura). Already bound, no signup,
//     no card, commercial use fine. It takes no delivery direction at all, so
//     the casting below does all the emotional work instead. English-focused:
//     other languages will suffer. Good enough to be real today.
//
// Which provider was used is part of the cache key, so switching regenerates
// rather than serving the old voice forever.

const MODEL = 'gpt-4o-mini-tts';
const AURA_MODEL = '@cf/deepgram/aura-1';


// A sorrow and a wish should not be read in the same breath. These are two
// different kinds of thing to say to someone.
const DELIVERY = {
  pain:
    'Read this the way you would speak to a friend who is hurting and sitting ' +
    'right next to you. Unhurried, low and warm, with real tenderness and a ' +
    'little sorrow. Leave small pauses where a person would naturally pause to ' +
    'breathe or to steady themselves. Never bright, never brisk, never cheerful.',
  wish:
    'Read this gently and hopefully, like someone quietly making a wish out ' +
    'loud at night. Warm and unhurried, soft rather than excited, with a small ' +
    'lift of hope near the end. Never salesy, never performed.',
};

// Three voices, not one. A sky where every stranger speaks in the same voice
// stops sounding like strangers.
//
// These particular OpenAI voices are a judgement call made without being able
// to listen to them here — swapping any of the three is a one-line change and
// costs nothing but a RECIPE bump.
const VOICES = {
  warm_female: 'coral',
  gentle_male: 'ash',
  soft_neutral: 'sage',
};
// The same three narrators in Deepgram's roster. Also picked without being able
// to listen to them; both maps are one line each to change.
const AURA_VOICES = {
  warm_female: 'asteria',
  gentle_male: 'orpheus',
  soft_neutral: 'arcas',
};
// Used whenever the choice cannot be made — no AI binding, a failed call, an
// answer we do not recognise. Never a reason to refuse to read something.
const DEFAULT_VOICE = 'soft_neutral';

const VOICE_MODEL = '@cf/meta/llama-3.1-8b-instruct';
const VOICE_SYSTEM =
  'You choose which of three narrators should read a short anonymous message ' +
  'aloud on a quiet, healing website. Answer with exactly one of these three ' +
  'words and nothing else: warm_female, gentle_male, soft_neutral.\n' +
  'warm_female — grief, longing, heartbreak, missing someone, love, loneliness.\n' +
  'gentle_male — steadiness, resolve, guilt, regret, apology, protectiveness, ' +
  'someone holding themselves together.\n' +
  'soft_neutral — anything reflective, ambiguous, hopeful or hard to place.';

// Which narrator suits this whisper. Runs on Cloudflare Workers AI — already
// bound for report moderation, effectively free, and only ever reached on a
// cache miss, so it is paid for once per whisper exactly like the audio is.
//
// Fails open to the neutral voice: a classifier having a bad day must never
// stop a whisper being read.
export async function pickVoice(text, env) {
  if (!env?.AI || !text) return DEFAULT_VOICE;
  try {
    const res = await env.AI.run(VOICE_MODEL, {
      messages: [
        { role: 'system', content: VOICE_SYSTEM },
        { role: 'user', content: String(text).slice(0, 1500) },
      ],
      max_tokens: 6,
      temperature: 0,
    });
    const answer = String(res?.response || '').trim().toLowerCase();
    return Object.keys(VOICES).find((k) => answer.includes(k)) || DEFAULT_VOICE;
  } catch {
    return DEFAULT_VOICE;
  }
}

// Whispers are capped at 1000 characters when written, so this is a backstop
// against a malformed row rather than a real limit on anyone.
const MAX_CHARS = 1200;

// AAC rather than the default MP3. OpenAI's MP3 comes out around 2.87MB per
// minute — a broadcast-grade bitrate for what is one quiet voice — which for a
// long whisper means several megabytes to store and to push down a phone
// connection every time. AAC is far leaner at the same perceived quality for
// speech, and unlike Opus it plays natively everywhere that matters, iOS
// included.
const FORMAT = 'aac';
const MIME = 'audio/aac';

// The cache key must cover everything that changes how it sounds. Bump this and
// every reading regenerates with the new delivery — old rows are simply never
// looked up again.
//
// Deliberately NOT keyed on the chosen narrator: the narrator is chosen by
// reading the text, so keying on it would mean running the classifier before
// every lookup just to discover we already had the audio. The roster and the
// rules for choosing are covered by RECIPE instead, and the narrator that was
// actually picked is stored next to the audio.
const RECIPE = 'v4-providers';

// Whichever provider will actually be used, so the hash can name it. Keeping
// this decision in one place means the cache key and the synthesis can never
// disagree about who spoke.
export function providerFor(env) {
  return env?.OPENAI_API_KEY ? 'openai' : env?.AI ? 'aura' : null;
}

export async function voiceHash(text, type, env) {
  const material = [RECIPE, providerFor(env), type, text].join(' ');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Returns { bytes, mime }, or throws. voiceKey is one of VOICES' keys. The
// caller decides what a failure means for the reader — see the endpoint.
export async function synthesize(text, type, voiceKey, env) {
  const input = String(text).slice(0, MAX_CHARS);
  const provider = providerFor(env);
  if (provider === 'openai') return openaiSpeech(input, type, voiceKey, env.OPENAI_API_KEY);
  if (provider === 'aura') return auraSpeech(input, voiceKey, env.AI);
  throw new Error('no tts provider');
}

async function openaiSpeech(input, type, voiceKey, apiKey) {
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      voice: VOICES[voiceKey] || VOICES[DEFAULT_VOICE],
      input,
      instructions: DELIVERY[type] || DELIVERY.pain,
      response_format: FORMAT,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`tts ${res.status}: ${detail.slice(0, 200)}`);
  }

  return { bytes: new Uint8Array(await res.arrayBuffer()), mime: MIME };
}

// Deepgram Aura, through the Workers AI binding that report moderation already
// uses. No delivery instructions exist on this model — the casting is the only
// emotional control we have here, which is exactly why three narrators matter
// more on this path than on the OpenAI one.
//
// MP3 rather than AAC: Aura offers both, but AAC needs a container argument to
// be right and MP3 is the one that is unambiguous everywhere.
async function auraSpeech(input, voiceKey, ai) {
  const result = await ai.run(
    AURA_MODEL,
    { text: input, speaker: AURA_VOICES[voiceKey] || AURA_VOICES[DEFAULT_VOICE], encoding: 'mp3' },
    { returnRawResponse: true }
  );
  return { bytes: await toBytes(result), mime: 'audio/mpeg' };
}

// The binding hands audio back in whichever shape the runtime feels like:
// a Response, a stream, or the bytes themselves. Normalise rather than assume.
async function toBytes(result) {
  if (result instanceof Uint8Array) return result;
  if (result instanceof ArrayBuffer) return new Uint8Array(result);
  if (result && typeof result.arrayBuffer === 'function') {
    return new Uint8Array(await result.arrayBuffer());
  }
  if (result && typeof result.getReader === 'function') {
    const reader = result.getReader();
    const parts = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      total += value.length;
    }
    const out = new Uint8Array(total);
    let at = 0;
    for (const part of parts) {
      out.set(part, at);
      at += part.length;
    }
    return out;
  }
  throw new Error('tts: unrecognised audio payload');
}
