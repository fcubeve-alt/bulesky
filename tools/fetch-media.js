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

// Accumulate a large curated library over many runs (don't overwrite good
// clips). We only prune once these caps are exceeded; the owner curates by
// asking to remove specific items.
const MAX_VIDEOS = 40;
const MAX_AUDIO = 40;
const MAX_VIDEO_BYTES = 24 * 1024 * 1024; // Cloudflare Pages per-file limit is 25 MB
const MAX_AUDIO_BYTES = 12 * 1024 * 1024;
// Curated classical pieces can be longer (a Chaconne runs ~14 min), so give
// them a larger budget — still under the 25 MB Cloudflare Pages per-file cap.
const CLASSICAL_MAX_BYTES = 22 * 1024 * 1024;
const VIDEOS_PER_RUN = 4;
const AUDIO_PER_RUN = 4;
const CLASSICAL_PER_RUN = 8;

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

// Keep only entries whose files still exist, newest first, capped. Entries
// flagged `pinned` (curated classical) are always kept and never counted
// toward the cap, so an active auto-fetch stream can't slowly evict them.
function pruneManifest(entries, dir, cap) {
  const kept = entries.filter((e) => {
    const p = path.join(dir, path.basename(e.src));
    return fs.existsSync(p);
  });
  // De-dupe by src.
  const seen = new Set();
  const unique = kept.filter((e) => (seen.has(e.src) ? false : seen.add(e.src)));
  const pinned = unique.filter((e) => e.pinned);
  const rest = unique.filter((e) => !e.pinned);
  const trimmed = [...pinned, ...rest.slice(0, cap)];
  // Delete files that fell out of the cap (pinned entries are exempt).
  for (const e of rest.slice(cap)) {
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

// ---------- Music: curated classical, public-domain (Internet Archive) --------

// A hand-picked list of calm, on-brand standard-repertoire pieces the owner
// asked for. All are pre-20th-century COMPOSITIONS in the public domain; we
// still fetch only PUBLIC-DOMAIN RECORDINGS of them (mostly the Musopen
// project's PD performances hosted on the Internet Archive), because a
// recording carries its own copyright even when the music itself is PD.
//
// Matching is deliberately strict: for each piece, every `groups` bucket must
// be satisfied by at least one of its alternative tokens appearing in the
// candidate's title/identifier/creator. That keeps us from grabbing the wrong
// nocturne. `pinned` protects them from the auto-prune cap.
//
// NOTE: modern neo-classical (Einaudi, Yann Tiersen, Max Richter, …) is NOT
// here — those composers are living and their works/recordings are under
// copyright, so they can't be streamed free on a public site.
const CLASSICAL = [
  { id: 'classical-chopin-nocturne-op9-no2', title: 'Nocturne in E-flat major, Op. 9 No. 2', composer: 'Frédéric Chopin',
    groups: [['chopin'], ['nocturne'], ['op. 9', 'op 9', 'opus 9', 'e-flat', 'e flat', 'eb ']] },
  { id: 'classical-chopin-nocturne-cs-minor', title: 'Nocturne in C-sharp minor, B. 49 (Lento con gran espressione)', composer: 'Frédéric Chopin',
    groups: [['chopin'], ['nocturne', 'lento'], ['c-sharp', 'c sharp', 'c# ', 'posth', 'b. 49', 'b.49', 'b 49']] },
  { id: 'classical-chopin-prelude-op28-no4', title: 'Prelude in E minor, Op. 28 No. 4', composer: 'Frédéric Chopin',
    groups: [['chopin'], ['prelude', 'preludes', 'préludes'], ['op. 28', 'op 28', 'e minor', 'no. 4', 'no 4']] },
  { id: 'classical-chopin-raindrop', title: 'Prelude in D-flat major, Op. 28 No. 15 (Raindrop)', composer: 'Frédéric Chopin',
    groups: [['chopin'], ['prelude', 'preludes', 'préludes', 'raindrop'], ['raindrop', 'no. 15', 'no 15', 'd-flat', 'd flat', 'op. 28']] },
  { id: 'classical-bach-cello-suite-1-prelude', title: 'Cello Suite No. 1 in G major, BWV 1007 — Prélude', composer: 'J. S. Bach',
    groups: [['bach'], ['cello'], ['1007', 'suite no. 1', 'suite no 1', 'prelude', 'prélude', 'g major']] },
  { id: 'classical-bach-chaconne', title: 'Partita No. 2 in D minor, BWV 1004 — Chaconne', composer: 'J. S. Bach',
    groups: [['bach'], ['chaconne', 'ciaccona', '1004']] },
  { id: 'classical-bach-violin-sonata-3-adagio', title: 'Violin Sonata No. 3 in C, BWV 1005 — Adagio', composer: 'J. S. Bach',
    groups: [['bach'], ['adagio'], ['1005', 'sonata no. 3', 'sonata no 3', 'violin']] },
  { id: 'classical-bach-air-g-string', title: 'Air on the G String (Orchestral Suite No. 3, BWV 1068)', composer: 'J. S. Bach',
    groups: [['bach'], ['air'], ['g string', 'g-string', '1068', 'suite no. 3', 'suite no 3']] },
  { id: 'classical-beethoven-moonlight-1', title: 'Piano Sonata No. 14 "Moonlight", Op. 27 No. 2 — Adagio sostenuto', composer: 'Ludwig van Beethoven',
    groups: [['beethoven'], ['moonlight', 'mondschein', 'op. 27', 'op 27', 'sonata no. 14', 'sonata no 14'], ['adagio', 'moonlight', 'mondschein', '1st', 'i.', 'movement 1', 'first']] },
  { id: 'classical-elgar-cello-concerto-1', title: 'Cello Concerto in E minor, Op. 85 — I. Adagio', composer: 'Edward Elgar',
    groups: [['elgar'], ['cello'], ['concerto'], ['op. 85', 'op 85', 'e minor', 'adagio']] },
  { id: 'classical-saint-saens-swan', title: 'The Swan (Le Cygne), from The Carnival of the Animals', composer: 'Camille Saint-Saëns',
    groups: [['saint', 'saëns', 'saens'], ['swan', 'cygne']] },
  { id: 'classical-satie-gymnopedie-1', title: 'Gymnopédie No. 1', composer: 'Erik Satie',
    groups: [['satie'], ['gymnopedie', 'gymnopédie', 'gymnopedies', 'gymnopédies'], ['no. 1', 'no 1', 'first', '1', 'i.']] },
  { id: 'classical-satie-gnossienne-1', title: 'Gnossienne No. 1', composer: 'Erik Satie',
    groups: [['satie'], ['gnossienne', 'gnossiennes'], ['no. 1', 'no 1', 'first', '1', 'i.']] },
  { id: 'classical-tchaikovsky-october', title: 'The Seasons, Op. 37a — October (Autumn Song)', composer: 'Pyotr Ilyich Tchaikovsky',
    groups: [['tchaikovsky', 'chaikovsky', 'čajkovskij'], ['october', 'autumn', 'seasons']] },
  { id: 'classical-debussy-clair-de-lune', title: 'Clair de Lune (Suite bergamasque)', composer: 'Claude Debussy',
    groups: [['debussy'], ['clair de lune', 'clair de', 'clair-de-lune']] },
  { id: 'classical-debussy-arabesque-1', title: 'Arabesque No. 1', composer: 'Claude Debussy',
    groups: [['debussy'], ['arabesque', 'arabesques'], ['no. 1', 'no 1', 'first', 'premiere', 'première', '1', 'l. 66']] },
];

function matchesPiece(piece, doc) {
  const creator = Array.isArray(doc.creator) ? doc.creator.join(' ') : doc.creator || '';
  const hay = `${doc.title || ''} ${doc.identifier || ''} ${creator}`.toLowerCase();
  return piece.groups.every((alts) => alts.some((tok) => hay.includes(tok)));
}

async function fetchCuratedClassical(existing) {
  const have = new Set(existing.map((e) => e.id).filter(Boolean));
  const added = [];
  const wanted = CLASSICAL.filter((p) => !have.has(p.id));

  for (const piece of wanted) {
    if (added.length >= CLASSICAL_PER_RUN) break;
    // Search by the piece's most distinctive tokens (first token of each
    // group), restricted to public-domain audio with an actual MP3 rendition.
    const terms = piece.groups.map((alts) => alts[0]).join(' ');
    const search =
      'https://archive.org/advancedsearch.php?q=' +
      encodeURIComponent(
        `mediatype:audio AND format:(VBR MP3) AND licenseurl:(*publicdomain* OR *creativecommons.org/publicdomain*) AND (${terms})`
      ) +
      '&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=licenseurl&sort[]=downloads+desc&rows=40&output=json';

    let docs = [];
    try {
      const j = await getJSON(search);
      docs = (j.response && j.response.docs) || [];
    } catch (e) {
      log('classical search failed:', piece.id, e.message);
      continue;
    }

    let done = false;
    for (const doc of docs) {
      if (done) break;
      if (!isPublicDomain(doc.licenseurl)) continue;
      if (!matchesPiece(piece, doc)) continue;
      if (!titleOk(doc.title) || !titleOk(doc.identifier)) continue;
      try {
        const meta = await getJSON(`https://archive.org/metadata/${doc.identifier}`);
        const files = (meta.files || []).filter(
          (f) => /\.mp3$/i.test(f.name || '') && f.size && Number(f.size) <= CLASSICAL_MAX_BYTES && titleOk(f.name)
        );
        if (!files.length) continue;
        // Prefer the largest MP3 within budget — usually the full performance
        // rather than a short excerpt/sample.
        const file = files.sort((a, b) => Number(b.size) - Number(a.size))[0];
        const url = `https://archive.org/download/${doc.identifier}/${encodeURIComponent(file.name)}`;
        const fname = `${piece.id}.mp3`;
        const dest = path.join(MUSIC_DIR, fname);
        const bytes = await download(url, dest, CLASSICAL_MAX_BYTES);
        added.push({
          id: piece.id,
          title: piece.title,
          artist: piece.composer,
          src: `/music/${fname}`,
          source: `https://archive.org/details/${doc.identifier}`,
          license: doc.licenseurl,
          pinned: true,
        });
        log(`+ classical: ${fname} (${(bytes / 1e6).toFixed(1)} MB) ← ${doc.identifier}`);
        done = true;
      } catch (e) {
        log('classical item skipped:', doc.identifier, e.message);
      }
    }
    if (!done) log('classical: no public-domain match found this run for', piece.id);
  }
  return added;
}

// ---------------- Video ----------------

// Motion-forward, expansive, high/aerial footage — real moving shots (drone
// flyovers, flowing water, moving clouds/timelapses), not near-static clips.
const VIDEO_QUERIES = [
  'drone flyover mountains',
  'flying over clouds',
  'aerial ocean waves',
  'river flowing aerial',
  'timelapse clouds moving',
  'aerial coastline sunset',
  'flying over forest river',
  'milky way timelapse',
  'northern lights timelapse',
  'aerial green valley',
  'waterfall aerial drone',
  'city lights timelapse night',
  'grassland wind waves aerial',
  'sea of clouds mountains drone',
];

async function fetchPixabayVideo(existing) {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) {
    log('PIXABAY_API_KEY not set → skipping scenery video auto-fetch.');
    return [];
  }
  const have = new Set(existing.map((e) => e.id).filter(Boolean));
  const added = [];
  // Wide, expansive, high/aerial vistas — not close-ups of a single tree or
  // animal. The whispers rise from below into an open sky, so the backdrop
  // should feel vast: starfields, seas of cloud, oceans, grasslands, valleys.
  const q = VIDEO_QUERIES[Math.floor(Math.random() * VIDEO_QUERIES.length)];
  const url =
    `https://pixabay.com/api/videos/?key=${encodeURIComponent(key)}` +
    `&q=${encodeURIComponent(q)}&per_page=40&safesearch=true&order=popular`;

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
    // Prefer a mid "small"/"medium" rendition (real footage, reasonable size).
    const v = (hit.videos && (hit.videos.small || hit.videos.medium || hit.videos.tiny)) || null;
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
      log(`+ video(pixabay): ${fname} (${(bytes / 1e6).toFixed(1)} MB)`);
    } catch (e) {
      log('pixabay item skipped:', hit.id, e.message);
    }
  }
  return added;
}

