#!/usr/bin/env node
// Guard against shipping a broken stylesheet.
//
// Written after two stray "}" survived an edit, silently swallowed the rule
// that followed them (.top-bar), and shipped — the whole top row of buttons
// vanished behind the balloons on the live site. Browsers never complain about
// this; they discard the damage and carry on, so nothing caught it.
//
// Scans character by character rather than with regexes. The first version of
// this file used regexes to blank out comments and strings, and an apostrophe
// inside an English comment ("doesn't") threw off the quote pairing far enough
// to hide the very bug it was written to catch.

import fs from 'node:fs';
import path from 'node:path';

const DIR = 'public/css';

function findProblems(src) {
  const problems = [];
  let depth = 0;
  let line = 1;
  let i = 0;

  while (i < src.length) {
    const c = src[i];

    if (c === '\n') {
      line += 1;
      i += 1;
    } else if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? src.length : end + 2;
      for (let k = i; k < stop; k++) if (src[k] === '\n') line += 1;
      i = stop;
    } else if (c === '"' || c === "'") {
      i += 1;
      while (i < src.length && src[i] !== c) {
        if (src[i] === '\\') i += 1; // escaped char
        else if (src[i] === '\n') line += 1;
        i += 1;
      }
      i += 1; // closing quote
    } else if (c === '{') {
      depth += 1;
      i += 1;
    } else if (c === '}') {
      depth -= 1;
      if (depth < 0) {
        problems.push(`line ${line}: stray "}" with no rule open — the rule after it is silently dropped`);
        depth = 0;
      }
      i += 1;
    } else {
      i += 1;
    }
  }

  if (depth > 0) problems.push(`${depth} unclosed "{" — everything after it is swallowed`);
  return problems;
}

let bad = 0;
for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith('.css'))) {
  const full = path.join(DIR, file);
  for (const p of findProblems(fs.readFileSync(full, 'utf8'))) {
    console.error(`${full}: ${p}`);
    bad += 1;
  }
}

if (bad) {
  console.error(`\ncheck-css: ${bad} problem(s). Refusing to deploy a stylesheet that will not parse as written.`);
  process.exit(1);
}
console.log('check-css: stylesheets balanced.');
