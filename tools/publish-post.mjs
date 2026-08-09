#!/usr/bin/env node
// Publish the next unpublished article from content/posts/.
//
// This replaces generating articles through Cloudflare Workers AI, which never
// once succeeded from CI — the token is refused and the fix is on the account
// side. Rather than leave the blog blocked behind that, the articles are
// written into the repository as Markdown and this publishes one per weekday
// through the same admin API a human editor uses.
//
// It needs exactly one secret, ADMIN_PASSWORD, which is already working. No
// model, no AI token, no quota, nothing that can be rate limited. The only
// upkeep is writing more articles into content/posts/ before the pool runs out,
// and the run says how many are left every time.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DIR = path.join(ROOT, 'content', 'posts');
const SITE = process.env.SITE_URL || 'https://cubewithin.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const PUBLISH = process.env.DRAFT !== '1';

const log = (...a) => console.log('[publish-post]', ...a);

// Front matter is three fields and nothing clever; a YAML parser would be a
// dependency to read six lines.
function readArticle(file) {
  const raw = fs.readFileSync(path.join(DIR, file), 'utf8');
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw);
  if (!m) throw new Error(`${file}: no front matter`);
  const meta = {};
  for (const line of m[1].split('\n')) {
    const at = line.indexOf(':');
    if (at > 0) meta[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  if (!meta.title || !meta.slug) throw new Error(`${file}: needs title and slug`);
  return { file, ...meta, body: m[2].trim() };
}

async function login() {
  const res = await fetch(`${SITE}/api/admin/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: ADMIN_PASSWORD }),
  });
  if (!res.ok) throw new Error(`sign-in failed (${res.status}) — is ADMIN_PASSWORD right?`);
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

async function main() {
  if (!ADMIN_PASSWORD) {
    console.error('[publish-post] ADMIN_PASSWORD is not set — cannot publish.');
    process.exit(1);
  }

  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.md')).sort();
  const articles = files.map(readArticle);

  const cookie = await login();
  const { posts } = await api(cookie, '/api/admin/posts');
  const taken = new Set((posts || []).map((p) => p.slug));

  const next = articles.find((a) => !taken.has(a.slug));
  if (!next) {
    log(`all ${articles.length} articles in content/posts/ are published.`);
    log('Add more .md files there to keep the schedule fed.');
    return;
  }

  // Every one of these is read by someone having a hard night. The helpline
  // goes on all of them, at the end, where whoever read the whole thing is.
  const body =
    `${next.body}\n\n---\n\nIf you are in crisis or thinking about harming ` +
    `yourself, please talk to someone now — [findahelpline.com](https://findahelpline.com) ` +
    `lists free, confidential helplines in your country.\n\n[Visit the sky →](${SITE}/)`;

  const created = await api(cookie, '/api/admin/posts', {
    method: 'POST',
    body: JSON.stringify({
      title: next.title,
      slug: next.slug,
      description: next.description || '',
      body,
      published: PUBLISH ? 1 : 0,
    }),
  });

  const left = articles.filter((a) => !taken.has(a.slug)).length - 1;
  log(`${PUBLISH ? 'published' : 'saved as draft'}: ${SITE}/blog/${created.slug}`);
  log(`"${next.title}" — ${next.body.split(/\s+/).length} words`);
  log(`${left} article${left === 1 ? '' : 's'} left in the pool.`);
  if (left <= 3) log('⚠ running low — add more .md files to content/posts/.');
}

main().catch((e) => {
  console.error('[publish-post] failed:', e.message);
  process.exit(1);
});
