// Drives the real limiters, with this file's own numbers rather than the
// production ones. That is the whole point of createApp taking rateLimits: the
// suite spends real budget, so without it either the tests have to fit inside
// production limits or production limits have to be sized around the tests.
//
// Each test gets its own app, and therefore its own counters, because the
// memory store lives per app instance.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { User } from '#models/index.js';

import { createApp } from '../src/app.js';

const TEST_DB = 'mjolnir_test';
const PASSWORD = 'correct horse battery';

const runId = crypto.randomUUID().slice(0, 8);
const emailFor = (name) => `${name}-${runId}@example.test`;

// Small enough to trip in a couple of requests. bcrypt at cost 12 is ~300ms a
// go, so a test that needed five failures would spend most of its time hashing.
const GENEROUS = { windowMs: 60_000, limit: 1000 };

before(() => connectDatabase({ dbName: TEST_DB }));

after(async () => {
  await User.deleteMany({ email: new RegExp(`-${runId}@example\\.test$`) });
  await disconnectDatabase();
});

// One server per test, so no test can spend another's budget.
async function withServer(rateLimits, run) {
  const server = createApp({ rateLimits }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));

  const send = (method, path, body, headers = {}) =>
    fetch(`http://localhost:${server.address().port}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  try {
    await run(send);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('failed sign-ins for one account are cut off, as JSON like every other error', async () => {
  const email = emailFor('lockout');

  await withServer(
    { loginByIp: GENEROUS, loginByEmail: { windowMs: 60_000, limit: 2 }, registerByIp: GENEROUS },
    async (send) => {
      assert.equal((await send('POST', '/api/auth/register', { email, password: PASSWORD })).status, 201);

      const wrong = { email, password: `${PASSWORD}!` };
      assert.equal((await send('POST', '/api/auth/login', wrong)).status, 401);
      assert.equal((await send('POST', '/api/auth/login', wrong)).status, 401);

      const blocked = await send('POST', '/api/auth/login', wrong);
      assert.equal(blocked.status, 429);
      assert.match(blocked.headers.get('content-type'), /application\/json/);

      const body = await blocked.json();
      assert.match(body.error.message, /too many/i, 'a 429 must use the { error: { message } } envelope');
      assert.ok(blocked.headers.get('retry-after'), 'the client should be told how long to wait');
    },
  );
});

test('the right password never spends the account budget', async () => {
  const email = emailFor('success');

  await withServer(
    { loginByIp: GENEROUS, loginByEmail: { windowMs: 60_000, limit: 1 }, registerByIp: GENEROUS },
    async (send) => {
      await send('POST', '/api/auth/register', { email, password: PASSWORD });

      // Well past a limit of 1. Only failures are counted, so none of these
      // bring the account closer to being locked.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        assert.equal((await send('POST', '/api/auth/login', { email, password: PASSWORD })).status, 200);
      }
    },
  );
});

test('casing cannot buy a second budget for the same account', async () => {
  const email = emailFor('casing-budget');

  await withServer(
    { loginByIp: GENEROUS, loginByEmail: { windowMs: 60_000, limit: 2 }, registerByIp: GENEROUS },
    async (send) => {
      await send('POST', '/api/auth/register', { email, password: PASSWORD });

      // Spend the budget through spellings the key has to normalise away.
      await send('POST', '/api/auth/login', { email: email.toUpperCase(), password: 'wrong-one' });
      await send('POST', '/api/auth/login', { email: `  ${email}  `, password: 'wrong-two' });

      const blocked = await send('POST', '/api/auth/login', { email, password: 'wrong-three' });
      assert.equal(blocked.status, 429, 'Victim@x.com and victim@x.com are one account, so one budget');
    },
  );
});

test('an account that does not exist is counted like one that does', async () => {
  // Otherwise the limiter answers a question the 401 deliberately refuses to:
  // which addresses are registered. See 0004.
  await withServer(
    { loginByIp: GENEROUS, loginByEmail: { windowMs: 60_000, limit: 2 }, registerByIp: GENEROUS },
    async (send) => {
      const ghost = { email: emailFor('never-registered'), password: PASSWORD };

      assert.equal((await send('POST', '/api/auth/login', ghost)).status, 401);
      assert.equal((await send('POST', '/api/auth/login', ghost)).status, 401);
      assert.equal((await send('POST', '/api/auth/login', ghost)).status, 429);
    },
  );
});

test('signing up repeatedly from one address is cut off', async () => {
  await withServer(
    { loginByIp: GENEROUS, loginByEmail: GENEROUS, registerByIp: { windowMs: 60_000, limit: 2 } },
    async (send) => {
      for (const name of ['flood-a', 'flood-b']) {
        const created = await send('POST', '/api/auth/register', {
          email: emailFor(name),
          password: PASSWORD,
        });
        assert.equal(created.status, 201);
      }

      const blocked = await send('POST', '/api/auth/register', {
        email: emailFor('flood-c'),
        password: PASSWORD,
      });
      assert.equal(blocked.status, 429);
      assert.equal((await blocked.json()).error.message.length > 0, true);
    },
  );
});

test('a request with no email still fails validation rather than the limiter', async () => {
  // The email limiter runs before parseCredentials, so it has to cope with a
  // body that has nothing to key on instead of bucketing them all together.
  await withServer(
    { loginByIp: GENEROUS, loginByEmail: { windowMs: 60_000, limit: 1 }, registerByIp: GENEROUS },
    async (send) => {
      for (const body of [{ password: PASSWORD }, { email: '   ', password: PASSWORD }, {}]) {
        const response = await send('POST', '/api/auth/login', body);
        assert.equal(response.status, 400, 'a malformed body is a validation error, not a 429');
        assert.ok((await response.json()).error.details, 'errors stay keyed by field');
      }
    },
  );
});

test('a forged X-Forwarded-For cannot buy a fresh address budget', async () => {
  // TRUST_PROXY_HOPS defaults to 0, so Express reads the socket address and
  // ignores the header entirely. This is the property that makes the default
  // safe to ship: if it were `true`, Express would believe the leftmost entry —
  // which the caller writes — and every request could claim a new bucket.
  await withServer(
    { loginByIp: GENEROUS, loginByEmail: GENEROUS, registerByIp: { windowMs: 60_000, limit: 1 } },
    async (send) => {
      const signUp = (name, forwardedFor) =>
        send('POST', '/api/auth/register', { email: emailFor(name), password: PASSWORD },
          forwardedFor ? { 'x-forwarded-for': forwardedFor } : {});

      assert.equal((await signUp('spoof-a')).status, 201);

      const blocked = await signUp('spoof-b', '203.0.113.7');
      assert.equal(blocked.status, 429, 'the header must not be believed at the default hop count');
    },
  );
});
