// The App cannot talk to the site without these headers, and the admin API
// must never gain them. Both are one-line mistakes, and neither shows up until
// somebody is holding a phone — so they are checked here instead.
//
//   node tools/cors-test.mjs
import { onRequest } from '../functions/_middleware.js';

const ok = new Response('{}', { headers: { 'content-type': 'application/json' } });
const next = async () => ok.clone();

async function call(method, url, origin) {
  const request = new Request(url, { method, headers: origin ? { origin } : {} });
  return onRequest({ request, next });
}

const results = [];
function check(name, pass, detail = '') {
  results.push(pass);
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` (${detail})` : ''}`);
}

const APP = 'capacitor://localhost';
const SITE = 'https://cubewithin.com';

// The preflight browsers send before every publish, delete, and any read
// carrying x-author.
const pre = await call('OPTIONS', `${SITE}/api/bubbles`, APP);
check('preflight from the App is allowed', pre.headers.get('access-control-allow-origin') === APP);
check(
  'preflight permits the header the identity check rides on',
  (pre.headers.get('access-control-allow-headers') || '').includes('x-author')
);
check(
  'preflight permits DELETE',
  (pre.headers.get('access-control-allow-methods') || '').includes('DELETE')
);

const get = await call('GET', `${SITE}/api/bubbles?limit=40`, APP);
check('ordinary calls from the App are allowed', get.headers.get('access-control-allow-origin') === APP);
check('and say so to caches', (get.headers.get('vary') || '').toLowerCase().includes('origin'));

const evil = await call('GET', `${SITE}/api/bubbles`, 'https://not-us.example');
check('another site gets nothing', evil.headers.get('access-control-allow-origin') === null);

const adminPre = await call('OPTIONS', `${SITE}/api/admin/reports`, APP);
check('the moderation queue refuses even the App', adminPre.headers.get('access-control-allow-origin') === null);

const adminGet = await call('GET', `${SITE}/api/admin/reports`, APP);
check('…on real calls too', adminGet.headers.get('access-control-allow-origin') === null);

const plain = await call('GET', `${SITE}/api/bubbles`, null);
check('a same-origin call is untouched', plain.status === 200 && plain.headers.get('access-control-allow-origin') === null);

const passed = results.every(Boolean);
console.log(passed ? '\nall passed' : '\nSOMETHING FAILED');
process.exit(passed ? 0 : 1);
