import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { TorInsight, User } from '#models/index.js';

import { createApp } from '../src/app.js';

const TEST_DB = 'mjolnir_test';
const PASSWORD = 'correct horse battery';
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
const sampleProjectId = `wl-test-${runId}`;

before(async () => {
  await connectDatabase({ dbName: TEST_DB });
  server = createApp({ rateLimits: NO_RATE_LIMITS }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://localhost:${server.address().port}`;

  await TorInsight.create({
    projectId: sampleProjectId,
    identification: {
      titleTh: 'โครงการทดสอบ Watchlist',
      agency: 'กรุงเทพมหานคร',
      status: 'Open',
    },
    facts: {
      referencePriceTHB: 1_500_000,
      submissionDeadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
    metadata: {
      origin: 'demo',
      reviewStatus: 'approved',
      confidenceScore: 90,
    },
  });
});

after(async () => {
  await TorInsight.deleteOne({ projectId: sampleProjectId });
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

function sessionCookie(response) {
  const header = response.headers.getSetCookie?.()?.find((c) => c.startsWith('mjolnir_session='));
  if (header) return header.split(';')[0];
  const setCookie = response.headers.get('set-cookie');
  return setCookie ? setCookie.split(';')[0] : null;
}

async function registerAndGetCookie(name) {
  const res = await send('POST', '/api/auth/register', {
    body: { email: emailFor(name), password: PASSWORD, name },
  });
  return sessionCookie(res);
}

test('watchlist: returns 401 for unauthenticated requests', async () => {
  const resGet = await send('GET', '/api/watchlist');
  assert.equal(resGet.status, 401);

  const resPut = await send('PUT', `/api/watchlist/${sampleProjectId}`);
  assert.equal(resPut.status, 401);

  const resDel = await send('DELETE', `/api/watchlist/${sampleProjectId}`);
  assert.equal(resDel.status, 401);
});

test('watchlist: new user starts with an empty watchlist', async () => {
  const cookie = await registerAndGetCookie('wl-empty');
  const res = await send('GET', '/api/watchlist', { cookie });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.deepEqual(data.tors, []);
  assert.deepEqual(data.savedIds, []);
});

test('watchlist: adds a TOR to the watchlist and verifies retrieval', async () => {
  const cookie = await registerAndGetCookie('wl-add');
  const addRes = await send('PUT', `/api/watchlist/${sampleProjectId}`, { cookie });
  assert.equal(addRes.status, 200);
  const addData = await addRes.json();
  assert.equal(addData.saved, true);
  assert.equal(addData.projectId, sampleProjectId);

  const getRes = await send('GET', '/api/watchlist', { cookie });
  assert.equal(getRes.status, 200);
  const data = await getRes.json();
  assert.ok(data.savedIds.includes(sampleProjectId));
  assert.ok(data.tors.some((t) => t.projectId === sampleProjectId));
});

test('watchlist: adding the same TOR twice is idempotent (no duplicate)', async () => {
  const cookie = await registerAndGetCookie('wl-idempotent');
  await send('PUT', `/api/watchlist/${sampleProjectId}`, { cookie });
  const secondRes = await send('PUT', `/api/watchlist/${sampleProjectId}`, { cookie });
  assert.equal(secondRes.status, 200);

  const getRes = await send('GET', '/api/watchlist', { cookie });
  const data = await getRes.json();
  const count = data.savedIds.filter((id) => id === sampleProjectId).length;
  assert.equal(count, 1, 'Should never contain duplicate project IDs');
});

test('watchlist: removes a TOR from the watchlist', async () => {
  const cookie = await registerAndGetCookie('wl-remove');
  await send('PUT', `/api/watchlist/${sampleProjectId}`, { cookie });

  const delRes = await send('DELETE', `/api/watchlist/${sampleProjectId}`, { cookie });
  assert.equal(delRes.status, 200);
  const delData = await delRes.json();
  assert.equal(delData.saved, false);

  const getRes = await send('GET', '/api/watchlist', { cookie });
  const data = await getRes.json();
  assert.ok(!data.savedIds.includes(sampleProjectId));
});

test('watchlist: user watchlists are completely isolated', async () => {
  const cookieA = await registerAndGetCookie('wl-user-a');
  const cookieB = await registerAndGetCookie('wl-user-b');

  await send('PUT', `/api/watchlist/${sampleProjectId}`, { cookie: cookieA });

  const getB = await send('GET', '/api/watchlist', { cookie: cookieB });
  const dataB = await getB.json();
  assert.equal(dataB.savedIds.length, 0, 'User B must not see User A saved items');
});

test('watchlist: watchlist persists across login and logout', async () => {
  const email = emailFor('wl-persist');
  const regRes = await send('POST', '/api/auth/register', {
    body: { email, password: PASSWORD, name: 'Persist User' },
  });
  const cookie1 = sessionCookie(regRes);

  await send('PUT', `/api/watchlist/${sampleProjectId}`, { cookie: cookie1 });
  await send('POST', '/api/auth/logout', { cookie: cookie1 });

  const loginRes = await send('POST', '/api/auth/login', {
    body: { email, password: PASSWORD },
  });
  const cookie2 = sessionCookie(loginRes);

  const meRes = await send('GET', '/api/auth/me', { cookie: cookie2 });
  const meData = await meRes.json();
  assert.ok(meData.user.watchlist.includes(sampleProjectId));
});

test('watchlist: returns 404 when saving a non-existent TOR project', async () => {
  const cookie = await registerAndGetCookie('wl-404');
  const res = await send('PUT', '/api/watchlist/NON_EXISTENT_9999999', { cookie });
  assert.equal(res.status, 404);
});
