#!/usr/bin/env node
// Write and publish one blog post, unattended.
//
// Walks content/topics.json in order, takes the first topic that has not been
// published yet, writes an article about it, makes two images for it, and posts
// the lot through the same admin API the human editor uses. Nothing here has
// privileges the editor does not.
//
// Everything it needs already exists as a secret: CLOUDFLARE_API_TOKEN and
// CLOUDFLARE_ACCOUNT_ID for the models, ADMIN_PASSWORD to publish.
//
// A word on what this is for. These posts exist to be found by someone typing
// "why does grief hit hardest at night" into a search box at 2am. That is the
// only reason to write them, and it sets every rule below: answer the question
// in the first paragraph, keep the reading level low, never pad for length, and
// never once pretend to be a clinician.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SITE = process.env.SITE_URL || 'https://cubewithin.com';
// Trimmed: a secret pasted with a trailing newline is invisible in the GitHub
// UI and in the logs, and produces authentication failures that look like a
// wrong token.
const ACCOUNT = (process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
const CF_TOKEN = (process.env.CLOUDFLARE_API_TOKEN || '').trim();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
// Overridable so the whole pipeline can be exercised against a stub before it
// is ever pointed at the live site with real money behind it.
const CF_API = process.env.CF_API_BASE || 'https://api.cloudflare.com';
const PUBLISH = process.env.DRAFT !== '1';

// Bigger model first: an 8B writes something that reads like it was written by
// an 8B, and the whole point is to be worth reading.
const TEXT_MODELS = [
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  '@cf/meta/llama-3.1-8b-instruct',
];
const IMAGE_MODEL = '@cf/black-forest-labs/flux-1-schnell';

const log = (...a) => console.log('[write-post]', ...a);

function need(name, value) {
  if (!value) {
    console.error(`[write-post] ${name} is not set — cannot run.`);
    process.exit(1);
  }
  return value;
}

async function cfRun(model, input) {
  const res = await fetch(
    `${CF_API}/client/v4/accounts/${ACCOUNT}/ai/run/${model}`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${CF_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify(input),
    }
  );
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.success === false) {
    const errors = (body && body.errors) || [];
    // Code 10000 here is not a bad token, it is a token without the right
    // permission — the deploy token can reach Pages and D1 and still be refused
    // by Workers AI. Saying so beats leaving someone to decode "Authentication
    // error" from a log.
    if (errors.some((e) => e && (e.code === 10000 || /auth/i.test(e.message || '')))) {
      throw new Error(
        `${model} → Cloudflare refused the token (HTTP ${res.status}). CLOUDFLARE_API_TOKEN ` +
          `cannot call Workers AI. In the Cloudflare dashboard → My Profile → API Tokens → ` +
          `edit this token: (1) add Account · Workers AI · Edit — "Read" alone is not enough ` +
          `to run inference; (2) press Continue to summary and then Save, since adding the ` +
          `row on the form does not apply it; (3) if the token was rotated, update the ` +
          `CLOUDFLARE_API_TOKEN secret in GitHub to the new value.`
      );
    }
    const why = errors.length ? JSON.stringify(errors).slice(0, 200) : res.status;
    throw new Error(`${model} → ${why}`);
  }
  return body.result;
}

// Check the one thing most likely to be wrong before spending anything, so a
// permissions problem is reported as itself rather than as "no text model
// produced an article".
async function checkAccess() {
  try {
    await cfRun(TEXT_MODELS[TEXT_MODELS.length - 1], {
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 1,
    });
    return;
  } catch (e) {
    if (!/cannot call Workers AI/.test(e.message)) return; // a busy model is not a reason to stop
  }

  // Workers AI refused us. There are three different problems that all surface
  // as an authentication failure, and they need three different fixes, so ask
  // Cloudflare which one it is instead of guessing.
  const say = (...a) => console.error('[write-post]', ...a);
  const ask = async (pathname) => {
    try {
      const r = await fetch(`${CF_API}/client/v4${pathname}`, {
        headers: { authorization: `Bearer ${CF_TOKEN}` },
      });
      return { status: r.status, body: await r.json().catch(() => null) };
    } catch (err) {
      return { status: 0, body: { errors: [{ message: String(err.message || err) }] } };
    }
  };

  say('Workers AI refused this token. Checking why…');
  say(`token looks like: ${CF_TOKEN.length} chars, starts "${CF_TOKEN.slice(0, 4)}…"`);
  say(`account id: ${ACCOUNT.length} chars, starts "${ACCOUNT.slice(0, 6)}…"`);

  const verify = await ask('/user/tokens/verify');
  if (verify.status === 200) {
    say('✓ the token itself is valid and active.');
  } else {
    say(`✗ the token is not valid at all (HTTP ${verify.status}).`);
    say('  → CLOUDFLARE_API_TOKEN in GitHub is wrong, expired, or revoked. Make a new');
    say('    token and update the secret. This is not a permissions problem.');
    process.exit(1);
  }

  const acct = await ask(`/accounts/${ACCOUNT}`);
  if (acct.status === 200) {
    say('✓ the token can see this account, so CLOUDFLARE_ACCOUNT_ID is right.');
    say('✗ so the only thing missing is the Workers AI permission on the token.');
    say('  → Cloudflare dashboard → My Profile → API Tokens → edit this token →');
    say('    Permissions → Account · Workers AI · Edit → Continue to summary → Save.');
    say('    If the row is already there, delete it, re-add it, and save again — a row');
    say('    left unsaved on the form looks identical to a saved one.');
  } else {
    say(`✗ the token cannot see account ${ACCOUNT} (HTTP ${acct.status}).`);
    say('  → CLOUDFLARE_ACCOUNT_ID is the wrong account, or this token is scoped to a');
    say('    different one. Copy the Account ID from the Cloudflare dashboard sidebar');
    say('    and update the secret.');
  }
  process.exit(1);
}

