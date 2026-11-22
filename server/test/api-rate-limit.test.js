// The limits outside auth (advanced feature 5, ASVS V2.4.1), driven through the
// real routes with this file's own small numbers. Each test builds its own
// app, so each starts with empty counters.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { Technology, User } from '#models/index.js';

import { createApp } from '../src/app.js';
import { signedInAccount } from './helpers/accounts.js';

const TEST_DB = 'mjolnir_test';
const PASSWORD = 'correct horse battery';
const runId = crypto.randomUUID().slice(0, 8);
const emailFor = (name) => `${name}-${runId}@example.test`;
const techName = (name) => `rl-${runId}-${name}`;

const GENEROUS = { windowMs: 60_000, limit: 10_000 };
const NO_AUTH_LIMITS = { loginByIp: GENEROUS, loginByEmail: GENEROUS, registerByIp: GENEROUS };

before(() => connectDatabase({ dbName: TEST_DB }));

after(async () => {
  await User.deleteMany({ email: new RegExp(`-${runId}@example\\.test$`) });
  await Technology.deleteMany({ key: new RegExp(`^rl-${runId}-`) });
  await disconnectDatabase();
});

async function withServer(apiRateLimits, run) {
  const server = createApp({ rateLimits: NO_AUTH_LIMITS, apiRateLimits }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://localhost:${server.address().port}`;

  const send = (method, path, { body, cookie } = {}) =>
    fetch(`${base}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(cookie ? { cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  // A confirmed account, signed in, and its session cookie: registering no
  // longer signs anyone in (0041)
  const signUp = async (name, { role } = {}) =>
    (await signedInAccount(base, { email: emailFor(name), password: PASSWORD, role })).cookie;

  try {
    await run({ send, signUp });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

// What every 429 here must carry: the JSON envelope, and headers that say how
// long to wait
async function assertLimited(response) {
  assert.equal(response.status, 429);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.ok((await response.json()).error?.message, 'a 429 uses the { error: { message } } envelope');
  assert.ok(response.headers.get('ratelimit-policy'), 'RateLimit-Policy says what the limit is');
  assert.ok(response.headers.get('ratelimit'), 'RateLimit says what is left');
  assert.ok(response.headers.get('retry-after'), 'Retry-After says how long to wait');
}

test('preview: /preview and /pdf share one budget per address', async () => {
  await withServer({ preview: { windowMs: 60_000, limit: 2 } }, async ({ send }) => {
    // A project we don't have: a 404 still spends budget, as a script's would
    assert.equal((await send('GET', '/api/tors/99999009999/preview')).status, 404);
    assert.equal((await send('GET', '/api/tors/99999009999/pdf')).status, 404);

    await assertLimited(await send('GET', '/api/tors/99999009999/preview'));
    await assertLimited(await send('GET', '/api/tors/99999009999/pdf'));
  });
});

test('preview: the rest of the catalog is not limited with it', async () => {
  await withServer({ preview: { windowMs: 60_000, limit: 1 } }, async ({ send }) => {
    await send('GET', '/api/tors/99999009999/preview');
    await assertLimited(await send('GET', '/api/tors/99999009999/preview'));
    assert.equal((await send('GET', '/api/tors/facets')).status, 200);
  });
});

test('technology requests: one budget per account, so one user never spends another\'s', async () => {
  await withServer({ technologyRequest: { windowMs: 60_000, limit: 1 } }, async ({ send, signUp }) => {
    const alice = await signUp('tech-alice');
    const bob = await signUp('tech-bob');
    const ask = (cookie, name) => send('POST', '/api/technologies/request', { cookie, body: { name: techName(name) } });

    assert.equal((await ask(alice, 'a1')).status, 201);
    await assertLimited(await ask(alice, 'a2'));

    // Same address, different account: a budget of its own
    assert.equal((await ask(bob, 'b1')).status, 201);
  });
});

test('technology requests: signed out is still a 401, before any budget', async () => {
  await withServer({ technologyRequest: { windowMs: 60_000, limit: 1 } }, async ({ send }) => {
    for (let i = 0; i < 3; i += 1) {
      const res = await send('POST', '/api/technologies/request', { body: { name: techName('anon') } });
      assert.equal(res.status, 401);
    }
  });
});

test('admin: re-extract, ingest, health-check and retry-all share one budget per admin', async () => {
  await withServer({ adminCostly: { windowMs: 60_000, limit: 1 } }, async ({ send, signUp }) => {
    const admin = await signUp('costly-admin', { role: 'admin' });
    const other = await signUp('costly-other-admin', { role: 'admin' });

    // A project that doesn't exist, so nothing is queued and nothing is fetched
    const first = await send('POST', '/api/admin/review/TEST-nothing-here/re-extract', { cookie: admin });
    assert.notEqual(first.status, 429);

    // The limiter answers before any handler runs, so none of these reach e-GP
    await assertLimited(await send('POST', '/api/admin/review/TEST-nothing-here/re-extract', { cookie: admin }));
    await assertLimited(await send('POST', '/api/admin/ingest', { cookie: admin, body: {} }));
    await assertLimited(await send('POST', '/api/admin/health-check', { cookie: admin, body: {} }));
    await assertLimited(await send('POST', '/api/admin/pipeline/retry-all', { cookie: admin, body: {} }));

    // Another admin has a budget of their own
    const theirs = await send('POST', '/api/admin/review/TEST-nothing-here/re-extract', { cookie: other });
    assert.notEqual(theirs.status, 429);

    // Reading is never limited
    assert.equal((await send('GET', '/api/admin/operations', { cookie: admin })).status, 200);
  });
});
