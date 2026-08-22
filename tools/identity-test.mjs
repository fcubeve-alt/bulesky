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

async function open(mine, extra = {}) {
  const b = await chromium.launch({ executablePath: browserPath() });
  const page = await b.newPage();
  const sent = [];
  await page.route('**/api/**', (r) => r.fulfill({ json: {} }));
  await page.route('**/api/bubbles**', (r) => {
    const req = r.request();
    if (req.method() === 'POST') { sent.push(JSON.parse(req.postData() || '{}')); return r.fulfill({ status: 201, json: { id: 9, code: 'tester', type: 'pain', content: 'x', createdAt: Date.now() } }); }
    if (/\/api\/bubbles\/\d+$/.test(req.url())) return r.fulfill({ json: { bubble: { ...W, mine, ...extra }, replies: [] } });
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
  // Open the whisper by its link. Searching by the name it was signed with is
  // gone — My Sky lists everything this device wrote, so the box that let a
  // public name stand in for proof had nothing left to do.
  await page.goto(`${BASE}/?w=${W.id}`, { waitUntil: 'domcontentloaded' });
  const notice = page.locator('#notice-ok');
  if (await notice.isVisible().catch(() => false)) await notice.click();
  await page.waitForSelector('#read-overlay:not(.hidden)');
  const visible = await page.locator('#read-delete-btn').isVisible();
  console.log(`${visible === mine ? 'PASS' : 'FAIL'}  delete button ${mine ? 'shown' : 'hidden'} when server says mine=${mine}`);
  const claimed = await page.evaluate(() => localStorage.getItem('my_bubbles'));
  if (!mine) console.log(`${!claimed ? 'PASS' : 'FAIL'}  looking a name up does not claim it (my_bubbles=${claimed})`);
  await b.close();
}


// 3. Keeping somebody else's story: offered on theirs, never on your own.
for (const [mine, expected] of [[false, true], [true, false]]) {
  const { b, page } = await open(mine);
  // Open the whisper by its link. Searching by the name it was signed with is
  // gone — My Sky lists everything this device wrote, so the box that let a
  // public name stand in for proof had nothing left to do.
  await page.goto(`${BASE}/?w=${W.id}`, { waitUntil: 'domcontentloaded' });
  const notice = page.locator('#notice-ok');
  if (await notice.isVisible().catch(() => false)) await notice.click();
  await page.waitForSelector('#read-overlay:not(.hidden)');
  const visible = await page.locator('#read-save-btn').isVisible();
  console.log(`${visible === expected ? 'PASS' : 'FAIL'}  keep button ${expected ? 'offered on' : 'hidden on'} ${mine ? 'your own' : "somebody else's"} whisper`);
  await b.close();
}

// 4. My Sky is found by the device secret, not by typing a name.
{
  const { b, page } = await open(false);
  let authHeader = null;
  await page.route('**/api/me', (r) => {
    authHeader = r.request().headers()['x-author'] || null;
    return r.fulfill({
      json: { mine: [{ id: 1, type: 'pain', content: '我写的那条' }], saved: [], gone: 2 },
    });
  });
  // Give the device an identity the way a first whisper would.
  await page.evaluate(() => localStorage.setItem('aya_author_secret', 'ABCDEFGHJKMNPQRSTVWX'));
  await page.click('#find-icon');
  await page.waitForFunction(() => document.querySelector('#mysky').children.length > 0, { timeout: 5000 });
  // The lists open folded, so the rows are in the DOM but not on screen —
  // textContent still reads them, which is what this case is checking.
  const shown = await page.locator('#mysky').textContent();
  const note = await page.locator('#mysky-msg').textContent();
  console.log(`${/^[0-9a-f]{64}$/.test(authHeader || '') ? 'PASS' : 'FAIL'}  my sky asks with the hash, never the secret`);
  console.log(`${shown.includes('我写的那条') ? 'PASS' : 'FAIL'}  my own whispers are listed`);
  console.log(`${note.includes('2') ? 'PASS' : 'FAIL'}  says how many kept stories their authors took back (${note})`);
  await b.close();
}

// 4b. The name is an identity you keep, not a field you fill in again.
//
// It stopped being a lookup key when My Sky replaced searching by name, so the
// one job it has left is being read under your words. That only works if it is
// actually there — and it was blank on every reply box, so the commonest
// answer in the sky was signed "Anonymous".
{
  const { b, page, sent } = await open(false);
  await page.click('#entry-pain');
  await page.fill('#compose-content', '第一次写点什么');
  await page.fill('#compose-code', '夜里的猫');
  await page.waitForTimeout(900);
  await page.click('#compose-submit');
  await page.waitForSelector('#confirm-sheet:not(.hidden)');
  const kept = await page.evaluate(() => localStorage.getItem('aya_author_name'));
  console.log(`${kept === '夜里的猫' ? 'PASS' : 'FAIL'}  the name is kept on the device (${kept})`);
  console.log(`${sent[0] && sent[0].code === '夜里的猫' ? 'PASS' : 'FAIL'}  and published with the whisper`);

  // Next whisper: already signed, nothing to retype.
  await page.click('#confirm-close');
  await page.click('#entry-wish');
  const prefilled = await page.inputValue('#compose-code');
  console.log(`${prefilled === '夜里的猫' ? 'PASS' : 'FAIL'}  the next whisper opens already signed (${prefilled})`);
  await page.click('#compose-cancel');

  // And so is a reply — an unsigned reply is what makes a sky of 匿名.
  await page.goto(`${BASE}/?w=${W.id}`, { waitUntil: 'domcontentloaded' });
  const n2 = page.locator('#notice-ok');
  if (await n2.isVisible().catch(() => false)) await n2.click();
  await page.waitForSelector('#read-overlay:not(.hidden)');
  await page.click('#read-reply-btn');
  await page.waitForSelector('#reply-sheet:not(.hidden)');
  const replyName = await page.inputValue('#reply-code');
  console.log(`${replyName === '夜里的猫' ? 'PASS' : 'FAIL'}  a reply is signed by default (${replyName})`);
  await b.close();
}

// 4c. The byline is shown in full. It used to be cut to two characters, which
// was right while a name could be typed into a search box to pull up
// everything that person wrote — and pointless once that box was removed.
{
  const { b, page } = await open(false, { code: '走夜路的人' });
  await page.goto(`${BASE}/?w=${W.id}`, { waitUntil: 'domcontentloaded' });
  const n3 = page.locator('#notice-ok');
  if (await n3.isVisible().catch(() => false)) await n3.click();
  await page.waitForSelector('#read-overlay:not(.hidden)');
  const by = (await page.locator('#read-author').textContent()) || '';
  console.log(`${by.includes('走夜路的人') && !by.includes('***') ? 'PASS' : 'FAIL'}  the byline is the whole name (${by.trim()})`);
  await b.close();
}

// 5. The share card: drawn on the device, offered only on your own whisper,
//    and a long whisper becomes an opening plus a link rather than a wall.
{
  const { b, page } = await open(true);
  // Open the whisper by its link. Searching by the name it was signed with is
  // gone — My Sky lists everything this device wrote, so the box that let a
  // public name stand in for proof had nothing left to do.
  await page.goto(`${BASE}/?w=${W.id}`, { waitUntil: 'domcontentloaded' });
  const notice = page.locator('#notice-ok');
  if (await notice.isVisible().catch(() => false)) await notice.click();
  await page.waitForSelector('#read-overlay:not(.hidden)');
  const offered = await page.locator('#read-share-btn').isVisible();
  console.log(`${offered ? 'PASS' : 'FAIL'}  share offered on your own whisper`);

  const drew = await page.evaluate(async () => {
    const { drawCard, excerpt } = await import('/js/sharecard.js');
    const long = '我还是会偷偷跟你说话。'.repeat(40);
    const cut = excerpt(long);
    const blob = await drawCard({ text: long, type: 'pain', label: '读全文 ↓' });
    return { bytes: blob ? blob.size : 0, mime: blob ? blob.type : '', trimmed: cut.trimmed, len: cut.text.length };
  });
  console.log(`${drew.bytes > 5000 && drew.mime === 'image/png' ? 'PASS' : 'FAIL'}  card renders to a PNG on the device (${drew.bytes} bytes)`);
  console.log(`${drew.trimmed && drew.len <= 230 ? 'PASS' : 'FAIL'}  a long whisper is cut to an opening (${drew.len} chars)`);
  await b.close();
}

// 6. The card's link opens that whisper, not the sky.
{
  const b = await chromium.launch({ executablePath: browserPath() });
  const page = await b.newPage();
  let asked = null;
  await page.route('**/api/**', (r) => r.fulfill({ json: {} }));
  await page.route('**/api/bubbles**', (r) => {
    const m = /\/api\/bubbles\/(\d+)$/.exec(r.request().url());
    if (m) { asked = m[1]; return r.fulfill({ json: { bubble: { ...W, id: 7, mine: false }, replies: [] } }); }
    return r.fulfill({ json: { bubbles: [W] } });
  });
  await page.goto(`${BASE}/?w=7`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#read-overlay:not(.hidden)', { timeout: 5000 }).catch(() => {});
  console.log(`${asked === '7' ? 'PASS' : 'FAIL'}  ?w=7 opens whisper 7 (asked for ${asked})`);
  await b.close();
}
