// Drives the real routes against a real database, like smoke.test.js — except
// these write, so they go to a separate mjolnir_test database and delete what
// they create rather than touching the shared Atlas data.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import bcrypt from 'bcryptjs';

import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { EmailToken, User } from '#models/index.js';

import { createApp } from '../src/app.js';
import { prehash } from '../src/features/auth/password.js';
import { createMailRecorder, tokenFrom } from './helpers/accounts.js';

const TEST_DB = 'mjolnir_test';
const PASSWORD = 'correct horse battery';
const NAME = 'Somchai Test';

// Random per process, not time-based: test files run in parallel, and two
// people can run the suite against the same cluster at once.
const runId = crypto.randomUUID().slice(0, 8);
const emailFor = (name) => `${name}-${runId}@example.test`;

// The limiters get their own file. Here they are set far out of the way, so
// that adding a test to this one can never turn CI red with a surprise 429 —
// and so the production numbers stay chosen for production.
const UNLIMITED = { windowMs: 60_000, limit: 10_000 };
const NO_RATE_LIMITS = {
  loginByIp: UNLIMITED,
  loginByEmail: UNLIMITED,
  registerByIp: UNLIMITED,
  registerByEmail: UNLIMITED,
  verifyByIp: UNLIMITED,
};

// What would have been emailed: the confirm links these tests open
const mail = createMailRecorder();

let server;
let baseUrl;

before(async () => {
  await connectDatabase({ dbName: TEST_DB });

  server = createApp({ rateLimits: NO_RATE_LIMITS, mail }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));

  baseUrl = `http://localhost:${server.address().port}`;
});

after(async () => {
  await User.deleteMany({ email: new RegExp(`-${runId}@example\\.test$`) });
  await EmailToken.deleteMany({ email: new RegExp(`-${runId}@example\\.test$`) });

  await new Promise((resolve) => server.close(resolve));
  await disconnectDatabase();
});

function send(method, path, { body, cookie } = {}) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// fetch keeps no cookie jar, so the session is carried between requests by hand.
function sessionCookie(response) {
  const header = response.headers.getSetCookie().find((c) => c.startsWith('mjolnir_session='));
  return header ? header.split(';')[0] : null;
}

/**
 * Signing up as a person does (0041): register, open the emailed link, type
 * the password again. Returns the confirmation's response, which signs in.
 */
async function signUp({ email, password = PASSWORD, name = NAME, notificationConsent } = {}) {
  const address = email.trim().toLowerCase();
  const before = mail.to(address).length;
  const registered = await send('POST', '/api/auth/register', { body: { email, password, name, notificationConsent } });
  assert.equal(registered.status, 202, 'registering answers 202 and nothing more');
  const message = await mail.waitFor(address, { count: before + 1 });
  const confirmed = await send('POST', '/api/auth/verify-email', { body: { token: tokenFrom(message), password } });
  assert.equal(confirmed.status, 200, 'the emailed link, with the password, signs in');
  return confirmed;
}

test('confirming creates the account, signs you in, and never returns the hash', async () => {
  const email = emailFor('signup');

  const response = await signUp({ email, notificationConsent: true });

  const { user } = await response.json();
  assert.equal(user.email, email);
  assert.equal(user.notificationConsent, true);
  assert.equal(user.passwordHash, undefined, 'the hash must never reach the client');
  assert.ok(user.id);

  const setCookie = response.headers.getSetCookie().find((c) => c.startsWith('mjolnir_session='));
  assert.ok(setCookie, 'confirming should sign you in');
  assert.match(setCookie, /HttpOnly/i, 'a session a script can read is a session an XSS can steal');
});

test('an address is normalized, so casing cannot open a second account', async () => {
  const email = emailFor('casing');

  const created = await signUp({ email: `  ${email.toUpperCase()}  ` });
  assert.equal((await created.json()).user.email, email);

  // The address is taken: the same 202, and its owner is told instead of a link
  const again = await send('POST', '/api/auth/register', {
    body: { email, password: PASSWORD, name: NAME },
  });
  assert.equal(again.status, 202);
  const told = await mail.waitFor(email, { count: 2 });
  assert.equal(tokenFrom(told), null, 'no link for an address that has an account');
  assert.equal(await User.countDocuments({ email }), 1);

  // Consent defaults to off. FR08 mails the people who asked to be mailed.
  const stored = await User.findOne({ email });
  assert.equal(stored.notificationConsent, false);
});

