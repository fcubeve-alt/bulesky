// Background — a continuous crossfade PLAYLIST of scenery videos from
// /video/manifest.json. Clips play one after another (1 → 2 → 3 → … → loop),
// each once, and dissolve into the next so there is no jarring loop jump.
//
// Two stacked <video> layers alternate. While one is on screen the other
// PRE-BUFFERS the next clip (loads it, ready to play), so when we crossfade
// the incoming clip is already moving — no still-frame-then-video stutter.
// The background is video only; with no videos yet a plain dark gradient
// (#sky-bg) shows behind the whispers.

const STORAGE_KEY = 'bulesky_bg_index';
const AUTO_KEY = 'bulesky_bg_auto';

export function initBackgrounds({ videoA, videoB, scrim }) {
  const layers = [videoA, videoB];
  let options = []; // videos only
  let index = 0; // index of the clip currently on screen
  let active = 0; // which layer (0/1) is currently visible
  let autoOn = localStorage.getItem(AUTO_KEY) !== '0'; // default on
  let switching = false;

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, String(index));
    } catch {
      /* ignore */
    }
  }

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
  function prepareNext() {
    if (options.length < 2) return;
    const nextIdx = (index + 1) % options.length;
    const standby = layers[1 - active];
    if (standby.dataset.idx === String(nextIdx) && standby.readyState >= 3) return;
    standby.dataset.idx = String(nextIdx);
    standby.src = options[nextIdx].src;
    standby.classList.remove('hidden');
    standby.load();
  }

  // Reveal the standby layer (already prepared) and retire the outgoing one.
  function advance() {
    if (switching) return;
    if (!(autoOn && options.length > 1)) return;
    switching = true;
    const standby = layers[1 - active];
    const outgoing = layers[active];

    const go = () => {
      standby.play().catch(() => {});
      standby.classList.add('bg-show');
      outgoing.classList.remove('bg-show');
      active = 1 - active;
      index = parseInt(standby.dataset.idx, 10);
      if (!Number.isFinite(index)) index = 0;
      updateLoop();
      persist();
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
    persist();
    prepareNext();
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
          options = data.videos.filter((v) => v && v.src);
        }
      }
    } catch {
      /* no manifest → dark fallback */
    }

    if (options.length === 0) {
      showDarkFallback();
      return;
    }
    let start = 0;
    const saved = parseInt(localStorage.getItem(STORAGE_KEY) || '', 10);
    if (Number.isFinite(saved) && saved >= 0 && saved < options.length) start = saved;
    playFirst(start);
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
