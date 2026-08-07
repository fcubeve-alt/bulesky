import { pageShell, html, formatDate, SITE } from '../../src/blog-page.js';
import { escapeHtml, renderMarkdown, excerpt } from '../../src/markdown.js';

// A published post. Drafts 404 exactly like a post that never existed, so an
// unfinished piece can't be found by guessing its URL.
export async function onRequestGet({ params, env }) {
  const slug = String(params.slug || '').trim().toLowerCase();
  const post = slug
    ? await env.DB.prepare(
        `SELECT slug, title, description, body, created_at, updated_at
           FROM posts WHERE slug = ? AND published = 1`
      )
        .bind(slug)
        .first()
    : null;

  if (!post) {
    return html(
      pageShell({
        title: 'Not found — Are you all right?',
        description: 'This page could not be found.',
        canonical: `${SITE}/blog/`,
        body: `
<main>
  <h1>Not here</h1>
  <p class="lede">This piece isn't here — it may have been moved, or never published.</p>
  <p><a class="cta" href="/blog/">Back to the blog →</a></p>
</main>`,
      }),
      404
    );
  }

  const url = `${SITE}/blog/${post.slug}`;
  const description = post.description || excerpt(post.body);
  // Inside a <script> block, HTML escaping does not apply — a title containing
  // "</script>" would end the block and everything after it would run. Escaping
  // every "<" as < keeps the JSON valid and closes that door.
  const jsonLd = `<script type="application/ld+json">
${JSON.stringify(
  {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description,
    datePublished: new Date(post.created_at).toISOString().slice(0, 10),
    dateModified: new Date(post.updated_at).toISOString().slice(0, 10),
    url,
    publisher: { '@type': 'Organization', name: 'Are you all right?' },
  },
  null,
  2
).replace(/</g, '\\u003c')}
</script>`;

  const body = `
<main>
  <h1>${escapeHtml(post.title)}</h1>
  <p class="meta">${formatDate(post.created_at)}</p>

  ${renderMarkdown(post.body)}

  <div class="note">
    <p>
      <strong>Are you all right?</strong> is a quiet night sky where you can release
      what you're carrying, anonymously, and strangers answer it kindly. No account,
      no name, nothing indexed by search engines.
    </p>
  </div>

  <hr />
  <p><a class="cta" href="/">Visit the sky →</a></p>
</main>`;

  return html(
    pageShell({ title: `${post.title} — Are you all right?`, description, canonical: url, body, jsonLd })
  );
}
