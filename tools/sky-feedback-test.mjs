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
  // a phone today is 62pt and the rule uses 120px, and the real gap measured on
  // the reported phone was 190px between the fixed-positioning box and the
  // glass. Anything that stops short of clearing 100px cannot clear a notch.
  //
  // Read from computed values rather than from a rect: several of these are
  // display:none at any given moment (.overlay until a sheet opens, .bg-video
  // before a clip loads) and a hidden element has no box — but it still has the
  // offsets and the height the rule gave it.
  // Measured where it is PAINTED, not where the declarations say it should be.
  //
  // This used to read the computed top and height and add them up, which is a
  // check on the arithmetic of a rule rather than on whether the scenery
  // reaches the glass. The scenery is sized by `inset: 0` and a transform now,
  // and getBoundingClientRect() is the only thing that reports the result of a
  // transform. It is also the honest question: a photograph shows painted
  // pixels, and painted pixels are what a band is made of.
  const MARGIN = 40;
  const short = await page.evaluate((margin) => {
    const out = [];
    // The video is deliberately absent: it is placed in pixels by coverVideos()
    // and checked further down, against the clip's own aspect ratio. Sizing it
    // here is what let a letterboxed frame hide inside a correct box.
    for (const sel of ['#sky-bg', '#bg-scrim']) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (!(r.top <= -margin) || !(r.bottom >= innerHeight + margin)) {
        out.push(`${sel} ${Math.round(r.top)}..${Math.round(r.bottom)}`);
      }
    }
    return out;
  }, MARGIN);
  check(
    short.length === 0,
    `every layer that paints reaches past both edges of the screen (${short.join(', ') || `all clear by ${MARGIN}px+`})`
  );

  // The whole point of the change: none of the three asks the browser how tall
  // the screen is. One phone reported 684, 792 and 874 for the same screen, and
  // twelve rounds were spent picking between them.
  const usesNoNumber = await page.evaluate(() => {
    const bad = [];
    for (const sel of ['#sky-bg', '#bg-scrim']) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const cs = getComputedStyle(el);
      // `inset: 0` resolves to exactly the viewport; anything else means a
      // measured height has crept back in.
      if (Math.abs(parseFloat(cs.height) - innerHeight) > 1) bad.push(`${sel} h=${cs.height}`);
      if (cs.transform === 'none') bad.push(`${sel} not scaled`);
    }
    return bad;
  });
  check(
    usesNoNumber.length === 0,
    `and none of them is sized by a number the browser had to be asked for (${usesNoNumber.join(', ') || 'inset:0 + scale, both'})`
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

  // Every layer must FOLLOW --sky-h, and the <video> most of all.
  //
  // This is the check that would have caught the worst regression in this whole
  // saga. The rule was briefly written as top+bottom with height:auto, which
  // stretches a <div> correctly and does NOT stretch a <video>: for replaced
  // elements `height: auto` resolves to the intrinsic height and `bottom` is
  // ignored. Every div in the rule looked right while the scenery stopped at
  // 600pt on an 874pt screen. So .bg-video is checked by the same measure as
  // the rest, deliberately, and 2000px is forced because no desktop viewport
  // would ever exercise it.
  const followed = await page.evaluate(() => {
    const root = document.documentElement;
    const was = root.style.getPropertyValue('--sky-h');
    root.style.setProperty('--sky-h', '2000px');
    const out = [];
    // Only the transparent layers now. The three that paint are sized by
    // `inset: 0` and do not consult --sky-h at all — that is the fix, not a
    // regression.
    for (const sel of ['#lanterns', '.overlay']) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const cs = getComputedStyle(el);
      const h = parseFloat(cs.height);
      const top = parseFloat(cs.top);
      if (!(h >= 2200) || !(top <= -100)) out.push(`${sel} top=${cs.top} h=${cs.height}`);
    }
    root.style.setProperty('--sky-h', was);
    return out;
  });
  check(
    followed.length === 0,
    `the layers that carry content still follow the screen height (${followed.join(', ') || 'both 2240px'})`
  );

  // ---- and when the prediction is wrong anyway ------------------------------
  //
  // Eleven rounds were spent predicting the right height, deploying, and waiting
  // for a photograph to say whether the prediction had been right. This is the
  // check that the app no longer needs the photograph: a background layer is
  // broken here in exactly the way a real one broke — a <video> left at its own
  // intrinsic height, which is what `height: auto` resolves to for a replaced
  // element and how the scenery once stopped 274pt short — and the page is
  // expected to notice and put it back on its own.
  //
  // If this goes red, the app is back to guessing.
  const healed = await page.evaluate(async () => {
    // A painting layer, not the video: the video is placed by coverVideos() and
    // growing a letterboxed element only grows the letterbox, which is the whole
    // reason it was taken out of this loop.
    const video = document.querySelector('#sky-bg');
    video.style.transform = 'none';
    video.style.height = '150px';
    const broken = video.getBoundingClientRect().bottom;

    window.dispatchEvent(new Event('resize'));
    await new Promise((r) => requestAnimationFrame(r));

    const target = Math.max(
      (window.screen && window.screen.height) || 0,
      window.innerHeight || 0,
      document.documentElement.clientHeight || 0
    );
    const now = video.getBoundingClientRect();
    return { broken: Math.round(broken), bottom: Math.round(now.bottom), target };
  });
  check(
    healed.bottom >= healed.target,
    `a layer that comes up short is measured and put back, without a deploy (${healed.broken}px → ${healed.bottom}px, screen ${healed.target})`
  );

  // ---- the picture inside the box -------------------------------------------
  //
  // Thirteen rounds went at the box the video sits in. Two photographs showed
  // the box was never the problem: the missing strip measured exactly
  // rgb(5,6,15) — the canvas, not footage — and it was 62pt at the BOTTOM on one
  // clip and 25.7pt at the TOP on the next, two minutes apart on the same
  // screen. A box does not change shape between clips; a letterboxed frame
  // inside it does. `object-fit: cover` was not being honoured.
  //
  // So the element is given the video's own aspect ratio in pixels. When the box
  // and the frame are the same shape, cover, contain and fill all agree, and
  // there is nowhere for a bar to go whichever one the browser picks.
  const framed = await page.evaluate(async () => {
    const v = document.querySelector('.bg-video');
    v.classList.remove('hidden');
    // A real clip only announces its shape at loadedmetadata, which is also the
    // moment a playlist swaps clips without the page ever resizing.
    Object.defineProperty(v, 'videoWidth', { value: 1920, configurable: true });
    Object.defineProperty(v, 'videoHeight', { value: 1080, configurable: true });
    v.dispatchEvent(new Event('loadedmetadata'));
    await new Promise((r) => requestAnimationFrame(r));
    const r = v.getBoundingClientRect();
    return {
      boxAspect: r.width / r.height,
      videoAspect: 1920 / 1080,
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      left: Math.round(r.left),
      right: Math.round(r.right),
      w: innerWidth,
      h: Math.max(screen.height, innerHeight, document.documentElement.clientHeight),
    };
  });
  check(
    Math.abs(framed.boxAspect - framed.videoAspect) < 0.01,
    `the video element is given the clip's own shape, so no fit mode can letterbox it (${framed.boxAspect.toFixed(3)} vs ${framed.videoAspect.toFixed(3)})`
  );
  check(
    framed.top <= 0 && framed.bottom >= framed.h && framed.left <= 0 && framed.right >= framed.w,
    `and it covers the whole screen on all four sides (${framed.left}..${framed.right} x ${framed.top}..${framed.bottom} over ${framed.w}x${framed.h})`
  );

  // A portrait clip has to work as well as a landscape one — the strip changed
  // ends between two clips, which is what a shape change does.
  const portrait = await page.evaluate(async () => {
    const v = document.querySelector('.bg-video');
    Object.defineProperty(v, 'videoWidth', { value: 1080, configurable: true });
    Object.defineProperty(v, 'videoHeight', { value: 2340, configurable: true });
    v.dispatchEvent(new Event('loadedmetadata'));
    await new Promise((r) => requestAnimationFrame(r));
    const r = v.getBoundingClientRect();
    return {
      ok:
        r.top <= 0 &&
        r.bottom >= Math.max(screen.height, innerHeight, document.documentElement.clientHeight) &&
        r.left <= 0 &&
        r.right >= innerWidth,
      box: `${Math.round(r.left)}..${Math.round(r.right)} x ${Math.round(r.top)}..${Math.round(r.bottom)}`,
    };
  });
  check(portrait.ok, `and a portrait clip covers it too, not only a landscape one (${portrait.box})`);

  // ---- the surface behind everything ----------------------------------------
  //
  // The gap in both photographs measured exactly rgb(5,6,15) — the flat end of
  // #sky-bg's gradient, and the colour <html> paints on the canvas. So the gap
  // was never a hole. Something was painting there; it was painting flat
  // near-black, and flat near-black against moving scenery reads as a bar.
  //
  // So the two hindmost surfaces now carry the picture instead: #sky-bg gets the
  // live frame scaled up from a 16x32 stamp (a blur, for free), and <html> gets
  // its average colour — and the root element's background is propagated to the
  // canvas, which by specification covers the whole painting surface, including
  // anywhere outside the layout viewport that no element can reach.
  const behind = await page.evaluate(async () => {
    // A headless video has no frames, so drawImage is stood in for. What is
    // under test is the sampling and what it does with the result, not the
    // decoder.
    const orig = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (src) {
      if (src instanceof HTMLVideoElement) {
        this.fillStyle = 'rgb(100, 150, 200)';
        this.fillRect(0, 0, 16, 32);
        return undefined;
      }
      return orig.apply(this, arguments);
    };
    const v = document.querySelector('.bg-video');
    v.classList.remove('hidden');
    v.classList.add('bg-show');
    Object.defineProperty(v, 'readyState', { value: 4, configurable: true });
    Object.defineProperty(v, 'videoWidth', { value: 1920, configurable: true });
    Object.defineProperty(v, 'videoHeight', { value: 1080, configurable: true });
    await new Promise((r) => setTimeout(r, 2400));
    return {
      html: document.documentElement.style.backgroundColor,
      sky: (document.getElementById('sky-bg').style.backgroundImage || '').replace(/"/g, '').slice(0, 14),
    };
  });
  // ⚠️ The opposite of what this asked a round ago. Writing the frame's average
  // to <html> every 700ms turned the strip along the bottom from our own dark
  // #05060f into pure white — measured 255,255,255 off the photograph, same
  // 62.0pt, far worse. WebKit paints the area outside the web content from the
  // root background and does not follow a value rewritten twice a second.
  check(
    behind.html === '',
    `the root background is left to the stylesheet, where WebKit can follow it (${behind.html || 'untouched'})`
  );
  check(
    behind.sky.startsWith('url(data:image'),
    `and the backstop layer shows the frame itself, not a flat gradient (${behind.sky || 'none'})`
  );

  // ---- and the controls clear whatever is left ------------------------------
  //
  // The strip is measured rather than fought. Everything anchored to the bottom
  // of the screen is placed with --safe-bottom, which is now the larger of the
  // home indicator and that measurement — so one number moves the two entry
  // buttons, the footer, the now-playing line and the reading view's own row
  // together, and a control can never end up underneath it.
  const lifted = await page.evaluate(() => {
    const root = document.documentElement;
    // The bar is anchored to the bottom edge and stays there; what has to clear
    // the strip is what is inside it.
    const btn = document.querySelector('.bottom-btn') || document.querySelector('.bottom-bar button');
    const written = root.style.getPropertyValue('--safe-bottom');
    const gap = btn ? Math.round(innerHeight - btn.getBoundingClientRect().bottom) : -1;
    return { written, gap, declared: !!btn };
  });
  // Written as a plain number, by script, rather than assembled by CSS out of an
  // env() inside a max() inside a custom property inside a calc(). Four features
  // deep is four chances for the whole declaration to be dropped, and a dropped
  // declaration looks exactly like nothing having been deployed.
  check(
    /^\d+px$/.test(lifted.written),
    `the bottom margin is written as a plain number, not assembled by CSS (${lifted.written || 'unset'})`
  );
  check(
    parseFloat(lifted.written) >= 60,
    `and never comes to nothing, however the screen reports itself (${lifted.written || 'unset'})`
  );
  check(
    lifted.declared && lifted.gap >= 60,
    `so the controls always stand clear of the bottom edge (${lifted.gap}px of clearance)`
  );

  // What it saw is left where the next round can read it, so a phone with the
  // problem reports its own numbers instead of being guessed about.
  const noted = await page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('sky-fit') || 'null'); } catch { return null; }
  });
  check(
    !!noted && typeof noted.target === 'number' && !!noted.layers,
    `and it writes down what it measured (${noted ? `target ${noted.target}, ${Object.keys(noted.layers).length} layers` : 'nothing'})`
  );

  // And the sky gradient stays behind the video as a backstop, so a gap can
  // never again be flat black.
  const backstop = await page.evaluate(() => {
    document.body.classList.add('has-video');
    const d = getComputedStyle(document.querySelector('#sky-bg')).display;
    document.body.classList.remove('has-video');
    return d;
  });
  check(backstop !== 'none', `the sky gradient stays behind the video as a backstop (display: ${backstop})`);

  // And the rule has to be IN index.html, not in the stylesheet.
  //
  // Not a style preference — the reason is the bug. Three correct fixes reached
  // the server and never reached the phone, because an installed home-screen web
  // app went on serving /css/style.css from its own cache while re-fetching the
  // page itself. A rule that decides whether the sky reaches the edge of the
  // screen must not be able to arrive stale on its own.
  const inline = await page.evaluate(async () => {
    const html = await (await fetch('/index.html', { cache: 'no-store' })).text();
    const blocks = html.match(/<style[^>]*>[\s\S]*?<\/style>/gi) || [];
    return blocks.some((b) => b.includes('#bg-scrim') && b.includes('--sky-h'));
  });
  check(inline, 'and the rule ships inside index.html, where it cannot go stale on its own');
  await b.close();
}

console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