// minLength guards against a model that answers with an apology or an empty
// string. It has to differ per call: an article under 400 characters is a
// failure, while a title over 400 characters is also a failure, and using one
// number for both means the title step can never pass.
async function writeText(prompt, system, { minLength = 400, maxTokens = 2400 } = {}) {
  let last;
  for (const model of TEXT_MODELS) {
    try {
      const r = await cfRun(model, {
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
        max_tokens: maxTokens,
        temperature: 0.7,
      });
      const text = String(r.response || '').trim();
      if (text.length >= minLength) return text;
      last = `${model} returned ${text.length} chars`;
    } catch (e) {
      last = e.message;
    }
    log('falling back:', last);
  }
  throw new Error(`no text model produced an article (${last})`);
}

// ---- the article ----

const SYSTEM = `You write for "Are you all right?", a quiet website where people
leave anonymous messages about grief, heartbreak and loneliness, and strangers
answer them kindly.

You are writing for one person who has just typed their question into a search
box, probably late at night, probably not for the first time. Write to them.

Rules, all of them firm:
- Answer the question honestly in the FIRST paragraph. Never open with "In
  today's world" or "Grief is a universal experience" or any other warm-up.
- Plain words. Short sentences. No jargon, no bullet-point listicles of
  "5 tips", no motivational-poster language, no exclamation marks.
- You are NOT a therapist and must never sound like one. No diagnosing, no
  treatment advice, no telling anyone what stage they are in. If something
  needs professional help, say so plainly and briefly.
- Never promise it gets better on a schedule. Never say "everything happens for
  a reason". Never minimise.
- Specific beats general. One concrete, ordinary detail is worth a paragraph of
  abstraction.
- It is fine to say that something is genuinely hard and that there is no fix.

Format: Markdown. Start with "## " for the first section — do NOT repeat the
title as a heading. Use "## " for sections and "### " sparingly. Around 700-900
words. No conclusion that summarises what you just said; end on something a
person would actually want to hear last.`;

async function buildArticle(topic) {
  const body = await writeText(
    `Someone searched: "${topic.query}"\n\nAngle to take: ${topic.angle}\n\n` +
      `Write the article. Markdown only, no title line, no front matter, no commentary.`,
    SYSTEM
  );

  const title = await writeText(
    `Someone searched: "${topic.query}". Write ONE title for an article answering it.\n` +
      `Under 60 characters. Plain and human, not clever, not clickbait, no colon-subtitle,\n` +
      `no quotation marks. Reply with the title and nothing else.`,
    'You write plain, quiet headlines. You reply with the headline only.',
    { minLength: 8, maxTokens: 40 }
  );

  const description = await writeText(
    `Write one sentence, under 155 characters, describing an article that answers:\n` +
      `"${topic.query}". It appears under the link in search results. Plain, calm, no marketing.\n` +
      `Reply with the sentence and nothing else.`,
    'You write plain search descriptions. You reply with the sentence only.',
    { minLength: 20, maxTokens: 80 }
  );

  return {
    title: clean(stripFence(title)).slice(0, 90),
    description: clean(stripFence(description)).slice(0, 180),
    body: stripFence(body),
  };
}

const clean = (s) =>
  String(s)
    .replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

// Small models like wrapping their answer in a code fence.
function stripFence(s) {
  const t = String(s).trim();
  const m = /^```(?:markdown|md)?\n([\s\S]*?)\n```$/.exec(t);
  return (m ? m[1] : t).trim();
}

