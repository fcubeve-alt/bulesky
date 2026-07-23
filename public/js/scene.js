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
    col.addColorStop(0, 'rgba(255,244,220,0.16)');
    col.addColorStop(1, 'rgba(255,244,220,0)');
    ctx.fillStyle = col;
    const cw = moon.r * 1.4;
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

// ---- Lantern field: the whispers, as drifting glowing lights ----

const WARMTH_CAP = 12;

// Each whisper becomes a lantern that slowly rises from the lake and sways,
// wrapping back down when it drifts off the top. Only `transform` and
// `opacity` change per frame. Returns a controller with setWhispers().
export function createLanternField(container, { onTap }) {
  let items = [];
  let raf = null;

  function frame(t) {
    const time = t * 0.001;
    const H = window.innerHeight;
    for (const it of items) {
      it.y -= it.rise; // rise upward
      if (it.y < -80) it.y = H + rand(20, 120); // wrap back below the waterline
      const sway = Math.sin(time * it.swayFreq + it.swayPhase) * it.swayAmp;
      const bob = Math.cos(time * it.bobFreq + it.bobPhase) * it.bobAmp;
      it.el.style.transform = `translate(${(it.x + sway).toFixed(1)}px, ${(it.y + bob).toFixed(1)}px)`;
    }
    raf = requestAnimationFrame(frame);
  }

  function build(whispers) {
    container.innerHTML = '';
    const W = window.innerWidth;
    const H = window.innerHeight;
    const horizon = H * HORIZON;
    items = whispers.map((wsp, i) => {
      const warmth = Math.min(1, (wsp.warmth || 0) / WARMTH_CAP);
      const size = 24 + warmth * 18 + rand(-3, 5);

      const el = document.createElement('button');
      el.className = `lantern type-${wsp.type}`;
      el.style.width = size + 'px';
      el.style.height = size * 1.18 + 'px';
      el.style.setProperty('--glow', (0.5 + warmth * 0.5).toFixed(2));
      el.setAttribute('aria-label', wsp.type === 'pain' ? 'a sorrow' : 'a wish');
      el.addEventListener('click', () => onTap(wsp.id));
      container.appendChild(el);

      // Spread across width and depth; start scattered through sky + lake.
      return {
        el,
        x: (i / Math.max(1, whispers.length)) * W + rand(-W * 0.06, W * 0.06),
        y: rand(horizon - H * 0.15, H + 40),
        rise: rand(0.12, 0.42),
        swayAmp: rand(6, 20),
        swayFreq: rand(0.1, 0.3),
        swayPhase: rand(0, Math.PI * 2),
        bobAmp: rand(2, 6),
        bobFreq: rand(0.4, 0.9),
        bobPhase: rand(0, Math.PI * 2),
      };
    });
  }

  if (!raf) raf = requestAnimationFrame(frame);

  return {
    setWhispers(whispers) {
      build(whispers);
    },
    stop() {
      cancelAnimationFrame(raf);
    },
  };
}
