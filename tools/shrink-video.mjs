#!/usr/bin/env node
// Re-encode the scenery clips down to a size a phone can actually open with.
//
// Why this exists: the stock clips arrive at broadcast bitrates — one 12-second
// river clip was 1920x1080 at 16.4 Mbps, 24MB. They are backgrounds. They play
// muted, behind a dark scrim, on a 390px-wide screen. Nothing about that needs
// 16 Mbps. Measured on a throttled 4G phone, a cold first visit was spending
// 30–100MB and the video still had not reached a playable state after 30
// seconds — the site felt broken before it felt slow.
//
// 1280px long edge, CRF 30, no audio: the same clip becomes 1.5MB and looks
// indistinguishable once it is behind the scrim.
//
// Idempotent: a clip already at or under the target is left alone, so this can
// run on every media fetch and only touches what has just arrived.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const DIR = process.argv[2] || 'public/video';
const MAX_EDGE = 1280;
const CRF = 30;
// Anything already this lean is left as it is. Set above the ~1.1 Mbps the
// encoder lands on so re-running does not slowly grind clips down each time.
const TARGET_BPS = 2_000_000;

function probe(file) {
  const out = execFileSync('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,bit_rate',
    '-show_entries', 'format=duration,bit_rate',
    '-of', 'json',
    file,
  ]).toString();
  const j = JSON.parse(out);
  const s = j.streams?.[0] || {};
  const bitRate = Number(s.bit_rate) || Number(j.format?.bit_rate) || 0;
  return { width: Number(s.width) || 0, height: Number(s.height) || 0, bitRate };
}

const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.mp4')).sort();
let before = 0;
let after = 0;
let touched = 0;

for (const name of files) {
  const file = path.join(DIR, name);
  const size = fs.statSync(file).size;
  before += size;

  let info;
  try {
    info = probe(file);
  } catch {
    console.log(`?  ${name} — unreadable, left alone`);
    after += size;
    continue;
  }

  if (info.bitRate && info.bitRate <= TARGET_BPS && Math.max(info.width, info.height) <= MAX_EDGE) {
    after += size;
    continue;
  }

  const tmp = `${file}.shrink.mp4`;
  try {
    execFileSync('ffmpeg', [
      '-v', 'error', '-y', '-i', file,
      // Scale the long edge to MAX_EDGE, leave anything already smaller alone.
      // -2 keeps the aspect ratio and an even number of pixels, which H.264
      // requires.
      '-vf', `scale='if(gt(iw,ih),min(${MAX_EDGE},iw),-2)':'if(gt(iw,ih),-2,min(${MAX_EDGE},ih))'`,
      '-c:v', 'libx264', '-profile:v', 'high', '-crf', String(CRF), '-preset', 'veryfast',
      '-pix_fmt', 'yuv420p', '-r', '30', '-g', '60',
      '-an', // the backgrounds are muted; the audio track was dead weight
      '-movflags', '+faststart', // playback can start before the file is in
      tmp,
    ]);
  } catch (e) {
    console.log(`!  ${name} — encode failed, left alone`);
    try { fs.unlinkSync(tmp); } catch { /* never written */ }
    after += size;
    continue;
  }

  const newSize = fs.statSync(tmp).size;
  // Refuse a "shrink" that grew the file — an already-efficient clip re-encoded
  // is worse than the one we had.
  if (newSize >= size) {
    fs.unlinkSync(tmp);
    console.log(`=  ${name} — re-encode was not smaller, kept original`);
    after += size;
    continue;
  }

  fs.renameSync(tmp, file);
  after += newSize;
  touched += 1;
  console.log(
    `↓  ${name}  ${(size / 1e6).toFixed(1)} MB → ${(newSize / 1e6).toFixed(1)} MB` +
      `  (${info.width}x${info.height} @ ${(info.bitRate / 1e6).toFixed(1)} Mbps)`
  );
}

console.log(
  `\nshrink-video: ${touched}/${files.length} re-encoded. ` +
    `${(before / 1e6).toFixed(0)} MB → ${(after / 1e6).toFixed(0)} MB.`
);
