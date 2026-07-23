// Decorative background stars (canvas, non-interactive) + helpers for
// placing/coloring the interactive content bubbles that live in #sky.
// Content bubbles are plain DOM nodes (not canvas) so they stay easily
// clickable/accessible and don't need hit-testing math.

// Three depth layers drifting at different speeds/directions give the sky
// a slow "swimming through space" feel without literally rotating the
// viewport (which reads as disorienting rather than immersive on mobile).
const STAR_LAYERS = [
  { density: 0.00007, sizeMin: 0.3, sizeMax: 0.9, speed: 1.5, opacity: 0.4 },
  { density: 0.00004, sizeMin: 0.7, sizeMax: 1.6, speed: 4, opacity: 0.6 },
  { density: 0.00002, sizeMin: 1.2, sizeMax: 2.4, speed: 9, opacity: 0.9 },
];

export function initBackgroundStars(canvas) {
  const ctx = canvas.getContext('2d');
  let width = 0;
  let height = 0;
  let raf = null;
  let layers = [];
  let last = 0;

  function resize() {
    width = canvas.width = window.innerWidth * devicePixelRatio;
    height = canvas.height = window.innerHeight * devicePixelRatio;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    const area = window.innerWidth * window.innerHeight;

    layers = STAR_LAYERS.map((cfg) => {
      const angle = Math.random() * Math.PI * 2;
      const count = Math.max(14, Math.round(area * cfg.density));
      return {
        ...cfg,
        dx: Math.cos(angle) * cfg.speed * devicePixelRatio,
        dy: Math.sin(angle) * cfg.speed * devicePixelRatio,
        stars: Array.from({ length: count }, () => ({
          x: Math.random() * width,
          y: Math.random() * height,
          r: (cfg.sizeMin + Math.random() * (cfg.sizeMax - cfg.sizeMin)) * devicePixelRatio,
          phase: Math.random() * Math.PI * 2,
          twinkleSpeed: 0.3 + Math.random() * 0.6,
        })),
      };
    });
  }

  function draw(t) {
    const dt = last ? (t - last) / 1000 : 0;
    last = t;
    ctx.clearRect(0, 0, width, height);
    for (const layer of layers) {
      for (const s of layer.stars) {
        s.x = (s.x + layer.dx * dt + width) % width;
        s.y = (s.y + layer.dy * dt + height) % height;
        const twinkle = 0.5 + 0.5 * Math.sin(t * 0.001 * s.twinkleSpeed + s.phase);
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${layer.opacity * (0.35 + twinkle * 0.65)})`;
        ctx.fill();
      }
    }
    raf = requestAnimationFrame(draw);
  }

  resize();
  window.addEventListener('resize', resize);
  raf = requestAnimationFrame(draw);

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
  };
}

// Bubbles drift like tethered balloons: a persistent rAF loop nudges each
// registered element's transform along independent sine paths. Only
// `transform` is touched per frame (GPU-composited, no layout thrash).
export function createBubbleDrift() {
  let entries = [];
  let raf = null;

  function tick(t) {
    const time = t * 0.001;
    for (const e of entries) {
      const dx = Math.sin(time * e.freqX + e.phaseX) * e.ampX;
      const dy = Math.cos(time * e.freqY + e.phaseY) * e.ampY;
      e.el.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
    }
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);

  return {
    setBubbles(elements) {
      entries = elements.map((el) => ({
        el,
        ampX: 5 + Math.random() * 9,
        ampY: 5 + Math.random() * 9,
        freqX: 0.12 + Math.random() * 0.22,
        freqY: 0.12 + Math.random() * 0.22,
        phaseX: Math.random() * Math.PI * 2,
        phaseY: Math.random() * Math.PI * 2,
      }));
    },
    stop() {
      cancelAnimationFrame(raf);
    },
  };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function mixColor(hexA, hexB, t) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const r = Math.round(lerp(a.r, b.r, t));
  const g = Math.round(lerp(a.g, b.g, t));
  const bl = Math.round(lerp(a.b, b.b, t));
  return `rgb(${r},${g},${bl})`;
}

// Warmth is an open-ended reply count; 12 replies is treated as "fully warmed".
const WARMTH_CAP = 12;

export function warmthRatio(warmth) {
  return Math.min(1, (warmth || 0) / WARMTH_CAP);
}

export function bubbleColor(type, warmth) {
  const t = warmthRatio(warmth);
  if (type === 'pain') return mixColor('#4a6fa5', '#ffb366', t);
  return mixColor('#ff8a5c', '#ffe08a', t);
}

export function bubbleSize(content) {
  const len = (content || '').length;
  const base = 76;
  const grown = base + Math.min(46, Math.round(len / 12));
  return grown;
}

// Places bubbles in a loosely jittered grid so they read as scattered
// without overlapping, and returns the total height the container needs.
export function layoutBubbles(items, containerWidth) {
  const cell = 116;
  const cols = Math.max(2, Math.floor(containerWidth / cell));
  const rows = Math.ceil(items.length / cols);
  const positions = items.map((item, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const jitterX = (Math.random() - 0.5) * (cell * 0.4);
    const jitterY = (Math.random() - 0.5) * (cell * 0.4);
    const x = col * cell + cell / 2 + jitterX;
    const y = row * cell + cell / 2 + jitterY;
    return { item, x, y };
  });
  return { positions, height: rows * cell + cell };
}
