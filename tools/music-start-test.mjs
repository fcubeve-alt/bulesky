// Tapping the music button must make a sound immediately.
//
// The library runs from 1.3MB to 18.5MB and nothing can be heard from a file
// until enough of it has arrived, so on a phone the button used to be followed
// by several seconds of silence — the reported "点了半天没反应，有时快有时慢".
// The variance was the giveaway: it was the download, not the code.
//
// So the synth pad (Web Audio, no network at all) answers the tap, and the real
// track takes over from underneath it when it is genuinely playing. This checks
// both halves against a deliberately stalled file.
//
//   npm i -D playwright && python3 -m http.server 8788 --directory public
//   node tools/music-start-test.mjs
import { chromium } from 'playwright';
import { existsSync, readdirSync } from 'node:fs';

const BASE = process.env.SITE || 'http://127.0.0.1:8788';

function browserPath() {
  if (process.env.PW_CHROMIUM) return process.env.PW_CHROMIUM;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !existsSync(root)) return undefined;
  const dir = readdirSync(root).find((d) => /^chromium-\d+$/.test(d));
  return dir ? `${root}/${dir}/chrome-linux/chrome` : undefined;
}

let failures = 0;
function check(ok, label) {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
}

const browser = await chromium.launch({
  executablePath: browserPath(),
  // Autoplay policy off: this is about our own timing, not Chrome's gesture
  // gate, and the tap in the test IS a gesture anyway.
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 390, height: 780 } });

// The moment any oscillator starts is the moment the sky makes a sound.
await page.addInitScript(() => {
  window.__firstSound = null;
  const wrap = (Ctor) => {
    const orig = Ctor.prototype.createOscillator;
    Ctor.prototype.createOscillator = function (...a) {
      if (window.__firstSound === null) window.__firstSound = performance.now();
      return orig.apply(this, a);
    };
  };
  if (window.AudioContext) wrap(window.AudioContext);
  if (window.webkitAudioContext) wrap(window.webkitAudioContext);
});

await page.route('**/api/**', (r) => r.fulfill({ json: {} }));
await page.route('**/api/bubbles**', (r) => r.fulfill({ json: { bubbles: [] } }));
await page.route('**/music/manifest.json', (r) =>
  r.fulfill({
    json: {
      tracks: [
        { src: '/music/slow.mp3', title: 'Slow One', bytes: 2_000_000 },
        { src: '/music/slow2.mp3', title: 'Slow Two', bytes: 2_100_000 },
        { src: '/music/big.mp3', title: 'Big One', bytes: 18_000_000 },
        { src: '/music/big2.mp3', title: 'Big Two', bytes: 17_000_000 },
      ],
    },
  })
);

// A track that takes three seconds to arrive — an ordinary phone on an
// ordinary connection.
const TRACK_DELAY = 3000;
const served = [];
await page.route('**/music/*.mp3', async (r) => {
  await new Promise((res) => setTimeout(res, TRACK_DELAY));
  served.push(r.request().url().split('/').pop());
  // A real, tiny, decodable file so 'playing' actually fires.
  r.fulfill({
    status: 200,
    headers: { 'content-type': 'audio/wav' },
    body: silentWav(),
  });
});

function silentWav(seconds = 4, rate = 8000) {
  const n = seconds * rate;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  return buf;
}

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.locator('#notice-modal').waitFor({ state: 'visible', timeout: 4000 }).catch(() => {});
// Music starts on the first touch anywhere, not on the music button — see
// armMusicAutostart. That first touch is what is being timed, because it is
// what a visitor actually experiences: they tap, and either the sky answers or
// it sits there silently for several seconds.
await page.waitForTimeout(1200); // manifest already loaded: the worst case
await page.evaluate(() => { window.__tapped = performance.now(); });
await page.click('#notice-ok');
await page.locator('#notice-modal').waitFor({ state: 'hidden', timeout: 4000 }).catch(() => {});
await page.waitForFunction(() => window.__firstSound !== null, { timeout: 5000 }).catch(() => {});
const gap = await page.evaluate(() =>
  window.__firstSound === null ? null : window.__firstSound - window.__tapped
);
check(
  gap !== null && gap < 300,
  `sound starts on the tap, not on the download (${gap === null ? 'never' : Math.round(gap) + 'ms'}, file takes ${TRACK_DELAY}ms)`
);

// …and the real track takes over once it finally arrives.
const handedOver = await page
  .waitForSelector('#now-playing:not(.hidden)', { timeout: TRACK_DELAY + 4000 })
  .then(() => true)
  .catch(() => false);
const title = (await page.locator('#now-playing').textContent()) || '';
check(handedOver, `the track takes over when it arrives (${title.trim() || 'nothing playing'})`);
// The opening track comes from the lighter half of the library, so the wait
// the synth is covering is as short as it can be.
check(
  served.length > 0 && /^slow/.test(served[0]),
  `the opening track is one of the light ones (${served[0] || 'none'})`
);

await browser.close();
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