// ---------------- Video: Pexels (second source, needs free API key) ----------------

async function fetchPexelsVideo(existing) {
  const key = process.env.PEXELS_API_KEY;
  if (!key) {
    log('PEXELS_API_KEY not set → skipping Pexels video.');
    return [];
  }
  const have = new Set(existing.map((e) => e.id).filter(Boolean));
  const added = [];
  const q = VIDEO_QUERIES[Math.floor(Math.random() * VIDEO_QUERIES.length)];
  const url =
    `https://api.pexels.com/videos/search?query=${encodeURIComponent(q)}` +
    `&per_page=30&orientation=portrait&size=medium`;

  let vids = [];
  try {
    const res = await fetch(url, { headers: { authorization: key, 'user-agent': UA } });
    if (!res.ok) throw new Error(`GET pexels → ${res.status}`);
    const j = await res.json();
    vids = j.videos || [];
  } catch (e) {
    log('pexels search failed:', e.message);
    return added;
  }
  vids.sort(() => Math.random() - 0.5);

  for (const vid of vids) {
    if (added.length >= 2) break;
    const id = `pexels-${vid.id}`;
    if (have.has(id)) continue;
    // Pick an HD-ish .mp4 file within the size budget (prefer ~720p width).
    const files = (vid.video_files || [])
      .filter((f) => f.file_type === 'video/mp4' && f.link)
      .sort((a, b) => (a.width || 0) - (b.width || 0));
    const pick = files.find((f) => (f.width || 0) >= 640) || files[files.length - 1];
    if (!pick) continue;
    try {
      const fname = `${slugify(q)}-pexels-${vid.id}.mp4`;
      const dest = path.join(VIDEO_DIR, fname);
      const bytes = await download(pick.link, dest, MAX_VIDEO_BYTES);
      added.push({
        id,
        title: `${q} #${vid.id}`,
        src: `/video/${fname}`,
        source: vid.url || 'https://www.pexels.com',
        license: 'Pexels License (free, no attribution required)',
      });
      log(`+ video(pexels): ${fname} (${(bytes / 1e6).toFixed(1)} MB)`);
    } catch (e) {
      log('pexels item skipped:', vid.id, e.message);
    }
  }
  return added;
}

