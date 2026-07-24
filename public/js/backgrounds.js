// Background switcher — looping scenery videos from /video/manifest.json.
// The background is video only (no procedural scene); if there are no
// videos yet, a plain dark gradient (#sky-bg) shows behind the whispers.
// The chosen video and auto-rotate preference are remembered across visits.

const STORAGE_KEY = 'bulesky_bg_index';
const AUTO_KEY = 'bulesky_bg_auto';
const ROTATE_MS = 75000; // switch scenery about every 75s when auto-rotating

export function initBackgrounds({ video, scrim }) {
  let options = []; // videos only
  let index = 0;
  let autoOn = localStorage.getItem(AUTO_KEY) !== '0'; // default on
  let timer = null;

  function stopTimer() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }
  function armTimer() {
    stopTimer();
    if (autoOn && options.length > 1) {
      timer = setInterval(() => apply(index + 1), ROTATE_MS);
    }
  }

  function showDarkFallback() {
    video.pause();
    video.removeAttribute('src');
    video.load();
    video.classList.add('hidden');
    scrim.classList.add('hidden');
    document.body.classList.remove('has-video');
  }

  function apply(i) {
    if (options.length === 0) {
      showDarkFallback();
      return;
    }
    index = ((i % options.length) + options.length) % options.length;
    const opt = options[index];
    video.src = opt.src;
    video.classList.remove('hidden');
    scrim.classList.remove('hidden');
    document.body.classList.add('has-video');
    const p = video.play();
    if (p && p.catch) p.catch(() => {});
    try {
      localStorage.setItem(STORAGE_KEY, String(index));
    } catch {
      /* ignore */
    }
    armTimer();
  }

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
    apply(start);
  })();

  return {
    next() {
      apply(index + 1);
    },
    toggleAuto() {
      autoOn = !autoOn;
      try {
        localStorage.setItem(AUTO_KEY, autoOn ? '1' : '0');
      } catch {
        /* ignore */
      }
      armTimer();
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
