// Background — a continuous crossfade PLAYLIST of scenery videos from
// /video/manifest.json. Clips play one after another (1 → 2 → 3 → … → loop),
// each once, and dissolve into the next so there is no jarring loop jump.
//
// Two stacked <video> layers alternate: while one is on screen the other
// pre-loads the next clip, then we crossfade opacity between them. The
// background is video only; with no videos yet a plain dark gradient
// (#sky-bg) shows behind the whispers.

const STORAGE_KEY = 'bulesky_bg_index';
const AUTO_KEY = 'bulesky_bg_auto';

export function initBackgrounds({ videoA, videoB, scrim }) {
  const layers = [videoA, videoB];
  let options = []; // videos only
  let index = 0; // index of the clip currently on screen
  let active = 0; // which layer (0/1) is currently visible
  let autoOn = localStorage.getItem(AUTO_KEY) !== '0'; // default on

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

  // Crossfade to clip `i` on the standby layer.
  function playIndex(i) {
    if (options.length === 0) {
      showDarkFallback();
      return;
    }
    index = ((i % options.length) + options.length) % options.length;
    const standby = layers[1 - active];
    const outgoing = layers[active];

    standby.classList.remove('hidden');
    scrim.classList.remove('hidden');
    document.body.classList.add('has-video');

    standby.src = options[index].src;
    standby.load();

    let revealed = false;
    const reveal = () => {
      if (revealed) return;
      revealed = true;
      standby.play().catch(() => {});
      standby.classList.add('bg-show');
      outgoing.classList.remove('bg-show');
      active = 1 - active;
      updateLoop();
      persist();
      // Free the now-hidden layer once the fade has finished.
      setTimeout(() => {
        if (layers[active] !== outgoing) outgoing.pause();
      }, 1100);
    };

    standby.addEventListener(
      'loadeddata',
      () => {
        standby.play().catch(() => {});
        reveal();
      },
      { once: true }
    );
    // Never get stuck if the media events are flaky.
    setTimeout(reveal, 1500);
  }

  function advance() {
    if (autoOn && options.length > 1) playIndex(index + 1);
  }

  // Advancing happens when the visible clip ends. Both layers carry the
  // listener; only the on-screen one is ever actually playing to completion.
  layers.forEach((l) => {
    l.addEventListener('ended', () => {
      if (l === layers[active]) advance();
    });
    // If a clip errors out, skip ahead so the sky never freezes on black.
    l.addEventListener('error', () => {
      if (l === layers[active] && options.length > 1) playIndex(index + 1);
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
    playIndex(start);
  })();

  return {
    next() {
      playIndex(index + 1);
    },
    toggleAuto() {
      autoOn = !autoOn;
      try {
        localStorage.setItem(AUTO_KEY, autoOn ? '1' : '0');
      } catch {
        /* ignore */
      }
      updateLoop();
      // Turning auto back on should resume the playlist promptly.
      if (autoOn && options.length > 1) {
        const cur = layers[active];
        if (cur.ended || cur.paused) advance();
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
