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
//   4. a long list of results ran off the bottom of the panel;
//   5. the invitation to reply arrives late on purpose — and shoved the two
//      buttons upward as it did, right as a thumb was reaching for one;
//   6. the ♪ button opened a panel and made no sound, for anyone who had once
//      pressed pause (that switches autostart off for good).
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
async function open({ detailDelayMs = 0, mine = false, mySky = null, locale = 'en-GB' } = {}) {
  const b = await chromium.launch({ executablePath: browserPath() });
  const page = await b.newPage({ viewport: { width: 390, height: 780 }, hasTouch: true, locale });
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
      // 99 is what POST hands back, and the reading view opens on it the moment
      // the confirmation closes. It has to answer with the words that were
      // actually written, or the check below reads the stub's filler instead.
      const bubble = id === 99
        ? { ...W(99), content: '刚刚写的这一条', code: 'tester', mine: true, saved: false }
        : { ...W(id), mine, saved: false };
      return r.fulfill({ json: { bubble, replies: [] } });
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

  // First the words, then the balloon. The author reads what they just wrote in
  // the reading view — the same view a tap on a balloon opens — because a ring
  // around a dot in a sky of dots is not "I can see what I wrote": "发完之后马上
  // 就变成气球了，有时候还要找一下才找得到".
  await page.waitForSelector('#read-overlay:not(.hidden)', { timeout: 3000 });
  const shownBack = (await page.locator('#read-content').textContent()) || '';
  check(shownBack.includes('刚刚写的这一条'), `the words are on the screen straight away (${shownBack.trim().slice(0, 14)})`);

  // And letting go of them leaves the balloon rising, so nothing is spent by
  // reading it once.
  await page.click('#read-close');
  await page.waitForSelector('#read-overlay', { state: 'hidden', timeout: 3000 });
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
  check(groups.length === 2, `what I wrote and what I kept, both there (${groups.length})`);
  // Four quiet lines and nothing else. The counts on the headings already
  // answer "is there anything in there", so spilling two full lists the moment
  // the panel opens is only mess.
  check(
    groups.every((g) => g.open === false),
    `every list starts folded (${groups.map((g) => g.open).join(', ')})`
  );
  check(groups[0] && groups[0].rows === 30, `and holds all thirty (${groups[0] ? groups[0].rows : 0})`);

  const rows = await page.evaluate(() =>
    [...document.querySelectorAll('#find-panel > .result-group, #find-panel #mysky > .result-group')]
      .map((g) => ({ id: g.id || 'list', open: g.open }))
  );
  // Three rows now: what I wrote, what I kept, my recovery code. The fourth
  // used to be "find by name", and it is gone — everything this device wrote is
  // in the first row whatever names were used, so the box that let a public
  // name stand in for proof was answering an answered question.
  check(
    rows.length === 3 && rows.every((r) => r.open === false),
    `the panel opens as three folded rows (${rows.map((r) => r.id).join(', ')})`
  );

  // …so it is short, whatever is in it.
  const panel = await page.locator('#find-panel').boundingBox();
  check(panel.height < 420, `and stays small (${Math.round(panel.height)}px of 780)`);

  // The recovery code still has a home, and so does pasting one in.
  await page.click('#recovery-summary');
  const code = (await page.locator('#my-recovery').textContent()) || '';
  const restoreVisible = await page.locator('#restore-input').isVisible();
  check(/^[0-9A-Z-]{20,}$/.test(code), `the recovery code can be fetched again (${code})`);
  check(restoreVisible, 'and a code from another phone can be pasted in under the same heading');

  await b.close();
}

// 5. The reply invitation appears without moving anything already on screen.
//
// In Chinese, because that is where it bites: the invitation was a wrapped flex
// item, so a SHORT sentence left room beside it and the "leave a light" button
// jumped up onto the invitation's line. The English sentence is long enough to
// fill the row on its own, which is why this went unseen until the interface
// started following the phone.
{
  const { b, page } = await open({ locale: 'zh-CN' });
  await page.waitForSelector('.lantern', { timeout: 4000 });
  await page.waitForTimeout(2500);
  const spot = await reachableBalloon(page);
  await page.mouse.click(spot.cx, spot.cy);
  await page.waitForSelector('#read-overlay:not(.hidden)', { timeout: 3000 });

  const before = await page.locator('#read-light-btn').boundingBox();
  // The invitation is held back until the whisper has nearly finished rising.
  await page.waitForSelector('#read-invite:not(.hidden)', { timeout: 60000 });
  await page.waitForTimeout(900); // let its entrance animation settle
  const after = await page.locator('#read-light-btn').boundingBox();
  const moved = Math.abs(before.y - after.y);
  check(moved < 2, `the light button does not jump when the invitation lands (moved ${moved.toFixed(1)}px)`);

  const invite = await page.locator('#read-invite').boundingBox();
  check(
    invite.y + invite.height <= after.y + 1,
    'the invitation sits above the buttons rather than between them'
  );
  await b.close();
}

