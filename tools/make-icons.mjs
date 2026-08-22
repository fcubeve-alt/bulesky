// One drawing in, every icon the stores want out.
//
// public/icons/icon.svg is the master. Nothing else is hand-drawn, so changing
// the icon is changing one file — the alternative is five PNGs that drift apart
// and a home screen that does not match the App Store listing.
//
// Rendered with the Chromium that is already here rather than an image library,
// because the master uses gradients and strokes that a rasteriser has to get
// exactly right, and this is the same engine that draws the site.
//
// WHAT THE STORES ACTUALLY REQUIRE, and why each rule is here:
//
//   iOS 1024×1024   No alpha channel and no rounded corners. iOS masks the
//                   icon itself; a radius baked in comes out as a dark ring,
//                   and an alpha channel is rejected at upload. Flattened onto
//                   opaque black below for exactly this reason.
//   Android 512×512 The Play listing icon, 32-bit PNG, alpha allowed.
//   Android adaptive The foreground is masked to shapes that vary by device,
//                   and only the inner ~66% is guaranteed visible. So the
//                   adaptive foreground is the SAME drawing scaled to two
//                   thirds on a transparent field — the balloon survives a
//                   circle mask, a squircle and a teardrop alike.
//   Web manifest    192 and 512, plus 180 for apple-touch-icon.
//
//   npm i -D playwright && node tools/make-icons.mjs
import { chromium } from 'playwright';
import { existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SRC = 'public/icons/icon.svg';
const OUT = 'public/icons';

function browserPath() {
  if (process.env.PW_CHROMIUM) return process.env.PW_CHROMIUM;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !existsSync(root)) return undefined;
  const dir = readdirSync(root).find((d) => /^chromium-\d+$/.test(d));
  return dir ? `${root}/${dir}/chrome-linux/chrome` : undefined;
}

const svg = readFileSync(SRC, 'utf8');

// `scale` shrinks the drawing inside its square, for the Android adaptive
// foreground; `opaque` flattens onto black, for the App Store icon.
function page(size, { scale = 1, opaque = false } = {}) {
  const inset = ((1 - scale) / 2) * 100;
  return `<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;padding:0;width:${size}px;height:${size}px;overflow:hidden;
    background:${opaque ? '#05060f' : 'transparent'};}
  .wrap{position:absolute;inset:${inset}%;}
  svg{display:block;width:100%;height:100%;}
</style>
<div class="wrap">${svg}</div>`;
}

const TARGETS = [
  // [file, size, options, why]
  ['icon-1024.png', 1024, { opaque: true }, 'App Store — no alpha, no radius'],
  ['icon-512.png', 512, {}, 'Play listing / web manifest'],
  ['icon-192.png', 192, {}, 'web manifest'],
  ['apple-touch-icon.png', 180, { opaque: true }, 'Add to Home Screen on iOS'],
  ['adaptive-foreground.png', 432, { scale: 0.66 }, 'Android adaptive — inner two thirds'],
  // The launch screen. Capacitor ships a white placeholder, and on a product
  // whose first frame is a night sky a white flash is the most visible thing
  // in the app. Square 2732 because it is centre-cropped to every device.
  ['splash.png', 2732, { scale: 0.34, opaque: true }, 'launch screen'],
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
