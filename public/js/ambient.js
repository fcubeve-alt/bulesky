// Ambient sound. Two sources, in priority order:
//   1. A music LIBRARY: real audio files listed in /music/manifest.json.
//      Plays a random track, then auto-advances to another random one.
//      You add your own tracks (see public/music/README.md) — nothing is
//      bundled, so there's no licensing baggage in the repo.
//   2. Fallback SYNTH pad (Web Audio) when the library is empty, so the
//      button always does something even before you've added music.
//
// Muted until the user taps the toggle (autoplay policies require a gesture).

// ---------------- Synth fallback ----------------

const CHORD = [
  { freq: 110, gain: 0.05, pan: -0.25 },
  { freq: 165, gain: 0.035, pan: 0.25 },
  { freq: 220, gain: 0.03, pan: 0 },
];
const TWINKLE_NOTES = [440, 493.88, 587.33, 659.25, 880];

function startSynth(context, destination) {
  const filter = context.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1100;
  filter.connect(destination);

  const lfo = context.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.035;
  const lfoGain = context.createGain();
  lfoGain.gain.value = 60;
  lfo.connect(lfoGain);
  lfoGain.connect(filter.frequency);
  lfo.start();

  const voices = CHORD.map(({ freq, gain: g, pan }) => {
    const osc = context.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc.detune.value = (Math.random() - 0.5) * 3;
    const gain = context.createGain();
    gain.gain.value = g;
    let node = osc;
    if (context.createStereoPanner) {
      const p = context.createStereoPanner();
      p.pan.value = pan;
      osc.connect(p);
      node = p;
    }
    node.connect(gain);
    gain.connect(filter);
    osc.start();
    return osc;
  });

  let twinkleTimer = null;
  function twinkle() {
    twinkleTimer = setTimeout(() => {
      const f = TWINKLE_NOTES[Math.floor(Math.random() * TWINKLE_NOTES.length)];
      const osc = context.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const gain = context.createGain();
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(destination);
      const now = context.currentTime;
      gain.gain.linearRampToValueAtTime(0.022, now + 0.15);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);
      osc.start(now);
      osc.stop(now + 2.3);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
      twinkle();
    }, 6000 + Math.random() * 8000);
  }
  twinkle();

  return {
    stop() {
      clearTimeout(twinkleTimer);
      lfo.stop();
      for (const v of voices) v.stop();
    },
  };
}

// ---------------- Public controller ----------------

