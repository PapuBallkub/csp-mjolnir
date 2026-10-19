import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { Technology, Tor, User } from '#models/index.js';

import { createApp } from '../src/app.js';

const TEST_DB = 'mjolnir_test';
const PASSWORD = 'correct horse battery';
const NAME = 'Somchai Admin Tech';

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
  await Technology.deleteMany({ key: new RegExp(`test-tech-${runId}`) });
  await Tor.deleteMany({ projectId: new RegExp(`^999${runId}`) });

  await new Promise((resolve) => server.close(resolve));
  await disconnectDatabase();
});

async function signUp(name, { role } = {}) {
  const email = emailFor(name);

  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, name: NAME }),
  });
  assert.equal(response.status, 201);

  if (role) {
    await User.updateOne({ email }, { role });
  }

  const cookie = response.headers.get('set-cookie');
  assert.ok(cookie, 'Registration should set a session cookie');
  return cookie.split(';')[0];
}

test('Admin Project Autocomplete / Suggestion (FR-24)', async () => {
  const adminCookie = await signUp(`admin-sugg-${runId}`, { role: 'admin' });
  const userCookie = await signUp(`user-sugg-${runId}`);

  const testProjId = `999${runId}01`;
  await Tor.create({
    projectId: testProjId,
    source: 'manual',
    title: `ระบบทดสอบความถูกต้องอัตโนมัติ ${runId}`,
    agency: 'สำนักการศึกษา กทม.',
    budgetTHB: 5000000,
  });

  // Guard test: non-admin gets 403
  const forbiddenRes = await fetch(`${baseUrl}/api/admin/projects/suggest?q=${testProjId}`, {
    headers: { cookie: userCookie },
  });
  assert.equal(forbiddenRes.status, 403);

  // Admin search by ID prefix
  const suggestByIdRes = await fetch(`${baseUrl}/api/admin/projects/suggest?q=${testProjId.slice(0, 5)}`, {
    headers: { cookie: adminCookie },
  });
  assert.equal(suggestByIdRes.status, 200);
  const byIdItems = await suggestByIdRes.json();
  assert.ok(byIdItems.some((item) => item.projectId === testProjId));

  // Admin search by Thai title snippet
  const suggestByTitleRes = await fetch(`${baseUrl}/api/admin/projects/suggest?q=ความถูกต้องอัตโนมัติ`, {
    headers: { cookie: adminCookie },
  });
  assert.equal(suggestByTitleRes.status, 200);
  const byTitleItems = await suggestByTitleRes.json();
  assert.ok(byTitleItems.some((item) => item.projectId === testProjId));
});

test('Admin Technology CRUD & Request Review', async () => {
  const adminCookie = await signUp(`admin-tech-${runId}`, { role: 'admin' });
  const techName = `Test Tech ${runId}`;

  // 1. Create new technology as Admin
  const createRes = await fetch(`${baseUrl}/api/admin/technologies`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({
      name: techName,
      category: 'Framework',
      aliases: ['test-alias-1', 'test-alias-2'],
      status: 'confirmed',
    }),
  });
  assert.equal(createRes.status, 201);
  const created = await createRes.json();
  assert.equal(created.name, techName);
  assert.equal(created.category, 'Framework');
  assert.deepEqual(created.aliases, ['test-alias-1', 'test-alias-2']);
  assert.equal(created.status, 'confirmed');

  // 2. Duplicate prevention
  const dupRes = await fetch(`${baseUrl}/api/admin/technologies`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({
      name: techName,
      category: 'Framework',
    }),
  });
  assert.equal(dupRes.status, 409);

  // 3. List technologies with search filter
  const listRes = await fetch(`${baseUrl}/api/admin/technologies?search=${encodeURIComponent(runId)}`, {
    headers: { cookie: adminCookie },
  });
  assert.equal(listRes.status, 200);
  const list = await listRes.json();
  assert.ok(list.items.some((t) => t.id === created.id));

  // 4. Update technology (edit name, category, and add alias)
  const updatedName = `${techName} Updated`;
  const updateRes = await fetch(`${baseUrl}/api/admin/technologies/${created.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({
      name: updatedName,
      category: 'Database',
      aliases: ['test-alias-1', 'test-alias-3'],
      status: 'confirmed',
    }),
  });
  assert.equal(updateRes.status, 200);
  const updated = await updateRes.json();
  assert.equal(updated.name, updatedName);
  assert.equal(updated.category, 'Database');
  assert.deepEqual(updated.aliases, ['test-alias-1', 'test-alias-3']);

  // 5. Delete technology
  const delRes = await fetch(`${baseUrl}/api/admin/technologies/${created.id}`, {
    method: 'DELETE',
    headers: { cookie: adminCookie },
  });
  assert.equal(delRes.status, 200);

  // Verify deletion
  const verifyRes = await fetch(`${baseUrl}/api/admin/technologies/${created.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ name: 'should fail' }),
  });
  assert.equal(verifyRes.status, 404);
});
