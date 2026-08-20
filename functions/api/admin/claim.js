import { isAuthed, unauthorized } from '../../../src/admin-auth.js';
import { cleanSecret, hashSecret } from '../../../src/identity.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

// Taking ownership of whispers written before authorship existed.
//
// Everything posted before the identity system has `author_hash IS NULL`, and
// nothing can ever prove who wrote it — which is why the ordinary delete path
// refuses to let anyone claim those by simply presenting a secret. Otherwise
// the first stranger to guess could take over somebody else's old words.
//
// The site owner is the one exception, and only because they already hold the
// power this grants: the moderation queue can hide or clear any whisper on the
// site. So this adds no new authority, it just moves those whispers into the
// owner's own My Sky, where the ordinary buttons work on them.
//
// Two guards on top of the admin password:
//
//   `code`   claims only whispers signed with that name, which is how the
//            owner takes their own and leaves everyone else's alone. Strongly
//            preferred, and what the admin page fills in.
//   dry run  no `secret` means "count what this would claim" — the interface
//            can say "42 whispers under 夜里的猫" before anything happens.
//
// Only ever rows with no author. A whisper that already belongs to somebody is
// never touched, admin password or not.
export async function onRequestPost({ request, env }) {
  if (!(await isAuthed(request, env))) return unauthorized();

  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const code = String(body.code || '').trim().toLowerCase();
  const where = code ? `author_hash IS NULL AND code = ?` : `author_hash IS NULL`;
  const args = code ? [code] : [];

  const counts = async () => ({
    bubbles: (await env.DB.prepare(`SELECT COUNT(*) AS n FROM bubbles WHERE ${where}`).bind(...args).first()).n,
    replies: (await env.DB.prepare(`SELECT COUNT(*) AS n FROM replies WHERE ${where}`).bind(...args).first()).n,
  });

  const secret = cleanSecret(body.secret);
  if (!secret) {
    // No secret: report what would be claimed and change nothing. A malformed
    // recovery code lands here too, which is the right answer — better a count
    // than a silent no-op the owner reads as success.
    return json({ ok: true, dryRun: true, code: code || null, would: await counts() });
  }

  const before = await counts();
  const hash = await hashSecret(secret);

  await env.DB.prepare(`UPDATE bubbles SET author_hash = ? WHERE ${where}`).bind(hash, ...args).run();
  await env.DB.prepare(`UPDATE replies SET author_hash = ? WHERE ${where}`).bind(hash, ...args).run();

  return json({ ok: true, code: code || null, claimed: before });
}