// ---- images ----

async function makeImage(prompt) {
  const r = await cfRun(IMAGE_MODEL, { prompt, steps: 6 });
  // flux-1-schnell answers with a base64 JPEG.
  const b64 = r && (r.image || r.images?.[0]);
  if (!b64) throw new Error('image model returned no image');
  return `data:image/jpeg;base64,${b64}`;
}

// Deliberately no people, no faces, no text in frame. A stock photo of a sad
// model would make the page look like every other content farm, and a face
// tells the reader who is supposed to be feeling this.
const IMAGE_STYLE =
  'soft natural light, muted colours, calm and quiet mood, cinematic, ' +
  'shallow depth of field, no people, no faces, no text, no words, no letters';

// ---- publishing, through the ordinary admin API ----

async function login() {
  const res = await fetch(`${SITE}/api/admin/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: ADMIN_PASSWORD }),
  });
  if (!res.ok) throw new Error(`sign-in failed (${res.status})`);
  const cookie = res.headers.get('set-cookie');
  if (!cookie) throw new Error('sign-in returned no cookie');
  return cookie.split(';')[0];
}

async function api(cookie, pathname, options = {}) {
  const res = await fetch(`${SITE}${pathname}`, {
    ...options,
    headers: { 'content-type': 'application/json', cookie, ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${pathname} → ${res.status} ${JSON.stringify(data).slice(0, 160)}`);
  return data;
}

async function publishedSlugs(cookie) {
  const { posts } = await api(cookie, '/api/admin/posts');
  return new Set((posts || []).map((p) => p.slug));
}

async function main() {
  need('CLOUDFLARE_ACCOUNT_ID', ACCOUNT);
  need('CLOUDFLARE_API_TOKEN', CF_TOKEN);
  need('ADMIN_PASSWORD', ADMIN_PASSWORD);

  const { topics } = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'topics.json'), 'utf8'));
  await checkAccess();
  const cookie = await login();
  const taken = await publishedSlugs(cookie);

  const topic = topics.find((t) => !taken.has(t.slug));
  if (!topic) {
    log('every topic in content/topics.json has been written. Add more to keep going.');
    return;
  }
  log(`topic: ${topic.query}`);

  const article = await buildArticle(topic);
  log(`title: ${article.title}`);
  log(`${article.body.length} characters`);

  // Images are a nice-to-have. A post with no pictures is worth publishing; a
  // post that never appears because an image model was busy is not.
  const images = [];
  for (const [n, prompt] of [
    [1, `${topic.angle}, atmospheric establishing image. ${IMAGE_STYLE}`],
    [2, `${topic.query}, quiet detail shot, a small ordinary object or window. ${IMAGE_STYLE}`],
  ]) {
    try {
      const dataUrl = await makeImage(prompt);
      const up = await api(cookie, '/api/admin/images', {
        method: 'POST',
        body: JSON.stringify({ dataUrl }),
      });
      images.push(up.url);
      log(`image ${n}: ${up.url} (${Math.round(up.bytes / 1024)} KB)`);
    } catch (e) {
      log(`image ${n} skipped: ${e.message}`);
    }
  }

  let body = article.body;
  if (images[0]) body = `![](${images[0]})\n\n${body}`;
  if (images[1]) {
    // Drop the second one at a section break near the middle rather than at the
    // end, where nobody scrolls to.
    const marks = [...body.matchAll(/\n## /g)].map((m) => m.index);
    const at = marks.length > 1 ? marks[Math.floor(marks.length / 2)] : -1;
    body = at > 0 ? `${body.slice(0, at)}\n\n![](${images[1]})\n${body.slice(at)}` : `${body}\n\n![](${images[1]})`;
  }

  // Every one of these pages is read by someone having a hard night. The line
  // goes on all of them, at the end, where someone who read the whole thing is.
  body += `\n\n---\n\nIf you are in crisis or thinking about harming yourself, please talk to someone now — [findahelpline.com](https://findahelpline.com) lists free, confidential helplines in your country.\n\n[Visit the sky →](${SITE}/)`;

  const created = await api(cookie, '/api/admin/posts', {
    method: 'POST',
    body: JSON.stringify({
      title: article.title,
      slug: topic.slug,
      description: article.description,
      body,
      published: PUBLISH ? 1 : 0,
    }),
  });

  log(`${PUBLISH ? 'published' : 'saved as draft'}: ${SITE}/blog/${created.slug}`);
}

main().catch((e) => {
  console.error('[write-post] failed:', e.message);
  process.exit(1);
});
