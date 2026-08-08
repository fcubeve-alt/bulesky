// A living night landscape, rendered procedurally (no image/video assets):
// a still lake under a starry sky, aurora ribbons, a low moon, drifting
// mist, and mountain silhouettes at the horizon. Everyone's whispers rise
// from the water as soft glowing lanterns.
//
// The canvas is transparent and draws only additive light (stars, aurora,
// moon, their reflections, water shimmer) over CSS gradient sky/lake behind
// it. Interactive lanterns are DOM nodes (see createLanternField) so they
// stay easily tappable and accessible.

const HORIZON = 0.6; // waterline as a fraction of viewport height

function rand(a, b) {
  return a + Math.random() * (b - a);
}

export function initScene(canvas) {
  const ctx = canvas.getContext('2d');
  let w = 0;
  let h = 0;
  let horizonY = 0;
  let stars = [];
  let aurora = [];
  let moon = { x: 0, y: 0, r: 0 };
  let shimmer = [];
  let shootingStar = null;
  let nextShoot = 4000;
  let last = 0;
  let raf = null;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    horizonY = h * HORIZON;

    stars = Array.from({ length: Math.round((w * horizonY) / 4200) }, () => ({
      x: Math.random() * w,
      y: Math.random() * horizonY * 0.96,
      r: rand(0.4, 1.5),
      phase: rand(0, Math.PI * 2),
      tw: rand(0.5, 1.4),
    }));

    moon = { x: w * 0.82, y: horizonY * 0.2, r: Math.max(22, w * 0.045) };

    // Aurora ribbons — a few smooth sine bands with soft additive glow.
    aurora = [
      { baseY: horizonY * 0.5, amp: horizonY * 0.09, k: 2.1, speed: 0.05, hue: '120,210,180', alpha: 0.16, width: 26 },
      { baseY: horizonY * 0.62, amp: horizonY * 0.07, k: 1.6, speed: -0.04, hue: '120,180,255', alpha: 0.14, width: 34 },
      { baseY: horizonY * 0.74, amp: horizonY * 0.06, k: 2.6, speed: 0.07, hue: '190,150,255', alpha: 0.12, width: 22 },
    ].map((a) => ({ ...a, phase: rand(0, Math.PI * 2) }));

    shimmer = Array.from({ length: 7 }, () => ({
      y: horizonY + rand(0.04, 0.95) * (h - horizonY),
      x: Math.random() * w,
      len: rand(40, 160),
      speed: rand(6, 22) * (Math.random() < 0.5 ? -1 : 1),
      alpha: rand(0.05, 0.16),
    }));
  }

  function drawMoon() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(moon.x, moon.y, 0, moon.x, moon.y, moon.r * 4.5);
    g.addColorStop(0, 'rgba(255,246,224,0.9)');
    g.addColorStop(0.12, 'rgba(255,240,210,0.5)');
    g.addColorStop(0.4, 'rgba(200,215,255,0.12)');
    g.addColorStop(1, 'rgba(200,215,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(moon.x, moon.y, moon.r * 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,250,235,0.95)';
    ctx.beginPath();
    ctx.arc(moon.x, moon.y, moon.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function ribbonPath(band, t, flip) {
    ctx.beginPath();
    const step = 14;
    for (let x = -step; x <= w + step; x += step) {
      const wobble = Math.sin(x * 0.01 * band.k + t * band.speed + band.phase) * band.amp
        + Math.sin(x * 0.021 + t * band.speed * 1.7) * band.amp * 0.35;
      let y = band.baseY + wobble;
      if (flip) y = horizonY + (horizonY - y);
      if (x === -step) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  }

  function drawAurora(t, flip) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const band of aurora) {
      // Fake a glow with a few stacked strokes instead of shadowBlur (cheaper).
      const passes = [
        { wm: 1, am: 0.4 },
        { wm: 0.5, am: 0.7 },
        { wm: 0.18, am: 1 },
      ];
      for (const p of passes) {
        ribbonPath(band, t, flip);
        ctx.lineWidth = band.width * p.wm;
        ctx.strokeStyle = `rgba(${band.hue},${band.alpha * p.am * (flip ? 0.4 : 1)})`;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawStars(t) {
    for (const s of stars) {
      const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 0.001 * s.tw + s.phase));
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fill();
    }
  }

  function drawWater(t, dt) {
    // Reflection of moon: a shimmering vertical column on the water.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const col = ctx.createLinearGradient(moon.x, horizonY, moon.x, h);
    col.addColorStop(0, 'rgba(255,244,220,0.09)');
    col.addColorStop(1, 'rgba(255,244,220,0)');
    ctx.fillStyle = col;
    const cw = moon.r * 1.05;
    ctx.fillRect(moon.x - cw / 2, horizonY, cw, h - horizonY);
    ctx.restore();

    // Reflected aurora, dim + wavy.
    drawAurora(t, true);

    // Horizontal shimmer streaks drifting across the lake.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const s of shimmer) {
      s.x += s.speed * dt;
      if (s.x > w + s.len) s.x = -s.len;
      if (s.x < -s.len) s.x = w + s.len;
      const g = ctx.createLinearGradient(s.x, s.y, s.x + s.len, s.y);
      g.addColorStop(0, 'rgba(200,220,255,0)');
      g.addColorStop(0.5, `rgba(210,228,255,${s.alpha})`);
      g.addColorStop(1, 'rgba(200,220,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(s.x, s.y, s.len, 1.4);
    }
    ctx.restore();
  }

  function drawShooting(t, dt) {
    if (!shootingStar) {
      nextShoot -= dt * 1000;
      if (nextShoot <= 0) {
        nextShoot = rand(7000, 16000);
        shootingStar = {
          x: rand(w * 0.1, w * 0.8),
          y: rand(0, horizonY * 0.4),
          vx: rand(180, 300),
          vy: rand(60, 120),
          life: 1,
        };
      }
      return;
    }
    const s = shootingStar;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.life -= dt * 0.8;
    if (s.life <= 0) {
      shootingStar = null;
      return;
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const tailX = s.x - s.vx * 0.12;
    const tailY = s.y - s.vy * 0.12;
    const g = ctx.createLinearGradient(tailX, tailY, s.x, s.y);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(1, `rgba(255,255,255,${0.8 * s.life})`);
    ctx.strokeStyle = g;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(s.x, s.y);
    ctx.stroke();
    ctx.restore();
  }

  function frame(t) {
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 0;
    last = t;
    ctx.clearRect(0, 0, w, h);
    drawStars(t);
    drawMoon();
    drawAurora(t, false);
    drawWater(t, dt);
    drawShooting(t, dt);
    raf = requestAnimationFrame(frame);
  }

  resize();
  window.addEventListener('resize', resize);
  raf = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
  };
}

// ---- Whisper world: the whispers, as rising lanterns you can pan through ----

// How many lights it takes for a whisper's halo to reach its warmest. Past
// this it stops growing — the sky must stay readable, and a popularity contest
// is the last thing this place needs.
const LIGHT_CAP = 8;
const PREVIEW_CHARS = 60;

// Four explicit depth tiers (see docs/SKY_FEED.md §4). Using discrete tiers —
// rather than one flat random spread — guarantees the sky always has real
// layers: a scatter of tiny dim dots far back, some mid, a few big readable
// ones up front. Each balloon lands in a tier by weight, then jitters within.
// `rise` is in PIXELS PER SECOND and is fixed per tier, not per balloon. That
// is what makes "no two balloons in the same layer ever overlap" hold: same
// tier = same speed = the gap set between them at spawn never changes. Layers
// differ (far slow, near fast), and layers passing over each other is exactly
// what reads as depth.
// Weights are 7 big : 3 small out of every ten balloons — the sky is for
// reading, and a small far dot can't be read. The two near tiers carry the
// text; the two far ones are there for depth.
const DEPTH_TIERS = [
  { zMin: 0.05, zMax: 0.16, weight: 1, rise: 15 }, // far: tiny dim dots, slowest
  { zMin: 0.3, zMax: 0.44, weight: 2, rise: 21 }, // mid-far
  { zMin: 0.58, zMax: 0.74, weight: 4, rise: 28 }, // mid-near
  { zMin: 0.88, zMax: 1.0, weight: 3, rise: 36 }, // near: big, bright, fastest
];
const DEPTH_TIER_TOTAL = DEPTH_TIERS.reduce((s, t) => s + t.weight, 0);
// Seconds a balloon spends on screen, per pixel of travel — the average of
// 1/rise, NOT 1 / average-rise. Slow balloons linger, so they are
// over-represented on screen at any instant; averaging the speeds instead of
// the durations undercounts the population and makes the sky thin out.
const SEC_PER_PX = DEPTH_TIERS.reduce((s, t) => s + t.weight / t.rise, 0) / DEPTH_TIER_TOTAL;
// Layers are dealt from a shuffled bag, not rolled independently each time.
// Independent rolls produce runs — six far balloons in a row, then four big
// near ones — and the sky visibly lurches between "all tiny dots" and "all
// giants". A bag guarantees the mix over every 14 balloons while keeping the
// order unpredictable.
let tierBag = [];
function pickTierIndex() {
  if (!tierBag.length) {
    DEPTH_TIERS.forEach((t, i) => {
      for (let n = 0; n < t.weight; n++) tierBag.push(i);
    });
    for (let i = tierBag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tierBag[i], tierBag[j]] = [tierBag[j], tierBag[i]];
    }
  }
  return tierBag.pop();
}

