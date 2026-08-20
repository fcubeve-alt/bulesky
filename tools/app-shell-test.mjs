// The same front end, pretending to be inside the App.
//
// In the shell the pages are files on the phone, so `/api/...` resolves to the
// bundle and finds nothing — the whole App is dead if the base URL is wrong,
// and that failure cannot be seen by opening the website. So this serves
// app/www (the bundle as it actually ships), tells the page it is native, and
// checks what it asks for.
//
//   npm i -D playwright
//   cd app && node sync-www.mjs
//   python3 -m http.server 8790 --directory app/www
//   node tools/app-shell-test.mjs
import { chromium } from 'playwright';
import { existsSync, readdirSync } from 'node:fs';

const BASE = process.env.APP_SITE || 'http://127.0.0.1:8790';
const SITE = 'https://cubewithin.com';

function browserPath() {
  if (process.env.PW_CHROMIUM) return process.env.PW_CHROMIUM;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !existsSync(root)) return undefined;
  const dir = readdirSync(root).find((d) => /^chromium-\d+$/.test(d));
  return dir ? `${root}/${dir}/chrome-linux/chrome` : undefined;
}

const W = {
  id: 1,
  type: 'pain',
  content: '我还是会偷偷跟你说话。',
  code: 'tester',
  lights: 0,
  created_at: Date.now(),
};

const browser = await chromium.launch({ executablePath: browserPath() });
const page = await browser.newPage();
const asked = [];
const results = [];

// Capacitor announces itself before any of our code runs. Haptics is recorded
// rather than felt.
await page.addInitScript(() => {
  window.__tapped = [];
  window.Capacitor = {
    isNativePlatform: () => true,
    Plugins: {
      Haptics: { impact: async (o) => { window.__tapped.push(o.style); } },
      StatusBar: { setStyle: async () => {}, setOverlaysWebView: async () => {}, setBackgroundColor: async () => {} },
      App: { addListener: () => {} },
    },
  };
});

// Everything the page asks the SITE for, answered here. Anything it asks the
// bundle for would 404 — which is exactly the bug this file exists to catch.
await page.route(`${SITE}/**`, (route) => {
  const url = route.request().url();
  asked.push(url);
  if (/\/api\/bubbles\/\d+$/.test(url)) {
    return route.fulfill({ json: { bubble: { ...W, mine: true, saved: false }, replies: [] } });
  }
  if (/\/api\/bubbles/.test(url)) return route.fulfill({ json: { bubbles: [W] } });
  if (/manifest\.json/.test(url)) return route.fulfill({ json: {} });
  return route.fulfill({ json: {} });
});

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.locator('#notice-modal').waitFor({ state: 'visible', timeout: 4000 }).catch(() => {});
const ok = page.locator('#notice-ok');
if (await ok.isVisible().catch(() => false)) await ok.click();
await page.locator('#notice-modal').waitFor({ state: 'hidden', timeout: 4000 }).catch(() => {});
await page.waitForTimeout(800);

const apiCalls = asked.filter((u) => u.includes('/api/'));
results.push(apiCalls.length > 0);
console.log(`${apiCalls.length ? 'PASS' : 'FAIL'}  the App asks the site for the API, not its own bundle (${apiCalls[0] || 'nothing'})`);

const mediaCalls = asked.filter((u) => /manifest\.json/.test(u));
results.push(mediaCalls.length > 0);
console.log(`${mediaCalls.length ? 'PASS' : 'FAIL'}  media manifests come from the site too (${mediaCalls.length} asked)`);

// The bundle must not carry the videos, the music, the admin page or a second
// service worker — see app/sync-www.mjs for why each one is left behind.
const missing = [];
for (const path of ['/video/manifest.json', '/music/manifest.json', '/admin.html', '/sw.js']) {
  const res = await page.request.get(BASE + path).catch(() => null);
  if (!res || res.status() === 404) missing.push(path);
}
results.push(missing.length === 4);
console.log(`${missing.length === 4 ? 'PASS' : 'FAIL'}  the bundle leaves out media, admin and the service worker (${missing.length}/4)`);

// Writing a whisper should feel like something.
await page.click('#entry-pain');
await page.fill('#compose-content', '第一次写点什么');
await page.fill('#compose-code', '夜里的猫');
await page.waitForTimeout(900);
await page.click('#compose-submit');
await page.waitForSelector('#confirm-sheet:not(.hidden)', { timeout: 5000 }).catch(() => {});
const tapped = await page.evaluate(() => window.__tapped);
results.push(tapped.length > 0);
console.log(`${tapped.length ? 'PASS' : 'FAIL'}  sending a whisper taps the phone (${JSON.stringify(tapped)})`);

// And the publish must have gone to the site, carrying the secret.
const published = asked.find((u) => u.endsWith('/api/bubbles'));
results.push(Boolean(published));
console.log(`${published ? 'PASS' : 'FAIL'}  the whisper was published to the site (${published || 'nowhere'})`);

await browser.close();
const passed = results.every(Boolean);
console.log(passed ? '\nall passed' : '\nSOMETHING FAILED');
process.exit(passed ? 0 : 1);
