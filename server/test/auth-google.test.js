// The Google flow, minus Google. The redirect we build, the callback with a fake
// Google answering the token and key requests (fetch is mocked, and anything
// that isn't our own server or one of those two URLs fails the test rather than
// reach the internet), and what we do with a profile once we have one. The
// token checks themselves are in auth-google-token.test.js.

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, before, test } from 'node:test';

import jwt from 'jsonwebtoken';

import { env, isGoogleConfigured } from '#common/config/env.js';
import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { User } from '#models/index.js';

import { signInWithGoogle } from '../src/features/auth/auth.service.js';
import { codeChallengeFor } from '../src/features/auth/google.js';
import { GOOGLE_CERTS_URL } from '../src/features/auth/google-id-token.js';
import { createApp } from '../src/app.js';

const TEST_DB = 'mjolnir_test';

const runId = crypto.randomUUID().slice(0, 8);
const emailFor = (name) => `${name}-${runId}@example.test`;
const googleIdFor = (name) => `google-${runId}-${name}`;

// Skipped rather than failed where GOOGLE_* is unset, so a teammate who has not
// set up a client can still run the suite. CI sets throwaway values.
const needsConfig = { skip: isGoogleConfigured ? false : 'GOOGLE_* not configured' };

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

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const realFetch = globalThis.fetch;

// Stands in for Google's signing key, for this run only.
const signingKey = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const KID = `test-${runId}`;
const JWKS = {
  keys: [{ ...signingKey.publicKey.export({ format: 'jwk' }), kid: KID, use: 'sig', alg: 'RS256' }],
};

// Starts a sign-in the way a browser would. Returns the cookie to send back and
// what we told Google.
async function startSignIn() {
  const response = await realFetch(`${baseUrl}/api/auth/google`, { redirect: 'manual' });
  const target = new URL(response.headers.get('location'));
  const setCookie = response.headers.getSetCookie().find((c) => c.startsWith('mjolnir_oauth_state='));

  return {
    response,
    target,
    setCookie,
    cookie: setCookie.split(';')[0],
    state: target.searchParams.get('state'),
    nonce: target.searchParams.get('nonce'),
    codeChallenge: target.searchParams.get('code_challenge'),
  };
}

function idTokenFor({ nonce, name }) {
  return jwt.sign(
    {
      iss: 'https://accounts.google.com',
      aud: env.google.clientId,
      sub: googleIdFor(name),
      email: emailFor(name),
      email_verified: true,
      nonce,
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
    signingKey.privateKey,
    { algorithm: 'RS256', keyid: KID },
  );
}

// Mocks fetch for one test. Requests to our own server go through; the token
// endpoint and the key set get fake answers; anything else is recorded and fails.
function fakeGoogle(t, { idToken, tokenEndpoint } = {}) {
  const seen = { tokenRequests: [], unexpected: [] };

  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);

    if (url.startsWith(baseUrl)) {
      return realFetch(input, init);
    }
    if (url === TOKEN_URL) {
      seen.tokenRequests.push(new URLSearchParams(init.body));
      return tokenEndpoint ? tokenEndpoint() : Response.json({ id_token: idToken });
    }
    if (url === GOOGLE_CERTS_URL) {
      return Response.json(JWKS, { headers: { 'cache-control': 'public, max-age=3600' } });
    }

    seen.unexpected.push(url);
    throw new Error(`unexpected request to ${url}`);
  });

  return seen;
}

const callback = (query, cookie) =>
  realFetch(`${baseUrl}/api/auth/google/callback?${query}`, {
    redirect: 'manual',
    headers: cookie ? { cookie } : {},
  });

const sessionCookieOf = (response) =>
  response.headers.getSetCookie().find((c) => c.startsWith('mjolnir_session=') && !/mjolnir_session=;/.test(c));

