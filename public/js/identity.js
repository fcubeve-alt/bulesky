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
