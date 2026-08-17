// Who may delete what, checked in a real browser with every API call stubbed.
//
// The rule this pins down: ownership is the server's answer, never the
// browser's memory. Looking a name up used to claim the whispers under it —
// a name is printed publicly under every whisper, so that let anyone take over
// somebody else's words. There is no unit test that can catch that; it lives
// in what the interface offers you.
//
//   npm i -D playwright && python3 -m http.server 8788 --directory public
//   node tools/identity-test.mjs
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
const W = { id: 1, type: 'pain', content: '很长的一条悄悄话。', code: 'tester', lights: 0, created_at: Date.now() };

async function open(mine) {
  const b = await chromium.launch({ executablePath: browserPath() });
  const page = await b.newPage();
  const sent = [];
  await page.route('**/api/**', (r) => r.fulfill({ json: {} }));
  await page.route('**/api/bubbles**', (r) => {
    const req = r.request();
    if (req.method() === 'POST') { sent.push(JSON.parse(req.postData() || '{}')); return r.fulfill({ status: 201, json: { id: 9, code: 'tester', type: 'pain', content: 'x', createdAt: Date.now() } }); }
    if (/\/api\/bubbles\/\d+$/.test(req.url())) return r.fulfill({ json: { bubble: { ...W, mine }, replies: [] } });
    return r.fulfill({ json: { bubbles: [W] } });
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.locator('#notice-modal').waitFor({ state: 'visible', timeout: 4000 }).catch(() => {});
  const ok = page.locator('#notice-ok');
  if (await ok.isVisible().catch(() => false)) await ok.click();
  await page.locator('#notice-modal').waitFor({ state: 'hidden', timeout: 4000 }).catch(() => {});
  return { b, page, sent };
}

// 1. publish carries a secret, and the recovery code is shown once
{
  const { b, page, sent } = await open(false);
  await page.click('#entry-pain');
  await page.fill('#compose-content', '第一次写点什么');
  await page.fill('#compose-code', '夜里的猫');
  await page.waitForTimeout(900);
  await page.click('#compose-submit');
  await page.waitForSelector('#confirm-sheet:not(.hidden)');
  const secret = sent[0] && sent[0].secret;
  const shown = await page.locator('#recovery-block').isVisible();
  const code = (await page.locator('#recovery-code').textContent()) || '';
  console.log(`${secret && /^[0-9A-Z]{20}$/.test(secret) ? 'PASS' : 'FAIL'}  publish sends a 20-char secret (${secret})`);
  console.log(`${shown && code.includes('-') ? 'PASS' : 'FAIL'}  recovery code shown on the first whisper (${code})`);
  const stored = await page.evaluate(() => localStorage.getItem('aya_author_secret'));
  console.log(`${stored === secret ? 'PASS' : 'FAIL'}  the same secret is kept on the device`);
  await b.close();
}

// 2. the delete button follows what the server says, not localStorage
for (const mine of [true, false]) {
  const { b, page } = await open(mine);
  await page.click('#find-icon');
  await page.fill('#find-input', 'tester');
  await page.click('#find-submit');
  await page.click('#find-result .find-result-row');
  await page.waitForSelector('#read-overlay:not(.hidden)');
  const visible = await page.locator('#read-delete-btn').isVisible();
  console.log(`${visible === mine ? 'PASS' : 'FAIL'}  delete button ${mine ? 'shown' : 'hidden'} when server says mine=${mine}`);
  const claimed = await page.evaluate(() => localStorage.getItem('my_bubbles'));
  if (!mine) console.log(`${!claimed ? 'PASS' : 'FAIL'}  looking a name up does not claim it (my_bubbles=${claimed})`);
  await b.close();
}
