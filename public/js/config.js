// Where the API lives, from wherever this page is running.
//
// On the website the answer is "here", and a relative path is right. Inside the
// App it is not: the pages are files on the phone, served from
// `capacitor://localhost` (iOS) or `http://localhost` (Android), so `/api/...`
// resolves to the app bundle and finds nothing. Same code, same files, two
// different homes — this is the one place that knows the difference.
//
// It is also why the API needs CORS (see functions/_middleware.js): from inside
// the App every call is cross-origin by definition.

const SITE = 'https://cubewithin.com';

// Capacitor announces itself on the window object before any of our code runs.
// The origin check is the belt to that braces: a WebView pointed at
// capacitor://localhost is in the App even if the bridge has not attached yet.
export function inApp() {
  if (typeof window === 'undefined') return false;
  if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
    return true;
  }
  return /^capacitor:/.test(location.protocol);
}

// The App is allowed to point somewhere else — a staging deploy, a preview
// branch — without a rebuild, by setting window.AYA_API before the bundle
// loads. Nothing does that yet; it exists so that testing the App against a
// preview does not mean editing this file and shipping the edit by accident.
export function apiBase() {
  if (typeof window !== 'undefined' && window.AYA_API) return String(window.AYA_API).replace(/\/+$/, '');
  return inApp() ? SITE : '';
}

// Everything the front end fetches goes through here. Relative on the web (so
// previews, custom domains and local dev all keep working with no config), and
// absolute in the App.
export function url(path) {
  const p = String(path || '');
  if (/^https?:/i.test(p)) return p;
  return apiBase() + (p.startsWith('/') ? p : `/${p}`);
}
