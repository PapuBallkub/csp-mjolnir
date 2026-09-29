// Drives the real routes against a real database, like smoke.test.js — except
// these write, so they go to a separate mjolnir_test database and delete what
// they create rather than touching the shared Atlas data.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { User } from '#models/index.js';

import { createApp } from '../src/app.js';

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
};

let server;
let baseUrl;

before(async () => {
  await connectDatabase({ dbName: TEST_DB });

  server = createApp({ rateLimits: NO_RATE_LIMITS }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));

  baseUrl = `http://localhost:${server.address().port}`;
});

after(async () => {
  await User.deleteMany({ email: new RegExp(`-${runId}@example\\.test$`) });

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

test('registering creates the account, signs you in, and never returns the hash', async () => {
  const email = emailFor('signup');

  const response = await send('POST', '/api/auth/register', {
    body: { email, password: PASSWORD, name: NAME, notificationConsent: true },
  });

  assert.equal(response.status, 201);

  const { user } = await response.json();
  assert.equal(user.email, email);
  assert.equal(user.notificationConsent, true);
  assert.equal(user.passwordHash, undefined, 'the hash must never reach the client');
  assert.ok(user.id);

  const setCookie = response.headers.getSetCookie().find((c) => c.startsWith('mjolnir_session='));
  assert.ok(setCookie, 'registering should sign you in');
  assert.match(setCookie, /HttpOnly/i, 'a session a script can read is a session an XSS can steal');
});

test('an address is normalized, so casing cannot open a second account', async () => {
  const email = emailFor('casing');

  const created = await send('POST', '/api/auth/register', {
    body: { email: `  ${email.toUpperCase()}  `, password: PASSWORD, name: NAME },
  });
  assert.equal(created.status, 201);
  assert.equal((await created.json()).user.email, email);

  const duplicate = await send('POST', '/api/auth/register', {
    body: { email, password: PASSWORD, name: NAME },
  });
  assert.equal(duplicate.status, 409);

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
  assert.match(error.details.password, /at least 8/);
  assert.equal(error.details.email, undefined, 'a valid field should not be reported as an error');

  assert.equal(await User.countDocuments({ email }), 0);
});

test('a password past the bcrypt 72-byte ceiling is refused, not truncated', async () => {
  const response = await send('POST', '/api/auth/register', {
    body: { email: emailFor('long'), password: 'a'.repeat(73), name: NAME },
  });

  assert.equal(response.status, 400);
  assert.match((await response.json()).error.details.password, /72 bytes/);
});

test('signing in needs the right password, and says no more than that', async () => {
  const email = emailFor('login');
  await send('POST', '/api/auth/register', { body: { email, password: PASSWORD, name: NAME } });

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
  const registered = await send('POST', '/api/auth/register', { body: { email, password: PASSWORD, name: NAME } });
  const cookie = sessionCookie(registered);

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
  const registered = await send('POST', '/api/auth/register', { body: { email, password: PASSWORD, name: NAME } });
  const cookie = sessionCookie(registered);

  await User.deleteOne({ email });

  const response = await send('GET', '/api/auth/me', { cookie });
  assert.equal(response.status, 401);
});

test('the hash stays out of an ordinary query, and a partial document still saves', async () => {
  const email = emailFor('projection');
  await send('POST', '/api/auth/register', { body: { email, password: PASSWORD, name: NAME } });

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
  assert.match((await missing.json()).error.details.name, /name is required/i);

  // One 400 carrying both, not the first failure it happens to reach. The
  // validation split is the easiest way to lose this property.
  const both = await send('POST', '/api/auth/register', {
    body: { email: emailFor('bothbad'), password: 'short', name: '   ' },
  });
  assert.equal(both.status, 400);

  const { error } = await both.json();
  assert.match(error.details.name, /name is required/i);
  assert.match(error.details.password, /at least 8/);
  assert.equal(error.details.email, undefined, 'a valid field should not be reported');
});

test('a name past 80 characters is refused by length, not by bytes', async () => {
  // Thai is three bytes a character. A byte ceiling here — the rule bcrypt
  // forces on passwords — would stop this at about 26, so this has to pass.
  const thai = 'ก'.repeat(80);
  const ok = await send('POST', '/api/auth/register', {
    body: { email: emailFor('thainame'), password: PASSWORD, name: thai },
  });
  assert.equal(ok.status, 201, '80 Thai characters is 240 bytes and must still be accepted');
  assert.equal((await ok.json()).user.name, thai);

  const tooLong = await send('POST', '/api/auth/register', {
    body: { email: emailFor('longname'), password: PASSWORD, name: 'a'.repeat(81) },
  });
  assert.equal(tooLong.status, 400);
  assert.match((await tooLong.json()).error.details.name, /at most 80/);
});

// The direct regression guard for the validation split: parseCredentials is
// shared, so a name check added to it would 400 every login in the product.
test('signing in still works with no name in the body', async () => {
  const email = emailFor('loginnoname');
  await send('POST', '/api/auth/register', { body: { email, password: PASSWORD, name: NAME } });

  const response = await send('POST', '/api/auth/login', { body: { email, password: PASSWORD } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).user.name, NAME);
});

test('the name is trimmed on the way in and comes back from /me, with a role', async () => {
  const email = emailFor('trimmed');
  const registered = await send('POST', '/api/auth/register', {
    body: { email, password: PASSWORD, name: `  ${NAME}  ` },
  });
  assert.equal(registered.status, 201);

  const me = await send('GET', '/api/auth/me', { cookie: sessionCookie(registered) });
  const { user } = await me.json();

  assert.equal(user.name, NAME, 'trimmed, or the shell renders padded whitespace');
  // requireRole reads this. Without it on the public shape every admin is
  // silently forbidden, and nothing else in the suite would notice.
  assert.equal(user.role, 'user', 'a fresh account is never an admin');
  assert.equal(user.passwordHash, undefined);
  assert.equal(user.googleId, undefined);
});
