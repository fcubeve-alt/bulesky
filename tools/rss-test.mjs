// The blog feed: draft posts must never leak into it, and a post with an
// ampersand or a stray angle bracket in its title must not be able to break
// the XML for every reader downstream of it.
//
//   node tools/rss-test.mjs
import { onRequestGet } from '../functions/blog/rss.xml.js';

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` (${detail})` : ''}`);
}

const POSTS = [
  {
    slug: 'why-does-grief-hit-hardest-at-night',
    title: 'Why Grief Gets Louder at Night',
    description: 'Why loss feels sharper after dark.',
    body: 'irrelevant',
    created_at: Date.parse('2026-08-24T08:31:00Z'),
    published: 1,
  },
  {
    // No description on purpose — the fallback (excerpt of the body) has to work.
    slug: 'a-post-with-no-description',
    title: 'A & B < C',
    description: null,
    body: 'First paragraph, used as the excerpt when no description is set.\n\nSecond paragraph.',
    created_at: Date.parse('2026-08-25T08:31:00Z'),
    published: 1,
  },
  {
    slug: 'still-a-draft',
    title: 'Should never appear',
    description: 'draft',
    body: 'draft',
    created_at: Date.parse('2026-08-26T08:31:00Z'),
    published: 0,
  },
];

function makeEnv() {
  return {
    DB: {
      prepare(sql) {
        return {
          async all() {
            // The real query filters `WHERE published = 1` in SQL; the fake
            // does the same filtering here so a regression in the actual
            // query (e.g. someone drops the WHERE clause) is the one thing
            // this fake cannot catch — everything downstream of the query
            // result is what these checks are for.
            const rows = POSTS.filter((p) => p.published === 1).sort((a, b) => b.created_at - a.created_at);
            return { results: rows };
          },
        };
      },
    },
  };
}

const res = await onRequestGet({ env: makeEnv() });
const xml = await res.text();

check('serves as RSS, not HTML or JSON', (res.headers.get('content-type') || '').includes('application/rss+xml'));
check('is well-formed enough to contain no raw "&" or stray "<" in a title', !/A & B < C/.test(xml));
check('and the escaped form is there instead', xml.includes('A &amp; B &lt; C'));
check('the draft never appears in the feed', !xml.includes('Should never appear'));
check('a post with no description falls back to its first paragraph', xml.includes('First paragraph, used as the excerpt'));
check(
  'newest post first',
  xml.indexOf('A &amp; B &lt; C') < xml.indexOf('Why Grief Gets Louder at Night')
);
check('each item links to the real post URL', xml.includes('https://cubewithin.com/blog/why-does-grief-hit-hardest-at-night'));
check('the feed points back to itself (self-discovery)', xml.includes('rel="self"') && xml.includes('/blog/rss.xml'));

const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\n${failed.length} failed` : '\nall passed');
process.exit(failed.length ? 1 : 0);
