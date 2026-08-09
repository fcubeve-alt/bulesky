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
// Aura 2 rather than Aura 1. Aura 1 reads a string; Aura 2 is context-aware —
// Deepgram describe it as applying "natural pacing, expressiveness, and fillers
// based on the context of the provided text", which is precisely the two things
// missing: no pauses between sentences, no change of tone. English-only, with
// Aura 1 kept as the fallback if the call fails.
const AURA_MODEL = '@cf/deepgram/aura-2-en';
const AURA_FALLBACK_MODEL = '@cf/deepgram/aura-1';


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
// to listen to them here — swapping either is a one-line change and costs
// nothing but a RECIPE bump.
// Two narrators, one of each. There used to be a third, "soft_neutral", which
// was also the fallback — and since Deepgram's neutral voice is male, both it
// and every case the classifier was unsure about came out male. Two thirds of
// the roster and all the uncertainty being one man is not a sky of strangers.
const VOICES = {
  warm_female: 'coral',
  gentle_male: 'ash',
};
// The same two in Deepgram's roster. Picked without being able to listen to
// them; both maps are one line each to change.
const AURA_VOICES = {
  warm_female: 'asteria',
  gentle_male: 'orpheus',
};
const NARRATORS = Object.keys(VOICES);

// When the choice cannot be made — no AI binding, a failed call, an answer we
// do not recognise — take one at random rather than always the same one. A
// broken classifier should make the sky arbitrary, not monotonous. The result
// is stored with the audio, so a whisper keeps whichever voice it was given.
function fallbackNarrator() {
  return NARRATORS[Math.floor(Math.random() * NARRATORS.length)];
}

const VOICE_MODEL = '@cf/meta/llama-3.1-8b-instruct';
const VOICE_SYSTEM =
  'You choose which of two narrators should read a short anonymous message ' +
  'aloud on a quiet, healing website. Answer with exactly one of these two ' +
  'words and nothing else: warm_female, gentle_male.\n' +
  'warm_female — grief, longing, heartbreak, missing someone, love, loneliness, ' +
  'tenderness.\n' +
  'gentle_male — steadiness, resolve, guilt, regret, apology, protectiveness, ' +
  'anger held in, someone holding themselves together.\n' +
  'If it could genuinely be either, pick the one that fits the feeling better ' +
  'rather than defaulting.';

// Give the model something to breathe on.
//
// Deepgram are explicit that "the quality of your text input directly impacts
// the naturalness of the audio output", and whispers are typed at night in a
// box with no spellcheck — many arrive as unpunctuated runs of words, or as
// lines broken by Enter instead of by full stops. A model that takes its pauses
// from punctuation has nothing to work with, and reads the whole thing as one
// breathless sentence. That is most of what "no pauses between sentences"
// actually is.
//
// This adds only terminal punctuation where a line clearly ends without any,
// which cannot change what the words mean. It does not invent commas, drama or
// ellipses — putting feeling in that the writer did not write is not ours to do.
const ENDS_SENTENCE = /[.!?…。！？；;:،؟]["'”’)\]]*$/;
const CJK_TAIL = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]\s*$/;

export function shapeForSpeech(text) {
  return String(text)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    // A CJK line gets a CJK full stop. A Latin one on Chinese text is both ugly
    // and, to a model taking cues from the script it is reading, a wrong signal.
    .map((line) => (ENDS_SENTENCE.test(line) ? line : line + (CJK_TAIL.test(line) ? '。' : '.')))
    .join('\n');
}

// Which narrator suits this whisper. Runs on Cloudflare Workers AI — already
// bound for report moderation, effectively free, and only ever reached on a
// cache miss, so it is paid for once per whisper exactly like the audio is.
//
// Fails open to a random narrator: a classifier having a bad day must never
// stop a whisper being read, or quietly make every voice the same.
export async function pickVoice(text, env) {
  if (!env?.AI || !text) return fallbackNarrator();
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
    return NARRATORS.find((k) => answer.includes(k)) || fallbackNarrator();
  } catch {
    return fallbackNarrator();
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
const RECIPE = 'v6-aura2-shaped';

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
  const input = shapeForSpeech(text).slice(0, MAX_CHARS);
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
      voice: VOICES[voiceKey] || VOICES.warm_female,
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
  const args = {
    text: input,
    speaker: AURA_VOICES[voiceKey] || AURA_VOICES.warm_female,
    encoding: 'mp3',
  };
  let result;
  try {
    result = await ai.run(AURA_MODEL, args, { returnRawResponse: true });
  } catch {
    // Aura 2 is English-only and newer; if it refuses this text, an unexpressive
    // reading still beats no reading.
    result = await ai.run(AURA_FALLBACK_MODEL, args, { returnRawResponse: true });
  }
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
