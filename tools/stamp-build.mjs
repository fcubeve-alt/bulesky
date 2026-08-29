// Write the current commit into index.html as the build stamp.
//
// The stamp is what /diag.html reports and what the self-heal in app.js compares
// against, so it has to be rewritten on every deploy — a stamp that never
// changes would make every phone look up to date forever, which is precisely the
// failure it exists to catch.
//
// Run from the deploy workflow, before `wrangler pages deploy`.
//
//   node tools/stamp-build.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const FILE = 'public/index.html';

function stamp() {
  // The commit, when there is one. In a checkout without git history — or any
  // other odd build environment — fall back to the time, which still changes on
  // every deploy and so still does the job.
  try {
    const sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    if (sha) return sha;
  } catch {
    /* no git here */
  }
  return `t${Math.floor(Date.now() / 1000)}`;
}

const value = stamp();
const html = readFileSync(FILE, 'utf8');
const re = /(<meta name="build-stamp" content=")([^"]*)(" \/>)/;

if (!re.test(html)) {
  // Not fatal, and deliberately so: a missing stamp turns the self-heal off
  // rather than breaking a deploy. But say it loudly, because with it off the
  // stale-cache bug comes back silently.
  console.error('::warning::No build-stamp meta in index.html — self-heal is off.');
  process.exit(0);
}

const before = html.match(re)[2];
writeFileSync(FILE, html.replace(re, `$1${value}$3`));
console.log(`build stamp: ${before || '(empty)'} → ${value}`);