test('GET /api/auth/google sends you to Google and remembers the attempt', needsConfig, async () => {
  const { response, target, setCookie, state, nonce, codeChallenge } = await startSignIn();

  assert.equal(response.status, 302);
  assert.equal(target.origin + target.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(target.searchParams.get('response_type'), 'code');
  assert.equal(target.searchParams.get('scope'), 'openid email profile');
  assert.ok(target.searchParams.get('client_id'));
  assert.ok(target.searchParams.get('redirect_uri'));

  assert.ok(setCookie, 'the attempt has to be stored to be checked on the way back');
  assert.match(setCookie, /HttpOnly/i);

  // One cookie: state, nonce and PKCE verifier, each 32 random bytes.
  const stored = decodeURIComponent(setCookie.split(';')[0].split('=')[1]).split('.');
  assert.equal(stored.length, 3);
  assert.equal(state, stored[0], 'the state sent must be the state kept');
  assert.equal(nonce, stored[1], 'the nonce sent must be the nonce kept');
  assert.notEqual(state, nonce);

  // PKCE: only the hash goes to the browser's address bar, never the verifier.
  assert.equal(target.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(codeChallenge, codeChallengeFor(stored[2]));
  assert.ok(!target.href.includes(stored[2]), 'the verifier must not appear in the URL');
});

test('the PKCE challenge matches RFC 7636’s worked example', () => {
  // Appendix B. The other tests compare codeChallengeFor with itself, which
  // still passes if it returns hex or keeps base64's `=`; only Google would
  // notice. This pair comes from the RFC.
  assert.equal(
    codeChallengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),
    'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
  );
});

test('a sign-in Google vouches for gets a session', needsConfig, async (t) => {
  const start = await startSignIn();
  const seen = fakeGoogle(t, { idToken: idTokenFor({ nonce: start.nonce, name: 'oidc-ok' }) });

  const response = await callback(`code=test-code&state=${start.state}`, start.cookie);

  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), env.corsOrigin);
  assert.ok(sessionCookieOf(response), 'signed in');
  assert.deepEqual(seen.unexpected, []);

  // The verifier we kept is the one whose hash we sent: Google would refuse the
  // code otherwise.
  const [request] = seen.tokenRequests;
  assert.equal(request.get('code'), 'test-code');
  assert.equal(codeChallengeFor(request.get('code_verifier')), start.codeChallenge);

  assert.ok(await User.exists({ email: emailFor('oidc-ok') }));
});

test('a token carrying another sign-in’s nonce is refused, and the log says why', needsConfig, async (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  const start = await startSignIn();
  const other = crypto.randomBytes(32).toString('base64url');
  fakeGoogle(t, { idToken: idTokenFor({ nonce: other, name: 'oidc-replayed' }) });

  const response = await callback(`code=test-code&state=${start.state}`, start.cookie);

  assert.equal(response.status, 302);
  assert.match(response.headers.get('location'), /auth=failed/);
  assert.equal(sessionCookieOf(response), undefined, 'no session');
  assert.equal(await User.exists({ email: emailFor('oidc-replayed') }), null, 'no account made');

  const [line] = warn.mock.calls.map((call) => call.arguments.join(' '));
  assert.match(line, /^Google sign-in failed: .*\(nonce\)$/);
  assert.ok(!line.includes(emailFor('oidc-replayed')), 'the address stays out of the log');
});

test('Google being unreachable lands on the failure page, not a 500', needsConfig, async (t) => {
  t.mock.method(console, 'warn', () => {});
  const start = await startSignIn();
  fakeGoogle(t, {
    tokenEndpoint: () => {
      throw new TypeError('fetch failed');
    },
  });

  const response = await callback(`code=test-code&state=${start.state}`, start.cookie);

  assert.equal(response.status, 302);
  assert.match(response.headers.get('location'), /auth=failed/);
});

const signInFailures = (warn) =>
  warn.mock.calls.map((call) => call.arguments.join(' ')).filter((line) => line.startsWith('Google sign-in failed'));

