// Put the rendered icons where Xcode and Gradle look for them.
//
// Run after tools/make-icons.mjs and after `npx cap add`, and again any time
// the icon changes. Separate from make-icons because the icons are also the
// website's, and the native projects may not exist on a given machine.
//
//   node tools/make-icons.mjs && node tools/install-app-icons.mjs
import { existsSync, copyFileSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ICONS = 'public/icons';
const IOS = 'app/ios/App/App/Assets.xcassets/AppIcon.appiconset';
const ANDROID = 'app/android/app/src/main/res';

let did = 0;
const say = (s) => { console.log(s); did += 1; };

// ---- iOS ----------------------------------------------------------------
// One 1024×1024 is the whole set on modern Xcode: it derives every other size
// itself. It must be opaque — the App Store rejects an alpha channel — which
// is why make-icons flattens this one and only this one.
if (existsSync(IOS)) {
  copyFileSync(path.join(ICONS, 'icon-1024.png'), path.join(IOS, 'AppIcon-512@2x.png'));
  say(`ios   ${IOS}/AppIcon-512@2x.png`);
} else {
  console.log(`ios   skipped — run \`cd app && npx cap add ios\` first`);
}

// The launch screen. Capacitor ships a white placeholder; on a product whose
// first frame is a night sky, a white flash on every cold start is the most
// visible thing in the app.
const SPLASH = 'app/ios/App/App/Assets.xcassets/Splash.imageset';
if (existsSync(SPLASH)) {
  for (const f of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
    const at = path.join(SPLASH, f);
    if (existsSync(at)) copyFileSync(path.join(ICONS, 'splash.png'), at);
  }
  say(`ios   ${SPLASH}/ (night sky, not white)`);
}

// ---- Android ------------------------------------------------------------
// Adaptive icons: a flat background colour plus a foreground drawn inside the
// safe inner two thirds, because the mask shape differs per device.
if (existsSync(ANDROID)) {
  const buckets = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
  for (const [bucket] of Object.entries(buckets)) {
    const dir = path.join(ANDROID, `mipmap-${bucket}`);
    mkdirSync(dir, { recursive: true });
    copyFileSync(path.join(ICONS, 'icon-512.png'), path.join(dir, 'ic_launcher.png'));
    copyFileSync(path.join(ICONS, 'icon-512.png'), path.join(dir, 'ic_launcher_round.png'));
    copyFileSync(path.join(ICONS, 'adaptive-foreground.png'), path.join(dir, 'ic_launcher_foreground.png'));
  }
  say(`android ${ANDROID}/mipmap-*/ (5 density buckets)`);

  const values = path.join(ANDROID, 'values');
  mkdirSync(values, { recursive: true });
  const bg = readFileSync(path.join(ICONS, 'adaptive-background.txt'), 'utf8').trim();
  writeFileSync(
    path.join(values, 'ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${bg}</color>\n</resources>\n`
  );
  say(`android ${values}/ic_launcher_background.xml (${bg})`);

  for (const dir of ['mipmap-anydpi-v26']) {
    const d = path.join(ANDROID, dir);
    mkdirSync(d, { recursive: true });
    const xml =
      `<?xml version="1.0" encoding="utf-8"?>\n` +
      `<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n` +
      `    <background android:drawable="@color/ic_launcher_background"/>\n` +
      `    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n` +
      `</adaptive-icon>\n`;
    writeFileSync(path.join(d, 'ic_launcher.xml'), xml);
    writeFileSync(path.join(d, 'ic_launcher_round.xml'), xml);
  }
  say(`android ${ANDROID}/mipmap-anydpi-v26/ (adaptive)`);
} else {
  console.log(`android skipped — run \`cd app && npx cap add android\` first`);
}

console.log(did ? `\n${did} destination(s) updated` : '\nnothing to do');