// ---------------- Music: Jamendo (Creative Commons, needs client id) ----------------

// Only accept licenses that allow commercial use and derivatives/streaming —
// i.e. CC-BY or CC-BY-SA. We exclude NonCommercial (NC) and NoDerivatives
// (ND) via the API filters below. These require attribution, which the app
// displays in the music panel.
async function fetchJamendoAudio(existing) {
  const key = process.env.JAMENDO_CLIENT_ID;
  if (!key) {
    log('JAMENDO_CLIENT_ID not set → skipping Jamendo music.');
    return [];
  }
  const have = new Set(existing.map((e) => e.id).filter(Boolean));
  const added = [];

  // Reject energetic / danceable genres even if a fuzzy tag matched. (We now
  // ALLOW gentler vocal genres — folk, acoustic, soul ballads — so those are
  // no longer blocked; only clearly upbeat/energetic styles are.)
  const GENRE_BLOCK = /\b(reggae|rock|metal|punk|edm|techno|trance|house|hip-?hop|rap|dance|disco|dubstep|trap|hardstyle|club|electro|samba|salsa|ska|funk|swing|march|marching)\b/i;

  // The owner wants ENGLISH songs only (foreign-language lyrics are hard to
  // connect with). Best-effort: Jamendo's musicinfo carries a sung-language
  // code; when it says a non-English language, reject. When it's missing, fall
  // back to a script heuristic (non-ASCII letters in the title ⇒ likely not
  // English). Neither is perfect, so the owner can still flag stragglers.
  function englishOk(tr) {
    const lang = String((tr.musicinfo && tr.musicinfo.lang) || '').toLowerCase();
    if (lang && !lang.startsWith('en')) return false; // known non-English
    if (/[^\x00-\x7F]/.test(tr.name || '')) return false; // accented/non-latin title
    return true;
  }

  // Core vibe: a late-night "confession hollow" — quiet, melancholic, healing.
  // NOT upbeat folk-rock or bright pop (that breaks the "gazing at the stars,
  // pouring your heart out" mood). Tags lean sad/slow/soft; a tempo filter
  // (below) additionally rejects fast tracks even if a tag slipped through.
  const tagPool = [
    'sad', 'melancholic', 'melancholy', 'emotional', 'mellow', 'slow',
    'ambient', 'dreamy', 'lonely', 'soft', 'piano', 'ballad',
    'introspective', 'calm', 'soothing', 'healing',
  ];
  const tagsToTry = tagPool.sort(() => Math.random() - 0.5).slice(0, 5);

  for (const tag of tagsToTry) {
    if (added.length >= AUDIO_PER_RUN) break;
    const url =
      `https://api.jamendo.com/v3.0/tracks/?client_id=${encodeURIComponent(key)}` +
      `&format=json&limit=50&fuzzytags=${encodeURIComponent(tag)}` +
      `&vocalinstrumental=vocal` +
      `&audioformat=mp31&order=popularity_total&include=musicinfo+licenses&ccnc=false&ccnd=false`;

    let results = [];
    try {
      const j = await getJSON(url);
      results = j.results || [];
    } catch (e) {
      log('jamendo search failed:', tag, e.message);
      continue;
    }
    log(`jamendo tag "${tag}": ${results.length} results`);
    results.sort(() => Math.random() - 0.5);

    for (const tr of results) {
      if (added.length >= AUDIO_PER_RUN) break;
      const id = `jamendo-${tr.id}`;
      if (have.has(id)) continue;
      have.add(id);
      if (!titleOk(tr.name) || !titleOk(tr.artist_name)) {
        log('skip (title):', tr.id);
        continue;
      }
      const genres = ((tr.musicinfo && tr.musicinfo.tags && tr.musicinfo.tags.genres) || []).join(' ');
      if (GENRE_BLOCK.test(genres) || GENRE_BLOCK.test(tr.name)) {
        log('skip (genre):', tr.id, genres);
        continue;
      }
      if (!englishOk(tr)) {
        log('skip (non-english):', tr.id, tr.name, (tr.musicinfo && tr.musicinfo.lang) || '?');
        continue;
      }
      // Reject upbeat tempos — the space is for quiet, unhurried listening.
      const speed = String((tr.musicinfo && tr.musicinfo.speed) || '').toLowerCase();
      if (speed === 'high' || speed === 'veryhigh') {
        log('skip (too upbeat):', tr.id, tr.name, speed);
        continue;
      }
      const dl = tr.audiodownload_allowed && tr.audiodownload ? tr.audiodownload : tr.audio;
      if (!dl) continue;
      try {
        const fname = `jamendo-${tr.id}.mp3`;
        const dest = path.join(MUSIC_DIR, fname);
        const bytes = await download(dl, dest, MAX_AUDIO_BYTES);
        added.push({
          id,
          title: (tr.name || 'Untitled').toString().slice(0, 80),
          artist: (tr.artist_name || '').toString().slice(0, 60),
          src: `/music/${fname}`,
          source: tr.shareurl || `https://www.jamendo.com/track/${tr.id}`,
          license: tr.license_ccurl || 'https://creativecommons.org/licenses/by/3.0/',
        });
        log(`+ music(jamendo): ${fname} (${(bytes / 1e6).toFixed(1)} MB) — ${tr.name} / ${tr.artist_name}`);
      } catch (e) {
        log('jamendo item skipped:', tr.id, e.message);
      }
    }
  }
  return added;
}

