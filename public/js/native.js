// The parts of the phone a web page cannot reach on its own.
//
// Every function here works three ways: the Capacitor plugin when the App has
// it, the browser's own API when the web has one, and nothing at all when
// neither does. Nothing here is ever load-bearing — a missing haptic is a
// missing haptic, and the whisper is still read.
//
// This is also what makes the App an App rather than a website in a frame. The
// review guideline everyone quotes is about "minimal functionality"; a shell
// that only loads a URL is what gets rejected. Feeling the tap, sharing through
// the system sheet, keeping the secret in the keychain and drawing under the
// notch are the things a browser genuinely cannot do, and they are the reason
// the App is worth installing.

import { inApp } from './config.js';

function plugin(name) {
  const cap = typeof window !== 'undefined' ? window.Capacitor : null;
  return (cap && cap.Plugins && cap.Plugins[name]) || null;
}

// A short tick, for the moments that deserve one: a light left on a whisper, a
// whisper sent. Not on every tap — a phone that buzzes constantly is a phone
// somebody turns the haptics off on.
export function tap(style = 'light') {
  const haptics = plugin('Haptics');
  if (haptics && haptics.impact) {
    haptics.impact({ style: style.toUpperCase() }).catch(() => {});
    return;
  }
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    // Android web only; iOS Safari has no vibration API at all, which is part
    // of why this is worth having in the App.
    navigator.vibrate(style === 'heavy' ? 18 : 8);
  }
}

// The system share sheet, with a file. Capacitor's Share plugin needs a file on
// disk, and getting a Blob there means the Filesystem plugin — more moving
// parts than this is worth for now, so in the App we still go through
// navigator.share, which Capacitor's WebView supports for files. If that ever
// stops being true, this is the one function to change.
export async function share(payload) {
  if (navigator.canShare && payload.files && navigator.canShare({ files: payload.files })) {
    return navigator.share(payload);
  }
  const sharePlugin = plugin('Share');
  if (sharePlugin && sharePlugin.share) {
    return sharePlugin.share({ text: payload.text, url: payload.url, title: payload.title });
  }
  if (navigator.share) return navigator.share({ text: payload.text, url: payload.url });
  throw new Error('no share');
}

// Dark status bar text on a dark sky, and content allowed to sit under it —
// the sky is the whole point, so it should reach the top of the screen rather
// than stopping at a grey bar.
export async function dressWindow() {
  const bar = plugin('StatusBar');
  if (!bar) return;
  try {
    if (bar.setStyle) await bar.setStyle({ style: 'DARK' });
    if (bar.setOverlaysWebView) await bar.setOverlaysWebView({ overlay: true });
    if (bar.setBackgroundColor) await bar.setBackgroundColor({ color: '#00000000' });
  } catch {
    /* a status bar that will not be styled is not a reason to fail */
  }
}

// Android's hardware back button. Without this it closes the App from any
// screen, including with a whisper open, which reads as a crash. Web has its
// own history and needs none of this.
export function onBackButton(handler) {
  const cap = typeof window !== 'undefined' ? window.Capacitor : null;
  if (!cap || !cap.Plugins || !cap.Plugins.App) return;
  cap.Plugins.App.addListener('backButton', ({ canGoBack }) => handler(canGoBack));
}

export { inApp };
