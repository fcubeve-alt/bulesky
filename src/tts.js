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
// Aura 1 by default, deliberately, even though Aura 2 is the context-aware one
// that would read with better pacing.
//
// Aura 1 is the only configuration a listener has actually heard come out of
// this site. Switching the default to Aura 2 coincided with the endpoint dying,
// and chasing an unproven model while the feature is silent is the wrong order
// to do things in. Set VOICE_MODEL=@cf/deepgram/aura-2-en once sound is
// confirmed and the improvement can be judged on its own.
const DEFAULT_AURA_MODEL = '@cf/deepgram/aura-1';


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
// Deterministic casting: same whisper, same narrator, forever, with no call to
// anything. Not as clever as reading the text, and it cannot be the reason the
// endpoint dies.
export async function pickVoiceLocally(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
  return NARRATORS[new Uint8Array(digest)[0] % NARRATORS.length];
}

// The classifier is OFF unless VOICE_CLASSIFIER is set, and that is deliberate.
//
// It runs on Workers AI, and Workers AI is the one thing that was still being
// called on every cache miss no matter which speech provider was configured —
// which makes it the only suspect left for an endpoint that dies without
// reaching its own error handler, on ElevenLabs and on Aura alike. A worker
// terminated by the platform does not throw, so the try/catch below cannot save
// it and never did.
//
// Casting by emotion is a nice touch. Producing sound is the feature. Turn this
// back on with VOICE_CLASSIFIER=1 once the endpoint is known to be healthy.
export async function pickVoice(text, env) {
  if (!env?.VOICE_CLASSIFIER) return pickVoiceLocally(text);
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
const RECIPE = 'v11-no-classifier';

// Whichever provider will actually be used, so the hash can name it. Keeping
// this decision in one place means the cache key and the synthesis can never
// disagree about who spoke.
// Overridable without a deploy, so the Aura 2 experiment can be turned on and
// off from the Pages dashboard rather than from a commit.
export function auraModel(env) {
  return (env && env.VOICE_MODEL) || DEFAULT_AURA_MODEL;
}

// Best first, and everything that is configured after it. This is an order of
// preference, not a single choice: see synthesize().
const CHAIN = ['elevenlabs', 'openai', 'aura'];

function available(env) {
  return CHAIN.filter(
    (p) =>
      (p === 'elevenlabs' && env?.ELEVENLABS_API_KEY) ||
      (p === 'openai' && env?.OPENAI_API_KEY) ||
      (p === 'aura' && env?.AI)
  );
}

// The provider the cache key is named after, and the one tried first. Stays the
// same whichever provider ends up speaking, so a lookup can always find what a
// previous listener paid for.
export function providerFor(env) {
  return available(env)[0] || null;
}

export async function voiceHash(text, type, env) {
  const material = [RECIPE, providerFor(env), auraModel(env), type, text].join(' ');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Returns { bytes, mime, provider, failures }, or throws. voiceKey is one of
// VOICES' keys.
//
// Every configured provider is tried in turn, not just the preferred one. The
// reason is the whole of this feature's history: ElevenLabs refuses every
// uncached reading on a free plan (402, "Free users cannot use library voices"),
// and because the preferred provider was also the only provider, that refusal
// reached the listener as a dead button. Whether a whisper could be heard came
// down to whether someone had already listened to that exact whisper under an
// earlier provider — which is precisely the "works, then doesn't, then works
// again, no pattern" that was reported.
//
// A worse voice is not the failure mode to protect against here. Silence is.
export async function synthesize(text, type, voiceKey, env) {
  const input = shapeForSpeech(text).slice(0, MAX_CHARS);
  const providers = available(env);
  if (!providers.length) throw new Error('no tts provider');

  const failures = [];
  for (const provider of providers) {
    try {
      const out = await speak(provider, input, type, voiceKey, env);
      return { ...out, provider, failures };
    } catch (e) {
      failures.push(String((e && e.message) || e).slice(0, 200));
    }
  }
  throw new Error(failures.join(' | '));
}

function speak(provider, input, type, voiceKey, env) {
  if (provider === 'openai') return openaiSpeech(input, type, voiceKey, env.OPENAI_API_KEY);
  if (provider === 'elevenlabs') return elevenSpeech(input, voiceKey, env);
  return auraSpeech(input, voiceKey, env.AI, auraModel(env));
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

// ElevenLabs. A plain HTTPS call with a key — no platform binding, no Workers
// AI quota, none of the machinery the Aura path goes through. When a key is
// present this is the provider, both because it is the best-sounding option and
// because it is the simplest thing that can possibly work.
//
// No voice id is hardcoded, deliberately. The two that were — Rachel and Adam —
// are Voice Library voices, and a free plan may not use those through the API
// at all: every request came back 402 "paid_plan_required". Asking the account
// what it has did not fix it either, because the voices listed on a free
// account are largely library voices too, so the fallback picked another
// forbidden id and got the same refusal.
//
// What a free plan may use is the premade set, which carries category
// "premade". So the list is filtered by what the plan permits rather than
// merely by what the account can see.
const ELEVEN_MODEL = 'eleven_multilingual_v2';

// Voices attached to this account. Looked up on a cache miss only, so it costs
// nothing on replays.
async function accountVoices(key) {
  const res = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': key } });
  if (!res.ok) return [];
  const data = await res.json().catch(() => null);
  return Array.isArray(data?.voices) ? data.voices : [];
}

// Premade voices first, since those are the ones a free plan is allowed to
// speak with. A paid account may have nothing premade at all — only cloned or
// professional voices, which it is perfectly entitled to use — so an empty
// premade set falls back to the whole list rather than to nothing.
export function usableVoices(voices) {
  const premade = voices.filter((v) => String(v?.category || '').toLowerCase() === 'premade');
  return premade.length ? premade : voices;
}

// Match on the label the account carries rather than on a name, then fall back
// to position: one voice each, so the sky still has two narrators even if the
// labels are missing.
function pickFromAccount(voices, voiceKey) {
  const usable = usableVoices(voices);
  if (!usable.length) return null;
  const wants = voiceKey === 'gentle_male' ? 'male' : 'female';
  const gendered = usable.filter((v) => String(v?.labels?.gender || '').toLowerCase() === wants);
  if (gendered.length) return gendered[0].voice_id;
  return voiceKey === 'gentle_male' && usable.length > 1
    ? usable[1].voice_id
    : usable[0].voice_id;
}

// What the account can actually speak with, for the probe. Ends the guessing:
// one look tells whether ElevenLabs can work here at all, and with which voice.
//
// Does its own fetch rather than reusing accountVoices, because that one turns
// every non-200 into an empty list — which is right for synthesis and useless
// for diagnosis. "No voices" and "the key was rejected" look identical from an
// empty array and need completely different fixes.
export async function elevenVoiceReport(env) {
  if (!env?.ELEVENLABS_API_KEY) return null;
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': env.ELEVENLABS_API_KEY },
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { status: res.status, detail: detail.slice(0, 200) };
    }
    const data = await res.json().catch(() => null);
    const voices = Array.isArray(data?.voices) ? data.voices : [];
    return {
      status: res.status,
      total: voices.length,
      usable: usableVoices(voices).length,
      voices: voices.slice(0, 12).map((v) => ({
        id: v.voice_id,
        name: v.name,
        category: v.category,
        gender: v?.labels?.gender || null,
      })),
    };
  } catch (e) {
    return { error: String((e && e.message) || e).slice(0, 200) };
  }
}

async function elevenRequest(voiceId, input, key) {
  return fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({
      text: input,
      model_id: ELEVEN_MODEL,
      // Lower stability leaves room for the delivery to move with the words,
      // which is the entire reason for using this provider. High style pushes
      // it into performance, which this material must never sound like.
      voice_settings: { stability: 0.4, similarity_boost: 0.75, style: 0.25, use_speaker_boost: true },
    }),
  });
}

