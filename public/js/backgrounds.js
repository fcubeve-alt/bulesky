// Background — a continuous crossfade PLAYLIST of scenery videos from
// /video/manifest.json. Clips play one after another (1 → 2 → 3 → … → loop),
// each once, and dissolve into the next so there is no jarring loop jump.
//
// Two stacked <video> layers alternate. While one is on screen the other
// PRE-BUFFERS the next clip (loads it, ready to play), so when we crossfade
// the incoming clip is already moving — no still-frame-then-video stutter.
// The background is video only; with no videos yet a plain dark gradient
// (#sky-bg) shows behind the whispers.

const AUTO_KEY = 'bulesky_bg_auto';
// Longest a single clip stays on screen before dissolving to the next. Stock
// scenery clips run 30–60s, and waiting out every one of them meant a five
// minute visit showed five backgrounds out of forty — the library looked tiny
// because you never reached it.
const MAX_DWELL_MS = 34000;

export function initBackgrounds({ videoA, videoB, scrim }) {
  const layers = [videoA, videoB];
  let options = []; // videos only
  let index = 0; // index of the clip currently on screen
  let active = 0; // which layer (0/1) is currently visible
  let autoOn = localStorage.getItem(AUTO_KEY) !== '0'; // default on
  let switching = false;

  // When we're not advancing (auto off, or only one clip) the visible clip
  // should loop itself; when advancing, it must fire 'ended' so we can move on.
  function updateLoop() {
    const shouldLoop = !(autoOn && options.length > 1);
    layers.forEach((l) => (l.loop = shouldLoop));
  }

  function showDarkFallback() {
    layers.forEach((l) => {
      l.pause();
      l.removeAttribute('src');
      l.load();
      l.classList.add('hidden');
      l.classList.remove('bg-show');
    });
    scrim.classList.add('hidden');
    document.body.classList.remove('has-video');
  }

  // Load the *next* clip into the standby layer ahead of time so it is
  // buffered and ready to play before we ever crossfade to it.
  //
  // preload is flipped to 'auto' only here. The markup ships preload="none" so
  // that opening the site does not start swallowing a second video while the
  // first one is still fighting for bandwidth — buffering ahead is worth doing,
  // but never during the first paint.
  function prepareNext() {
    if (options.length < 2) return;
    const nextIdx = (index + 1) % options.length;
    const standby = layers[1 - active];
    if (standby.dataset.idx === String(nextIdx) && standby.readyState >= 3) return;
    standby.dataset.idx = String(nextIdx);
    standby.preload = 'auto';
    standby.src = options[nextIdx].src;
    standby.classList.remove('hidden');
    standby.load();
  }

  // Hold the pre-buffer back until the visible clip is actually moving, so the
  // opening seconds of a visit are spent on one video instead of two.
  let prepareTimer = 0;
  function prepareNextSoon(delay) {
    clearTimeout(prepareTimer);
    prepareTimer = setTimeout(prepareNext, delay);
  }

  // Move on after MAX_DWELL_MS even if the clip is longer than that, so a
  // session walks through the library instead of sitting on three long clips.
  let dwellTimer = 0;
  function armDwell() {
    clearTimeout(dwellTimer);
    if (!(autoOn && options.length > 1)) return;
    dwellTimer = setTimeout(() => advance(), MAX_DWELL_MS);
  }

  // Reveal the standby layer (already prepared) and retire the outgoing one.
  function advance() {
    if (switching) return;
    if (!(autoOn && options.length > 1)) return;
    switching = true;
    const standby = layers[1 - active];
    const outgoing = layers[active];

    // The pre-buffer is now held back for the opening seconds of a visit, so a
    // clip that fails early can call us before the standby has any source at
    // all. Crossfading to it would leave the sky black. Load it now instead.
    clearTimeout(prepareTimer);
    if (!standby.getAttribute('src')) prepareNext();

    const go = () => {
      standby.play().catch(() => {});
      standby.classList.add('bg-show');
      outgoing.classList.remove('bg-show');
      active = 1 - active;
      index = parseInt(standby.dataset.idx, 10);
      if (!Number.isFinite(index)) index = 0;
      updateLoop();
      armDwell();
      switching = false;
      // Retire the old layer once the fade has finished, then buffer the next.
      setTimeout(() => {
        if (layers[active] !== outgoing) outgoing.pause();
        prepareNext();
      }, 1300);
    };

    // Only cross-fade once the incoming clip can actually play through, so the
    // viewer never sees a frozen first frame. Fall back on a short timer.
    if (standby.readyState >= 3) {
      go();
    } else {
      let done = false;
      const once = () => {
        if (done) return;
        done = true;
        standby.removeEventListener('canplay', once);
        go();
      };
      standby.addEventListener('canplay', once, { once: true });
      setTimeout(once, 1500);
    }
  }

  // First clip on load — show it directly on the active layer.
  function playFirst(i) {
    if (options.length === 0) {
      showDarkFallback();
      return;
    }
    index = ((i % options.length) + options.length) % options.length;
    const cur = layers[active];
    cur.dataset.idx = String(index);
    cur.src = options[index].src;
    cur.classList.remove('hidden');
    scrim.classList.remove('hidden');
    document.body.classList.add('has-video');
    cur.classList.add('bg-show');
    const p = cur.play();
    if (p && p.catch) p.catch(() => {});
    updateLoop();
    armDwell();
    // Wait for this clip to be genuinely playing before touching the next one.
    // The timer is the floor, not the trigger: on a slow phone 'playing' is the
    // thing worth waiting for, and the timeout only covers the case where it
    // never fires at all.
    cur.addEventListener('playing', () => prepareNextSoon(5000), { once: true });
    prepareNextSoon(12000);
  }

  // Advancing happens when the visible clip ends. Both layers carry the
  // listener; only the on-screen one is ever actually playing to completion.
  layers.forEach((l) => {
    l.addEventListener('ended', () => {
      if (l === layers[active]) advance();
    });
    // If a clip errors out, skip ahead so the sky never freezes on black.
    l.addEventListener('error', () => {
      if (l === layers[active] && options.length > 1) advance();
    });
  });

  (async () => {
    try {
      const res = await fetch('/video/manifest.json', { cache: 'no-cache' });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.videos)) {
          // Shuffle per session. The playlist used to run in manifest order
          // from wherever you left off last time, so every visit replayed the
          // same few neighbours and the other forty clips were effectively
          // invisible. Same idea as the per-viewer balloon deck: a different
          // order for every visit is what makes the library feel like a
          // library.
          options = data.videos.filter((v) => v && v.src);
          for (let i = options.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [options[i], options[j]] = [options[j], options[i]];
          }
        }
      }
    } catch {
      /* no manifest → dark fallback */
    }

    if (options.length === 0) {
      showDarkFallback();
      return;
    }
    playFirst(Math.floor(Math.random() * options.length));
  })();

  return {
    next() {
      // Manual skip: prepare the next clip then crossfade to it.
      if (options.length < 2) return;
      prepareNext();
      advance();
    },
    toggleAuto() {
      autoOn = !autoOn;
      try {
        localStorage.setItem(AUTO_KEY, autoOn ? '1' : '0');
      } catch {
        /* ignore */
      }
      updateLoop();
      armDwell();
      if (autoOn && options.length > 1) {
        const cur = layers[active];
        if (cur.ended || cur.paused) advance();
        else prepareNext();
      }
      return autoOn;
    },
    get autoOn() {
      return autoOn;
    },
    get currentTitle() {
      return options.length && options[index] ? options[index].title : '—';
    },
    get count() {
      return options.length;
    },
    get hasVideos() {
      return options.length > 0;
    },
  };
}
