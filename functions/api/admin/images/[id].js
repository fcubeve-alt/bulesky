import { isAuthed, unauthorized } from '../../../../src/admin-auth.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

// Delete an uploaded image for good.
//
// Refuses by default when a post still embeds it — deleting then would leave a
// broken picture in a published article, and the admin has no way to notice.
// ?force=1 goes ahead anyway, which is what the confirm dialog in the editor
// sends once it has told you which posts are affected.
export async function onRequestDelete({ request, params, env }) {
  if (!(await isAuthed(request, env))) return unauthorized();

  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id)) return json({ error: 'invalid_id' }, 400);

  const force = new URL(request.url).searchParams.get('force') === '1';
  if (!force) {
    const used = await env.DB.prepare(`SELECT COUNT(*) AS n FROM posts WHERE body LIKE ?`)
      .bind(`%](/media/${id})%`)
      .first();
    if (used?.n > 0) return json({ error: 'in_use', posts: used.n }, 409);
  }

  await env.DB.prepare(`DELETE FROM images WHERE id = ?`).bind(id).run();
  return json({ ok: true });
}