export function initAmbient(opts = {}) {
  const onChange = typeof opts.onChange === 'function' ? opts.onChange : () => {};
  let library = [];
  let playlist = []; // library, grouped by style and ordered
  let playIdx = 0;
  let libraryLoaded = false;
  // Two audio players so tracks can TRUE-crossfade: as one fades out the other
  // is already fading in, so there's never a silent gap or an abrupt jump.
  let players = null; // [Audio, Audio]
  let trackOf = [null, null];
  let segEnds = [Infinity, Infinity];
  let cur = 0; // index of the currently-dominant player
  let crossTimer = null;
  let fading = false;
  let ctx = null;
  let masterGain = null;
  let synth = null;
  let playing = false;
  let currentTitle = null;
  let currentTrack = null;

  // "Highlight" playback: many tracks have long intros and aren't good all the
  // way through, so we skip the intro and play only a ~100s slice of the good
  // part, then move on. A track may override with explicit `start`/`end`
  // (seconds) in the manifest for a hand-picked hook.
  const PLAY_WINDOW = 100; // seconds of the "good part" to play
  const MAX_INTRO_SKIP = 40; // never skip more than this into a track
  const INTRO_FRACTION = 0.22; // otherwise start ~22% in, past the intro
  const TARGET_VOLUME = 0.55;
  const CROSSFADE_SEC = 3; // overlap duration when moving between tracks

  function clearCross() {
    if (crossTimer) {
      clearInterval(crossTimer);
      crossTimer = null;
    }
    fading = false;
  }

  // Pick the slice to play, given the track's (possibly unknown) duration.
  function computeSegment(track, dur) {
    const hasDur = Number.isFinite(dur) && dur > 0;
    let start = Number.isFinite(track && track.start) ? track.start : null;
    let end = Number.isFinite(track && track.end) ? track.end : null;
    if (start == null) start = hasDur ? Math.min(MAX_INTRO_SKIP, dur * INTRO_FRACTION) : 0;
    if (end == null) end = start + PLAY_WINDOW;
    if (hasDur) end = Math.min(end, dur - 0.3);
    start = Math.max(0, Math.min(start, Math.max(0, end - 20)));
    return { start, end };
  }

  // ---- Style grouping: keep similar styles adjacent so transitions feel
  // cohesive (no cello-classical → pop-vocal whiplash). Buckets are ordered
  // so neighbours are close in feel: solo piano → strings → orchestral → songs.
  function bucketOf(t) {
    const id = String(t.id || '');
    const title = String(t.title || '').toLowerCase();
    if (id.startsWith('classical-')) {
      if (/cello|violin|viola|string|swan|cygne|air|adagio|chaconne|serenade|s[eé]r[eé]nade|meditation|m[eé]ditation|thais|thd|elgar|vivaldi|winter/.test(title)) return 'strings';
      if (/piano|nocturne|prelude|pr[eé]lude|arabesque|gnossienne|gymnop|clair|r[eê]verie|moonlight|elise|bagatelle|sonata|canon|andante/.test(title)) return 'piano';
      return 'orchestral';
    }
    return 'song'; // Jamendo / ccMixter — mostly CC vocal songs
  }
  const BUCKET_ORDER = ['piano', 'strings', 'orchestral', 'song'];

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function buildPlaylist() {
    const groups = { piano: [], strings: [], orchestral: [], song: [] };
    for (const t of library) (groups[bucketOf(t)] || groups.song).push(t);
    playlist = [];
    for (const b of BUCKET_ORDER) playlist.push(...shuffle(groups[b]));
    if (playlist.length === 0) playlist = library.slice();
    // Random entry point so sessions don't always open on the same piece,
    // while still walking the grouped order from there.
    playIdx = playlist.length ? Math.floor(Math.random() * playlist.length) : 0;
  }

  async function loadLibrary() {
    if (libraryLoaded) return;
    libraryLoaded = true;
    try {
      const res = await fetch('/music/manifest.json', { cache: 'no-cache' });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.tracks)) {
          library = data.tracks.filter((t) => t && t.src);
        }
      }
    } catch {
      /* no manifest → synth fallback */
    }
    buildPlaylist();
  }

  function pickTrack() {
    if (playlist.length === 0) return null;
    if (playlist.length === 1) return playlist[0];
    let t;
    let guard = 0;
    do {
      t = playlist[playIdx % playlist.length];
      playIdx = (playIdx + 1) % playlist.length;
      guard += 1;
    } while (t.title === currentTitle && guard < playlist.length);
    return t;
  }

  function ensureAudio() {
    if (players) return;
    players = [new Audio(), new Audio()];
    players.forEach((p, idx) => {
      p.preload = 'auto';
      // Once we know the duration, jump to the start of the highlight slice.
      p.addEventListener('loadedmetadata', () => {
        const seg = computeSegment(trackOf[idx] || {}, p.duration);
        segEnds[idx] = seg.end;
        if (seg.start > 0.5 && p.currentTime < seg.start - 0.5) {
          try {
            p.currentTime = seg.start;
          } catch {
            /* seeking not ready yet — ignore */
          }
        }
      });
      // Begin the crossfade CROSSFADE_SEC before the slice ends, so the next
      // track is already rising as this one settles out.
      p.addEventListener('timeupdate', () => {
        if (!playing || idx !== cur || fading) return;
        if (Number.isFinite(segEnds[idx]) && p.currentTime >= segEnds[idx] - CROSSFADE_SEC) {
          advance();
        }
      });
      p.addEventListener('ended', () => {
        if (playing && !fading) advance();
      });
    });
  }

  // Smoothly ramp `to` up to volume and `from` down to 0 over CROSSFADE_SEC.
  function runRamp(from, to, toIdx) {
    if (crossTimer) clearInterval(crossTimer);
    const fps = 20;
    const steps = Math.round(CROSSFADE_SEC * fps);
    let i = 0;
    crossTimer = setInterval(() => {
      i += 1;
      const k = Math.min(1, i / steps);
      try { to.volume = TARGET_VOLUME * k; } catch {}
      try { if (from) from.volume = Math.max(0, TARGET_VOLUME * (1 - k)); } catch {}
      if (i >= steps) {
        clearInterval(crossTimer);
        crossTimer = null;
        if (from) { try { from.pause(); } catch {} }
        cur = toIdx;
        fading = false;
      }
    }, 1000 / fps);
  }

  // Crossfade from the current player to the next track on the other player.
  function advance() {
    if (fading) return;
    const track = pickTrack();
    if (!track) return;
    ensureAudio();
    fading = true;
    const from = players[cur];
    const toIdx = cur ^ 1;
    const to = players[toIdx];
    trackOf[toIdx] = track;
    segEnds[toIdx] = Number.isFinite(track.end) ? track.end : Infinity;
    // Reflect now-playing as the incoming track becomes audible.
    currentTrack = track;
    currentTitle = track.title || track.src.split('/').pop();
    onChange();
    to.src = track.src;
    to.volume = 0;
    let started = false;
    const begin = () => {
      if (started) return;
      started = true;
      runRamp(from, to, toIdx);
    };
    to.addEventListener('playing', begin, { once: true });
    const safety = setTimeout(begin, 1500); // start the ramp even if 'playing' is late
    to.play().then(() => clearTimeout(safety)).catch(() => {
      clearTimeout(safety);
      begin();
    });
  }

  // Start the first library track outright (no crossfade — nothing to fade from).
  function playFirstTrack() {
    const track = pickTrack();
    if (!track) return;
    ensureAudio();
    clearCross();
    cur = 0;
    const p = players[0];
    const other = players[1];
    try { other.pause(); other.volume = 0; } catch {}
    trackOf[0] = track;
    segEnds[0] = Number.isFinite(track.end) ? track.end : Infinity;
    currentTrack = track;
    currentTitle = track.title || track.src.split('/').pop();
    p.src = track.src;
    p.volume = TARGET_VOLUME;
    p.play().catch(() => {});
    onChange();
  }

  // Short license label from a Creative Commons URL, for attribution.
  function licenseShort(url) {
    const u = String(url || '').toLowerCase();
    if (!u) return '';
    if (u.includes('publicdomain') || u.includes('/zero/')) return 'Public Domain';
    const m = u.match(/licenses\/(by(?:-[a-z]+)*)/);
    return m ? 'CC ' + m[1].toUpperCase() : 'CC';
  }

  function startSynthFallback() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0;
      masterGain.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    synth = startSynth(ctx, masterGain);
    masterGain.gain.cancelScheduledValues(ctx.currentTime);
    masterGain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 2.5);
    currentTitle = null;
    currentTrack = null;
    onChange();
  }

  function stopSynth() {
    if (synth) {
      masterGain.gain.cancelScheduledValues(ctx.currentTime);
      masterGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6);
      const s = synth;
      setTimeout(() => s.stop(), 650);
      synth = null;
    }
  }

  function stopAll() {
    clearCross();
    if (players) for (const p of players) { try { p.pause(); } catch {} }
    stopSynth();
  }

  // Silence output without forgetting that the user wants music on. Used when
  // the page is hidden/closed (mobile backgrounding, tab close) so audio never
  // keeps playing behind a closed page; resume() brings it back on return.
  function suspend() {
    if (!playing) return;
    if (players) for (const p of players) { try { p.pause(); } catch {} }
    if (ctx && ctx.state === 'running') ctx.suspend();
  }

  function resume() {
    if (!playing) return;
    // Resume only the dominant player; a half-finished crossfade just settles.
    if (players && players[cur] && players[cur].paused) players[cur].play().catch(() => {});
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  function beginPlayback() {
    if (playlist.length > 0) playFirstTrack();
    else startSynthFallback();
  }

  return {
    // Preload the manifest at startup so the first user gesture can start a
    // real track synchronously. Mobile browsers (iOS especially) block
    // audio.play() that runs *after* an awaited fetch, so we must not await
    // inside the tap handler.
    preload() {
      loadLibrary();
    },
    // Synchronous on purpose — playback must begin within the user gesture.
    toggle() {
      if (playing) {
        playing = false;
        stopAll();
        onChange();
        return false;
      }
      playing = true;
      if (libraryLoaded) {
        beginPlayback();
      } else {
        // Manifest hasn't landed yet: start the soft synth right now (allowed
        // in-gesture), then swap to a real track the moment it arrives.
        startSynthFallback();
        loadLibrary().then(() => {
          if (playing && playlist.length > 0) {
            stopSynth();
            playFirstTrack();
          }
        });
      }
      return true;
    },
    next() {
      if (!playing || playlist.length === 0) return;
      // Crossfade to the next track if one is already playing; otherwise start.
      if (players && trackOf[cur]) advance();
      else playFirstTrack();
    },
    // Pause/resume actual audio output without changing the "playing" intent.
    suspend,
    resume,
    // Live audio track(s) of the current track, for in-page video recording.
    getAudioTracks() {
      try {
        const p = players && players[cur];
        if (p && typeof p.captureStream === 'function') return p.captureStream().getAudioTracks();
        if (p && typeof p.mozCaptureStream === 'function') return p.mozCaptureStream().getAudioTracks();
      } catch {
        /* capture not permitted — record silently */
      }
      return [];
    },
    get isPlaying() {
      return playing;
    },
    get usingLibrary() {
      return library.length > 0;
    },
    get nowPlaying() {
      return currentTitle;
    },
    get nowArtist() {
      return currentTrack ? currentTrack.artist || '' : '';
    },
    get nowCredit() {
      if (!currentTrack) return '';
      const parts = [];
      if (currentTrack.artist) parts.push(currentTrack.artist);
      const lic = licenseShort(currentTrack.license);
      if (lic) parts.push(lic);
      return parts.join(' · ');
    },
    get nowSource() {
      return currentTrack ? currentTrack.source || '' : '';
    },
  };
}
