import { SITE } from '../../src/blog-page.js';
import { escapeHtml, excerpt } from '../../src/markdown.js';

// A feed, so the blog can be found somewhere other than a search result.
//
// There was no way to subscribe to this blog at all — no feed for a reader
// like Feedreader/Feedly, nothing to hand a directory or aggregator that asks
// for one. That is a real gap in getting the writing in front of anyone: most
// grief/loneliness content directories and feed readers want an RSS URL before
// they'll list a site, and without one this blog was invisible to all of them
// no matter how good a post was.
//
// Modelled on sitemap.xml.js — same D1 query shape, same content-type-driven
// XML response, nothing clever added.
const TITLE = 'Are you all right? — Blog';
const DESCRIPTION =
  'Quiet writing about heartbreak, grief, loneliness and the nights that are hard to get through.';

function rfc822(ms) {
  return new Date(ms).toUTCString();
}

export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(
    `SELECT slug, title, description, body, created_at
       FROM posts WHERE published = 1 ORDER BY created_at DESC LIMIT 30`
  ).all();

  const posts = results || [];
  const items = posts
    .map((p) => {
      const url = `${SITE}/blog/${p.slug}`;
      const description = p.description || excerpt(p.body, 300);
      return `  <item>
    <title>${escapeHtml(p.title)}</title>
    <link>${url}</link>
    <guid isPermaLink="true">${url}</guid>
    <pubDate>${rfc822(p.created_at)}</pubDate>
    <description>${escapeHtml(description)}</description>
  </item>`;
    })
    .join('\n');

  const lastBuild = posts.length ? rfc822(posts[0].created_at) : rfc822(Date.now());

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>${escapeHtml(TITLE)}</title>
  <link>${SITE}/blog/</link>
  <description>${escapeHtml(DESCRIPTION)}</description>
  <language>en</language>
  <lastBuildDate>${lastBuild}</lastBuildDate>
  <atom:link xmlns:atom="http://www.w3.org/2005/Atom" href="${SITE}/blog/rss.xml" rel="self" type="application/rss+xml" />
${items}
</channel>
</rss>
`;

  return new Response(xml, {
    headers: { 'content-type': 'application/rss+xml; charset=utf-8', 'cache-control': 'public, max-age=300' },
  });
}
