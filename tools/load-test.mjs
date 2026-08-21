// What happens when this is not five people any more.
//
// Two separate questions, measured separately because they fail for different
// reasons and at different sizes:
//
//   1. THE SKY QUERY. Every viewer's sky is a fresh weighted-random sample,
//      re-rolled per request (docs/SKY_FEED.md §3). That is a full table scan
//      plus a sort of the whole table, on every request, and it refetches
//      every 90 seconds per open tab. It is the one query whose cost grows
//      with the corpus rather than staying flat, so it is measured here across
//      four corpus sizes.
//
//   2. EVERYTHING ELSE — opening a whisper, its replies, leaving a light,
//      publishing. These are primary-key or indexed lookups and should be flat
//      no matter how big the corpus gets. Measured at the largest size, and
//      including ten thousand people opening the SAME whisper at once, which
//      is what a whisper going round looks like from the database's side.
//
// This runs against local SQLite, not against D1. D1 is SQLite, and the query
// PLAN is the same one D1 will use, so the shape of the curve transfers even
// though the absolute numbers do not: D1 adds network and its own per-query
// overhead on top of everything here, and applies a hard limit on how many
// rows a single query may examine. Read the numbers as "how much work per
// request", not as "how many milliseconds a visitor waits".
//
//   node tools/load-test.mjs           # 1k, 10k, 100k, 500k
//   SIZES=1000,2000000 node tools/load-test.mjs
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const SIZES = (process.env.SIZES || '1000,10000,100000,500000')
  .split(',')
  .map((s) => parseInt(s, 10))
  .filter(Number.isFinite);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bulesky-load-'));
const file = path.join(dir, 'load.sqlite');
const db = new DatabaseSync(file);

// The real schema, from the real migrations — a load test against a made-up
// table would be measuring the wrong indexes.
for (const name of fs.readdirSync('migrations').filter((f) => f.endsWith('.sql')).sort()) {
  const sql = fs.readFileSync(path.join('migrations', name), 'utf8');
  try {
    db.exec(sql);
  } catch (err) {
    // 0003 rebuilds a table that this fresh database has just created in its
    // final shape, and the post seeds collide with each other. Neither has
    // anything to do with what is being measured.
    if (!/duplicate column|already exists|no such/i.test(String(err.message))) throw err;
  }
}

const WORDS = ['今天', '很想', '你', '一个人', '走了很久', '睡不着', '没关系', '会好的', '谢谢', '对不起'];
function whisper(i) {
  const n = 3 + (i % 20);
  let s = '';
  for (let k = 0; k < n; k++) s += WORDS[(i * 7 + k * 3) % WORDS.length];
  return s;
}

function seed(total) {
  db.exec('DELETE FROM bubbles');
  db.exec('BEGIN');
  const ins = db.prepare(
    `INSERT INTO bubbles (code, type, content, lang, warmth, lights, report_count, hidden, crisis_flag, created_at, author_hash)
     VALUES (?, ?, ?, 'zh', ?, ?, 0, ?, 0, ?, ?)`
  );
  const now = Date.now();
  const YEAR = 365 * 24 * 60 * 60 * 1000;
  for (let i = 1; i <= total; i++) {
    ins.run(
      `name${i % 5000}`,
      i % 2 ? 'pain' : 'wish',
      whisper(i),
      i % 7 === 0 ? (i % 13) : 0, // most have no reply, some have several
      i % 11,
      i % 97 === 0 ? 1 : 0, // ~1% hidden by moderation
      now - Math.floor((i / total) * YEAR),
      // A realistic spread of authors: most whispers belong to someone with a
      // handful of them, a few people have written a lot. Giving a third of the
      // corpus the same author would measure a person who has written 160,000
      // whispers, which is not a person.
      i % 3 === 0 ? String(i % 20000).padStart(64, '0') : null
    );
  }
  db.exec('COMMIT');
  db.exec('ANALYZE');
}

// Exactly the statement in functions/api/bubbles/index.js.
const SKY = `SELECT id, type, content, lang, warmth, lights, created_at
   FROM bubbles
  WHERE hidden = 0
  ORDER BY (
    ABS(RANDOM() % 1000)
    - MIN(warmth, 12) * 45
    - (CASE WHEN warmth = 0 THEN 120 ELSE 0 END)
    - (CASE WHEN created_at > ? THEN 200 ELSE 0 END)
  ) ASC
  LIMIT ?`;

function timeIt(runs, fn) {
  const took = [];
  for (let i = 0; i < runs; i++) {
    const t = process.hrtime.bigint();
    fn(i);
    took.push(Number(process.hrtime.bigint() - t) / 1e6);
  }
  took.sort((a, b) => a - b);
  return {
    median: took[Math.floor(took.length / 2)],
    p95: took[Math.floor(took.length * 0.95)],
    worst: took[took.length - 1],
  };
}

