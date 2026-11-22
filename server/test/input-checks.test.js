// Input that used to reach the database unchecked (ASVS V2.2.1): a wrong type
// is a 400 or a 404, never a 500, and search text is matched as text.

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
const prefix = `ic-${runId}`;

const GENEROUS = { windowMs: 60_000, limit: 10_000 };

let server;
let baseUrl;

before(async () => {
  await connectDatabase({ dbName: TEST_DB });
  server = createApp({
    rateLimits: { loginByIp: GENEROUS, loginByEmail: GENEROUS, registerByIp: GENEROUS },
    apiRateLimits: { technologyRequest: GENEROUS },
  }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://localhost:${server.address().port}`;
});

after(async () => {
  await User.deleteMany({ email: new RegExp(`-${runId}@example\\.test$`) });
  await Technology.deleteMany({ key: new RegExp(`^${prefix}`) });
  await new Promise((resolve) => server.close(resolve));
  await disconnectDatabase();
});

const send = (method, path, { body, cookie } = {}) =>
  fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

async function signUp(name, { role } = {}) {
  // A confirmed account, signed in: registering no longer signs anyone in (0041)
  const { user, cookie } = await signedInAccount(baseUrl, { email: emailFor(name), password: PASSWORD, role });
  return { cookie, id: String(user._id) };
}

test('technology request: a name that is not text is a 400, not a 500', async () => {
  const { cookie } = await signUp('tech-types');
  for (const name of [42, { $gt: '' }, ['React']]) {
    const res = await send('POST', '/api/technologies/request', { cookie, body: { name } });
    assert.equal(res.status, 400, JSON.stringify(name));
  }
});

test('technology request: the category is one the vocabulary uses, or none', async () => {
  const { cookie } = await signUp('tech-category');

  const unknown = await send('POST', '/api/technologies/request', {
    cookie,
    body: { name: `${prefix}-unknown-category`, category: 'blockchain-ish' },
  });
  assert.equal(unknown.status, 400);
  const wrongType = await send('POST', '/api/technologies/request', {
    cookie,
    body: { name: `${prefix}-number-category`, category: 7 },
  });
  assert.equal(wrongType.status, 400);

  // Known, in any case, is stored as the vocabulary writes it
  const known = await send('POST', '/api/technologies/request', {
    cookie,
    body: { name: `${prefix}-known-category`, category: 'Database' },
  });
  assert.equal(known.status, 201);
  assert.equal((await known.json()).technology.category, 'database');
});

test('technology request: records who asked', async () => {
  const { cookie, id } = await signUp('tech-who');
  const res = await send('POST', '/api/technologies/request', { cookie, body: { name: `${prefix}-who-asked` } });
  assert.equal(res.status, 201);

  const stored = await Technology.findOne({ key: `${prefix}-who-asked` }).lean();
  assert.equal(stored.firstSeenIn, `user-request:${id}`);
});

test('admin search: the text is matched as text, not as a pattern', async () => {
  const { cookie } = await signUp('search-admin', { role: 'admin' });
  await Technology.create([
    { name: `${prefix} Literal (beta`, key: `${prefix}-literal`, status: 'new' },
    { name: `${prefix} Other`, key: `${prefix}-other`, status: 'new' },
  ]);
  const search = async (text) => {
    const res = await send('GET', `/api/admin/technologies?status=all&search=${encodeURIComponent(text)}`, { cookie });
    assert.equal(res.status, 200, text);
    return JSON.stringify(await res.json());
  };

  // An unbalanced bracket was a broken pattern; as text it is just a character
  assert.ok((await search(`${prefix} Literal (beta`)).includes('Literal (beta'));
  // As a pattern this matched "<prefix> Other"; as text nothing has ".*"
  assert.ok(!(await search(`${prefix}.*Other`)).includes(`${prefix} Other`));
});

test('admin search: a repeated search parameter is a 400', async () => {
  const { cookie } = await signUp('search-repeat', { role: 'admin' });
  for (const path of [
    '/api/admin/technologies?search=a&search=b',
    '/api/admin/pipeline/tasks?search=a&search=b',
    '/api/admin/projects/suggest?q=a&q=b',
  ]) {
    const res = await send('GET', path, { cookie });
    assert.equal(res.status, 400, path);
  }
});

test('notifications: an id that cannot be one is answered like someone else\'s', async () => {
  const { cookie } = await signUp('notif-ids');

  const detail = await send('GET', '/api/notifications/not-an-id', { cookie });
  assert.equal(detail.status, 404);

  const read = await send('PATCH', '/api/notifications/not-an-id/read', { cookie });
  assert.equal(read.status, 200);
  assert.equal((await read.json()).updated, false);
});
