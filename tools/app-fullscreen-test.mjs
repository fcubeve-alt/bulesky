// The App fills the glass. All four edges, both platforms.
//
// This is the counterpart to the sky checks in tools/sky-feedback-test.mjs.
// Those open the page in a browser and measure it; they passed while the App
// still showed a band, because the band was never the page's fault — it was the
// native window the page was put inside. A WebView laid out between the status
// bar and the navigation bar leaves a strip of window background at each end,
// and no CSS can reach it.
//
// Nothing here needs a simulator, a device, or a build. Every one of these is a
// line in a config file that somebody can helpfully "clean up" — Capacitor's own
// scaffold ships two of them set the wrong way — and the next time anyone would
// find out is a screenshot from a phone. So they are asserted as text.
//
//   node tools/app-fullscreen-test.mjs

import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` (${detail})` : ''}`);
}

// ---- the one colour ---------------------------------------------------------
// Four surfaces can be seen before or behind the WebView: the canvas <html>
// paints, the native window background on each platform, and the splash. If any
// of them disagrees, the disagreement IS a visible band — the same symptom,
// caused by a colour rather than a layout.
const css = read('public/css/style.css');
const SKY = (css.match(/html\s*{\s*background-color:\s*(#[0-9a-f]{6})/i) || [])[1];
check('the page names one colour for the canvas behind everything', !!SKY, SKY);

const cap = JSON.parse(read('app/capacitor.config.json'));
const androidColors = read('app/android/app/src/main/res/values/colors.xml');
const nativeColors = {
  'iOS window': cap.ios?.backgroundColor,
  'Android window': cap.android?.backgroundColor,
  'splash screen': cap.plugins?.SplashScreen?.backgroundColor,
  'Android theme': (androidColors.match(/name="skyBackground">\s*(#[0-9a-f]{6})/i) || [])[1],
};
const mismatched = Object.entries(nativeColors).filter(
  ([, v]) => (v || '').toLowerCase() !== (SKY || '').toLowerCase()
);
check(
  'and every native surface behind it is that same colour',
  SKY && mismatched.length === 0,
  mismatched.length ? mismatched.map(([k, v]) => `${k}=${v}`).join(', ') : SKY
);

// ---- iOS --------------------------------------------------------------------
// contentInset: "always" is what Capacitor's scaffold ships, and it tells
// WKWebView to inset its content by the safe areas. That is the band, on iOS,
// exactly: the page is pushed clear of the notch and the home indicator and the
// window's own colour fills what is left. "never" hands the page the whole
// screen; the buttons stay clear of the bars on their own, with
// env(safe-area-inset-*).
check(
  'iOS hands the WebView the whole screen, insets and all',
  cap.ios?.contentInset === 'never',
  `contentInset=${cap.ios?.contentInset}`
);

const plist = read('app/ios/App/App/Info.plist');
// With the sky under the clock and the battery, the glyphs have to be light.
// Left view-controller-based, the one view controller is Capacitor's and it asks
// for the dark default — black on a night sky.
check(
  'and the status bar glyphs are light, so they can be seen on the sky',
  /<key>UIViewControllerBasedStatusBarAppearance<\/key>\s*<false\/>/.test(plist) &&
    /UIStatusBarStyleLightContent/.test(plist),
  'UIStatusBarStyleLightContent'
);

const launch = read('app/ios/App/App/Base.lproj/LaunchScreen.storyboard');
// The launch screen is the first thing drawn, before any of our code. White
// there is a white flash at the edges of the splash art.
check(
  'the launch screen is not white behind the splash',
  !/systemBackgroundColor/.test(launch) && /key="backgroundColor"/.test(launch)
);

// ---- Android ----------------------------------------------------------------
// Three separate things, and the band comes back if any one of them goes.
const styles = read('app/android/app/src/main/res/values/styles.xml');
const theme = (styles.match(/<style name="AppTheme\.NoActionBar"[\s\S]*?<\/style>/) || [''])[0];
check(
  'Android paints no colour into the status or navigation bar',
  /android:statusBarColor">@android:color\/transparent/.test(theme) &&
    /android:navigationBarColor">@android:color\/transparent/.test(theme) &&
    /android:windowDrawsSystemBarBackgrounds">true/.test(theme)
);

const main = read('app/android/app/src/main/java/com/cubewithin/areyoualright/MainActivity.java');
// Transparent bars alone only reveal the window background underneath: the
// WebView is still laid out inside them until this call says otherwise.
check(
  'and lays the WebView out behind them rather than between them',
  /setDecorFitsSystemWindows\(\s*getWindow\(\)\s*,\s*false\s*\)/.test(main)
);

const v27 = read('app/android/app/src/main/res/values-v27/styles.xml');
// Without shortEdges a phone with a notch letterboxes the window below it —
// the same band, at the other end of the screen.
check(
  'and reaches into the notch instead of being letterboxed under it',
  /android:windowLayoutInDisplayCutoutMode">shortEdges/.test(v27)
);

// ---- the page's own half ----------------------------------------------------
// Both platforms above hand the page the full screen. viewport-fit=cover is what
// makes the page willing to take it — and what gives it the insets it needs to
// keep the buttons off the notch and the home indicator.
const index = read('public/index.html');
check(
  'and the page asks for the whole screen, with the insets to place buttons by',
  /viewport-fit=cover/.test(index) && /safe-area-inset-top/.test(css)
);

const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\n${failed.length} failed` : '\nall passed');
process.exit(failed.length ? 1 : 0);
