// The claim path, against an in-memory database double.
//
// This is the one place where the admin password can change who owns somebody's
// words, so the guards matter more than the feature: only the owner, only rows
// that have no author, and — when a name is given — only that name's. Counting
// first must change nothing at all.
//
//   node tools/claim-test.mjs
import { onRequestPost } from '../functions/api/admin/claim.js';
import { hashSecret } from '../src/identity.js';

const rows = {
  bubbles: [
    { id: 1, code: 'mine', author_hash: null },
    { id: 2, code: 'mine', author_hash: null },
    { id: 3, code: 'someone-else', author_hash: null },
    { id: 4, code: 'mine', author_hash: 'already-owned' },
  ],
  replies: [{ id: 1, code: 'mine', author_hash: null }],
};

function match(table, where, args) {
  const code = where.includes('code = ?') ? args[args.length - 1] : null;
  return rows[table].filter((r) => r.author_hash === null && (code === null || r.code === code));
}

const DB = {
  prepare(sql) {
    const st = {
      bind(...a) { st.args = a; return st; },
      async first() {
        const table = /FROM bubbles/.test(sql) ? 'bubbles' : 'replies';
        const where = sql.split('WHERE ')[1];
        return { n: match(table, where, st.args).length };
      },
      async run() {
        const table = /UPDATE bubbles/.test(sql) ? 'bubbles' : 'replies';
        const where = sql.split('WHERE ')[1];
        const hash = st.args[0];
        for (const r of match(table, where, st.args.slice(1))) r.author_hash = hash;
        return {};
      },
    };
    return st;
  },
};

const env = { DB, ADMIN_PASSWORD: 'pw' };
const results = [];
const check = (name, pass, detail = '') => { results.push(pass); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` (${detail})` : ''}`); };

async function call(body, authed = true) {
  const { issueCookie } = await import('../src/admin-auth.js');
  const cookie = authed ? await issueCookie('pw') : '';
  const request = new Request('https://x/api/admin/claim', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: cookie.split(';')[0] },
    body: JSON.stringify(body),
  });
  const res = await onRequestPost({ request, env });
  return { status: res.status, data: await res.json() };
}

const SECRET = 'ABCDEFGHJKMNPQRSTVWX';
const SECRET_HASH = await hashSecret(SECRET);

// Nobody without the admin password.
const anon = await call({ code: 'mine', secret: SECRET }, false);
check('no admin password, no claim', anon.status === 401);

// Counting changes nothing.
const dry = await call({ code: 'mine' });
check('counting first reports the number', dry.data.would.bubbles === 2, JSON.stringify(dry.data.would));
check('and claims nothing', rows.bubbles.every((r) => r.author_hash !== SECRET_HASH));

// Claiming by name takes only that name's whispers.
const done = await call({ code: 'mine', secret: SECRET });
const hash = SECRET_HASH;
check('claims the whispers signed with that name', rows.bubbles.filter((r) => r.author_hash === hash).length === 2, JSON.stringify(done.data.claimed));
check("leaves somebody else's alone", rows.bubbles.find((r) => r.id === 3).author_hash === null);
check('never touches one that already has an owner', rows.bubbles.find((r) => r.id === 4).author_hash === 'already-owned');
check('takes the replies too', rows.replies[0].author_hash === hash);

const passed = results.every(Boolean);
console.log(passed ? '\nall passed' : '\nSOMETHING FAILED');
process.exit(passed ? 0 : 1);