// How wide the pannable world is, as a multiple of the screen. Nobody drags a
// phone screen sideways by habit, so what matters is how the sky looks
// standing still — a world much wider than the screen quietly parks half the
// balloons out of sight. Just enough extra to have somewhere to drag to.
const WORLD_SPREAD = 1.3;

// How many balloons should be visible ON SCREEN, without dragging: enough that
// there is always something to read, few enough that a phone doesn't turn into
// a heap. See docs/SKY_FEED.md §2 & §6.
// Calibrated against what the browser actually renders in the viewport, not
// against the model — the model runs about 20% optimistic on a phone.
function visibleTarget() {
  return window.innerWidth < 640 ? 10 : 19;
}
// The pool covers what you can't see too: the share of the world sitting
// off-screen left and right, one balloon entering from below and one clearing
// the top, plus slack so the spawner almost always has one parked when its
// beat comes round. Without that slack the cadence stutters exactly when the
// sky is fullest.
function poolCap() {
  return Math.round(visibleTarget() * WORLD_SPREAD * 1.35) + 2;
}

// The whispers live in a layered depth field, not on a flat plane. Each
// balloon gets a depth `z` in [0,1] (0 = far, 1 = near) that drives its size,
// brightness, blur, rise speed, drag-parallax and stacking — so the sky reads
// as a real 3D space you look *into*: tiny dim balloons drift far away while
// big bright ones rise close and sway past. `viewport` is the fixed clipping
// element; `world` is the inner layer that holds the balloons. Tap vs. drag is
// distinguished by movement distance.
export function createWhisperWorld(viewport, world, { onTap, onNeedMore }) {
  let items = [];
  let raf = null;
  let lastT = 0;
  let worldW = 0;
  let panX = 0;
  let minPan = 0;

  // Drag state
  let dragging = false;
  let moved = false;
  let startX = 0;
  let startPan = 0;

  function clampPan(x) {
    return Math.max(minPan, Math.min(0, x));
  }

  function onDown(e) {
    dragging = true;
    moved = false;
    startX = e.touches ? e.touches[0].clientX : e.clientX;
    startPan = panX;
  }
  function onMove(e) {
    if (!dragging) return;
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const dx = cx - startX;
    if (Math.abs(dx) > 6) moved = true;
    panX = clampPan(startPan + dx);
    // Parallax is applied per balloon in the frame loop (near layers pan more
    // than far ones), so we don't move `world` as a single block here.
  }
  function onUp() {
    dragging = false;
  }

  viewport.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);

  // ---- The "river": a small, capped set of balloons streams continuously ----
  // Only poolCap() balloons live on screen at once, so the sky is a calm stream,
  // never a heap. Each draws whispers one at a time from `deck` — the sample the
  // server dealt THIS viewer — and when one drifts off the top it rebinds to the
  // next whisper in the deck and re-enters from the bottom. So a handful are
  // visible while, over time, the whole deck cycles through; different viewers
  // get different decks, so different people see different whispers.
  let deck = [];
  let nextIdx = 0;
  const pinned = []; // whispers to surface ASAP (e.g. the author's own new post)

  // Is this whisper already up there on some balloon?
  function airborne(id) {
    for (const it of items) if (it.wsp && it.wsp.id === id) return true;
    return false;
  }

  function nextWhisper() {
    if (pinned.length) return pinned.shift(); // the author's own post jumps the queue
    if (!deck.length) return null;
    // Walk the deck in order. The deck is a random sample dealt by the server,
    // in random order, so walking it is walking a random permutation: every
    // balloon that rises carries something different, and a full pass asks for
    // a brand new sample rather than looping the same batch (SKY_FEED §3).
    for (let tries = 0; tries < deck.length; tries++) {
      const wsp = deck[nextIdx % deck.length];
      nextIdx += 1;
      if (nextIdx % deck.length === 0 && typeof onNeedMore === 'function') onNeedMore();
      // Skip anything already in the air. A refreshed sample can contain a
      // whisper a balloon is still carrying, and the same words rising twice at
      // once is exactly the repetition this whole scheme exists to avoid.
      if (!airborne(wsp.id)) return wsp;
    }
    // Everything in the deck is already flying — only possible when the corpus
    // is smaller than the pool. Better to fly fewer balloons than duplicates.
    return null;
  }

  // How wide this balloon actually reads on screen, including how far it sways.
  function halfSpan(it) {
    return (it.w * (0.3 + it.z0 * 1.0)) / 2 + it.swayAmp + 8;
  }

  function halfHeight(it) {
    return (it.h * (0.3 + it.z0 * 1.0)) / 2;
  }

  // Pick a horizontal spot that keeps this balloon clear of the others IN ITS
  // OWN TIER (SKY_FEED §9).
  //
  // Same tier = identical rise speed, so every gap decided here is frozen for
  // the balloon's whole flight: get it right once and they can never collide.
  // That also means only the neighbours it is level with matter — a same-tier
  // balloon already a few heights above will stay exactly that far above
  // forever, so it doesn't constrain the choice at all. Checking against the
  // whole tier instead (the obvious version of this) asks a phone-width sky to
  // fit four big near balloons side by side, fails, and freezes the overlap in
  // place. Different tiers are ignored on purpose: one layer drifting across
  // another is the depth cue, not a defect.
  function pickFreeX(it) {
    const max = Math.max(1, worldW - it.w);
    const mine = halfSpan(it);
    const myMidY = it.y + halfHeight(it);
    const rivals = items.filter(
      (o) =>
        o !== it &&
        o.wsp &&
        o.tier === it.tier &&
        Math.abs(myMidY - (o.y + halfHeight(o))) < halfHeight(it) + halfHeight(o) + 8
    );
    if (!rivals.length) return rand(0, max);

    let best = rand(0, max);
    let bestGap = -Infinity;
    for (let attempt = 0; attempt < 24; attempt++) {
      const x = attempt === 0 ? best : rand(0, max);
      let gap = Infinity;
      for (const o of rivals) {
        const need = mine + halfSpan(o);
        gap = Math.min(gap, Math.abs(x + it.w / 2 - (o.baseX + o.w / 2)) - need);
      }
      if (gap >= 0) return x;
      if (gap > bestGap) {
        bestGap = gap;
        best = x;
      }
    }
    return best;
  }

  // Seat a balloon in one of the four depth tiers (SKY_FEED §4–5): sets its
  // depth, its rise speed (near noticeably faster, far slowest — the staggered
  // pace that reads as 3D), its horizontal spot, and its depth styling. Every
  // tier stays populated, so there are always tiny dim dots far back and a few
  // big readable ones up front — all still tappable.
  function seatDepth(it) {
    const ti = pickTierIndex();
    const tier = DEPTH_TIERS[ti];
    it.tier = ti;
    it.z0 = tier.zMin + Math.random() * (tier.zMax - tier.zMin);
    it.rise = tier.rise; // px per second, fixed for the whole tier
    it.baseX = pickFreeX(it);
    it.el.style.opacity = (0.38 + it.z0 * 0.62).toFixed(2);
    it.el.style.filter = it.z0 < 0.34 ? `blur(${((0.34 - it.z0) * 5).toFixed(2)}px)` : '';
    it.el.style.zIndex = String(Math.round(it.z0 * 100));
  }

  // Point an existing balloon at a (new) whisper: size, colour, glow, preview
  // text and ribbon all follow the content it now carries.
  function applyWhisper(it, wsp) {
    it.wsp = wsp;
    const text = (wsp.content || '').trim();
    const lenFactor = Math.min(1, text.length / 160);
    const base = 66 + lenFactor * 34; // ~66–100px, then × depth scale
    const shape = Math.random();
    let w = base;
    let h = base;
    if (shape < 0.32) h = base * (1.1 + Math.random() * 0.16);
    else if (shape < 0.52) w = base * (1.12 + Math.random() * 0.16);
    it.w = w;
    it.h = h;
    const el = it.el;
    el.className = `lantern type-${wsp.type}`;
    el.style.width = w + 'px';
    el.style.height = h + 'px';
    el.style.fontSize = (0.56 + lenFactor * 0.12).toFixed(3) + 'rem';
    el.setAttribute('aria-label', wsp.type === 'pain' ? 'a sorrow' : 'a wish');
    it.span.textContent = text.length > PREVIEW_CHARS ? text.slice(0, PREVIEW_CHARS) + '…' : text;
    applyWarmth(it);
  }

  // The two ways of caring read differently and never blur together:
  //   a reply  → the basket is lit, on or off, never a count;
  //   a light  → the envelope's halo warms up, capped so a much-visited
  //              whisper glows a little more but never burns out the picture.
  // Split out from applyWhisper because it also runs the instant the reader
  // leaves a light or a reply — see markWhisper().
  function applyWarmth(it) {
    const wsp = it.wsp;
    if (!wsp) return;
    const litN = Math.min(1, (wsp.lights || 0) / LIGHT_CAP);
    it.el.style.setProperty('--glow', (0.5 + litN * 0.85).toFixed(2));
    it.el.style.setProperty('--burn', (0.12 + litN * 0.5).toFixed(2));
    it.el.classList.toggle('answered', (wsp.warmth || 0) >= 1);
  }

  // Send a balloon up from just below the bottom edge carrying the next
  // whisper. Returns false when there is nothing to carry.
  function launch(it) {
    const wsp = nextWhisper();
    if (!wsp) {
      release(it);
      return false;
    }
    it.el.style.display = '';
    applyWhisper(it, wsp);
    it.y = window.innerHeight + 8 + rand(0, 10); // seatDepth reads this
    seatDepth(it);
    return true;
  }

  // Park a balloon that has drifted off the top. It waits, invisible, until the
  // spawner's next beat — which is what keeps arrivals evenly spaced instead of
  // bunched up behind whichever balloon happened to exit.
  function release(it) {
    it.wsp = null;
    it.el.style.display = 'none';
  }

  // Balloons actually in front of the viewer right now (not the ones still
  // below the bottom edge or already past the top).
  function onScreenCount() {
    const H = window.innerHeight;
    const W = window.innerWidth;
    let n = 0;
    for (const it of items) {
      if (!it.wsp || it.y >= H || it.y <= -it.h) continue;
      // Count only what is in front of the viewer right now: the rest of the
      // world is off to the side until they drag to it.
      const cx = it.baseX + it.w / 2 + panX * (0.24 + it.z0 * 0.76);
      if (cx > -it.w && cx < W + it.w) n += 1;
    }
    return n;
  }

  // Launch the next parked balloon, if there is one.
  function launchOne() {
    const free = items.find((it) => !it.wsp);
    return free ? launch(free) : false;
  }

  // One balloon every `spawnInterval` seconds. The interval is derived, not
  // guessed: a balloon crosses the screen in about `travel / AVG_RISE` seconds,
  // so releasing one every (that ÷ pool size) keeps the pool's worth of
  // balloons in the air at a steady, even cadence (SKY_FEED §9).
  let spawnInterval = 3;
  let spawnAcc = 0;
  function computeCadence() {
    // Rate is set by the VISIBLE span, not the whole flight: a fifth of the
    // journey happens below the bottom edge and above the top one, and those
    // balloons are not on screen keeping anyone company. Using the full travel
    // here is what left the sky about 20% emptier than asked for.
    const visibleSpan = window.innerHeight;
    // Rate is set for the whole world; the on-screen share of it then lands
    // near visibleTarget().
    const target = Math.max(
      1,
      Math.min(visibleTarget() * WORLD_SPREAD, Math.round(items.length / 1.35))
    );
    spawnInterval = (visibleSpan * SEC_PER_PX) / target;
  }

  function makeItem() {
    const el = document.createElement('button');
    el.className = 'lantern';
    const span = document.createElement('span');
    span.className = 'lantern-text';
    el.appendChild(span);
    const it = {
      el,
      span,
      wsp: null,
      w: 90,
      h: 90,
      y: 0,
      z0: 0,
      tier: 0,
      pulseTimer: 0,
      baseX: 0,
      rise: 0,
      zPhase: rand(0, Math.PI * 2),
      zFreq: rand(0.05, 0.16),
      zAmp: rand(0.03, 0.08),
      swayAmp: rand(5, 15),
      swayFreq: rand(0.08, 0.26),
      swayPhase: rand(0, Math.PI * 2),
      bobAmp: rand(2, 5),
      bobFreq: rand(0.3, 0.8),
      bobPhase: rand(0, Math.PI * 2),
    };
    // Tap opens whatever whisper this balloon currently carries — near or far.
    el.addEventListener('click', () => {
      if (!moved && it.wsp) onTap(it.wsp.id, el.getBoundingClientRect());
    });
    world.appendChild(el);
    return it;
  }

  function layout() {
    const W = window.innerWidth;
    // About two screens wide — enough to drag sideways and let the few big near
    // balloons breathe, but not so wide the sky feels empty or the depth tiers
    // get scattered so you never see near + far together (SKY_FEED §6). Depth
    // (near big, far tiny), not width, does most of the decluttering.
    worldW = Math.round(W * WORLD_SPREAD);
    world.style.width = worldW + 'px';
    world.style.transform = 'none';
    minPan = Math.min(0, W - worldW);
    panX = clampPan(panX);
  }

  function build() {
    const target = Math.min(poolCap(), Math.max(1, deck.length));
    while (items.length < target) items.push(makeItem());
    layout();
    computeCadence();
    // Seed the sky mid-flight. Space them by REMAINING FLIGHT TIME, not by
    // screen position: they rise at different speeds, so evenly-spaced dots
    // would still leave the top on a clumped schedule and the stream would
    // stutter for the first minute. Spacing the exits by exactly one beat means
    // the cadence is right from the first second.
    const H = window.innerHeight;
    items.forEach((it, i) => {
      if (!launch(it)) return;
      // Stagger them along their own flight path, one slot each, so the first
      // screen is already as full as the steady state — waiting for the
      // spawner to fill an empty sky would take a whole flight time. The
      // jitter keeps two balloons from lining up at identical heights.
      const frac = (i + 0.5) / items.length + rand(-0.02, 0.02);
      it.y = H * 1.02 - Math.max(0, Math.min(1, frac)) * (H * 1.25 + it.h * 2.2);
      it.baseX = pickFreeX(it); // re-choose now that its real height is known
    });
    spawnAcc = 0;
  }

  function frame(t) {
    const time = t * 0.001;
    const dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0;
    lastT = t;

    // Even cadence: one balloon per beat, independent of who happened to leave.
    // The beat comes from average flight time, which is close but not exact, so
    // it is nudged by how far the sky is from its target: a little slower when
    // it is full, a little quicker when it is thinning. Stretching the beat
    // keeps the stream even — simply skipping beats when full would hold the
    // count down but bring back the bunching this whole scheme exists to fix.
    const err = onScreenCount() - visibleTarget();
    // A one-balloon deadband: correcting for being a single balloon off would
    // wobble the beat constantly for no visible gain.
    const drift = Math.abs(err) < 2 ? 0 : Math.max(-0.3, Math.min(0.5, err * 0.1));
    const beat = spawnInterval * (1 + drift);
    spawnAcc += dt;
    while (spawnAcc >= beat) {
      spawnAcc -= beat;
      if (!launchOne()) break;
    }

    for (const it of items) {
      if (!it.wsp) continue;
      it.y -= it.rise * dt; // px/second, so speed doesn't depend on frame rate
      // Off the top → park it and let the spawner send it up again on its beat.
      if (it.y < -it.h * 2.2) {
        release(it);
        continue;
      }
      // Gentle depth "breathing" — balloons drift a little toward and away from
      // the viewer, so the field feels alive in 3D rather than fixed.
      const z = Math.max(0, Math.min(1, it.z0 + Math.sin(time * it.zFreq + it.zPhase) * it.zAmp));
      const scale = 0.3 + z * 1.0; // far ~0.35× (tiny dot), near ~1.3× — layered, never bloated
      const sway = Math.sin(time * it.swayFreq + it.swayPhase) * it.swayAmp * (0.4 + z);
      const bob = Math.cos(time * it.bobFreq + it.bobPhase) * it.bobAmp;
      // Near layers slide a lot under a drag; the far layer barely moves.
      const px = panX * (0.24 + it.z0 * 0.76);
      const x = it.baseX + px + sway;
      it.el.style.transform =
        `translate(${x.toFixed(1)}px, ${(it.y + bob).toFixed(1)}px) scale(${scale.toFixed(3)})`;
    }
    raf = requestAnimationFrame(frame);
  }

  if (!raf) raf = requestAnimationFrame(frame);

  return {
    // Deal this viewer a fresh deck (a server sample). On first call it builds
    // the pool; later calls (periodic refetch) just swap the deck — balloons
    // rebind to the new whispers as they recycle, so content stays fresh.
    setWhispers(whispers) {
      deck = Array.isArray(whispers) ? whispers.slice() : [];
      nextIdx = 0;
      if (!items.length) {
        build();
        return;
      }
      const target = Math.min(poolCap(), Math.max(1, deck.length));
      let grew = false;
      while (items.length < target) {
        const it = makeItem();
        items.push(it);
        grew = true;
      }
      if (grew) {
        layout();
        computeCadence();
      }
      if (!deck.length) {
        for (const it of items) {
          it.wsp = null;
          it.el.style.display = 'none';
        }
      }
    },
    // Someone just left a light or a reply on this whisper: show it on the
    // balloon NOW. Waiting for the next deck refresh meant up to a minute of
    // nothing, on a balloon that had probably recycled onto a different
    // whisper by then — so leaving a light looked like it did nothing at all.
    // Returns false when no balloon is currently carrying it.
    markWhisper(id, changes) {
      if (id == null) return false;
      for (const w of deck) if (w.id === id) Object.assign(w, changes);
      let live = false;
      for (const it of items) {
        if (it.wsp && it.wsp.id === id) {
          Object.assign(it.wsp, changes);
          applyWarmth(it);
          live = true;
        }
      }
      return live;
    },
    // A brief warm flare on the balloon carrying this whisper. One extra light
    // only widens the halo by a few pixels — true to the "no numbers" rule, but
    // far too quiet to read as "that worked". This is the moment of feedback;
    // the halo is the lasting state. Returns false if no balloon carries it.
    pulse(id) {
      let found = false;
      for (const it of items) {
        if (!it.wsp || it.wsp.id !== id) continue;
        found = true;
        it.el.classList.remove('just-warmed');
        void it.el.offsetWidth; // restart the animation if it is already running
        it.el.classList.add('just-warmed');
        clearTimeout(it.pulseTimer);
        it.pulseTimer = setTimeout(() => it.el.classList.remove('just-warmed'), 1300);
      }
      return found;
    },
    // Surface a whisper right away (the author's own new post). It jumps into
    // the deck ahead of the queue and the balloon nearest the top re-enters
    // carrying it, so the author sees their own balloon within a moment.
    pin(wsp) {
      if (!wsp || wsp.id == null) return;
      pinned.push(wsp);
      // Straight up on the next frame, not on the next beat: recycle whichever
      // balloon is closest to leaving if none is parked (SKY_FEED §7).
      if (launchOne()) return;
      let top = null;
      for (const it of items) if (it.wsp && (!top || it.y < top.y)) top = it;
      if (top) launch(top);
    },
    get pannable() {
      return worldW > window.innerWidth + 4;
    },
    stop() {
      cancelAnimationFrame(raf);
    },
  };
}
