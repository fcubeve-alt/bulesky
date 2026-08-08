// Serve an uploaded blog image. Public — these are pictures in published
// posts, not user content. Lives at /media/<id> rather than under /blog/ so it
// can never be mistaken for a post slug.
//
// Immutable caching: an id always points at the same bytes (editing a post
// uploads a new image and gets a new id), so browsers and Cloudflare's edge can
// keep it for good and the database is read once.
export async function onRequestGet({ params, env }) {
  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id)) return new Response('Not found', { status: 404 });

  const row = await env.DB.prepare(`SELECT mime, data FROM images WHERE id = ?`)
    .bind(id)
    .first();
  if (!row) return new Response('Not found', { status: 404 });

  return new Response(row.data, {
    headers: {
      'content-type': row.mime,
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
}