test('when Google refuses the code, the log says what Google said', needsConfig, async (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  const start = await startSignIn();
  fakeGoogle(t, {
    tokenEndpoint: () =>
      Response.json({ error: 'invalid_grant', error_description: 'Invalid code verifier.' }, { status: 400 }),
  });

  const response = await callback(`code=test-code&state=${start.state}`, start.cookie);

  assert.match(response.headers.get('location'), /auth=failed/);
  assert.deepEqual(signInFailures(warn).map((line) => line.replace(/^.*\(/, '(')), [
    '(token-endpoint: invalid_grant "Invalid code verifier.")',
  ]);
});

test('Google’s refusal reaches the log only in the shape RFC 6749 allows', needsConfig, async (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  let body;
  fakeGoogle(t, {
    tokenEndpoint: () =>
      typeof body === 'string' ? new Response(body, { status: 400 }) : Response.json(body, { status: 400 }),
  });

  const cases = [
    // A line break would let the description write a log line of its own
    [{ error: 'invalid_grant', error_description: 'x\nGoogle sign-in succeeded' }, '(token-endpoint: invalid_grant)'],
    [{ error: 'invalid_grant', error_description: 'x'.repeat(201) }, '(token-endpoint: invalid_grant)'],
    [{ error: 'invalid_grant', error_description: 'says "hi"' }, '(token-endpoint: invalid_grant)'],
    [{ error: 'a'.repeat(65), error_description: 'fine' }, '(token-endpoint)'],
    [{ error: ['invalid_grant'] }, '(token-endpoint)'],
    [{ error_description: 'no code' }, '(token-endpoint)'],
    ['<html>not json</html>', '(token-endpoint)'],
  ];

  for (const [index, [next, expected]] of cases.entries()) {
    body = next;
    const start = await startSignIn();
    await callback(`code=test-code&state=${start.state}`, start.cookie);

    const line = signInFailures(warn)[index];
    assert.ok(line.endsWith(expected), `case ${index}: ${JSON.stringify(line)}`);
    assert.ok(!line.includes('\n'), `case ${index}: one line only`);
  }
});

// A repeated parameter arrives as an array.
test('a repeated state or code is refused before Google is asked', needsConfig, async (t) => {
  const seen = fakeGoogle(t);

  const twoStates = await startSignIn();
  const first = await callback(`code=x&state=${twoStates.state}&state=${twoStates.state}`, twoStates.cookie);
  assert.equal(first.status, 302);
  assert.match(first.headers.get('location'), /auth=failed/);

  const twoCodes = await startSignIn();
  const second = await callback(`code=x&code=y&state=${twoCodes.state}`, twoCodes.cookie);
  assert.equal(second.status, 302);
  assert.match(second.headers.get('location'), /auth=failed/);

  assert.equal(seen.tokenRequests.length, 0);
});

test('a cookie from before the nonce existed fails once, without asking Google', needsConfig, async (t) => {
  const seen = fakeGoogle(t);
  const oldState = crypto.randomBytes(32).toString('base64url');

  const response = await callback(`code=x&state=${oldState}`, `mjolnir_oauth_state=${oldState}`);

  assert.match(response.headers.get('location'), /auth=failed/);
  assert.equal(seen.tokenRequests.length, 0);
});

test('the callback refuses a state that does not match the cookie', needsConfig, async () => {
  const withoutCookie = await fetch(`${baseUrl}/api/auth/google/callback?code=x&state=abc`, {
    redirect: 'manual',
  });
  assert.equal(withoutCookie.status, 302);
  assert.match(withoutCookie.headers.get('location'), /auth=failed/);

  const mismatched = await fetch(`${baseUrl}/api/auth/google/callback?code=x&state=abc`, {
    redirect: 'manual',
    headers: { cookie: 'mjolnir_oauth_state=something-else' },
  });
  assert.equal(mismatched.status, 302);
  assert.match(mismatched.headers.get('location'), /auth=failed/);
});

// With a well-formed cookie and a matching state, so the missing code is the
// only thing wrong.
test('the callback refuses a missing code', needsConfig, async (t) => {
  const start = await startSignIn();
  const seen = fakeGoogle(t);

  const response = await callback(`state=${start.state}`, start.cookie);

  assert.equal(response.status, 302);
  assert.match(response.headers.get('location'), /auth=failed/);
  assert.equal(seen.tokenRequests.length, 0);
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

  const registered = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'correct horse battery', name: 'Somchai Test' }),
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

test('a new Google account keeps the name Google reported', async () => {
  const email = emailFor('named-google');

  const user = await signInWithGoogle({
    googleId: googleIdFor('named'),
    email,
    emailVerified: true,
    name: 'Somchai Wongsawat',
  });

  assert.equal(user.name, 'Somchai Wongsawat');
  assert.equal(user.role, 'user', 'a Google account is no more privileged than any other');
});

// $setOnInsert, not $set. Google is the source of a name only for an account it
// is creating: on a link the address already belongs to someone who may have
// typed their own name at signup, and on a return they may have changed it.
test('signing in with Google again never overwrites the name on the account', async () => {
  const email = emailFor('keeps-name');
  const googleId = googleIdFor('keeps');

  await signInWithGoogle({ googleId, email, emailVerified: true, name: 'Original Name' });
  const again = await signInWithGoogle({
    googleId,
    email,
    emailVerified: true,
    name: 'Renamed At Google',
  });

  assert.equal(again.name, 'Original Name');
});

test('linking to an existing account leaves the name that account already had', async () => {
  const email = emailFor('link-name');

  const registered = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'correct horse battery', name: 'Typed At Signup' }),
  });
  assert.equal(registered.status, 201);

  const linked = await signInWithGoogle({
    googleId: googleIdFor('link-name'),
    email,
    emailVerified: true,
    name: 'From Google Profile',
  });

  assert.equal(linked.name, 'Typed At Signup', 'linking adds a way in, it does not rewrite you');
});
