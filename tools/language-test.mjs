// The interface follows the phone. What people write never does.
//
// These are two different things and confusing them would be the worst possible
// bug here: translating someone's grief into a language they did not choose,
// or showing a Chinese speaker an English button to write Chinese into. So this
// opens the same sky on five phones set to five languages and checks both
// halves — the chrome moves, the whisper does not.
//
//   npm i -D playwright && python3 -m http.server 8788 --directory public
//   node tools/language-test.mjs
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

// One whisper, written in Chinese. Everyone sees these exact characters.
const WORDS = '今天很难，但我还是想说说话。';
const W = { id: 1, type: 'pain', content: WORDS, code: 'tester', lights: 0, warmth: 0, created_at: Date.now() };

// Phone language → what the "share a sorrow" button must say on it.
const PHONES = [
  ['zh-CN', 'zh', '说说心事'],
  ['en-GB', 'en', 'Share a sorrow'],
  ['es-ES', 'es', 'Necesito contarlo'],
  ['fr-FR', 'fr', 'J\'ai besoin d\'en parler'],
  ['ar-EG', 'ar', 'أريد أن أتحدث'],
  // A language the site does not speak falls back to English rather than
  // showing key names or an empty screen.
  ['ja-JP', 'en', 'Share a sorrow'],
];

const browser = await chromium.launch({ executablePath: browserPath() });

for (const [locale, expectLang, expectButton] of PHONES) {
  const ctx = await browser.newContext({ locale, viewport: { width: 390, height: 780 } });
  const page = await ctx.newPage();
  await page.route('**/api/**', (r) => r.fulfill({ json: {} }));
  await page.route('**/api/bubbles**', (r) => {
    const req = r.request();
    if (/\/api\/bubbles\/\d+$/.test(req.url())) {
      return r.fulfill({ json: { bubble: { ...W, mine: false, saved: false }, replies: [] } });
    }
    return r.fulfill({ json: { bubbles: [W] } });
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.locator('#notice-modal').waitFor({ state: 'visible', timeout: 4000 }).catch(() => {});
  const ok = page.locator('#notice-ok');
  if (await ok.isVisible().catch(() => false)) await ok.click();
  await page.locator('#notice-modal').waitFor({ state: 'hidden', timeout: 4000 }).catch(() => {});

  const lang = await page.evaluate(() => document.documentElement.lang);
  const dir = await page.evaluate(() => document.documentElement.dir);
  const button = (await page.locator('#entry-pain').textContent()) || '';
  check(lang === expectLang, `${locale} → interface in ${lang} (wanted ${expectLang})`);
  check(
    button.includes(expectButton),
    `${locale} → the button reads "${button.trim()}"`
  );
  if (expectLang === 'ar') check(dir === 'rtl', `${locale} → the page runs right to left (dir=${dir})`);

  // Nothing anywhere translates the whisper.
  await page.waitForSelector('.lantern', { timeout: 4000 });
  await page.waitForTimeout(2200);
  const onBalloon = await page.evaluate(() => {
    for (const el of document.querySelectorAll('.lantern')) {
      if (el.style.display !== 'none' && el.textContent.trim()) return el.textContent.trim();
    }
    return '';
  });
  check(
    onBalloon && WORDS.startsWith(onBalloon.replace(/…$/, '')),
    `${locale} → the whisper is still Chinese ("${onBalloon}")`
  );

  // Not a single interface string left untranslated as a raw key.
  const raw = await page.evaluate(() =>
    [...document.querySelectorAll('button, label, summary, p')]
      .map((e) => e.textContent.trim())
      .filter((s) => /^[a-z][A-Za-z]{4,}$/.test(s) && !s.includes(' '))
  );
  check(raw.length === 0, `${locale} → no untranslated keys showing (${raw.join(', ') || 'none'})`);

  await ctx.close();
}

await browser.close();
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
