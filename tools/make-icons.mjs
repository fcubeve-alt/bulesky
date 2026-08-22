// One picture in, every icon the stores want out.
//
// public/icons/icon-source.png is the master — the owner's artwork. Nothing
// else is edited by hand, so changing the icon is replacing one file.
//
// THE MASTER IS A CIRCLE ON A SQUARE, and an app icon may not be. Apple wants
// a full-bleed opaque square with no transparency and no baked-in corner
// radius (it applies its own mask, so a radius shows up as a dark ring on the
// home screen). Leaving the corners as they came would put four pale wedges
// around a night sky. So the artwork is scaled past the edges until it fills
// the frame itself: the corners are filled with more sky rather than with a
// guessed colour, and nothing that matters is cropped because the balloon sits
// in the middle.
//
// Rendered with the Chromium that is already here rather than an image library
// — same engine that draws the site, and no new dependency for a job it can
// already do.
//
// WHAT THE STORES ACTUALLY REQUIRE, and why each rule is here:
//
//   iOS 1024×1024   No alpha channel and no rounded corners. iOS masks the
//                   icon itself; a radius baked in comes out as a dark ring,
//                   and an alpha channel is rejected at upload. Flattened onto
//                   opaque black below for exactly this reason.
//   Android 512×512 The Play listing icon, 32-bit PNG, alpha allowed.
//   Android adaptive The foreground is masked to shapes that vary by device,
//                   and only the inner ~66% is guaranteed visible. So it does
//                   NOT bleed: the circle stays at its natural inscribed size,
//                   where every mask shape can only trim sky, and the balloon
//                   sits well inside the safe zone.
//   Web manifest    192 and 512, plus 180 for apple-touch-icon.
//
//   npm i -D playwright && node tools/make-icons.mjs
import { chromium } from 'playwright';
import { existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SRC = 'public/icons/icon-source.png';
const OUT = 'public/icons';

function browserPath() {
  if (process.env.PW_CHROMIUM) return process.env.PW_CHROMIUM;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !existsSync(root)) return undefined;
  const dir = readdirSync(root).find((d) => /^chromium-\d+$/.test(d));
  return dir ? `${root}/${dir}/chrome-linux/chrome` : undefined;
}

const master = readFileSync(SRC).toString('base64');

// How far past the square the circle has to reach before its corners are gone.
// A circle inscribed in a square needs √2 to cover it; a little more than that
// hides the soft edge of the drawing too.
const BLEED = 1.46;

// `zoom` is literal: BLEED fills the square with artwork, 1 leaves the circle
// at its natural inscribed size. `opaque` puts a floor under it for the formats
// that forbid alpha.
function page(size, { zoom = BLEED, opaque = false } = {}) {
  return `<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;padding:0;width:${size}px;height:${size}px;overflow:hidden;
    background:${opaque ? '#0b1030' : 'transparent'};}
  img{position:absolute;left:50%;top:50%;width:${size}px;height:${size}px;
    transform:translate(-50%,-50%) scale(${zoom.toFixed(3)});}
</style>
<img src="data:image/png;base64,${master}">`;
}

const TARGETS = [
  // [file, size, options, why]
  ['icon-1024.png', 1024, { opaque: true }, 'App Store — no alpha, no radius'],
  ['icon-512.png', 512, {}, 'Play listing / web manifest'],
  ['icon-192.png', 192, {}, 'web manifest'],
  ['apple-touch-icon.png', 180, { opaque: true }, 'Add to Home Screen on iOS'],
  // NOT bleeding: the adaptive mask crops the outer third and its shape differs
  // per device, so the circle stays at its natural size where the mask can only
  // ever trim sky. The balloon sits well inside the safe zone.
  ['adaptive-foreground.png', 432, { zoom: 1 }, 'Android adaptive — inside the safe zone'],
  // The launch screen. Capacitor ships a white placeholder, and on a product
  // whose first frame is a night sky a white flash is the most visible thing
  // in the app. Square 2732 because it is centre-cropped to every device.
  ['splash.png', 2732, { zoom: 0.62, opaque: true }, 'launch screen'],
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: browserPath() });
for (const [name, size, opts, why] of TARGETS) {
  const p = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await p.setContent(page(size, opts), { waitUntil: 'load' });
  const buf = await p.screenshot({ omitBackground: !opts.opaque, type: 'png' });
  writeFileSync(path.join(OUT, name), buf);
  // The App Store rejects an icon that carries an alpha channel at all, so it
  // is worth saying out loud which files have one.
  const hasAlpha = buf[25] === 6; // PNG IHDR colour type 6 = truecolour+alpha
  console.log(
    `${name.padEnd(24)} ${String(size).padStart(4)}px  ${(buf.length / 1024).toFixed(0).padStart(4)}KB  ` +
      `${hasAlpha ? 'alpha' : 'opaque'}  — ${why}`
  );
  await p.close();
}
await browser.close();

// The Android adaptive background is a flat colour, not an image: the
// foreground above is the whole picture, and a gradient behind a mask that
// crops differently on every device only ever looks like a mistake.
writeFileSync(path.join(OUT, 'adaptive-background.txt'), '#05060f\n');
console.log('\nadaptive background colour: #05060f (app/android res, ic_launcher_background)');