test('a bad password is refused per field, and writes nothing', async () => {
  const email = emailFor('weak');

  const response = await send('POST', '/api/auth/register', {
    body: { email, password: 'short', name: NAME },
  });

  assert.equal(response.status, 400);

  const { error } = await response.json();
  assert.match(error.details.password, /อย่างน้อย 8/);
  assert.equal(error.details.email, undefined, 'a valid field should not be reported as an error');

  assert.equal(await User.countDocuments({ email }), 0);
});

test('a 64-character Thai password registers and signs in (V6.2.9)', async () => {
  // 192 bytes: refused while the ceiling was bcrypt's 72
  const email = emailFor('thai-password');
  const password = 'กขคง'.repeat(16);

  await signUp({ email, password });

  const login = await send('POST', '/api/auth/login', { body: { email, password } });
  assert.equal(login.status, 200);
});

test('the password ceiling is 128 characters, counted as characters, not bytes', async () => {
  const at = await send('POST', '/api/auth/register', {
    body: { email: emailFor('pw-128'), password: 'ก'.repeat(128), name: NAME },
  });
  assert.equal(at.status, 202, '128 Thai characters is 384 bytes and must be accepted');

  // Four bytes and two UTF-16 units each, but one character to the person typing
  const emoji = await send('POST', '/api/auth/register', {
    body: { email: emailFor('pw-emoji'), password: '🔒'.repeat(128), name: NAME },
  });
  assert.equal(emoji.status, 202, 'an emoji counts once');

  const over = await send('POST', '/api/auth/register', {
    body: { email: emailFor('pw-129'), password: 'ก'.repeat(129), name: NAME },
  });
  assert.equal(over.status, 400);
  assert.match((await over.json()).error.details.password, /128 ตัวอักษร/);
  assert.equal(await EmailToken.countDocuments({ email: emailFor('pw-129') }), 0, 'nothing is held for a refused one');
});

test('a password is used in full, even past bcrypt’s 72 bytes', async () => {
  // bcrypt alone would see only the 72 shared bytes, and let the second one in
  const email = emailFor('no-truncation');
  const password = `${'a'.repeat(72)}X`;

  await signUp({ email, password }); // 73 bytes, refused before the pepper

  const nearly = await send('POST', '/api/auth/login', { body: { email, password: `${'a'.repeat(72)}Y` } });
  assert.equal(nearly.status, 401, 'only the last character differs, and that has to count');

  const right = await send('POST', '/api/auth/login', { body: { email, password } });
  assert.equal(right.status, 200);
});

test('the stored hash is bcrypt of the peppered password, never of the password itself', async () => {
  const email = emailFor('peppered');
  await signUp({ email });

  const { passwordHash } = await User.findOne({ email }).select('+passwordHash');
  assert.match(passwordHash, /^\$2b\$12\$/, 'bcrypt, cost 12');
  assert.equal(await bcrypt.compare(PASSWORD, passwordHash), false, 'the raw password must not match');
  assert.equal(await bcrypt.compare(prehash(PASSWORD), passwordHash), true);
});

test('signing in needs the right password, and says no more than that', async () => {
  const email = emailFor('login');
  await signUp({ email });

  const wrong = await send('POST', '/api/auth/login', { body: { email, password: `${PASSWORD}!` } });
  assert.equal(wrong.status, 401);

  const missing = await send('POST', '/api/auth/login', {
    body: { email: emailFor('never-registered'), password: PASSWORD },
  });
  assert.equal(missing.status, 401);

  assert.equal(
    (await wrong.json()).error.message,
    (await missing.json()).error.message,
    'a different message for a missing account tells anyone who asks which addresses are registered',
  );

  const right = await send('POST', '/api/auth/login', { body: { email, password: PASSWORD } });
  assert.equal(right.status, 200);
  assert.ok(sessionCookie(right));
});

