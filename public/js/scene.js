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

const WARMTH_CAP = 12;
const PREVIEW_CHARS = 20;

// The whispers live in a layered depth field, not on a flat plane. Each
// balloon gets a depth `z` in [0,1] (0 = far, 1 = near) that drives its size,
// brightness, blur, rise speed, drag-parallax and stacking — so the sky reads
// as a real 3D space you look *into*: tiny dim balloons drift far away while
// big bright ones rise close and sway past. `viewport` is the fixed clipping
// element; `world` is the inner layer that holds the balloons. Tap vs. drag is
// distinguished by movement distance.
export function createWhisperWorld(viewport, world, { onTap, ribbonText }) {
  let items = [];
  let raf = null;
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
  // Only POOL_CAP balloons live on screen at once, so the sky is a calm stream,
  // never a heap. Each draws whispers one at a time from `deck` — the sample the
  // server dealt THIS viewer — and when one drifts off the top it rebinds to the
  // next whisper in the deck and re-enters from the bottom. So a handful are
  // visible while, over time, the whole deck cycles through; different viewers
  // get different decks, so different people see different whispers.
  const POOL_CAP = 18;
  let deck = [];
  let nextIdx = 0;
  const pinned = []; // whispers to surface ASAP (e.g. the author's own new post)

  function nextWhisper() {
    if (pinned.length) return pinned.shift();
    if (!deck.length) return null;
    const wsp = deck[nextIdx % deck.length];
    nextIdx += 1;
    return wsp;
  }

  // Give a balloon a fresh depth, rise speed and horizontal spot. Depth is
  // spread evenly across near→far (not crammed onto one plane and not all
  // pushed to the distance) so the sky has real layers: a few big readable
  // ones close, some mid, a few small dim ones far back — every one still
  // tappable. Everything rises slowly and gently — the calm float-up we like.
  function seatDepth(it) {
    const z0 = 0.15 + Math.random() * 0.85; // even spread → real layering, not one plane
    it.z0 = z0;
    it.rise = 0.09 + z0 * 0.18; // slow, gentle; near only a touch faster (parallax)
    it.baseX = rand(0, Math.max(1, worldW - it.w));
    it.el.style.opacity = (0.45 + z0 * 0.55).toFixed(2);
    it.el.style.filter = z0 < 0.35 ? `blur(${((0.35 - z0) * 4).toFixed(2)}px)` : '';
    it.el.style.zIndex = String(Math.round(z0 * 100));
  }

  // Point an existing balloon at a (new) whisper: size, colour, glow, preview
  // text and ribbon all follow the content it now carries.
  function applyWhisper(it, wsp) {
    it.wsp = wsp;
    const text = (wsp.content || '').trim();
    const warmN = Math.min(1, ((wsp.warmth || 0) + (wsp.lights || 0) * 0.6) / WARMTH_CAP);
    const lenFactor = Math.min(1, text.length / 160);
    const base = 74 + lenFactor * 42; // ~74–116px, then × depth scale
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
    el.style.setProperty('--glow', (0.5 + warmN * 1.0).toFixed(2));
    el.style.setProperty('--burn', (0.14 + warmN * 0.7).toFixed(2)); // burner brightens with warmth
    el.setAttribute('aria-label', wsp.type === 'pain' ? 'a sorrow' : 'a wish');
    it.span.textContent = text.length > PREVIEW_CHARS ? text.slice(0, PREVIEW_CHARS) + '…' : text;
    // A whisper that's been answered hangs a small streamer; rebuild it per bind.
    if (it.ribbon) {
      it.ribbon.remove();
      it.ribbon = null;
    }
    if ((wsp.warmth || 0) >= 1 && typeof ribbonText === 'function') {
      const ribbon = document.createElement('span');
      ribbon.className = 'lantern-ribbon' + ((wsp.warmth || 0) >= 5 ? ' warm' : '');
      ribbon.textContent = ribbonText(wsp.warmth || 0);
      el.appendChild(ribbon);
      it.ribbon = ribbon;
    }
  }

  // (Re)enter a balloon from below carrying the next whisper. On firstTime it is
  // scattered across the whole height so the sky looks alive immediately.
  function respawn(it, firstTime) {
    const wsp = nextWhisper();
    if (!wsp) {
      it.wsp = null;
      it.el.style.display = 'none';
      return;
    }
    it.el.style.display = '';
    applyWhisper(it, wsp);
    seatDepth(it);
    const H = window.innerHeight;
    it.y = firstTime ? rand(-H * 0.05, H * 1.02) : H + rand(20, 160);
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
      ribbon: null,
      wsp: null,
      w: 90,
      h: 90,
      y: 0,
      z0: 0,
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
    const poolN = Math.max(1, items.length);
    // Width follows how many are actually on screen (the pool), not the whole
    // deck — modest, so depth does the spacing and you never drag forever.
    worldW = Math.max(W, Math.min(poolN * 96, W * 1.9));
    world.style.width = worldW + 'px';
    world.style.transform = 'none';
    minPan = Math.min(0, W - worldW);
    panX = clampPan(panX);
  }

  function build() {
    const target = Math.min(POOL_CAP, Math.max(1, deck.length));
    while (items.length < target) items.push(makeItem());
    layout();
    for (const it of items) respawn(it, true);
  }

  function frame(t) {
    const time = t * 0.001;
    for (const it of items) {
      if (!it.wsp) continue;
      it.y -= it.rise;
      // Off the top → rebind to the next whisper and re-enter from the bottom.
      if (it.y < -it.h * 2.2) {
        respawn(it, false);
        continue;
      }
      // Gentle depth "breathing" — balloons drift a little toward and away from
      // the viewer, so the field feels alive in 3D rather than fixed.
      const z = Math.max(0, Math.min(1, it.z0 + Math.sin(time * it.zFreq + it.zPhase) * it.zAmp));
      const scale = 0.4 + z * 1.05; // far ~0.4×, near ~1.45× — clear layered depth
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
      const target = Math.min(POOL_CAP, Math.max(1, deck.length));
      let grew = false;
      while (items.length < target) {
        const it = makeItem();
        items.push(it);
        grew = true;
      }
      if (grew) {
        layout();
        for (const it of items) if (!it.wsp) respawn(it, true);
      }
      if (!deck.length) {
        for (const it of items) {
          it.wsp = null;
          it.el.style.display = 'none';
        }
      }
    },
    // Surface a whisper right away (the author's own new post). It jumps into
    // the deck ahead of the queue and the balloon nearest the top re-enters
    // carrying it, so the author sees their own balloon within a moment.
    pin(wsp) {
      if (!wsp || wsp.id == null) return;
      pinned.push(wsp);
      let top = null;
      for (const it of items) if (it.wsp && (!top || it.y < top.y)) top = it;
      if (top) respawn(top, false);
    },
    get pannable() {
      return worldW > window.innerWidth + 4;
    },
    stop() {
      cancelAnimationFrame(raf);
    },
  };
}
