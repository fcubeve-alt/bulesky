// Proving you wrote something, without asking who you are.
//
// There are no accounts here and there will not be: an email address is the
// first thing that makes signing up complicated, and asking for one while
// calling the product anonymous contradicts itself. So authorship is a secret
// the writer's device holds, and the server only ever stores its hash.
//
//   publish        client sends the secret once, server stores SHA-256(secret)
//   "is this mine" client sends the HASH — enough to compare, useless to steal
//   delete         client sends the secret, server hashes and compares
//
// The split matters. A hash travels on ordinary reads, so it must not be worth
// anything on its own; the secret travels only when something is being changed.
// Neither is a password to a person — nobody can be looked up by it, and two
// whispers by the same writer are only linkable by someone who already has the
// hash, which is the writer.
//
// Losing the secret means losing the ability to delete. That is the real cost
// of having no accounts, and the interface says so plainly rather than quietly
// hoping nobody clears their browser.

// Crockford's alphabet: no I, L, O or U, so nothing in a recovery code can be
// misread as something else when it is copied by hand off a screen.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const SECRET_LEN = 20; // 20 × 5 bits = 100 bits

export function newSecret() {
  const bytes = new Uint8Array(SECRET_LEN);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
}

// Accept what a human might actually paste: spaces, dashes, lower case, and
// the three letters people substitute for digits when reading a code aloud.
export function cleanSecret(input) {
  const s = String(input || '')
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (s.length !== SECRET_LEN) return null;
  return [...s].every((c) => ALPHABET.includes(c)) ? s : null;
}

export async function hashSecret(secret) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(secret)));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// A hash as it arrives from a client: 64 hex characters or nothing. Anything
// else is not worth a database round trip.
export function cleanHash(input) {
  const s = String(input || '').trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(s) ? s : null;
}

// Whether this request may change that row.
//
// A row with no author_hash is one written before any of this existed. It
// cannot be claimed by presenting a secret — otherwise the first person to
// guess at an old whisper could take it over and delete it, which is worse than
// the gap it would close. Those stay removable by the site owner only.
export function ownsRow(row, hash) {
  return Boolean(hash && row && row.author_hash && row.author_hash === hash);
}
