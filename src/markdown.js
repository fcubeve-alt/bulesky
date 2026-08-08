// A deliberately small Markdown subset for blog posts: headings, paragraphs,
// lists, blockquotes, rules, bold/italic, links. Everything is escaped first,
// so a post can never inject markup — the admin is trusted, but a bug in the
// editor shouldn't be able to break the page either.

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Inline: **bold**, *italic*, [text](href). Only http(s) and same-site links
// are allowed through; anything else renders as plain text.
function inline(text) {
  return text
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, href) => {
      const safe = /^(https?:\/\/|\/)/.test(href);
      if (!safe) return label;
      const external = href.startsWith('http');
      const rel = external ? ' target="_blank" rel="noopener noreferrer"' : '';
      return `<a href="${href}"${rel}>${label}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
}

export function renderMarkdown(src) {
  const blocks = escapeHtml(src).replace(/\r\n/g, '\n').split(/\n{2,}/);
  const out = [];

  for (const raw of blocks) {
    const block = raw.trim();
    if (!block) continue;

    if (/^---+$/.test(block)) {
      out.push('<hr />');
    } else if (block.startsWith('### ')) {
      out.push(`<h3>${inline(block.slice(4).trim())}</h3>`);
    } else if (block.startsWith('## ')) {
      out.push(`<h2>${inline(block.slice(3).trim())}</h2>`);
    } else if (block.split('\n').every((l) => l.trim().startsWith('- '))) {
      const items = block
        .split('\n')
        .map((l) => `<li>${inline(l.trim().slice(2).trim())}</li>`)
        .join('');
      out.push(`<ul>${items}</ul>`);
    } else if (block.split('\n').every((l) => l.trim().startsWith('&gt; '))) {
      const text = block
        .split('\n')
        .map((l) => l.trim().slice(5).trim())
        .join(' ');
      out.push(`<blockquote>${inline(text)}</blockquote>`);
    } else {
      out.push(`<p>${inline(block.replace(/\n/g, ' '))}</p>`);
    }
  }

  return out.join('\n');
}

// First paragraph, plain text — used when a post has no description of its own.
export function excerpt(src, max = 180) {
  const first = String(src || '')
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .find((b) => b && !b.startsWith('#') && !b.startsWith('-') && !b.startsWith('>'));
  const text = (first || '').replace(/[*`]/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\n/g, ' ');
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}
