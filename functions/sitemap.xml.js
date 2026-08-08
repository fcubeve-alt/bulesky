import { SITE } from '../src/blog-page.js';
import { escapeHtml } from '../src/markdown.js';

// Official pages only — never user content. Blog posts come from D1 so a post
// published in the admin is in the sitemap immediately, without a deploy.
const STATIC = [
  { loc: '/', changefreq: 'daily', priority: '1.0' },
  { loc: '/about.html', changefreq: 'monthly', priority: '0.7' },
  { loc: '/principles.html', changefreq: 'monthly', priority: '0.7' },
  { loc: '/privacy.html', changefreq: 'monthly', priority: '0.5' },
  { loc: '/blog/', changefreq: 'weekly', priority: '0.8' },
];

function day(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(
    `SELECT slug, updated_at FROM posts WHERE published = 1 ORDER BY created_at DESC`
  ).all();

  const today = day(Date.now());
  const urls = [
    ...STATIC.map((u) => ({ ...u, lastmod: today })),
    ...(results || []).map((p) => ({
      loc: `/blog/${p.slug}`,
      changefreq: 'yearly',
      priority: '0.6',
      lastmod: day(p.updated_at),
    })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${SITE}${escapeHtml(u.loc)}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>
`;

  return new Response(xml, {
    headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=300' },
  });
}
