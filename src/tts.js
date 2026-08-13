// Reading a whisper aloud.
//
// Six providers, tried in order, first one that produces audio wins. See CHAIN
// for the order and why it is that order — it is not "best model first", it is
// "what this site actually needs first", and those turned out to be different
// things.
//
// The preferred provider's name is part of the cache key, so changing the head
// of the chain regenerates every reading rather than serving the old voice
// forever. That is a real cost: do not reorder casually.

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
// Written once for a model that could not follow them, then handed to two that
// could — at which point they turned out to be instructions for exactly the
// reading nobody wanted. The first version said "unhurried, low and warm" and
// "leave small pauses where a person would naturally pause to breathe", and
// Gemini did precisely that: a voice pitched down into the floor, words drawn
// out, long silences the listener read as the feature being broken.
//
// Feeling does not come from slowness. A person comforting someone speaks at an
// ordinary pace; what makes it tender is warmth, not drag. So these now ask for
// the warmth and explicitly rule out the dragging — telling a model what not to
// do matters here, because "gentle" on its own pulls it back toward a whisper.
const DELIVERY = {
  pain:
    'Read this warmly and sincerely, the way you would speak to a friend ' +
    'sitting beside you who is having a hard time. Kind, natural and clear. ' +
    'Keep an ordinary speaking pace and an ordinary pitch: do not slow down, do ' +
    'not draw the words out, do not leave long silences between phrases, and do ' +
    'not drop into a deep or breathy register. Not cheerful, but not heavy or ' +
    'mournful either.',
  wish:
    'Read this warmly and hopefully, like someone saying a quiet wish out loud. ' +
    'Kind, natural and clear, at an ordinary speaking pace, with a small lift ' +
    'near the end. Do not slow down, draw the words out or leave long silences. ' +
    'Never salesy, never performed.',
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
const RECIPE = 'v12-natural-pace';

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
//
// MeloTTS is last and is the floor. Every other entry can run out — ElevenLabs'
// free plan is 10,000 characters a MONTH, and Deepgram's Aura is a partner
// model on Workers AI, which is why it answers 429 even hours after the daily
// free allocation resets. MeloTTS is Cloudflare's own model on the binding this
// project already has, so it needs no key, no account and no card, and it is
// the difference between a listener hearing a modest voice and hearing the
// phone's flat built-in one.
// Aura first, and that is a reversal worth explaining.
//
// This feature was built on the premise that delivery is the point — that a
// flat reading of "I miss you" is worse than none. Two providers that can
// actually follow a delivery note later arrived, and the reading they produced
// was rejected by the person who asked for it: too much rise and fall, too
// performed, "just give me a normal voice". That is the requirement now, and it
// beats the premise.
//
// The measurements agree, and they are not close:
//
//   aura     0.6s   11,912 bytes  (MP3)
//   gemini    ~9s  514,604 bytes  (uncompressed WAV, 43x larger)
//
// Those bytes are not only a download. They are written into D1 behind every
// first listen and read back out of it on every replay — the same database the
// whisper list and the reading view query — so a megabyte of audio per whisper
// slowed the whole site down, not just the voice. Opening a balloon started
// taking a second or two, which is the tell that this was never really about
// speech at all.
//
// So: the fast, small, plain one leads. Everything below it is a fallback for
// when Workers AI runs out of its daily allowance, and a paid provider that is
// genuinely better can be promoted back above it by moving one word.
const CHAIN = ['aura', 'openai', 'gemini', 'volc', 'elevenlabs', 'melo'];

function available(env) {
  return CHAIN.filter(
    (p) =>
      (p === 'elevenlabs' && env?.ELEVENLABS_API_KEY) ||
      (p === 'openai' && env?.OPENAI_API_KEY) ||
      (p === 'gemini' && env?.GEMINI_API_KEY) ||
      (p === 'volc' && env?.VOLC_APPID && env?.VOLC_ACCESS_TOKEN) ||
      (p === 'aura' && env?.AI) ||
      (p === 'melo' && env?.AI)
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
      const out = await withDeadline(speak(provider, input, type, voiceKey, env), provider);
      return { ...out, provider, failures };
    } catch (e) {
      failures.push(String((e && e.message) || e).slice(0, 200));
    }
  }
  throw new Error(failures.join(' | '));
}

