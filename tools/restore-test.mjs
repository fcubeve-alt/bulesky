// Losing your phone, and getting your sky back.
//
// This is the only path back. There are no accounts, no email, nothing the
// server can send you — the recovery code is it. And it had never been tested:
// the identity tests covered writing, owning and deleting from ONE device, and
// stopped there. If pasting the code into a second phone did not really work,
// nothing in the suite would have said so, and the first person to find out
// would have been someone who had already lost the first phone.
//
// So two real browser profiles, which is what two phones are: the first writes
// something and reads its code off the screen, the second starts empty and is
// handed nothing but that string.
//
//   npm i -D playwright && python3 -m http.server 8788 --directory public
//   node tools/restore-test.mjs
import { chromium } from 'playwright';
import { existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

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

const WHISPER = {
  id: 7,
  type: 'pain',
  content: '写在丢手机之前的一条。',
  code: '夜里的猫',
  lights: 0,
  warmth: 0,
  created_at: Date.now(),
};

// The server, as far as these two phones are concerned. It stores one
// author_hash — whatever the first phone published with — and answers "is this
// yours" by comparing the hash it is shown. That comparison IS the feature:
// if the second phone reconstructs the same secret, it gets the same hash, and
// the server cannot tell the phones apart. Which is the point.
let publishedHash = null;
const seen = { me: [], detail: [] };

async function phone(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
  const page = await ctx.newPage();
  await page.route('**/api/**', (r) => r.fulfill({ json: {} }));
  await page.route('**/api/me**', (r) => {
    const hash = r.request().headers()['x-author'] || null;
    seen.me.push(hash);
    const owns = Boolean(hash) && hash === publishedHash;
    const mine = owns ? [{ ...WHISPER, itemType: 'bubble' }] : [];
    // The server has always known the name — it is the `code` on every whisper.
    // The browser is the only thing that loses it.
    return r.fulfill({ json: { name: owns ? WHISPER.code : '', mine, saved: [], gone: 0 } });
  });
  await page.route('**/api/bubbles**', (r) => {
    const req = r.request();
    if (req.method() === 'POST') {
      const body = JSON.parse(req.postData() || '{}');
      // The server stores SHA-256 of the secret, never the secret.
      publishedHash = createHash('sha256').update(body.secret).digest('hex');
      return r.fulfill({
        status: 201,
        json: { id: WHISPER.id, code: WHISPER.code, type: 'pain', content: WHISPER.content, createdAt: Date.now() },
      });
    }
    if (/\/api\/bubbles\/\d+$/.test(req.url())) {
      const hash = req.headers()['x-author'] || null;
      seen.detail.push(hash);
      return r.fulfill({
        json: { bubble: { ...WHISPER, mine: hash === publishedHash, saved: false }, replies: [] },
      });
    }
    return r.fulfill({ json: { bubbles: [WHISPER] } });
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.locator('#notice-modal').waitFor({ state: 'visible', timeout: 4000 }).catch(() => {});
  const ok = page.locator('#notice-ok');
  if (await ok.isVisible().catch(() => false)) await ok.click();
  await page.locator('#notice-modal').waitFor({ state: 'hidden', timeout: 4000 }).catch(() => {});
  return { ctx, page };
}

const browser = await chromium.launch({ executablePath: browserPath() });

// ---- the first phone: write something, read the code off the screen ----
const first = await phone(browser);
await first.page.click('#entry-pain');
await first.page.fill('#compose-content', WHISPER.content);
await first.page.fill('#compose-code', WHISPER.code);
await first.page.waitForTimeout(900);
await first.page.click('#compose-submit');
await first.page.waitForSelector('#confirm-sheet:not(.hidden)');

const shownCode = (await first.page.locator('#recovery-code').textContent()) || '';
const firstSecret = await first.page.evaluate(() => localStorage.getItem('aya_author_secret'));
check(/^[0-9A-Z]{20}$/.test(firstSecret || ''), `the first phone minted a secret (${firstSecret})`);
check(
  shownCode.replace(/-/g, '') === firstSecret,
  `and showed it as a recovery code (${shownCode})`
);
check(Boolean(publishedHash), 'the whisper was published under its hash');
await first.ctx.close();

// ---- the second phone: nothing but the string on the screen ----
const second = await phone(browser);
const before = await second.page.evaluate(() => localStorage.getItem('aya_author_secret'));
check(before === null, 'the second phone starts with no identity at all');

await second.page.click('#find-icon');
await second.page.waitForSelector('#find-panel:not(.hidden)');
await second.page.click('#recovery-summary');

// Typed the way a person actually types it off another screen: lower case, and
// with the O/0 and I/1 confusion the alphabet is designed to survive.
const typed = shownCode.toLowerCase().replace(/0/g, 'o').replace(/1/g, 'l');
await second.page.fill('#restore-input', typed);
await second.page.click('#restore-submit');
await second.page.waitForTimeout(600);

const after = await second.page.evaluate(() => localStorage.getItem('aya_author_secret'));
check(after === firstSecret, `the same secret is reconstructed from what was typed (${typed} → ${after})`);
check(
  seen.me.includes(publishedHash),
  'and My Sky asks the server with the first phone\'s hash'
);

// The whisper written on the lost phone is now listed here.
await second.page.waitForSelector('#mysky .result-group', { timeout: 3000 });
const listed = await second.page.evaluate(() => {
  const g = document.querySelector('#mysky .result-group');
  return g ? { count: g.querySelector('summary').textContent, rows: g.querySelectorAll('.find-result-row').length } : null;
});
check(listed && listed.rows === 1, `the whisper from the lost phone is back (${listed && listed.count})`);

// The name comes back with it, without being asked for again.
//
// The recovery code carries the secret and nothing else, so a restored phone
// used to be recognised — its whispers listed, its delete button offered —
// while still asking "你的名字" as though it had never written anything. The
// name was never lost; it is the `code` on every whisper the server holds.
const restoredName = await second.page.evaluate(() => localStorage.getItem('aya_author_name'));
check(restoredName === WHISPER.code, `the name comes back with the identity (${restoredName})`);
const nameLine = (await second.page.locator('#mysky-name').textContent()) || '';
check(nameLine.includes(WHISPER.code), `and My Sky says who this phone is (${nameLine.trim()})`);

// …and it is deletable, which is the half that actually needed the secret
// rather than the hash.
// The list starts folded (My Sky opens as four quiet lines), so open it first.
await second.page.click('#mysky .result-group > summary');
await second.page.click('#mysky .find-result-row');
await second.page.waitForSelector('#read-overlay:not(.hidden)', { timeout: 3000 });
const canDelete = await second.page.locator('#read-delete-btn').isVisible();
check(canDelete, 'the second phone may delete it — the server accepts it as the same author');

// The secret itself must never have travelled on a read.
check(
  !seen.me.includes(firstSecret) && !seen.detail.includes(firstSecret),
  'the secret never went out on a read — only its hash did'
);

// …and the next whisper from this phone goes out under that name, unasked.
await second.page.click('#read-close');
await second.page.waitForSelector('#read-overlay', { state: 'hidden', timeout: 3000 });
await second.page.click('#entry-pain');
await second.page.waitForSelector('#compose-sheet:not(.hidden)', { timeout: 3000 });
const asksAgain = await second.page.locator('#compose-code').isVisible();
const asLine = (await second.page.locator('#compose-as').textContent()) || '';
check(!asksAgain, 'the restored phone is not asked for a name a second time');
check(asLine.includes(WHISPER.code), `the sheet says who it goes out as (${asLine.trim().slice(0, 30)})`);
await second.ctx.close();

// ---- the name comes back on its own, without opening My Sky ----
//
// The commonest way to lose it is not a lost phone at all: it is the same
// person in a different browser, or one who cleared the site's data. They open
// the app and write — they never go near the panel — so the name has to be
// back before the compose sheet is opened, not when something is looked up.
{
  const fourth = await phone(browser);
  await fourth.page.evaluate((s) => localStorage.setItem('aya_author_secret', s), firstSecret);
  await fourth.page.reload({ waitUntil: 'domcontentloaded' });
  const n = fourth.page.locator('#notice-ok');
  if (await n.isVisible().catch(() => false)) await n.click();
  await fourth.page
    .waitForFunction(() => localStorage.getItem('aya_author_name'), { timeout: 4000 })
    .catch(() => {});
  const back = await fourth.page.evaluate(() => localStorage.getItem('aya_author_name'));
  check(back === WHISPER.code, `an identity with no name gets it back on load (${back})`);
  await fourth.ctx.close();
}

// ---- a wrong code changes nothing ----
{
  const third = await phone(browser);
  await third.page.click('#find-icon');
  await third.page.waitForSelector('#find-panel:not(.hidden)');
  await third.page.click('#recovery-summary');
  await third.page.fill('#restore-input', 'NOPE-NOPE-NOPE-NOPE');
  await third.page.click('#restore-submit');
  await third.page.waitForTimeout(400);
  const stored = await third.page.evaluate(() => localStorage.getItem('aya_author_secret'));
  const msg = (await third.page.locator('#mysky-msg').textContent()) || '';
  check(stored === null, 'a wrong code does not mint or store anything');
  check(msg.trim().length > 0, `and says so rather than failing silently ("${msg.trim().slice(0, 40)}")`);
  await third.ctx.close();
}

await browser.close();
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
