import { pageShell, html, formatDate } from '../../src/blog-page.js';
import { escapeHtml, excerpt } from '../../src/markdown.js';

const TITLE = 'Blog — Are you all right?';
const DESCRIPTION =
  'Quiet writing about heartbreak, grief, loneliness and the nights that are hard to get through. No user stories, no advice you didn\'t ask for.';

export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(
    `SELECT slug, title, description, body, created_at
       FROM posts WHERE published = 1 ORDER BY created_at DESC`
  ).all();

  const posts = results || [];
  const list = posts.length
    ? `<ul class="post-list">${posts
        .map(
          (p) => `
      <li>
        <a href="/blog/${escapeHtml(p.slug)}">
          <h2>${escapeHtml(p.title)}</h2>
          <p class="meta">${formatDate(p.created_at)}</p>
          <p>${escapeHtml(p.description || excerpt(p.body))}</p>
        </a>
      </li>`
        )
        .join('')}</ul>`
    : '<p>Nothing here yet. The first letters are being written.</p>';

  const body = `
<main>
  <h1>Blog</h1>
  <p class="lede">
    Writing for the hours when it's hard — heartbreak, grief, loneliness, the things
    you can't say to the people closest to you. Nothing here quotes anyone's whisper;
    what people write in the sky stays in the sky.
  </p>

  ${list}

  <hr />
  <p><a class="cta" href="/">Visit the sky →</a></p>
</main>`;

  return html(
    pageShell({
      title: TITLE,
      description: DESCRIPTION,
      canonical: 'https://cubewithin.com/blog/',
      body,
    })
  );
}
