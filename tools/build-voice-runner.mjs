// Assemble the thing that gets double-clicked.
//
// Two files, into out/:
//
//   read-the-sky.bat   tools/revoice.bat with the upload token substituted in,
//                      written with CRLF line endings
//   revoice.mjs        a copy of the reader, so the very first run works before
//                      the site has served one. Every run after that replaces
//                      it with the live copy by itself.
//
// ⚠️ CRLF is not a nicety. cmd.exe reads a .bat line by line and a lone LF can
// leave a stray character on the end of a SET value or a label — which shows up
// as a token that is one byte wrong, or a GOTO that lands nowhere, and both
// look like a bug in the site rather than in a line ending.
//
// ⚠️ The output carries a live credential. It is a build artifact on a private
// repository and is never committed; anything added here has to keep that true.
//
//   VOICE_UPLOAD_TOKEN=... node tools/build-voice-runner.mjs

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const token = process.env.VOICE_UPLOAD_TOKEN;
if (!token) {
  console.error('VOICE_UPLOAD_TOKEN is not set. A runner without it cannot upload anything.');
  process.exit(1);
}

const here = new URL('.', import.meta.url);
const read = (name) => readFileSync(new URL(name, here), 'utf8');

const PLACEHOLDER = '__VOICE_UPLOAD_TOKEN__';
const bat = read('revoice.bat');
if (!bat.includes(PLACEHOLDER)) {
  console.error(`tools/revoice.bat no longer contains ${PLACEHOLDER}; nothing would be substituted.`);
  process.exit(1);
}

mkdirSync('out', { recursive: true });
writeFileSync(
  'out/read-the-sky.bat',
  bat.replace(PLACEHOLDER, token).replace(/\r?\n/g, '\r\n'),
  'utf8'
);
writeFileSync('out/revoice.mjs', read('revoice.mjs'), 'utf8');

console.log('out/read-the-sky.bat  (token substituted, CRLF)');
console.log('out/revoice.mjs       (first-run copy of the reader)');
