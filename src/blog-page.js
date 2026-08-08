// The HTML shell the blog pages are rendered into — the same header, footer
// and stylesheet as the hand-written official pages (about / privacy /
// principles), so a post published from the admin looks like part of the site
// rather than a different one.

import { escapeHtml } from './markdown.js';

export const SITE = 'https://cubewithin.com';
const BRAND = 'Are you all right?';

function nav(current) {
  const mark = (href) => (href === current ? ' aria-current="page"' : '');
  return `
  <nav class="page-nav">
    <a href="/about.html"${mark('/about.html')}>About</a>
    <a href="/principles.html"${mark('/principles.html')}>Principles</a>
    <a href="/privacy.html"${mark('/privacy.html')}>Privacy</a>
    <a href="/blog/"${mark('/blog/')}>Blog</a>
  </nav>`;
}

export function pageShell({ title, description, canonical, body, current = '/blog/', jsonLd = '' }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="theme-color" content="#ffffff" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}" />
<link rel="canonical" href="${escapeHtml(canonical)}" />
<meta name="robots" content="index,follow" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="${BRAND}" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:url" content="${escapeHtml(canonical)}" />
<meta property="og:image" content="${SITE}/icons/icon.svg" />
<meta name="twitter:card" content="summary" />
<link rel="icon" href="/icons/icon.svg" />
<link rel="stylesheet" href="/css/pages.css?v=3" />
${jsonLd}
</head>
<body>
<div class="page">

<header class="page-header">
  <a class="brand-link" href="/">${BRAND}</a>${nav(current)}
</header>

${body}

<footer class="page-footer">
  <nav>
    <a href="/">The sky</a>
    <a href="/about.html">About</a>
    <a href="/principles.html">Principles</a>
    <a href="/privacy.html">Privacy</a>
    <a href="/blog/">Blog</a>
  </nav>
  <p>Your stories stay private and are not indexed by search engines.</p>
</footer>

</div>
</body>
</html>
`;
}

export function html(markup, status = 200) {
  return new Response(markup, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // Short cache: a post edited in the admin should appear quickly, but the
      // blog shouldn't hit D1 for every crawler request either.
      'cache-control': 'public, max-age=60',
    },
  });
}

// 6 August 2026 — matches the dates on the hand-written pages.
export function formatDate(ms) {
  return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}
