// The Google flow, minus Google. Turning a code into a profile is the only part
// that needs the network, so it stays in google.js and is not exercised here —
// everything below is either the redirect we build or what we do with a profile
// once we have one.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { isGoogleConfigured } from '#common/config/env.js';
import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { User } from '#models/index.js';

import { signInWithGoogle } from '../src/features/auth/auth.service.js';
import { createApp } from '../src/app.js';

const TEST_DB = 'mjolnir_test';

const runId = crypto.randomUUID().slice(0, 8);
const emailFor = (name) => `${name}-${runId}@example.test`;
const googleIdFor = (name) => `google-${runId}-${name}`;

// Skipped rather than failed where GOOGLE_* is unset, so a teammate who has not
// set up a client can still run the suite. CI sets throwaway values.
const needsConfig = { skip: isGoogleConfigured ? false : 'GOOGLE_* not configured' };

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

test('GET /auth/google sends you to Google and remembers the state', needsConfig, async () => {
  const response = await fetch(`${baseUrl}/auth/google`, { redirect: 'manual' });

  assert.equal(response.status, 302);

  const target = new URL(response.headers.get('location'));
  assert.equal(target.origin + target.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(target.searchParams.get('response_type'), 'code');
  assert.equal(target.searchParams.get('scope'), 'openid email profile');
  assert.ok(target.searchParams.get('client_id'));
  assert.ok(target.searchParams.get('redirect_uri'));

  const cookie = response.headers.getSetCookie().find((c) => c.startsWith('mjolnir_oauth_state='));
  assert.ok(cookie, 'the state has to be stored to be checked on the way back');
  assert.match(cookie, /HttpOnly/i);

  const stored = decodeURIComponent(cookie.split(';')[0].split('=')[1]);
  assert.equal(target.searchParams.get('state'), stored, 'the state sent must be the state kept');
});

test('the callback refuses a state that does not match the cookie', needsConfig, async () => {
  const withoutCookie = await fetch(`${baseUrl}/auth/google/callback?code=x&state=abc`, {
    redirect: 'manual',
  });
  assert.equal(withoutCookie.status, 302);
  assert.match(withoutCookie.headers.get('location'), /auth=failed/);

  const mismatched = await fetch(`${baseUrl}/auth/google/callback?code=x&state=abc`, {
    redirect: 'manual',
    headers: { cookie: 'mjolnir_oauth_state=something-else' },
  });
  assert.equal(mismatched.status, 302);
  assert.match(mismatched.headers.get('location'), /auth=failed/);
});

test('the callback refuses a missing code', needsConfig, async () => {
  const response = await fetch(`${baseUrl}/auth/google/callback?state=abc`, {
    redirect: 'manual',
    headers: { cookie: 'mjolnir_oauth_state=abc' },
  });

  assert.equal(response.status, 302);
  assert.match(response.headers.get('location'), /auth=failed/);
});

test('a first-time Google user gets an account, with no password', async () => {
  const email = emailFor('new-google');
  const googleId = googleIdFor('new');

  const user = await signInWithGoogle({ googleId, email, emailVerified: true });
  assert.equal(user.email, email);

  const stored = await User.findOne({ email }).select('+passwordHash');
  assert.equal(stored.googleId, googleId);
  assert.equal(stored.passwordHash, undefined, 'a Google account has no password to store');
  assert.equal(stored.notificationConsent, false);
});

test('a verified address links to the account that already uses it', async () => {
  const email = emailFor('linked');

  const registered = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'correct horse battery' }),
  });
  const existing = (await registered.json()).user;

  const linked = await signInWithGoogle({
    googleId: googleIdFor('linked'),
    email,
    emailVerified: true,
  });

  assert.equal(linked.id, existing.id, 'linking, not a second account');
  assert.equal(await User.countDocuments({ email }), 1);

  // The password still works: linking adds a way in, it does not replace one.
  const stored = await User.findOne({ email }).select('+passwordHash');
  assert.match(stored.passwordHash, /^\$2[aby]\$/);
});

test('an unverified Google address cannot claim an existing account', async () => {
  const email = emailFor('unverified');
  await User.create({ email, passwordHash: 'not-a-real-hash' });

  await assert.rejects(
    () => signInWithGoogle({ googleId: googleIdFor('unverified'), email, emailVerified: false }),
    (error) => error.status === 403,
    'without this, anyone able to claim an address at Google takes over the account',
  );

  const stored = await User.findOne({ email });
  assert.equal(stored.googleId, undefined);
});

test('signing in again finds the same account, even if the Google email changed', async () => {
  const googleId = googleIdFor('returning');
  const original = emailFor('returning');

  const first = await signInWithGoogle({ googleId, email: original, emailVerified: true });
  const second = await signInWithGoogle({
    googleId,
    email: emailFor('returning-renamed'),
    emailVerified: true,
  });

  assert.equal(second.id, first.id);
  assert.equal(second.email, original, 'the googleId is the identity, the address is not');
});
