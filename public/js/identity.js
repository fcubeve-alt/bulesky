// The one secret this device keeps.
//
// It is what makes "delete my whisper" possible without accounts, e-mail or
// anyone learning who the writer is. Generated once, on the first thing you
// write, and used for everything you write afterwards — so a person has one
// recovery code, not one per whisper.
//
// Two values leave this file and they are not interchangeable:
//
//   secret()   the thing that grants control. Sent only when publishing or
//              deleting. Never in a URL, never on an ordinary read.
//   hash()     SHA-256 of it. Sent on reads so the server can answer "is this
//              yours"; worth nothing to anyone who intercepts it.
//
// Storage goes through one pair of functions on purpose. In the App this moves
// to Capacitor Preferences (and eventually the Keychain), which is a change in
// two lines here rather than everywhere the secret is used.
const KEY = 'aya_author_secret';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const SECRET_LEN = 20;

function load() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function save(value) {
  try {
    localStorage.setItem(KEY, value);
    return true;
  } catch {
    // Private mode, or storage turned off. Publishing still works — the
    // whisper simply will not be deletable, which is exactly what the old
    // behaviour was for everyone.
    return false;
  }
}

function mint() {
  const bytes = new Uint8Array(SECRET_LEN);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
}

// Created on first use rather than on first visit: someone who only ever reads
// the sky should not be given an identity they never asked for.
export function secret() {
  const existing = load();
  if (existing) return existing;
  const fresh = mint();
  return save(fresh) ? fresh : null;
}

// Whether this device has ever written anything. Read-only — asking must not
// bring an identity into existence.
export function hasSecret() {
  return Boolean(load());
}

let cachedHash = null;
let cachedFor = null;

export async function hash() {
  const s = load();
  if (!s) return null;
  if (cachedFor === s) return cachedHash;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  cachedHash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  cachedFor = s;
  return cachedHash;
}

// The name you are known by here.
//
// This is NOT the secret above and does not protect anything — it is a byline,
// the thing printed under your words so a stranger reading them at two in the
// morning is reading a person rather than a row in a table. It used to double
// as the way back to your own whispers, which is why the interface called it a
// 暗号 (a passphrase) and told you to remember it. My Sky answers that now, and
// looking anyone up by name is gone, so the name has exactly one job left.
//
// ONE STORE, ONE NAME. Asked for once, on the first thing you write, and from
// then on shown rather than asked — the compose sheet says "as 夜里的猫" instead
// of holding out an empty box. Changing it is possible, but from My Sky, which
// is a deliberate act rather than something that happens because a field was
// sitting there at two in the morning.
//
// ⚠️ It is one store, NOT one phone, and the difference is the whole caveat.
// localStorage is scoped to one browser profile on one origin. The same phone
// therefore holds a separate identity in Safari, another in Chrome, another in
// every private window, and another again in a page added to the home screen —
// each of them empty, each asking for a name, each becoming a new "person" in
// the numbers. One person can hold ten without meaning to.
//
// Nothing here can join them up. What could — canvas/font fingerprinting and
// friends — is exactly what this site promises not to do, and would not survive
// App Store review either. So the site does three things instead: it offers to
// carry an existing identity across at the moment a new one would be minted
// (the line under the name box on the first whisper), it lets a recovery code
// merge them back down at any time, and it reports the count honestly as an
// upper bound rather than as people (functions/api/admin/stats.js).
//
// Inside the App this really is one device: one WebView, one store, no private
// windows. That is a reason the App matters beyond distribution.
const NAME_KEY = 'aya_author_name';

// Whether this device has settled on a name yet. One phone, one name: it is
// asked for once, on the first thing you write, and after that the interface
// shows it rather than asking again.
export function hasName() {
  return Boolean(displayName());
}

export function displayName() {
  try {
    return localStorage.getItem(NAME_KEY) || '';
  } catch {
    return '';
  }
}

export function rememberName(value) {
  const s = String(value || '').trim().slice(0, 25);
  if (!s) return;
  try {
    localStorage.setItem(NAME_KEY, s);
  } catch {
    /* private mode: the name simply is not remembered next time */
  }
}

// Grouped for reading off a screen and typing into another device.
export function recoveryCode() {
  const s = load();
  return s ? s.replace(/(.{5})(?=.)/g, '$1-') : null;
}

// Carry an identity over from another device. Same normalisation as the
// server: people paste with spaces, lower case, and O/0 and I/1 confused.
export function adopt(input) {
  const s = String(input || '')
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (s.length !== SECRET_LEN || ![...s].every((c) => ALPHABET.includes(c))) return false;
  cachedHash = null;
  cachedFor = null;
  return save(s);
}
