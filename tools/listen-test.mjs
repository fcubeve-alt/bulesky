// Press Listen in a real browser and check what the reader actually hears.
//
// This exists because "a long whisper came back with two voices in it" is not
// something anybody can see in a diff, and asking the owner to open a phone,
// add ?debug=voice and read a toast back is a slow way to answer a yes/no
// question. Everything here is stubbed except the front end itself, so it runs
// with no keys, no database and no network.
//
// What it pins down is the one rule that keeps being broken by accident: a
// whisper is read by ONE voice. The phone's own voice is a safety net for
// "nothing played at all", and the moment it is allowed to start over the top
// of a reading that already began, the listener hears the opening in one voice
// and the whole thing again in another.
//
//   npm i -D playwright     (kept out of package.json on purpose: the deploy
//                            runs npm install, and this pulls a browser)
//   node tools/listen-test.mjs
//   SITE=https://cubewithin.com node tools/listen-test.mjs   (against the live
//                            site: the stubs still apply, so it tests the
//                            deployed front end, not the deployed voice)
import { chromium } from 'playwright';
import { existsSync, readdirSync } from 'node:fs';

const BASE = process.env.SITE || 'http://127.0.0.1:8788';

function browserPath() {
  if (process.env.PW_CHROMIUM) return process.env.PW_CHROMIUM;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !existsSync(root)) return undefined; // let playwright find its own
  const dir = readdirSync(root).find((d) => /^chromium-\d+$/.test(d));
  return dir ? `${root}/${dir}/chrome-linux/chrome` : undefined;
}

// A couple of seconds of silence as a PCM WAV. Chromium decodes it natively, so
// no fixture file has to live in the repo.
function silentWav(seconds = 2, rate = 8000) {
  const samples = seconds * rate;
  const out = Buffer.alloc(44 + samples * 2);
  out.write('RIFF', 0);
  out.writeUInt32LE(36 + samples * 2, 4);
  out.write('WAVE', 8);
  out.write('fmt ', 12);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22);
  out.writeUInt32LE(rate, 24);
  out.writeUInt32LE(rate * 2, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write('data', 36);
  out.writeUInt32LE(samples * 2, 40);
  return out;
}

const WHISPER = {
  id: 1,
  type: 'pain',
  content: '我还是会偷偷跟你说话。已经两年了，我不再数日子，可我还在数那些小事。',
  code: 'tester',
  lights: 0,
  created_at: Date.now(),
};

async function openAndPressListen(page, voiceHandler) {
  // Playwright tries route handlers in reverse order of registration, so the
  // catch-all goes first or it swallows the two below it.
  await page.route('**/api/**', (route) => route.fulfill({ json: {} }));
  await page.route('**/api/bubbles**', (route) =>
    route.fulfill(
      /\/api\/bubbles\/\d+$/.test(route.request().url())
        ? { json: { bubble: WHISPER, replies: [] } }
        : { json: { bubbles: [WHISPER] } }
    )
  );
  await page.route('**/api/voice/**', voiceHandler);

  // Watch what the phone's own voice is asked to say, and every toast. The
  // audio element is made with `new Audio()` and never enters the DOM, so it is
  // caught on the way out instead.
  await page.addInitScript(() => {
    window.__spoke = [];
    window.__toasts = [];
    window.__audio = null;
    const RealAudio = window.Audio;
    window.Audio = function (...args) {
      const el = new RealAudio(...args);
      window.__audio = el;
      return el;
    };
    if (!window.speechSynthesis) window.speechSynthesis = {};
    window.speechSynthesis.speak = (u) => window.__spoke.push(String((u && u.text) || ''));
    window.speechSynthesis.cancel = () => {};
    window.speechSynthesis.getVoices = () => [];
  });

  // One navigation, straight to the whisper. The observer below is installed
  // with page.evaluate, so a second goto would wipe it — and `?debug=voice`
  // would be lost with it, which is what puts the reason inside the toast.
  await page.goto(`${BASE}/?w=${WHISPER.id}&debug=voice`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    const seen = new Set();
    new MutationObserver(() => {
      const toast = document.querySelector('#toast, .toast');
      const text = toast && toast.textContent;
      if (text && !seen.has(text)) {
        seen.add(text);
        window.__toasts.push(text);
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });

  const ok = page.locator('#notice-ok'); // first-visit notice covers everything
  if (await ok.isVisible().catch(() => false)) await ok.click();
  await page.locator('#notice-overlay').waitFor({ state: 'hidden' }).catch(() => {});

  // The whisper is already open — ?w= put it there. The name lookup that used
  // to be how this test reached it is gone: My Sky lists everything this device
  // wrote, so a box keyed on a public name had nothing left to do.
  await page.waitForSelector('#read-listen-btn', { state: 'visible' });
  await page.click('#read-listen-btn');
}

async function check(name, voiceHandler, verdict) {
  const browser = await chromium.launch({
    executablePath: browserPath(),
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  });
  try {
    const page = await browser.newPage();
    await openAndPressListen(page, voiceHandler);
    const { ok, spoke, toasts } = await verdict(page);
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
    console.log('      phone voice read:', JSON.stringify(spoke));
    console.log('      told the reader:', JSON.stringify(toasts));
    return ok;
  } finally {
    await browser.close();
  }
}

// The empty utterance is spoken inside the tap on purpose, to buy permission to
// speak later on iOS. Only real text counts as a second reader.
const realSpeech = (page) => page.evaluate(() => window.__spoke.filter(Boolean));

const results = [];

// Nothing ever played. The phone's voice SHOULD read it — this is the net.
results.push(
  await check(
    'endpoint fails before any sound  → phone voice reads it',
    (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"error":"tts_failed"}' }),
    async (page) => {
      await page
        .waitForFunction(() => window.__spoke.filter(Boolean).length > 0, { timeout: 8000 })
        .catch(() => {});
      const spoke = await realSpeech(page);
      return { ok: spoke.length === 1, spoke, toasts: await page.evaluate(() => window.__toasts) };
    }
  )
);

// The site's voice was already speaking. The phone's voice MUST NOT start the
// whisper again from the top — that is the "two voices in one reading" fault.
results.push(
  await check(
    'audio fails after it started     → reading stops, no second reader',
    (route) => route.fulfill({ status: 200, contentType: 'audio/wav', body: silentWav() }),
    async (page) => {
      await page.waitForFunction(
        () => window.__audio && !window.__audio.paused && window.__audio.currentTime > 0,
        { timeout: 8000 }
      );
      await page.evaluate(() => window.__audio.dispatchEvent(new Event('error')));
      await page.waitForTimeout(1500);
      const spoke = await realSpeech(page);
      const toasts = await page.evaluate(() => window.__toasts);
      return { ok: spoke.length === 0 && toasts.some((t) => /stopped partway|朗读中断/.test(t)), spoke, toasts };
    }
  )
);

const passed = results.every(Boolean);
console.log(passed ? '\nall passed' : '\nSOMETHING FAILED');
process.exit(passed ? 0 : 1);
