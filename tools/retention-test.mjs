// A year, and then really gone.
//
// The Principles page tells people their words do not stay here forever. That
// sentence is only allowed on the page because this file passes: a promise
// about deletion that turns out to mean `hidden = 1` is worse than making no
// promise, because the words are still sitting in the database while the
// person believes they are not.
//
// Runs against real SQLite with the real schema, because what is being checked
// is what the tables look like afterwards.
//
//   node tools/retention-test.mjs
import { DatabaseSync } from 'node:sqlite';
import { sweepExpired, cutoff } from '../src/retention.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let failures = 0;
function check(ok, label) {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bulesky-retention-'));
const db = new DatabaseSync(path.join(dir, 'r.sqlite'));
for (const name of fs.readdirSync('migrations').filter((f) => f.endsWith('.sql')).sort()) {
  try {
    db.exec(fs.readFileSync(path.join('migrations', name), 'utf8'));
  } catch (err) {
    if (!/duplicate column|already exists|no such/i.test(String(err.message))) throw err;
  }
}

// A D1-shaped wrapper over node:sqlite, so the module under test runs the
// statements it will really run.
const env = {
  DB: {
    prepare(sql) {
      const stmt = db.prepare(sql);
      const wrap = (args) => ({
        async all() {
          return { results: stmt.all(...args) };
        },
        async run() {
          return stmt.run(...args);
        },
        async first() {
          return stmt.get(...args) ?? null;
        },
        __run: () => stmt.run(...args),
      });
      const bound = wrap([]);
      bound.bind = (...args) => wrap(args);
      return bound;
    },
    async batch(stmts) {
      for (const s of stmts) s.__run();
    },
  },
};

const NOW = Date.now();
const OLD = cutoff(NOW) - 24 * 60 * 60 * 1000; // a year and a day ago
const RECENT = NOW - 30 * 24 * 60 * 60 * 1000; // last month

function addWhisper(id, at) {
  db.prepare(
    `INSERT INTO bubbles (id, code, type, content, lang, warmth, lights, report_count, hidden, crisis_flag, created_at)
     VALUES (?, 'someone', 'pain', ?, 'zh', 0, 0, 0, 0, 0, ?)`
  ).run(id, `whisper ${id}`, at);
}

addWhisper(1, OLD);
addWhisper(2, OLD);
addWhisper(3, RECENT);
db.prepare(
  `INSERT INTO replies (bubble_id, content, code, lang, report_count, hidden, crisis_flag, created_at)
   VALUES (?, 'a reply', 'friend', 'zh', 0, 0, 0, ?)`
).run(1, OLD);
db.prepare(
  `INSERT INTO replies (bubble_id, content, code, lang, report_count, hidden, crisis_flag, created_at)
   VALUES (?, 'a newer reply', 'friend', 'zh', 0, 0, 0, ?)`
).run(3, RECENT);
db.prepare(
  `INSERT INTO reports (item_type, item_id, reason, status, created_at) VALUES ('bubble', 1, 'x', 'open', ?)`
).run(OLD);
db.prepare(
  `INSERT INTO saves (author_hash, item_type, item_id, created_at) VALUES (?, 'bubble', 1, ?)`
).run('a'.repeat(64), RECENT);

const went = await sweepExpired(env, NOW);
check(went === 2, `the two year-old whispers are swept (${went})`);

const left = db.prepare(`SELECT id FROM bubbles ORDER BY id`).all().map((r) => r.id);
check(left.length === 1 && left[0] === 3, `only the recent one is left (${left.join(',')})`);

// Really deleted, not hidden. This is the distinction the promise rests on.
const stillThere = db.prepare(`SELECT COUNT(*) AS n FROM bubbles WHERE id IN (1,2)`).get().n;
check(stillThere === 0, 'the rows are gone from the table, not flagged hidden');
const anyText = db.prepare(`SELECT COUNT(*) AS n FROM bubbles WHERE content LIKE 'whisper 1%'`).get().n;
check(anyText === 0, 'and the words with them');

// Replies belong to the whisper they hang from.
const replies = db.prepare(`SELECT bubble_id FROM replies`).all().map((r) => r.bubble_id);
check(replies.length === 1 && replies[0] === 3, `replies go with their whisper (${replies.join(',')})`);

// Nothing is left pointing at something that no longer exists.
check(db.prepare(`SELECT COUNT(*) AS n FROM reports`).get().n === 0, 'no orphaned reports');
check(db.prepare(`SELECT COUNT(*) AS n FROM saves`).get().n === 0, 'no orphaned saves');

// A second sweep with nothing left to do is a no-op, not an error.
check((await sweepExpired(env, NOW)) === 0, 'sweeping again does nothing');

// A year old is not yet a year old.
{
  const justUnder = cutoff(NOW) + 60 * 1000;
  addWhisper(4, justUnder);
  check((await sweepExpired(env, NOW)) === 0, 'a whisper one minute short of a year stays');
  check(db.prepare(`SELECT COUNT(*) AS n FROM bubbles WHERE id = 4`).get().n === 1, '…and is still readable');
}

// A broken database must never take a publish down with it.
{
  const angry = { DB: { prepare: () => { throw new Error('nope'); } } };
  let threw = false;
  let out = -1;
  try {
    out = await sweepExpired(angry, NOW);
  } catch {
    threw = true;
  }
  check(!threw && out === 0, 'housekeeping that fails stays quiet');
}

db.close();
fs.rmSync(dir, { recursive: true, force: true });
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