// 6. The music button makes music.
{
  const { b, page } = await open();
  // Someone who once pressed pause: autostart is off for them from then on,
  // and ♪ was a panel toggle that produced silence however many times it was
  // pressed.
  await page.evaluate(() => localStorage.setItem('bulesky_music_off', '1'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  const ok = page.locator('#notice-ok');
  if (await ok.isVisible().catch(() => false)) await ok.click();
  await page.waitForTimeout(600);

  const silent = await page.evaluate(() => document.getElementById('music-icon').getAttribute('aria-pressed'));
  check(silent === 'false', `starts silent, as that person left it (aria-pressed=${silent})`);

  await page.click('#music-icon');
  await page.waitForTimeout(400);
  const nowOn = await page.evaluate(() => document.getElementById('music-icon').getAttribute('aria-pressed'));
  const panelOpen = await page.locator('#music-panel').isVisible();
  check(nowOn === 'true', 'one tap on ♪ turns the music on');
  check(panelOpen, 'and shows the panel, so it is obvious what happened');

  // A second tap must not silence it — that is the panel toggle, not a stop.
  await page.click('#music-icon');
  await page.waitForTimeout(200);
  const stillOn = await page.evaluate(() => document.getElementById('music-icon').getAttribute('aria-pressed'));
  check(stillOn === 'true', 'tapping again closes the panel and leaves the music playing');
  await b.close();
}

// 9. Nothing but sky, all the way to the edge of the glass.
//
// Reported twice from an iPhone home-screen install: a band across the bottom,
// then a band across the top, then a band across the bottom again. Two separate
// things have to hold.
//
// The canvas — the surface behind everything, and the only one that reaches
// into the notch and the home-indicator strip — takes its colour from <html>.
// Unset it is white, and no `position: fixed` layer can cover it. That was the
// white bar.
//
// The full-bleed layers then have to reach past both screen edges themselves.
// They cannot compute where those edges are: `top: 0` and `100vh` were measured
// meaning different things in two different installs of the same code, so the
// rule overshoots instead. What is pinned here is the overshoot — a browser
// with no insets cannot see a band, but it can see whether the layers are built
// to clear one.
{
  const { b, page } = await open();
  await page.waitForTimeout(600);

  const canvas = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
  const rgb = (canvas.match(/\d+/g) || []).map(Number);
  const opaque = rgb.length === 3 || (rgb.length === 4 && rgb[3] !== 0);
  const dark = rgb.length >= 3 && rgb[0] + rgb[1] + rgb[2] < 120;
  check(opaque && dark, `the canvas behind everything is painted dark (${canvas})`);

  // 100px is the test's floor, not the design's: the biggest safe-area inset on
  // a phone today is 62pt, and the rule uses 120px. Anything that stops short of
  // clearing 100px cannot clear a notch.
  const MARGIN = 100;
  const short = await page.evaluate((margin) => {
    const out = [];
    for (const sel of ['#sky-bg', '#bg-scrim', '#lanterns', '.bg-video', '.overlay']) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const cs = getComputedStyle(el);
      const top = parseFloat(cs.top);
      const bottom = top + parseFloat(cs.height);
      if (!(top <= -margin) || !(bottom >= innerHeight + margin)) {
        out.push(`${sel} ${Math.round(top)}..${Math.round(bottom)}`);
      }
    }
    return out;
  }, MARGIN);
  check(
    short.length === 0,
    `every full-bleed layer overshoots both screen edges (${short.join(', ') || `all clear by ${MARGIN}px+`})`
  );

  // The two that deliberately do NOT bleed still have to cover the viewport
  // exactly — a taller #scene would move the waterline, a shifted .read-overlay
  // would move the words.
  const exact = await page.evaluate(() => {
    const out = [];
    for (const sel of ['#scene', '.read-overlay']) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const cs = getComputedStyle(el);
      const top = parseFloat(cs.top);
      const h = parseFloat(cs.height);
      if (Math.abs(top) > 1 || Math.abs(h - innerHeight) > 1) out.push(`${sel} top=${Math.round(top)} h=${Math.round(h)}`);
    }
    return out;
  });
  check(exact.length === 0, `the lake and the reading view stay exactly on the viewport (${exact.join(', ') || 'both exact'})`);

  // And the bleed must not leak sideways: the balloon world is positioned
  // inside #lanterns, so a horizontal offset would shift every balloon in the
  // sky by that much.
  const sideways = await page.evaluate(() => {
    const cs = getComputedStyle(document.querySelector('#lanterns'));
    return { left: parseFloat(cs.left), width: parseFloat(cs.width) };
  });
  check(
    Math.abs(sideways.left) < 1 && Math.abs(sideways.width - 390) < 2,
    `and never sideways, which would move every balloon (left=${sideways.left}, w=${sideways.width})`
  );
  await b.close();
}

console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
