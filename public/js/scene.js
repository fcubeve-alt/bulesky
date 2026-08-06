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
const COL_SPACING = 120; // horizontal room per whisper; wider than a screen when many

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

  function frame(t) {
    const time = t * 0.001;
    const H = window.innerHeight;
    for (const it of items) {
      it.y -= it.rise;
      if (it.y < -it.h * 2.2) it.y = H + rand(20, 160);

      // Gentle depth "breathing" — balloons drift a little toward and away
      // from the viewer, so the field feels alive in 3D rather than fixed.
      const z = Math.max(0, Math.min(1, it.z0 + Math.sin(time * it.zFreq + it.zPhase) * it.zAmp));
      const scale = 0.24 + z * 1.28; // far ~0.24× (distant dots), near ~1.5×
      const sway = Math.sin(time * it.swayFreq + it.swayPhase) * it.swayAmp * (0.4 + z);
      const bob = Math.cos(time * it.bobFreq + it.bobPhase) * it.bobAmp;
      // Near layers slide a lot under a drag; the far layer barely moves → real parallax depth.
      const px = panX * (0.24 + it.z0 * 0.76);
      const x = it.baseX + px + sway;
      it.el.style.transform =
        `translate(${x.toFixed(1)}px, ${(it.y + bob).toFixed(1)}px) scale(${scale.toFixed(3)})`;
    }
    raf = requestAnimationFrame(frame);
  }

  function build(whispers) {
    world.innerHTML = '';
    const W = window.innerWidth;
    const H = window.innerHeight;

    // World is at least a screen wide, wider when there are many whispers, so
    // the sky never feels crammed and you can drag sideways to explore.
    worldW = Math.max(W, whispers.length * COL_SPACING);
    world.style.width = worldW + 'px';
    world.style.transform = 'none';
    minPan = Math.min(0, W - worldW);
    panX = clampPan(panX);

    const slot = worldW / Math.max(1, whispers.length);

    items = whispers.map((wsp, i) => {
      const text = (wsp.content || '').trim();
      // Combined "warmth": replies plus a lighter weight for passing lights —
      // both make a balloon glow more and light its burner brighter.
      const warmN = Math.min(1, ((wsp.warmth || 0) + (wsp.lights || 0) * 0.6) / WARMTH_CAP);

      // Depth: biased toward the far distance so the field has several tiers —
      // a scatter of tiny dim dots deep in the sky, fewer big bright ones up
      // close — like looking into real distance rather than at a flat plane.
      const z0 = Math.pow(Math.random(), 1.5);

      // Base envelope size (before depth scale). A little variety from length.
      const lenFactor = Math.min(1, text.length / 160);
      const base = 74 + lenFactor * 42; // ~74–116px, then × depth scale

      // Shape variety: mostly round, some taller or wider envelopes.
      const shape = Math.random();
      let w = base;
      let h = base;
      if (shape < 0.32) h = base * (1.1 + Math.random() * 0.16);
      else if (shape < 0.52) w = base * (1.12 + Math.random() * 0.16);

      const el = document.createElement('button');
      el.className = `lantern type-${wsp.type}`;
      el.style.width = w + 'px';
      el.style.height = h + 'px';
      el.style.fontSize = (0.56 + lenFactor * 0.12).toFixed(3) + 'rem';
      el.style.setProperty('--glow', (0.5 + warmN * 1.0).toFixed(2));
      el.style.setProperty('--burn', (0.14 + warmN * 0.7).toFixed(2)); // burner brightens with warmth
      // Depth cues baked once: nearer = more opaque and crisp; farther = dim
      // and softly out of focus. Nearer balloons also stack on top.
      el.style.opacity = (0.34 + z0 * 0.62).toFixed(2);
      el.style.filter = z0 < 0.5 ? `blur(${((0.5 - z0) * 4).toFixed(2)}px)` : '';
      el.style.zIndex = String(Math.round(z0 * 100));
      el.setAttribute('aria-label', wsp.type === 'pain' ? 'a sorrow' : 'a wish');

      const span = document.createElement('span');
      span.className = 'lantern-text';
      span.textContent = text.length > PREVIEW_CHARS ? text.slice(0, PREVIEW_CHARS) + '…' : text;
      el.appendChild(span);

      // A whisper that's been answered hangs a small streamer — "someone
      // stayed for this". None when there are no replies (keeps the sky calm).
      if ((wsp.warmth || 0) >= 1 && typeof ribbonText === 'function') {
        const ribbon = document.createElement('span');
        ribbon.className = 'lantern-ribbon' + ((wsp.warmth || 0) >= 5 ? ' warm' : '');
        ribbon.textContent = ribbonText(wsp.warmth || 0);
        el.appendChild(ribbon);
      }

      // Fire a tap only when the pointer didn't drag the field. Pass the
      // balloon's on-screen rect so the reading text can rise from where it is.
      el.addEventListener('click', () => {
        if (!moved) onTap(wsp.id, el.getBoundingClientRect());
      });
      world.appendChild(el);

      return {
        el,
        w,
        h,
        baseX: i * slot + slot / 2 + rand(-slot * 0.22, slot * 0.22) - w / 2,
        y: rand(-H * 0.05, H * 1.02), // pre-scattered so the sky looks alive on load
        z0,
        zPhase: rand(0, Math.PI * 2),
        zFreq: rand(0.05, 0.16),
        zAmp: rand(0.03, 0.08),
        rise: 0.04 + z0 * 0.5, // near balloons rise faster (parallax)
        swayAmp: rand(5, 15),
        swayFreq: rand(0.08, 0.26),
        swayPhase: rand(0, Math.PI * 2),
        bobAmp: rand(2, 5),
        bobFreq: rand(0.3, 0.8),
        bobPhase: rand(0, Math.PI * 2),
      };
    });
  }

  if (!raf) raf = requestAnimationFrame(frame);

  return {
    setWhispers(whispers) {
      build(whispers);
    },
    get pannable() {
      return worldW > window.innerWidth + 4;
    },
    stop() {
      cancelAnimationFrame(raf);
    },
  };
}
