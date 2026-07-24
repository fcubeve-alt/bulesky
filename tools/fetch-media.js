#!/usr/bin/env node
// Automated media fetcher — runs in GitHub Actions (open internet), NOT in
// the dev sandbox (whose network is locked down). It pulls license-safe,
// free-to-use media into the app's libraries and rewrites the manifests:
//
//   • Ambient MUSIC  ← Internet Archive (public-domain / Creative-Commons).
//                       Fully automatic, no API key required.
//   • Scenery VIDEO  ← Pixabay (Pixabay License: free, no attribution),
//                       only when PIXABAY_API_KEY is set. We deliberately do
//                       NOT scrape license-unclear video sources.
//
// Everything is best-effort: any source that fails is skipped, and the app
// keeps working (music falls back to a soft synth pad; video falls back to
// the hand-drawn lake scene). Caps keep the git repo from ballooning.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const VIDEO_DIR = path.join(ROOT, 'public', 'video');
const MUSIC_DIR = path.join(ROOT, 'public', 'music');

const MAX_VIDEOS = 4;
const MAX_AUDIO = 6;
const MAX_VIDEO_BYTES = 18 * 1024 * 1024;
const MAX_AUDIO_BYTES = 9 * 1024 * 1024;

const UA = 'bulesky-media-fetcher/1.0 (starry-mind; contact: repo owner)';

function log(...a) {
  console.log('[fetch-media]', ...a);
}

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'track';
}

async function getJSON(url, headers = {}) {
  const res = await fetch(url, { headers: { 'user-agent': UA, ...headers } });
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return res.json();
}

// Download to disk only if within the size cap. Returns bytes written.
async function download(url, destPath, maxBytes) {
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`download ${url} → ${res.status}`);
  const len = parseInt(res.headers.get('content-length') || '0', 10);
  if (len && len > maxBytes) throw new Error(`too large (${len} > ${maxBytes})`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) throw new Error(`too large (${buf.length} > ${maxBytes})`);
  fs.writeFileSync(destPath, buf);
  return buf.length;
}

function readManifest(file, key) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Array.isArray(data[key])) return data[key];
  } catch {
    /* fresh */
  }
  return [];
}

// Keep only entries whose files still exist, newest first, capped.
function pruneManifest(entries, dir, cap) {
  const kept = entries.filter((e) => {
    const p = path.join(dir, path.basename(e.src));
    return fs.existsSync(p);
  });
  // De-dupe by src.
  const seen = new Set();
  const unique = kept.filter((e) => (seen.has(e.src) ? false : seen.add(e.src)));
  const trimmed = unique.slice(0, cap);
  // Delete files that fell out of the cap.
  for (const e of unique.slice(cap)) {
    const p = path.join(dir, path.basename(e.src));
    try { fs.unlinkSync(p); } catch { /* ignore */ }
  }
  return trimmed;
}

// ---------------- Music: Internet Archive, public-domain only ----------------

// Only accept genuinely public-domain / CC0 licenses: no attribution burden,
// no NonCommercial/NoDerivatives restrictions (this is a public, donation-
// supported site). Anything else is rejected.
function isPublicDomain(licenseurl) {
  const u = String(licenseurl || '').toLowerCase();
  if (!u) return false;
  if (u.includes('publicdomain') || u.includes('/zero/') || u.includes('mark')) return true;
  return false;
}

// Reject off-brand / disturbing titles — this is a gentle, healing space.
const TITLE_BLOCK = /\b(rape|blood|bleed|death|kill|gore|satan|hell|drug|porn|sex|nsfw|nazi|war|gun|suicide|terror|hate|noise|scream|horror)\b/i;

function titleOk(s) {
  return s && !TITLE_BLOCK.test(String(s));
}

