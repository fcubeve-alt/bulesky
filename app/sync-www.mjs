// Copy the website's front end into the shell, minus what the App must not ship.
//
// The App and the website run the SAME files — that is the whole reason for
// choosing Capacitor over a rewrite, and it stops being true the moment anyone
// maintains a second copy of them. So this copies rather than forks, and it is
// run before every build.
//
// Three things are left behind on purpose:
//
//   the videos and music   tens of megabytes, and they stream from the site
//                          anyway (see config.js) — bundling them would put a
//                          25MB download in front of a first launch for files
//                          the App will not use
//   admin.html             moderation is a desktop job on the website, and an
//                          admin page inside a store-reviewed App invites
//                          questions nobody wants to answer
//   sw.js                  the files are already local; a second cache in
//                          front of them can only serve something stale
import { cp, rm, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const SITE = new URL('../public/', import.meta.url);
const WWW = new URL('./www/', import.meta.url);

const SKIP = new Set(['video', 'music', 'admin.html', 'sw.js']);

// Store and native artwork, by exact path. These live in public/icons because
// that is where the icon is drawn and generated (tools/make-icons.mjs), but the
// App has no use for them: the 1024 goes to App Store Connect, the splash and
// the adaptive foreground are copied into the native projects themselves. A
// megabyte of pictures the app never loads would triple a bundle that is
// deliberately about a third of a megabyte.
const SKIP_FILES = new Set([
  'icons/icon-source.png',
  'icons/icon-1024.png',
  'icons/splash.png',
  'icons/adaptive-foreground.png',
  'icons/adaptive-background.txt',
]);

if (existsSync(WWW)) await rm(WWW, { recursive: true });
await mkdir(WWW, { recursive: true });

await cp(SITE, WWW, {
  recursive: true,
  filter: (src) => {
    const rel = src.replace(SITE.pathname, '');
    return !SKIP.has(rel.split('/')[0]) && !SKIP_FILES.has(rel);
  },
});

console.log('www/ rebuilt from public/, without', [...SKIP, ...SKIP_FILES].join(', '));