async function elevenSpeech(input, voiceKey, env) {
  const key = env.ELEVENLABS_API_KEY;

  // Explicitly configured ids win — someone who has chosen a voice means it.
  const configured =
    voiceKey === 'gentle_male' ? env.ELEVENLABS_VOICE_MALE : env.ELEVENLABS_VOICE_FEMALE;

  const voiceId = configured || pickFromAccount(await accountVoices(key).catch(() => []), voiceKey);
  // Nothing this plan may speak with. Say so and let the chain move on, rather
  // than spending a request to be told 402 again.
  if (!voiceId) throw new Error('elevenlabs: no voice this plan may use');

  const res = await elevenRequest(voiceId, input, key);

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`elevenlabs ${res.status}: ${detail.slice(0, 200)}`);
  }

  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!looksLikeAudio(bytes)) throw new Error(`elevenlabs returned ${bytes.length} bytes, not audio`);
  return { bytes, mime: 'audio/mpeg' };
}

// Deepgram Aura, through the Workers AI binding that report moderation already
// uses. No delivery instructions exist on this model — the casting is the only
// emotional control we have here, which is exactly why three narrators matter
// more on this path than on the OpenAI one.
//
// MP3 rather than AAC: Aura offers both, but AAC needs a container argument to
// be right and MP3 is the one that is unambiguous everywhere.
async function auraSpeech(input, voiceKey, ai, model) {
  const speaker = AURA_VOICES[voiceKey] || AURA_VOICES.warm_female;

  // Tried in order until one returns something that is actually audio.
  //
  // A rejected model does not necessarily throw — with returnRawResponse the
  // binding can hand back a perfectly ordinary Response carrying a JSON error,
  // and the previous version cheerfully treated those bytes as audio, stored
  // them, and served an unplayable file from cache forever after. Aura 2 also
  // documents a different parameter set from Aura 1, so "encoding" is dropped
  // on the second attempt rather than assumed to be accepted.
  // Two attempts, not three. Every extra attempt is another response body read
  // and discarded inside one request's resource budget, and this endpoint has
  // already been killed once for doing too much before replying.
  const attempts = [
    [model, { text: input, speaker, encoding: 'mp3' }],
    [model, { text: input, speaker }],
  ];

  let lastError = 'no attempt ran';
  for (const [model, args] of attempts) {
    try {
      const result = await ai.run(model, args, { returnRawResponse: true });
      if (result && typeof result.status === 'number' && !result.ok) {
        lastError = `${model} → ${result.status}`;
        continue;
      }
      // Take the format the model actually produced rather than asserting one.
      // The second attempt drops "encoding", so the model falls back to its own
      // default — which may not be MP3 at all. Labelling raw PCM as audio/mpeg
      // gets it rejected by the browser as an undecodable file, which looks
      // exactly like the bug this whole chain exists to avoid.
      const declared = result && result.headers ? result.headers.get('content-type') : null;
      const mime = declared && /^audio\//i.test(declared) ? declared.split(';')[0].trim() : 'audio/mpeg';
      const bytes = await toBytes(result);
      if (!looksLikeAudio(bytes)) {
        lastError = `${model} → ${bytes.length} bytes, not audio`;
        continue;
      }
      return { bytes, mime };
    } catch (e) {
      lastError = `${model} → ${e && e.message ? e.message : e}`;
    }
  }
  throw new Error(`aura: ${lastError}`);
}

// Cheap sanity check before anything is cached forever. A JSON error body is
// small and starts with a brace or a bracket; real speech is neither.
function looksLikeAudio(bytes) {
  if (!bytes || bytes.length < 2048) return false;
  const first = bytes[0];
  return first !== 0x7b && first !== 0x5b; // '{' '['
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