async function fetchArchiveAudio(existing) {
  const have = new Set(existing.map((e) => e.id).filter(Boolean));
  const added = [];

  // Curated calm, public-domain collections (classical performances + solo
  // piano) — far safer and more on-brand than an open "ambient" keyword.
  const collections = ['musopen', 'DailyPianoPodcast', 'coucou'];
  const collection = collections[Math.floor(Math.random() * collections.length)];

  const search =
    'https://archive.org/advancedsearch.php?q=' +
    encodeURIComponent(
      `collection:(${collection}) AND mediatype:audio AND format:(VBR MP3) AND licenseurl:(*publicdomain* OR *creativecommons.org/publicdomain*)`
    ) +
    '&fl[]=identifier&fl[]=title&fl[]=licenseurl&sort[]=downloads+desc&rows=50&output=json';

  let docs = [];
  try {
    const j = await getJSON(search);
    docs = (j.response && j.response.docs) || [];
  } catch (e) {
    log('archive search failed:', e.message);
    return added;
  }
  docs.sort(() => Math.random() - 0.5);

  for (const doc of docs) {
    if (added.length >= 2) break;
    if (have.has(doc.identifier)) continue;
    if (!isPublicDomain(doc.licenseurl)) continue; // PD/CC0 only
    if (!titleOk(doc.title) || !titleOk(doc.identifier)) {
      log('skip (title):', doc.identifier);
      continue;
    }
    try {
      const meta = await getJSON(`https://archive.org/metadata/${doc.identifier}`);
      const files = (meta.files || []).filter(
        (f) => /\.mp3$/i.test(f.name || '') && f.size && Number(f.size) <= MAX_AUDIO_BYTES && titleOk(f.name)
      );
      if (!files.length) continue;
      const file = files.sort((a, b) => Number(a.size) - Number(b.size))[Math.floor(files.length / 2)];
      const url = `https://archive.org/download/${doc.identifier}/${encodeURIComponent(file.name)}`;
      const fname = `${slugify(doc.identifier)}.mp3`;
      const dest = path.join(MUSIC_DIR, fname);
      const bytes = await download(url, dest, MAX_AUDIO_BYTES);
      added.push({
        id: doc.identifier,
        title: (doc.title || 'Untitled').toString().slice(0, 80),
        src: `/music/${fname}`,
        source: `https://archive.org/details/${doc.identifier}`,
        license: doc.licenseurl,
      });
      log(`+ music: ${fname} (${(bytes / 1e6).toFixed(1)} MB)`);
    } catch (e) {
      log('archive item skipped:', doc.identifier, e.message);
    }
  }
  return added;
}

// ---------------- Video: Pixabay (needs free API key) ----------------

async function fetchPixabayVideo(existing) {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) {
    log('PIXABAY_API_KEY not set → skipping scenery video auto-fetch.');
    return [];
  }
  const have = new Set(existing.map((e) => e.id).filter(Boolean));
  const added = [];
  const queries = ['calm lake', 'misty mountains', 'snow forest', 'night sky stars', 'aurora'];
  const q = queries[Math.floor(Math.random() * queries.length)];
  const url =
    `https://pixabay.com/api/videos/?key=${encodeURIComponent(key)}` +
    `&q=${encodeURIComponent(q)}&category=nature&per_page=30&safesearch=true`;

  let hits = [];
  try {
    const j = await getJSON(url);
    hits = j.hits || [];
  } catch (e) {
    log('pixabay search failed:', e.message);
    return added;
  }
  hits.sort(() => Math.random() - 0.5);

  for (const hit of hits) {
    if (added.length >= 2) break;
    const id = `pixabay-${hit.id}`;
    if (have.has(id)) continue;
    // Prefer the "small" rendition to stay within size/repo limits.
    const v = (hit.videos && (hit.videos.small || hit.videos.tiny || hit.videos.medium)) || null;
    if (!v || !v.url) continue;
    try {
      const fname = `${slugify(q)}-${hit.id}.mp4`;
      const dest = path.join(VIDEO_DIR, fname);
      const bytes = await download(v.url, dest, MAX_VIDEO_BYTES);
      added.push({
        id,
        title: `${q} #${hit.id}`,
        src: `/video/${fname}`,
        source: hit.pageURL || 'https://pixabay.com',
        license: 'Pixabay License (free, no attribution required)',
      });
      log(`+ video: ${fname} (${(bytes / 1e6).toFixed(1)} MB)`);
    } catch (e) {
      log('pixabay item skipped:', hit.id, e.message);
    }
  }
  return added;
}

// ---------------- Main ----------------

(async () => {
  fs.mkdirSync(VIDEO_DIR, { recursive: true });
  fs.mkdirSync(MUSIC_DIR, { recursive: true });

  const musicFile = path.join(MUSIC_DIR, 'manifest.json');
  const videoFile = path.join(VIDEO_DIR, 'manifest.json');

  let music = readManifest(musicFile, 'tracks');
  let videos = readManifest(videoFile, 'videos');

  const newMusic = await fetchArchiveAudio(music).catch((e) => (log('music error', e.message), []));
  const newVideos = await fetchPixabayVideo(videos).catch((e) => (log('video error', e.message), []));

  // Newest first, then prune to caps (and delete dropped files).
  music = pruneManifest([...newMusic, ...music], MUSIC_DIR, MAX_AUDIO);
  videos = pruneManifest([...newVideos, ...videos], VIDEO_DIR, MAX_VIDEOS);

  fs.writeFileSync(musicFile, JSON.stringify({ tracks: music }, null, 2) + '\n');
  fs.writeFileSync(videoFile, JSON.stringify({ videos }, null, 2) + '\n');

  log(`done. music tracks: ${music.length} (+${newMusic.length}), videos: ${videos.length} (+${newVideos.length})`);
  // Signal to CI whether anything changed (for the commit step).
  if (newMusic.length + newVideos.length > 0) process.exitCode = 0;
})().catch((e) => {
  console.error('[fetch-media] fatal', e);
  process.exit(1);
});
