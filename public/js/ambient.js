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

export function initAmbient() {
  let library = [];
  let libraryLoaded = false;
  let audio = null;
  let ctx = null;
  let masterGain = null;
  let synth = null;
  let playing = false;
  let currentTitle = null;
  let currentTrack = null;

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
  }

  function pickTrack() {
    if (library.length === 0) return null;
    if (library.length === 1) return library[0];
    let next;
    do {
      next = library[Math.floor(Math.random() * library.length)];
    } while (next.title === currentTitle);
    return next;
  }

  function playRandomTrack() {
    const track = pickTrack();
    if (!track) return;
    if (!audio) {
      audio = new Audio();
      audio.addEventListener('ended', () => {
        if (playing) playRandomTrack();
      });
    }
    currentTrack = track;
    currentTitle = track.title || track.src.split('/').pop();
    audio.src = track.src;
    audio.volume = 0.55;
    audio.play().catch(() => {});
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
  }

  function stopAll() {
    if (audio) {
      audio.pause();
    }
    if (synth) {
      masterGain.gain.cancelScheduledValues(ctx.currentTime);
      masterGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1);
      const s = synth;
      setTimeout(() => s.stop(), 1100);
      synth = null;
    }
  }

  return {
    async toggle() {
      await loadLibrary();
      if (playing) {
        playing = false;
        stopAll();
        return false;
      }
      playing = true;
      if (library.length > 0) playRandomTrack();
      else startSynthFallback();
      return true;
    },
    next() {
      if (playing && library.length > 0) playRandomTrack();
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
