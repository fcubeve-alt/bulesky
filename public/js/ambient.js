// Procedural ambient space-pad, built entirely with the Web Audio API —
// no external audio files, so nothing to fetch, license, or bundle.
// Muted until the user explicitly opts in (autoplay policies require a
// gesture anyway, and staying quiet by default is the polite choice).

const CHORD = [110, 164.81, 220, 277.18]; // A2, E3, A3, C#4 — a soft, open drone

function startPad(context, destination) {
  const filter = context.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 900;

  const swell = context.createGain();
  swell.gain.value = 1;
  filter.connect(swell);
  swell.connect(destination);

  const lfo = context.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.04;
  const lfoDepth = context.createGain();
  lfoDepth.gain.value = 0.18;
  lfo.connect(lfoDepth);
  lfoDepth.connect(swell.gain);
  lfo.start();

  const voices = CHORD.map((freq, i) => {
    const osc = context.createOscillator();
    osc.type = i % 2 === 0 ? 'sine' : 'triangle';
    osc.frequency.value = freq;
    osc.detune.value = (Math.random() - 0.5) * 6;

    const gain = context.createGain();
    gain.gain.value = 0.05;

    osc.connect(gain);
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
  const freq = 700 + Math.random() * 1400;
  const osc = context.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = freq;

  const gain = context.createGain();
  gain.gain.value = 0;

  osc.connect(gain);
  gain.connect(destination);

  const now = context.currentTime;
  gain.gain.linearRampToValueAtTime(0.035, now + 0.08);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);
  osc.start(now);
  osc.stop(now + 1.5);
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
    }, 3500 + Math.random() * 5000);
  }

  return {
    async toggle() {
      const context = ensureContext();
      if (context.state === 'suspended') await context.resume();

      if (playing) {
        playing = false;
        clearTimeout(twinkleTimer);
        masterGain.gain.cancelScheduledValues(context.currentTime);
        masterGain.gain.linearRampToValueAtTime(0, context.currentTime + 0.8);
        const stopping = pad;
        setTimeout(() => stopping && stopping.stop(), 900);
        pad = null;
        return false;
      }

      playing = true;
      pad = startPad(context, masterGain);
      masterGain.gain.cancelScheduledValues(context.currentTime);
      masterGain.gain.linearRampToValueAtTime(0.4, context.currentTime + 1.8);
      scheduleTwinkle();
      return true;
    },
    get isPlaying() {
      return playing;
    },
  };
}
