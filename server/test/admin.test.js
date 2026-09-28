// The admin routes over HTTP, because the guard is the entire reason this
// feature exists. requireRole is unit-tested in auth-role.test.js; what is
// checked here is that it is actually mounted, in the right order, in front of
// data that used to be public.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { User } from '#models/index.js';

import { createApp } from '../src/app.js';

const TEST_DB = 'mjolnir_test';
const PASSWORD = 'correct horse battery';
const NAME = 'Somchai Test';

const runId = crypto.randomUUID().slice(0, 8);
const emailFor = (name) => `${name}-${runId}@example.test`;

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

/** Registers an account and returns its session cookie. */
async function signUp(name, { role } = {}) {
  const email = emailFor(name);

  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, name: NAME }),
  });
  assert.equal(response.status, 201);

  if (role) {
    // What `npm run role` does, which is the only way an account becomes an
    // admin. requireAuth re-reads the user per request, so this takes effect
    // on the very next one — no need to sign in again.
    await User.updateOne({ email }, { $set: { role } });
  }

  const header = response.headers.getSetCookie().find((c) => c.startsWith('mjolnir_session='));
  return header.split(';')[0];
}

const operations = (cookie) =>
  fetch(`${baseUrl}/api/admin/operations`, { headers: cookie ? { cookie } : {} });

test('an anonymous caller gets 401, not 403', async () => {
  const response = await operations();

  // 403 would tell someone who is nobody that they are the wrong kind of
  // person. 401 is the honest answer and matches the rest of the API.
  assert.equal(response.status, 401);
  assert.match((await response.json()).error.message, /Sign in/i);
});

test('an ordinary signed-in user is forbidden, and gets no data with it', async () => {
  const response = await operations(await signUp('plain-user'));

  assert.equal(response.status, 403);

  const body = await response.json();
  assert.match(body.error.message, /administrator/i);

  // The whole point: the payload must not ride along with the refusal.
  const raw = JSON.stringify(body);
  assert.equal(raw.includes('gprocurement'), false, 'scraper internals leaked in a 403');
  assert.equal(raw.includes('BMA-2569'), false, 'document ids leaked in a 403');
});

test('an admin gets the operations payload', async () => {
  const response = await operations(await signUp('an-admin', { role: 'admin' }));

  assert.equal(response.status, 200);

  const body = await response.json();
  assert.ok(Array.isArray(body.sources) && body.sources.length > 0);
  assert.ok(Array.isArray(body.reviewQueue));
  assert.equal(typeof body.stats.docsAwaitingReview, 'number');

  // The failure states are why the screen exists, so they have to survive the
  // trip rather than being tidied away into a happy-path payload.
  assert.ok(
    body.sources.some((source) => source.health === 'failed' && source.error),
    'a broken scraper must arrive with its error text',
  );
  assert.ok(
    body.reviewQueue.some((item) => item.misclassified),
    'a misclassified document must arrive flagged',
  );
});

test('losing the role closes the door again on the next request', async () => {
  const email = emailFor('demoted');

  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, name: NAME }),
  });
  const cookie = response.headers
    .getSetCookie()
    .find((c) => c.startsWith('mjolnir_session='))
    .split(';')[0];

  await User.updateOne({ email }, { $set: { role: 'admin' } });
  assert.equal((await operations(cookie)).status, 200);

  await User.updateOne({ email }, { $set: { role: 'user' } });

  // The same cookie, still perfectly valid as a session. Revoking the role has
  // to be enough on its own — nobody is going to hunt down their sessions.
  assert.equal((await operations(cookie)).status, 403);
});