// No single provider may hold the button.
//
// Gemini once took seventeen seconds to answer a 503, and the listener spent
// all seventeen watching a button that looked broken. Whatever the provider is
// doing, the chain moves on and someone further down gets a chance to speak —
// which is the entire point of having a chain.
//
// Generous rather than tight: a long whisper legitimately takes a while to
// synthesise, and cutting off real work would trade a slow reading for no
// reading.
const ATTEMPT_MS = 20000;

function withDeadline(work, provider) {
  // A late rejection from the abandoned attempt must not surface as an
  // unhandled rejection once the race has already been lost.
  work.catch(() => {});
  return Promise.race([
    work,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${provider}: no answer in ${ATTEMPT_MS / 1000}s`)), ATTEMPT_MS)
    ),
  ]);
}

function speak(provider, input, type, voiceKey, env) {
  if (provider === 'openai') return openaiSpeech(input, type, voiceKey, env);
  if (provider === 'elevenlabs') return elevenSpeech(input, voiceKey, env);
  if (provider === 'gemini') return geminiSpeech(input, type, voiceKey, env);
  if (provider === 'volc') return volcSpeech(input, voiceKey, env);
  if (provider === 'melo') return meloSpeech(input, env.AI);
  return auraSpeech(input, voiceKey, env.AI, auraModel(env));
}

// OpenAI, or anything speaking its dialect.
//
// The host is configurable because api.openai.com is not reachable from
// everywhere, and a relay that speaks the same protocol is the difference
// between this provider being available to this project and not. Same reason
// Azure OpenAI, OpenRouter and a self-hosted server all exist behind this
// shape: an OpenAI-compatible base URL is an ordinary thing to point at.
//
// The model is configurable for a sharper reason. Only gpt-4o-mini-tts accepts
// `instructions` — the plain-language delivery note that is the entire point of
// preferring this provider — and relays commonly carry only the older tts-1.
// Sending `instructions` to a model that does not know the field is an error,
// so it is sent only when the model can use it, and its absence is a quiet
// downgrade rather than a failure.
function openaiBase(env) {
  const base = String(env?.OPENAI_BASE_URL || 'https://api.openai.com/v1').trim();
  return base.replace(/\/+$/, '');
}

function takesDelivery(model) {
  return /gpt-4o/i.test(model);
}

async function openaiSpeech(input, type, voiceKey, env) {
  const model = env.OPENAI_TTS_MODEL || MODEL;
  const body = {
    model,
    voice: VOICES[voiceKey] || VOICES.warm_female,
    input,
    response_format: FORMAT,
  };
  if (takesDelivery(model)) body.instructions = DELIVERY[type] || DELIVERY.pain;

  const res = await fetch(`${openaiBase(env)}/audio/speech`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`openai ${res.status}: ${detail.slice(0, 200)}`);
  }

  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!looksLikeAudio(bytes)) throw new Error(`openai returned ${bytes.length} bytes, not audio`);

  // Believe the response about its own format rather than the request. A relay
  // may quietly ignore response_format and hand back MP3; labelling that as AAC
  // gets it stored, served, and refused by the browser forever after.
  const declared = res.headers.get('content-type') || '';
  const mime = /^audio\//i.test(declared) ? declared.split(';')[0].trim() : MIME;
  return { bytes, mime };
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

// ElevenLabs' premade voices, whose ids are public constants shared by every
// account. Speaking with one needs only the text-to-speech permission — no
// voices_read, no account lookup, nothing the owner has to go and switch on.
//
// This is the whole answer to the 401 the probe found. The key on this project
// is scoped to text-to-speech and nothing else, so asking the account which
// voices it has was refused; asking it to speak with a voice everybody already
// has is not. I was requiring a permission the feature never needed.
//
// Several per narrator because a single hardcoded id is exactly what failed
// before: Rachel and Adam turned out to be Voice Library voices, forbidden on a
// free plan. If the first is refused the next is tried.
const ELEVEN_PREMADE = {
  gentle_male: [
    'nPczCjzI2devNBz1zQrb', // Brian — deep, calm
    'cjVigY5qzO86Huf0OWal', // Eric — warm, conversational
    'JBFqnCBsd6RMkjVDRZzb', // George — low, steady
  ],
  warm_female: [
    'EXAVITQu4vr4xnSDxMaL', // Sarah — soft, gentle
    'cgSgspJ2msm6clMCkdW9', // Jessica — warm
    'Xb7hH8MSUJpSbSDYk0k2', // Alice — clear, kind
  ],
};

// Premade voices are the ones a free plan may speak with; anything the account
// added from the Voice Library is refused with 402. Kept for the probe, which
// is the only thing that reads the account's list now.
export function usableVoices(voices) {
  const premade = voices.filter((v) => String(v?.category || '').toLowerCase() === 'premade');
  return premade.length ? premade : voices;
}

// What the account can actually speak with, for the probe only — synthesis no
// longer needs it, which is the point: this lookup requires the voices_read
// permission and the reading itself does not.
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

// Which voices to try, in order of preference. Premade ids come before the
// account lookup on purpose: they need no extra permission and no extra
// request, so the common case now costs one HTTP call instead of two.
export function elevenCandidates(voiceKey, env) {
  const configured =
    voiceKey === 'gentle_male' ? env.ELEVENLABS_VOICE_MALE : env.ELEVENLABS_VOICE_FEMALE;
  const premade = ELEVEN_PREMADE[voiceKey] || ELEVEN_PREMADE.warm_female;
  return [...new Set([configured, ...premade].filter(Boolean))];
}

// Two attempts, not six. Every attempt is another round trip inside one
// request, and a refusal is a property of the plan rather than of the id — if
// the first premade voice is refused the second almost certainly will be too.
// The list exists so a single retired id cannot silence the site, not so we can
// hammer the API.
const ELEVEN_MAX_ATTEMPTS = 2;

async function elevenSpeech(input, voiceKey, env) {
  const key = env.ELEVENLABS_API_KEY;
  let candidates = elevenCandidates(voiceKey, env);

  let lastError = 'no voice to try';
  for (const voiceId of candidates.slice(0, ELEVEN_MAX_ATTEMPTS)) {
    const res = await elevenRequest(voiceId, input, key);
    if (res.ok) {
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (looksLikeAudio(bytes)) return { bytes, mime: 'audio/mpeg' };
      lastError = `returned ${bytes.length} bytes, not audio`;
      continue;
    }
    const detail = await res.text().catch(() => '');
    lastError = `${res.status}: ${detail.slice(0, 160)}`;
    // 401 and 403 are about the key, not the voice. Trying another id with the
    // same key is just a slower way to get the same answer.
    if (res.status === 401 || res.status === 403) break;
  }

  throw new Error(`elevenlabs ${lastError}`);
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

// Google Gemini speech, through an AI Studio key.
//
// The only provider on this list with a free allowance that does not ask for a
// card, which for this project is not a footnote — it is the difference between
// having a voice and not. It also takes plain-language direction, so DELIVERY
// works here the way it does on OpenAI and nowhere else on this chain.
//
// Nothing about its shape resembles OpenAI's: the request is generateContent
// with an AUDIO modality, and the audio comes back inside the model's reply as
// base64.
const GEMINI_HOST = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_MODEL = 'gemini-2.5-flash-preview-tts';

// Two of the thirty prebuilt voices, chosen from their published descriptions
// rather than by listening — "warm" and "easy-going" are the two that suit a
// whisper read at night. Both are overridable without a deploy, because this is
// a judgement made deaf.
const GEMINI_VOICES = {
  warm_female: 'Sulafat',
  // Was Umbriel ("easy-going"), which came out far too deep and too slow to
  // carry over the background music. "Clear" is the correction.
  gentle_male: 'Iapetus',
};

async function geminiSpeech(input, type, voiceKey, env) {
  const model = env.GEMINI_TTS_MODEL || GEMINI_MODEL;
  const configured = voiceKey === 'gentle_male' ? env.GEMINI_VOICE_MALE : env.GEMINI_VOICE_FEMALE;
  const voice = configured || GEMINI_VOICES[voiceKey] || GEMINI_VOICES.warm_female;

  // Direction goes in the prompt rather than in a field. This is the whole
  // reason the DELIVERY strings exist, and only two providers have ever been
  // able to use them.
  const prompt = `${DELIVERY[type] || DELIVERY.pain}\n\n${input}`;

  const res = await fetch(`${GEMINI_HOST}/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`gemini ${res.status}: ${detail.slice(0, 200)}`);
  }

  const data = await res.json().catch(() => null);
  const part = data?.candidates?.[0]?.content?.parts?.find((p) => p?.inlineData?.data);
  if (!part) {
    const why = data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason || 'no audio in response';
    throw new Error(`gemini: ${String(why).slice(0, 160)}`);
  }

  const mime = String(part.inlineData.mimeType || '');
  const bytes = fromBase64(part.inlineData.data);

  // Raw PCM, not a playable file. Gemini answers with 24kHz 16-bit mono samples
  // and a mime type like "audio/L16;codec=pcm;rate=24000" — headerless, so a
  // browser handed these bytes has no idea what they are and simply refuses
  // them. Google's own issue tracker is full of this. The cache here is
  // permanent, so storing them unwrapped would mean a whisper that can never be
  // played, forever.
  if (/L16|pcm/i.test(mime)) {
    const rate = Number(/rate=(\d+)/i.exec(mime)?.[1]) || 24000;
    return { bytes: wavFromPcm(bytes, rate), mime: 'audio/wav' };
  }

  if (!looksLikeAudio(bytes)) throw new Error(`gemini returned ${bytes.length} bytes, not audio`);
  return { bytes, mime: /^audio\//i.test(mime) ? mime.split(';')[0].trim() : 'audio/mpeg' };
}

// A 44-byte RIFF header in front of the samples is the whole of "unplayable"
// to "plays everywhere". Nothing is re-encoded: the samples are untouched.
function wavFromPcm(pcm, sampleRate, channels = 1, bits = 16) {
  const out = new Uint8Array(44 + pcm.length);
  const view = new DataView(out.buffer);
  const blockAlign = (channels * bits) / 8;
  const ascii = (at, s) => { for (let i = 0; i < s.length; i += 1) out[at + i] = s.charCodeAt(i); };

  ascii(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length, true); // everything after this field
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM header length
  view.setUint16(20, 1, true); // 1 = uncompressed PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // bytes per second
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bits, true);
  ascii(36, 'data');
  view.setUint32(40, pcm.length, true);
  out.set(pcm, 44);
  return out;
}

