// Background switcher. Options are:
//   0. the procedural night-lake scene (always available fallback)
//   1..N. looping scenery videos listed in /video/manifest.json
//
// You add your own license-cleared scenery videos (see public/video/
// README.md) and the switcher cycles through them. The chosen background
// is remembered across visits.

const STORAGE_KEY = 'bulesky_bg_index';

export function initBackgrounds({ video, scrim, proceduralTitle }) {
  // options[0] is always the procedural scene (src === null).
  let options = [{ title: proceduralTitle, src: null }];
  let index = 0;

  function apply(i) {
    index = ((i % options.length) + options.length) % options.length;
    const opt = options[index];
    if (opt.src) {
      video.src = opt.src;
      video.classList.remove('hidden');
      scrim.classList.remove('hidden');
      document.body.classList.add('has-video');
      const p = video.play();
      if (p && p.catch) p.catch(() => {});
    } else {
      video.pause();
      video.removeAttribute('src');
      video.load();
      video.classList.add('hidden');
      scrim.classList.add('hidden');
      document.body.classList.remove('has-video');
    }
    try {
      localStorage.setItem(STORAGE_KEY, String(index));
    } catch {
      /* ignore */
    }
  }

  // Load the video manifest, then restore the saved choice (default to the
  // first video if any exist, so the app opens on real scenery when present).
  (async () => {
    try {
      const res = await fetch('/video/manifest.json', { cache: 'no-cache' });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.videos)) {
          options = options.concat(data.videos.filter((v) => v && v.src));
        }
      }
    } catch {
      /* no manifest → procedural only */
    }

    let start = 0;
    const saved = parseInt(localStorage.getItem(STORAGE_KEY) || '', 10);
    if (Number.isFinite(saved) && saved >= 0 && saved < options.length) start = saved;
    else if (options.length > 1) start = 1; // prefer real scenery when available
    apply(start);
  })();

  return {
    next() {
      apply(index + 1);
    },
    get currentTitle() {
      return options[index] ? options[index].title : proceduralTitle;
    },
    get count() {
      return options.length;
    },
    get hasVideos() {
      return options.length > 1;
    },
  };
}