const ms = (n) => `${n.toFixed(2)}ms`.padStart(9);
const num = (n) => n.toLocaleString('en-US').padStart(9);

console.log('THE SKY  — one viewer asking for a sky, at four corpus sizes');
console.log('          (each open tab asks again every 90 seconds)\n');
console.log('    whispers    median       p95     worst   rows scanned');

const sky = db.prepare(SKY);
const rowsScanned = db.prepare(
  `SELECT COUNT(*) AS n FROM bubbles WHERE hidden = 0`
);
const results = [];
for (const size of SIZES) {
  seed(size);
  const fresh = Date.now() - 24 * 60 * 60 * 1000;
  const t = timeIt(40, () => sky.all(fresh, 40));
  const scanned = rowsScanned.get().n;
  results.push({ size, ...t, scanned });
  console.log(`${num(size)}  ${ms(t.median)} ${ms(t.p95)} ${ms(t.worst)}   ${num(scanned)}`);
}

const first = results[0];
const last = results[results.length - 1];
const growth = last.median / first.median;
const sizeGrowth = last.size / first.size;
console.log(
  `\n    ${sizeGrowth}× the whispers costs ${growth.toFixed(1)}× the time — ` +
    (growth > sizeGrowth * 0.6 ? 'linear: every request reads the whole table.' : 'sub-linear.')
);

// The rest, at the largest size, where any hidden scan would show up.
console.log('\nEVERYTHING ELSE  — at ' + num(last.size).trim() + ' whispers\n');

const openOne = db.prepare(
  `SELECT id, type, content, code, lang, warmth, lights, hidden, created_at, author_hash
     FROM bubbles WHERE id = ? AND hidden = 0`
);
const repliesOf = db.prepare(
  `SELECT id, content, code, lang, created_at, author_hash
     FROM replies WHERE bubble_id = ? AND hidden = 0 ORDER BY created_at ASC`
);
const byName = db.prepare(
  `SELECT id, type, content, lang, warmth, crisis_flag, hidden, created_at
     FROM bubbles WHERE code = ? ORDER BY created_at DESC`
);
// The statement from functions/api/me.js.
const mine = db.prepare(
  `SELECT id, type, content, warmth, lights, created_at
     FROM bubbles WHERE author_hash = ? AND hidden = 0
    ORDER BY created_at DESC LIMIT 100`
);
const light = db.prepare(`UPDATE bubbles SET lights = lights + 1 WHERE id = ? RETURNING lights`);
const publish = db.prepare(
  `INSERT INTO bubbles (code, type, content, lang, warmth, report_count, hidden, crisis_flag, created_at, author_hash)
   VALUES (?, 'pain', ?, 'zh', 0, 0, 0, 0, ?, ?)`
);

const cases = [
  ['open a whisper', 2000, (i) => { const id = 1 + (i % last.size); openOne.get(id); repliesOf.all(id); }],
  ['ten thousand people open the SAME one', 10000, () => { openOne.get(12345); repliesOf.all(12345); }],
  ['look a name up', 500, (i) => byName.all(`name${i % 5000}`)],
  ['my sky (by author)', 500, (i) => mine.all(String(i % 20000).padStart(64, '0'))],
  ['leave a light', 2000, (i) => light.get(1 + (i % last.size))],
  ['publish a whisper', 1000, (i) => publish.run('loadtest', whisper(i), Date.now(), null)],
];

console.log('                                          runs    median       p95     worst');
for (const [label, runs, fn] of cases) {
  const t = timeIt(runs, fn);
  console.log(`${label.padEnd(40)} ${String(runs).padStart(6)}  ${ms(t.median)} ${ms(t.p95)} ${ms(t.worst)}`);
}

// The sky query is the whole risk, so say what it would cost as an audience.
const perSky = last.median;
console.log('\nWHAT THAT MEANS\n');
for (const readers of [100, 1000, 10000, 100000]) {
  // One sky per reader on arrival, then one more every 90 seconds.
  const perSec = readers / 90 + readers / 600; // steady refresh + arrivals
  const busy = (perSec * perSky) / 1000;
  console.log(
    `  ${String(readers).padStart(7)} people reading the sky  →  ` +
      `${perSec.toFixed(1)} sky queries/sec, ` +
      `${busy < 1 ? (busy * 100).toFixed(0) + '% of one database busy' : busy.toFixed(1) + '× more than one database can do'}`
  );
}

db.close();
fs.rmSync(dir, { recursive: true, force: true });