// Volcengine (ByteDance / Doubao) large-model speech.
//
// Every provider above this one is unbuyable from where this site is run: OpenAI
// does not sell to mainland China at all, and OpenAI, Google and ElevenLabs
// alike want a card this project does not have. A provider that cannot be paid
// for is not a provider. This one takes domestic payment, which is the only
// reason it is second in the chain rather than further down.
//
// One POST, two credentials, base64 MP3 back. Set VOLC_APPID and
// VOLC_ACCESS_TOKEN and it is live; nothing else here needs touching.
const VOLC_ENDPOINT = 'https://openspeech.bytedance.com/api/v1/tts';
const VOLC_OK = 3000;

// Two of the preset roster, one each. Overridable without a deploy because the
// available voices depend on what the account has enabled, and a voice id that
// is not enabled is a 400 rather than something we can discover from here.
const VOLC_VOICES = {
  warm_female: 'zh_female_wanwanxiaohe_moon_bigtts',
  gentle_male: 'zh_male_wennuanahu_moon_bigtts',
};

async function volcSpeech(input, voiceKey, env) {
  const configured = voiceKey === 'gentle_male' ? env.VOLC_VOICE_MALE : env.VOLC_VOICE_FEMALE;
  const voice = configured || VOLC_VOICES[voiceKey] || VOLC_VOICES.warm_female;

  const res = await fetch(VOLC_ENDPOINT, {
    method: 'POST',
    headers: {
      // Semicolon, not space. This is Volcengine's own spelling of the scheme
      // and an ordinary "Bearer " here fails authentication.
      authorization: `Bearer;${env.VOLC_ACCESS_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      app: {
        appid: env.VOLC_APPID,
        token: env.VOLC_ACCESS_TOKEN,
        cluster: env.VOLC_CLUSTER || 'volcano_tts',
      },
      user: { uid: 'cubewithin' },
      audio: {
        voice_type: voice,
        encoding: 'mp3',
        // Slower than default on purpose, for the same reason the client plays
        // at 0.82: this material is not an announcement.
        speed_ratio: Number(env.VOLC_SPEED || 0.9),
      },
      request: { reqid: crypto.randomUUID(), text: input, operation: 'query' },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`volc ${res.status}: ${detail.slice(0, 160)}`);
  }

  // Answers 200 with a code in the body, so the HTTP status alone means nothing.
  const data = await res.json().catch(() => null);
  if (!data || data.code !== VOLC_OK || !data.data) {
    throw new Error(`volc ${data?.code ?? 'no code'}: ${String(data?.message || '').slice(0, 160)}`);
  }

  const bytes = fromBase64(data.data);
  if (!looksLikeAudio(bytes)) throw new Error(`volc returned ${bytes.length} bytes, not audio`);
  return { bytes, mime: 'audio/mpeg' };
}

// MeloTTS, Cloudflare's own text-to-speech model on the same binding.
//
// The floor of the chain, and the only leg that costs nothing and can be
// reached without the owner signing up for anything. Not as warm as ElevenLabs
// and it takes no delivery direction at all — but it is a real synthesised
// voice rather than the phone's built-in one, and it does not run out.
//
// One voice, no casting. That is a feature here rather than a limitation: the
// complaint being answered is that the same whisper came back in a different
// voice on different days, and a provider with one voice cannot do that.
const MELO_MODEL = '@cf/myshell-ai/melotts';

// MeloTTS takes the language rather than inferring it, and reading Chinese with
// the English model produces something worse than silence. The scripts are
// checked in order of specificity: kana or hangul settle it outright, and only
// then does Han script mean Chinese.
const HAS_KANA = /[぀-ヿ]/;
const HAS_HANGUL = /[가-힯]/;
const HAS_HAN = /[㐀-䶿一-鿿]/;

export function meloLang(text) {
  const s = String(text);
  if (HAS_KANA.test(s)) return 'jp';
  if (HAS_HANGUL.test(s)) return 'kr';
  if (HAS_HAN.test(s)) return 'zh';
  return 'en';
}

async function meloSpeech(input, ai) {
  // This one answers with JSON carrying base64 rather than with a Response, so
  // it does not go through returnRawResponse like Aura does.
  const res = await ai.run(MELO_MODEL, { prompt: input, lang: meloLang(input) });
  const encoded = res && typeof res.audio === 'string' ? res.audio : null;
  if (!encoded) throw new Error('melotts: no audio in response');

  const bytes = fromBase64(encoded);
  if (!looksLikeAudio(bytes)) throw new Error(`melotts returned ${bytes.length} bytes, not audio`);
  return { bytes, mime: 'audio/mpeg' };
}

function fromBase64(encoded) {
  const binary = atob(encoded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
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
