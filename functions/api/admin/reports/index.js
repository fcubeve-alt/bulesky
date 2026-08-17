import { isAuthed, unauthorized } from '../../../../src/admin-auth.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

const LIMIT = 100;

// The queue, newest first, with the reported words attached.
//
// A report is unreviewable without the text it is about, and looking each one
// up by hand is how a queue stops being read. The content comes from whichever
// table the report points at, including content that is already hidden — the
// whole job here is deciding whether hiding it was right.
//
// `?status=open` by default: the reviewed ones stay in the table as the record
// of what was decided, but they are not what anyone opens this page to see.
export async function onRequestGet({ request, env }) {
  if (!(await isAuthed(request, env))) return unauthorized();

  const url = new URL(request.url);
  const status = url.searchParams.get('status') || 'open';

  const { results } = await env.DB.prepare(
    status === 'all'
      ? `SELECT * FROM reports ORDER BY created_at DESC LIMIT ?`
      : `SELECT * FROM reports WHERE status = ? ORDER BY created_at DESC LIMIT ?`
  )
    .bind(...(status === 'all' ? [LIMIT] : [status, LIMIT]))
    .all();

  const rows = results || [];
  const items = await Promise.all(
    rows.map(async (r) => {
      const table = r.item_type === 'bubble' ? 'bubbles' : 'replies';
      const item = await env.DB.prepare(
        `SELECT id, content, code, hidden, report_count, deleted_at, created_at
           FROM ${table} WHERE id = ?`
      )
        .bind(r.item_id)
        .first();
      return {
        ...r,
        item: item
          ? {
              ...item,
              // The author's own deletion and a moderator's hiding both leave
              // `hidden = 1`. Telling them apart is the difference between "we
              // removed this" and "they took it back", which is the first thing
              // anyone answering a complaint needs to know.
              gone: item.deleted_at ? 'author' : item.hidden ? 'hidden' : null,
            }
          : null,
      };
    })
  );

  // Counts for the header, so nobody has to guess whether the queue is empty
  // because it is clean or because a filter is on.
  const counts = await env.DB.prepare(
    `SELECT status, COUNT(*) AS n FROM reports GROUP BY status`
  ).all();

  return json({
    reports: items,
    counts: Object.fromEntries((counts.results || []).map((c) => [c.status, c.n])),
  });
}