test('/api/auth/me is closed without a session and open with one, and logout closes it', async () => {
  const email = emailFor('session');
  const cookie = sessionCookie(await signUp({ email }));

  const anonymous = await send('GET', '/api/auth/me');
  assert.equal(anonymous.status, 401);

  const authenticated = await send('GET', '/api/auth/me', { cookie });
  assert.equal(authenticated.status, 200);
  assert.equal((await authenticated.json()).user.email, email);

  const forged = await send('GET', '/api/auth/me', { cookie: 'mjolnir_session=not.a.token' });
  assert.equal(forged.status, 401, 'an unsigned token must not pass');

  const loggedOut = await send('POST', '/api/auth/logout', { cookie });
  assert.equal(loggedOut.status, 204);
  assert.match(
    loggedOut.headers.getSetCookie().find((c) => c.startsWith('mjolnir_session=')),
    /Expires=Thu, 01 Jan 1970|Max-Age=0/,
    'logout has to actually clear the cookie, not just answer 204',
  );
});

test('a deleted account cannot keep using a token that is still valid', async () => {
  const email = emailFor('deleted');
  const cookie = sessionCookie(await signUp({ email }));

  await User.deleteOne({ email });

  const response = await send('GET', '/api/auth/me', { cookie });
  assert.equal(response.status, 401);
});

test('the hash stays out of an ordinary query, and a partial document still saves', async () => {
  const email = emailFor('projection');
  await signUp({ email });

  const user = await User.findOne({ email });
  assert.equal(user.passwordHash, undefined, 'select: false should hold on a plain find');

  // required plus select: false is a known Mongoose trap. If validation ran on
  // the unselected path, this save would fail, or drop the hash.
  user.notificationConsent = false;
  await user.save();

  const reloaded = await User.findOne({ email }).select('+passwordHash');
  assert.match(reloaded.passwordHash, /^\$2[aby]\$/, 'the hash must survive a partial save');
});

test('registering needs a name, and reports it beside every other bad field', async () => {
  const missing = await send('POST', '/api/auth/register', {
    body: { email: emailFor('noname'), password: PASSWORD },
  });
  assert.equal(missing.status, 400);
  assert.match((await missing.json()).error.details.name, /กรุณากรอกชื่อ/);

  // One 400 carrying both, not the first failure it happens to reach. The
  // validation split is the easiest way to lose this property.
  const both = await send('POST', '/api/auth/register', {
    body: { email: emailFor('bothbad'), password: 'short', name: '   ' },
  });
  assert.equal(both.status, 400);

  const { error } = await both.json();
  assert.match(error.details.name, /กรุณากรอกชื่อ/);
  assert.match(error.details.password, /อย่างน้อย 8/);
  assert.equal(error.details.email, undefined, 'a valid field should not be reported');
});

test('a name past 80 characters is refused by length, not by bytes', async () => {
  // Thai is three bytes a character. A byte ceiling here would stop this at
  // about 26, so this has to pass.
  const thai = 'ก'.repeat(80);
  const ok = await signUp({ email: emailFor('thainame'), name: thai }); // 240 bytes, still accepted
  assert.equal((await ok.json()).user.name, thai);

  const tooLong = await send('POST', '/api/auth/register', {
    body: { email: emailFor('longname'), password: PASSWORD, name: 'a'.repeat(81) },
  });
  assert.equal(tooLong.status, 400);
  assert.match((await tooLong.json()).error.details.name, /80/);
});

// The direct regression guard for the validation split: parseCredentials is
// shared, so a name check added to it would 400 every login in the product.
test('signing in still works with no name in the body', async () => {
  const email = emailFor('loginnoname');
  await signUp({ email });

  const response = await send('POST', '/api/auth/login', { body: { email, password: PASSWORD } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).user.name, NAME);
});

