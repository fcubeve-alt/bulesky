// The bug that cost four rounds: a fix that deploys, goes green, and is not on
// the phone.
//
// An installed home-screen web app kept serving its own cached copy of the page.
// From outside that is indistinguishable from a fix that did not work, and it
// was diagnosed only by measuring a screenshot's pixels against the geometry of
// a specific old commit. Nothing in the suite could have caught it, because
// every test here loads a fresh page.
//
// So two things now exist and both are checked here: the page carries a build
// stamp, and a page whose stamp is older than the server's throws away the
// service worker, its caches, and itself.
//
//   npm i -D playwright && python3 -m http.server 8788 --directory public
//   node tools/staleness-test.mjs
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

const b = await chromium.launch({ executablePath: browserPath() });

// The page has to carry a stamp at all, or nothing below can work.
{
  const page = await b.newPage();
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  const stamp = await page.evaluate(() => {
    const m = document.querySelector('meta[name="build-stamp"]');
    return m && m.content;
  });
  check(Boolean(stamp), `the page says which build it is (${stamp || 'NO STAMP'})`);
  await page.close();
}

// A phone running an old build: the page it has says one stamp, the server says
// another. It must clear what it is holding and reload itself.
{
  const ctx = await b.newContext();
  const page = await ctx.newPage();
  const urls = [];
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) urls.push(f.url()); });

  // Serve a page stamped OLD to the browser, while /index.html fetched with
  // no-store answers with the real (current) stamp — exactly the shape of the
  // real failure.
  await page.route('**/api/**', (r) => r.fulfill({ json: {} }));
  await page.route('**/api/bubbles**', (r) => r.fulfill({ json: { bubbles: [] } }));
  let served = 0;
  await page.route(`${BASE}/`, async (r) => {
    served += 1;
    const res = await r.fetch();
    let html = await res.text();
    // Only the FIRST load is stale; the reload gets the real page, so a passing
    // run proves it heals rather than loops.
    if (served === 1) {
      html = html.replace(/(<meta name="build-stamp" content=")[^"]*(")/, '$1ancient-build$2');
    }
    return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
  });

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  const ok = page.locator('#notice-ok');
  if (await ok.isVisible().catch(() => false)) await ok.click();

  await page.waitForURL(/[?&]fresh=\d+/, { timeout: 8000 }).catch(() => {});
  const healed = urls.some((u) => /[?&]fresh=\d+/.test(u));
  check(healed, `a stale page reloads itself onto a fresh URL (${urls.length} navigations)`);

  // And it does it ONCE. A stamp that never matches must not put the app in a
  // reload loop — that would be a worse bug than the one being fixed.
  await page.waitForTimeout(2500);
  const freshLoads = urls.filter((u) => /[?&]fresh=\d+/.test(u)).length;
  check(freshLoads === 1, `and only once, never a reload loop (${freshLoads} fresh loads)`);
  await ctx.close();
}

// A phone that is already current must not reload at all.
{
  const ctx = await b.newContext();
  const page = await ctx.newPage();
  const urls = [];
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) urls.push(f.url()); });
  await page.route('**/api/**', (r) => r.fulfill({ json: {} }));
  await page.route('**/api/bubbles**', (r) => r.fulfill({ json: { bubbles: [] } }));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const reloaded = urls.some((u) => /[?&]fresh=\d+/.test(u));
  check(!reloaded, `an up-to-date page is left alone (${urls.length} navigation)`);
  await ctx.close();
}

// The diagnostics page has to stand on its own: no stylesheet, no module, no
// service worker. It is the page you open precisely when the others are stale.
{
  const page = await b.newPage();
  const res = await page.goto(`${BASE}/diag.html`, { waitUntil: 'domcontentloaded' });
  check(res && res.ok(), '/diag.html is served');
  const deps = await page.evaluate(() => ({
    links: document.querySelectorAll('link[rel="stylesheet"]').length,
    modules: document.querySelectorAll('script[src]').length,
  }));
  check(
    deps.links === 0 && deps.modules === 0,
    `and depends on nothing that could itself be stale (${deps.links} css, ${deps.modules} js)`
  );
  await page.waitForTimeout(800);
  const verdict = (await page.locator('#verdict').textContent()) || '';
  check(/UP TO DATE|STALE/.test(verdict), `and reaches a verdict (${verdict.slice(0, 28)}…)`);
  const hasButton = await page.locator('#fix').isVisible();
  check(hasButton, 'and offers the button that clears a stale install');
  await page.close();
}

await b.close();
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