// ---------------- Music: ccMixter (Creative Commons, no key) ----------------

// ccMixter is a Creative-Commons music community with a public JSON query API
// (no key). We restrict to attribution-only licenses (CC-BY / CC-BY-SA / PD —
// no NonCommercial, no NoDerivatives) and English-ish, on-brand titles.
async function fetchCCMixterAudio(existing) {
  const have = new Set(existing.map((e) => e.id).filter(Boolean));
  const added = [];

  const tags = ['mellow', 'calm', 'ambient', 'downtempo', 'sad', 'slow', 'dreamy', 'soft'];
  const tag = tags[Math.floor(Math.random() * tags.length)];
  // lic=by asks the API for attribution licenses; we still re-check per item.
  const url =
    `https://ccmixter.org/api/query?f=json&sort=rank&limit=40` +
    `&lic=by&tags=${encodeURIComponent(tag)}`;

  let rows = [];
  try {
    rows = await getJSON(url);
  } catch (e) {
    log('ccmixter search failed:', e.message);
    return added;
  }
  if (!Array.isArray(rows)) return added;
  rows.sort(() => Math.random() - 0.5);

  for (const up of rows) {
    if (added.length >= 2) break;
    const id = `ccmixter-${up.upload_id}`;
    if (have.has(id)) continue;
    const name = String(up.upload_name || '');
    const artist = String(up.user_name || '');
    if (!titleOk(name) || !titleOk(artist)) {
      log('skip (title):', up.upload_id);
      continue;
    }
    if (/[^\x00-\x7F]/.test(name)) continue; // English-ish only
    const lic = String(up.license_url || '').toLowerCase();
    const okLic =
      (lic.includes('/by/') || lic.includes('/by-sa/') || lic.includes('publicdomain') || lic.includes('/zero/')) &&
      !lic.includes('/by-nc') &&
      !lic.includes('/by-nd') &&
      !lic.includes('sampling');
    if (!okLic) {
      log('skip (license):', up.upload_id, lic);
      continue;
    }
    const files = up.files || [];
    const mp3 = files.find((f) => /\.mp3$/i.test(f.download_url || f.file_name || ''));
    if (!mp3 || !mp3.download_url) continue;
    try {
      const fname = `ccmixter-${up.upload_id}.mp3`;
      const dest = path.join(MUSIC_DIR, fname);
      const bytes = await download(mp3.download_url, dest, MAX_AUDIO_BYTES);
      added.push({
        id,
        title: name.slice(0, 80),
        artist: artist.slice(0, 60),
        src: `/music/${fname}`,
        source: up.file_page_url || up.upload_url || `http://ccmixter.org/files/${artist}/${up.upload_id}`,
        license: up.license_url || 'https://creativecommons.org/licenses/by/3.0/',
      });
      log(`+ music(ccmixter): ${fname} (${(bytes / 1e6).toFixed(1)} MB) — ${name} / ${artist}`);
    } catch (e) {
      log('ccmixter item skipped:', up.upload_id, e.message);
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

  // Curated public-domain classical (owner's request) first — these are
  // pinned, so they persist across future runs.
  const classical = await fetchCuratedClassical(music).catch((e) => (log('classical error', e.message), []));
  // English CC vocal songs from Jamendo + ccMixter (both attribution-only).
  // Top up with Internet Archive public-domain if the two return too few.
  const jam = await fetchJamendoAudio([...music, ...classical]).catch((e) => (log('jamendo error', e.message), []));
  const ccm = await fetchCCMixterAudio([...music, ...classical, ...jam]).catch((e) => (log('ccmixter error', e.message), []));
  let newMusic = [...classical, ...jam, ...ccm];
  if (jam.length + ccm.length < 2) {
    const arch = await fetchArchiveAudio([...music, ...newMusic]).catch((e) => (log('archive error', e.message), []));
    newMusic = [...newMusic, ...arch];
  }
  // Two video sources — combine so we accumulate faster and vary the look.
  const pix = await fetchPixabayVideo(videos).catch((e) => (log('pixabay video error', e.message), []));
  const pex = await fetchPexelsVideo([...videos, ...pix]).catch((e) => (log('pexels video error', e.message), []));
  const newVideos = [...pix, ...pex];

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