test('the name is trimmed on the way in and comes back from /me, with a role', async () => {
  const email = emailFor('trimmed');
  const registered = await signUp({ email, name: `  ${NAME}  ` });

  const me = await send('GET', '/api/auth/me', { cookie: sessionCookie(registered) });
  const { user } = await me.json();

  assert.equal(user.name, NAME, 'trimmed, or the shell renders padded whitespace');
  // requireRole reads this. Without it on the public shape every admin is
  // silently forbidden, and nothing else in the suite would notice.
  assert.equal(user.role, 'user', 'a fresh account is never an admin');
  assert.equal(user.passwordHash, undefined);
  assert.equal(user.googleId, undefined);
});

test('security hardening: X-Powered-By is disabled, session TTL is 24 hours, and private routes set anti-caching headers', async () => {
  // 1. ASVS V13.4.6: X-Powered-By must not be advertised
  const rootRes = await send('GET', '/');
  assert.equal(rootRes.headers.get('x-powered-by'), null, 'X-Powered-By must be disabled');

  // 2. SRS NFR-11, ASVS V7.1.1, V7.3.2: Session TTL must be 24 hours (86400 seconds)
  const email = emailFor('sec-ttl');
  const loginRes = await signUp({ email });
  const setCookie = loginRes.headers.getSetCookie().find((c) => c.startsWith('mjolnir_session='));
  assert.ok(setCookie);
  assert.match(setCookie, /Max-Age=86400/i, 'Session cookie Max-Age must be 86400s (24h)');

  // 3. ASVS V14.3.2, V14.2.2: Authenticated responses must not be cached by browsers/proxies
  const meRes = await send('GET', '/api/auth/me', { cookie: sessionCookie(loginRes) });
  assert.equal(meRes.status, 200);
  const cacheControl = meRes.headers.get('cache-control') || '';
  assert.match(cacheControl, /no-store/i, 'Cache-Control must contain no-store');
  assert.match(cacheControl, /no-cache/i, 'Cache-Control must contain no-cache');
  assert.equal(meRes.headers.get('pragma'), 'no-cache', 'Pragma must be no-cache');
});

test('security hardening: security headers, 50kb body limit, Clear-Site-Data and token versioning on logout', async () => {
  // 1. ASVS V3.2, V3.4, V3.5, V13.4, V14.3, V15.2: Core security headers present globally
  const rootRes = await send('GET', '/');
  assert.equal(rootRes.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(rootRes.headers.get('x-frame-options'), 'DENY');
  assert.equal(rootRes.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  assert.equal(rootRes.headers.get('content-security-policy'), "default-src 'none'; frame-ancestors 'none'");
  assert.equal(rootRes.headers.get('cross-origin-resource-policy'), 'same-site');
  assert.equal(rootRes.headers.get('cross-origin-opener-policy'), 'same-origin-allow-popups');

  // 2. ASVS V13.1.3, V15.2.2: Body size limit enforces 50kb ceiling
  const oversizedEmail = emailFor('oversized');
  const hugePayload = {
    email: oversizedEmail,
    password: PASSWORD,
    name: 'A'.repeat(55 * 1024), // 55 KB
  };
  const oversizedRes = await send('POST', '/api/auth/register', { body: hugePayload });
  assert.equal(oversizedRes.status, 413, 'payloads exceeding 50kb must be rejected with 413');

  // 3. ASVS V7.4.1, V14.3.1: Token Versioning & Clear-Site-Data on logout
  const email = emailFor('tokenversion');
  const cookie = sessionCookie(await signUp({ email }));

  // Authenticated call succeeds before logout
  const meBefore = await send('GET', '/api/auth/me', { cookie });
  assert.equal(meBefore.status, 200);

  // Logout responds with 204 and Clear-Site-Data header
  const logoutRes = await send('POST', '/api/auth/logout', { cookie });
  assert.equal(logoutRes.status, 204);
  assert.match(logoutRes.headers.get('clear-site-data') || '', /"storage"/);

  // Replaying the old cookie after logout MUST return 401 because tokenVersion incremented
  const meAfter = await send('GET', '/api/auth/me', { cookie });
  assert.equal(meAfter.status, 401, 'stolen or replayed JWT after logout must be rejected');
});
