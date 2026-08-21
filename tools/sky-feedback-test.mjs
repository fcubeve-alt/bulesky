// The things the sky does back at you, checked in a real browser.
//
// Four reported problems, all of which look like "the site is flaky" and none
// of which any unit test could see, because every one of them lives in the
// timing between a finger and the screen:
//
//   1. you post a whisper and it is gone — the balloon went up behind the
//      confirmation sheet and had sailed off by the time it was dismissed;
//   2. you tap a balloon and nothing opens — a thumb's wobble was read as a
//      drag, and the small far ones were under half the size a thumb can hit;
//   3. the reading view waited on the network before drawing anything, so a
//      slow connection meant a tap that did nothing at all for a second;
//   4. a long list of results ran off the bottom of the panel.
//
//   npm i -D playwright && python3 -m http.server 8788 --directory public
//   node tools/sky-feedback-test.mjs
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

const W = (id) => ({
  id,
  type: id % 2 ? 'pain' : 'wish',
  content: `第 ${id} 条悄悄话，写得不长不短。`,
  code: 'tester',
  lights: 0,
  warmth: 0,
  created_at: Date.now(),
});

let failures = 0;
function check(ok, label) {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
}

// `detailDelayMs` stalls the single-whisper fetch, which is how a slow phone
// behaves and the only way to see whether the reading view waits for it.
async function open({ detailDelayMs = 0, mine = false, mySky = null } = {}) {
  const b = await chromium.launch({ executablePath: browserPath() });
  const page = await b.newPage({ viewport: { width: 390, height: 780 }, hasTouch: true });
  await page.route('**/api/**', (r) => r.fulfill({ json: {} }));
  if (mySky) await page.route('**/api/me**', (r) => r.fulfill({ json: mySky }));
  await page.route('**/api/bubbles**', async (r) => {
    const req = r.request();
    if (req.method() === 'POST') {
      return r.fulfill({
        status: 201,
        json: { id: 99, code: 'tester', type: 'pain', content: '刚刚写的这一条', createdAt: Date.now() },
      });
    }
    if (/\/api\/bubbles\/\d+$/.test(req.url())) {
      if (detailDelayMs) await new Promise((res) => setTimeout(res, detailDelayMs));
      const id = Number(req.url().match(/(\d+)$/)[1]);
      return r.fulfill({ json: { bubble: { ...W(id), mine, saved: false }, replies: [] } });
    }
    return r.fulfill({ json: { bubbles: Array.from({ length: 12 }, (_, i) => W(i + 1)) } });
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.locator('#notice-modal').waitFor({ state: 'visible', timeout: 4000 }).catch(() => {});
  const ok = page.locator('#notice-ok');
  if (await ok.isVisible().catch(() => false)) await ok.click();
  await page.locator('#notice-modal').waitFor({ state: 'hidden', timeout: 4000 }).catch(() => {});
  return { b, page };
}

// A balloon a finger could actually land on. The world is wider than the phone,
// so plenty of them sit off to the side, and the bottom bar covers the ones
// still entering — picking blindly tests nothing.
function reachableBalloon(page) {
  return page.evaluate(() => {
    for (const el of document.querySelectorAll('.lantern')) {
      if (el.style.display === 'none') continue;
      const r = el.getBoundingClientRect();
      const cx = r.x + r.width / 2;
      const cy = r.y + r.height / 2;
      if (cy < 120 || cy > 560) continue;
      if (el.contains(document.elementFromPoint(cx, cy))) return { cx, cy };
    }
    return null;
  });
}

// 1. Post something and you see it — after the confirmation, not behind it.
{
  const { b, page } = await open();
  await page.click('#entry-pain');
  await page.fill('#compose-content', '刚刚写的这一条');
  await page.fill('#compose-code', '夜里的猫');
  await page.waitForTimeout(900);
  await page.click('#compose-submit');
  await page.waitForSelector('#confirm-sheet:not(.hidden)');

  const early = await page.locator('.lantern.spotlight').count();
  check(early === 0, `nothing is launched behind the confirmation (${early} in the air)`);

  await page.click('#confirm-close');
  await page.waitForSelector('.lantern.spotlight', { timeout: 3000 });
  const mine = page.locator('.lantern.spotlight').first();
  check(
    (await mine.textContent()).includes('刚刚写的这一条'),
    'the balloon that rises is the one just written'
  );

  // On screen, not parked off the side of a world wider than the phone.
  const box = await mine.boundingBox();
  const vw = 390;
  const onScreen = box && box.x + box.width > 8 && box.x < vw - 8;
  check(Boolean(onScreen), `it rises where the author is looking (x=${box ? Math.round(box.x) : '?'})`);

  // And slowly enough to follow: the readable middle tier, ~28px/s.
  const y0 = box.y;
  await page.waitForTimeout(1500);
  const y1 = (await mine.boundingBox()).y;
  const speed = (y0 - y1) / 1.5;
  check(speed > 8 && speed < 45, `it drifts up gently (${speed.toFixed(0)} px/s)`);
  await b.close();
}

// 2. A thumb that wobbles is still a tap, and the far ones can be hit at all.
{
  const { b, page } = await open();
  await page.waitForSelector('.lantern', { timeout: 4000 });
  await page.waitForTimeout(2500); // let the sky fill and the tiers spread

  // Every balloon in the sky must present at least a thumb's worth of target,
  // however far back it sits.
  const worst = await page.evaluate(() => {
    let min = Infinity;
    for (const el of document.querySelectorAll('.lantern')) {
      if (el.style.display === 'none') continue;
      const hit = el.querySelector('.lantern-hit');
      if (!hit) continue;
      const r = hit.getBoundingClientRect();
      min = Math.min(min, Math.min(r.width, r.height));
    }
    return Math.round(min);
  });
  check(worst >= 40, `even the farthest balloon is thumb-sized (smallest ${worst}px)`);

  // A tap that slides 9px — an ordinary thumb — must still open the whisper.
  const spot = await reachableBalloon(page);
  check(Boolean(spot), 'there is a balloon in reach to tap');
  const { cx, cy } = spot || { cx: 0, cy: 0 };
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 9, cy + 2);
  await page.mouse.up();
  const opened = await page
    .waitForSelector('#read-overlay:not(.hidden)', { timeout: 2500 })
    .then(() => true)
    .catch(() => false);
  check(opened, 'a tap that wobbles 9px still opens the whisper');
  await b.close();
}

// 3. The words are already on the balloon, so the reading view never waits.
{
  const { b, page } = await open({ detailDelayMs: 4000 });
  await page.waitForSelector('.lantern', { timeout: 4000 });
  await page.waitForTimeout(2500);
  const spot = await reachableBalloon(page);
  const started = Date.now();
  await page.mouse.click(spot.cx, spot.cy);
  await page.waitForSelector('#read-overlay:not(.hidden)', { timeout: 2000 });
  const took = Date.now() - started;
  const text = (await page.locator('#read-content').textContent()) || '';
  check(took < 1200, `opens without waiting for the network (${took}ms, server took 4000ms)`);
  check(text.includes('悄悄话'), 'and opens on the words the balloon was carrying');
  await b.close();
}

// 4. A long list folds instead of running off the panel.
{
  const many = Array.from({ length: 30 }, (_, i) => ({ ...W(i + 1), itemType: 'bubble' }));
  const { b, page } = await open({ mySky: { mine: many, saved: many.slice(0, 3), gone: 0 } });
  // A device that has written before — the panel only shows a code and a shelf
  // to someone who has one.
  await page.evaluate(() => localStorage.setItem('aya_author_secret', 'K9T7KY3QKKKWB4JXW1VF'));
  await page.click('#find-icon');
  await page.waitForSelector('#find-panel:not(.hidden)');
  await page.waitForSelector('.result-group', { timeout: 3000 });

  const groups = await page.evaluate(() =>
    [...document.querySelectorAll('#mysky .result-group')].map((g) => ({
      open: g.open,
      rows: g.querySelectorAll('.find-result-row').length,
    }))
  );
  check(groups.length === 2, `what I wrote and what I kept, both listed (${groups.length})`);
  // Everything is listed, whatever the count — this panel IS your own sky, so
  // folding the answer away behind a tap is hiding it.
  check(
    groups[0] && groups[0].rows === 30 && groups[0].open === true,
    `all thirty are listed, not folded away (${groups[0] ? groups[0].rows : 0} rows, open=${groups[0] && groups[0].open})`
  );
  check(groups[1] && groups[1].open === true, 'what I kept is listed too');

  // …and the panel is still the size of the panel: the lists scroll inside
  // themselves rather than growing it off the screen.
  const panel = await page.locator('#find-panel').boundingBox();
  check(panel.height <= 780, `the panel still fits the screen (${Math.round(panel.height)}px of 780)`);

  // Searching by name is a fallback and sits at the bottom, folded.
  const search = await page.evaluate(() => {
    const d = document.getElementById('find-box');
    const my = document.getElementById('mysky');
    return d && my ? { open: d.open, below: d.compareDocumentPosition(my) & Node.DOCUMENT_POSITION_PRECEDING } : null;
  });
  check(
    search && search.open === false && Boolean(search.below),
    'searching by name is folded away below your own sky'
  );

  // The recovery code has a home now: it used to be shown once, ever.
  const codeVisible = await page.locator('#recovery-box').isVisible();
  await page.click('#recovery-summary');
  const code = (await page.locator('#my-recovery').textContent()) || '';
  check(codeVisible && /^[0-9A-Z-]{20,}$/.test(code), `the recovery code can be fetched again (${code})`);
  await b.close();
}

console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
