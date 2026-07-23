// Procedural ambient space-pad, built entirely with the Web Audio API —
// no external audio files. (Note: this sandbox's network policy blocks
// fetching real audio assets from anywhere but a handful of package
// registries, so a licensed/found track isn't an option here — this is a
// deliberately gentle, consonant synth pad instead of one.)
// Muted until the user explicitly opts in (autoplay policies require a
// gesture anyway, and staying quiet by default is the polite choice).

// A plain root/fifth/octave drone — the most consonant chord there is,
// standard in ambient/drone music, impossible to make "clashy".
const CHORD = [
  { freq: 110, gain: 0.05, pan: -0.25 }, // A2 root
  { freq: 165, gain: 0.035, pan: 0.25 }, // E3 fifth
  { freq: 220, gain: 0.03, pan: 0 }, // A3 octave
];

// Notes for the twinkle chimes, all drawn from the same A major-pentatonic
// family as the drone so anything that plays is harmonically "safe".
const TWINKLE_NOTES = [440, 493.88, 587.33, 659.25, 880, 987.77];

function startPad(context, destination) {
  const filter = context.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1100;
  filter.Q.value = 0.3;

  const swell = context.createGain();
  swell.gain.value = 1;
  filter.connect(swell);
  swell.connect(destination);

  const lfo = context.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.035;
  const lfoDepth = context.createGain();
  lfoDepth.gain.value = 0.08; // subtle breathing, not a tremolo
  lfo.connect(lfoDepth);
  lfoDepth.connect(swell.gain);
  lfo.start();

  const voices = CHORD.map(({ freq, gain: gainValue, pan }) => {
    const osc = context.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc.detune.value = (Math.random() - 0.5) * 3; // barely-there chorus, not dissonance

    const gain = context.createGain();
    gain.gain.value = gainValue;

    let node = osc;
    if (context.createStereoPanner) {
      const panner = context.createStereoPanner();
      panner.pan.value = pan;
      osc.connect(panner);
      node = panner;
    }
    node.connect(gain);
    gain.connect(filter);
    osc.start();
    return osc;
  });

  return {
    stop() {
      lfo.stop();
      for (const v of voices) v.stop();
      // Nodes disconnect themselves once their source has stopped and
      // nothing references them anymore — no manual teardown needed.
    },
  };
}

function playTwinkle(context, destination) {
  const freq = TWINKLE_NOTES[Math.floor(Math.random() * TWINKLE_NOTES.length)];
  const osc = context.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = freq;

  const gain = context.createGain();
  gain.gain.value = 0;

  osc.connect(gain);
  gain.connect(destination);

  const now = context.currentTime;
  gain.gain.linearRampToValueAtTime(0.025, now + 0.15);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);
  osc.start(now);
  osc.stop(now + 2.3);
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
}

export function initAmbient() {
  let ctx = null;
  let masterGain = null;
  let pad = null;
  let twinkleTimer = null;
  let playing = false;

  function ensureContext() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0;
      masterGain.connect(ctx.destination);
    }
    return ctx;
  }

  function scheduleTwinkle() {
    twinkleTimer = setTimeout(() => {
      if (!playing) return;
      playTwinkle(ctx, masterGain);
      scheduleTwinkle();
    }, 6000 + Math.random() * 8000);
  }

  return {
    async toggle() {
      const context = ensureContext();
      if (context.state === 'suspended') await context.resume();

      if (playing) {
        playing = false;
        clearTimeout(twinkleTimer);
        masterGain.gain.cancelScheduledValues(context.currentTime);
        masterGain.gain.linearRampToValueAtTime(0, context.currentTime + 1.2);
        const stopping = pad;
        setTimeout(() => stopping && stopping.stop(), 1300);
        pad = null;
        return false;
      }

      playing = true;
      pad = startPad(context, masterGain);
      masterGain.gain.cancelScheduledValues(context.currentTime);
      masterGain.gain.linearRampToValueAtTime(0.32, context.currentTime + 2.5);
      scheduleTwinkle();
      return true;
    },
    get isPlaying() {
      return playing;
    },
  };
}
