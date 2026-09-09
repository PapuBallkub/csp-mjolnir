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

// Stamped into every address, so a run that dies before cleanup cannot collide
// with the next one.
const runId = Date.now().toString(36);
const emailFor = (name) => `${name}-${runId}@example.test`;

let server;
let baseUrl;

before(async () => {
  await connectDatabase({ dbName: TEST_DB });

  server = createApp().listen(0);
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

  const response = await send('POST', '/auth/register', {
    body: { email, password: PASSWORD, notificationConsent: true },
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

  const created = await send('POST', '/auth/register', {
    body: { email: `  ${email.toUpperCase()}  `, password: PASSWORD },
  });
  assert.equal(created.status, 201);
  assert.equal((await created.json()).user.email, email);

  const duplicate = await send('POST', '/auth/register', {
    body: { email, password: PASSWORD },
  });
  assert.equal(duplicate.status, 409);

  // Consent defaults to off. FR08 mails the people who asked to be mailed.
  const stored = await User.findOne({ email });
  assert.equal(stored.notificationConsent, false);
});

test('a bad password is refused per field, and writes nothing', async () => {
  const email = emailFor('weak');

  const response = await send('POST', '/auth/register', {
    body: { email, password: 'short' },
  });

  assert.equal(response.status, 400);

  const { error } = await response.json();
  assert.match(error.details.password, /at least 8/);
  assert.equal(error.details.email, undefined, 'a valid field should not be reported as an error');

  assert.equal(await User.countDocuments({ email }), 0);
});

test('a password past the bcrypt 72-byte ceiling is refused, not truncated', async () => {
  const response = await send('POST', '/auth/register', {
    body: { email: emailFor('long'), password: 'a'.repeat(73) },
  });

  assert.equal(response.status, 400);
  assert.match((await response.json()).error.details.password, /72 bytes/);
});

test('signing in needs the right password, and says no more than that', async () => {
  const email = emailFor('login');
  await send('POST', '/auth/register', { body: { email, password: PASSWORD } });

  const wrong = await send('POST', '/auth/login', { body: { email, password: `${PASSWORD}!` } });
  assert.equal(wrong.status, 401);

  const missing = await send('POST', '/auth/login', {
    body: { email: emailFor('never-registered'), password: PASSWORD },
  });
  assert.equal(missing.status, 401);

  assert.equal(
    (await wrong.json()).error.message,
    (await missing.json()).error.message,
    'a different message for a missing account tells anyone who asks which addresses are registered',
  );

  const right = await send('POST', '/auth/login', { body: { email, password: PASSWORD } });
  assert.equal(right.status, 200);
  assert.ok(sessionCookie(right));
});

test('/auth/me is closed without a session and open with one, and logout closes it', async () => {
  const email = emailFor('session');
  const registered = await send('POST', '/auth/register', { body: { email, password: PASSWORD } });
  const cookie = sessionCookie(registered);

  const anonymous = await send('GET', '/auth/me');
  assert.equal(anonymous.status, 401);

  const authenticated = await send('GET', '/auth/me', { cookie });
  assert.equal(authenticated.status, 200);
  assert.equal((await authenticated.json()).user.email, email);

  const forged = await send('GET', '/auth/me', { cookie: 'mjolnir_session=not.a.token' });
  assert.equal(forged.status, 401, 'an unsigned token must not pass');

  const loggedOut = await send('POST', '/auth/logout', { cookie });
  assert.equal(loggedOut.status, 204);
  assert.match(
    loggedOut.headers.getSetCookie().find((c) => c.startsWith('mjolnir_session=')),
    /Expires=Thu, 01 Jan 1970|Max-Age=0/,
    'logout has to actually clear the cookie, not just answer 204',
  );
});

test('a deleted account cannot keep using a token that is still valid', async () => {
  const email = emailFor('deleted');
  const registered = await send('POST', '/auth/register', { body: { email, password: PASSWORD } });
  const cookie = sessionCookie(registered);

  await User.deleteOne({ email });

  const response = await send('GET', '/auth/me', { cookie });
  assert.equal(response.status, 401);
});

test('the hash stays out of an ordinary query, and a partial document still saves', async () => {
  const email = emailFor('projection');
  await send('POST', '/auth/register', { body: { email, password: PASSWORD } });

  const user = await User.findOne({ email });
  assert.equal(user.passwordHash, undefined, 'select: false should hold on a plain find');

  // required plus select: false is a known Mongoose trap. If validation ran on
  // the unselected path, this save would fail, or drop the hash.
  user.notificationConsent = false;
  await user.save();

  const reloaded = await User.findOne({ email }).select('+passwordHash');
  assert.match(reloaded.passwordHash, /^\$2[aby]\$/, 'the hash must survive a partial save');
});
