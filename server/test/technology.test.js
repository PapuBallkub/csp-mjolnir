import assert from 'node:assert/strict';
import { test } from 'node:test';

import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { Technology } from '#models/index.js';
import { getAllTechnologies } from '#features/technologies/index.js';

test('Technology schema: matches on lower-cased keys and aliases, and starts as new', async () => {
  const tech = new Technology({
    name: 'PostgreSQL',
    key: '  PostgreSQL ',
    aliases: ['Postgres', 'PGSQL'],
    firstSeenIn: '68039469567',
  });

  assert.equal(await tech.validate().catch((err) => err), undefined);
  assert.equal(tech.key, 'postgresql');
  assert.deepEqual([...tech.aliases], ['postgres', 'pgsql']);
  // An entry nobody has reviewed yet is never treated as confirmed
  assert.equal(tech.status, 'new');
});

test('Technology schema: requires a display name and a matching key', async () => {
  const validationError = await new Technology({}).validate().catch((err) => err);

  assert.ok(validationError?.errors.name);
  assert.ok(validationError?.errors.key);
});

test('GET /api/technologies: returns list of technologies from vocabulary or fallback', async () => {
  const { createApp } = await import('../src/app.js');
  const server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://localhost:${server.address().port}`;

  try {
    const res = await fetch(`${baseUrl}/api/technologies`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.technologies));
    assert.ok(body.technologies.length > 0);
    assert.ok(body.technologies.some((t) => t.name === 'React' || t.name === 'PostgreSQL'));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /api/technologies/request: returns 401 when not authenticated', async () => {
  const { createApp } = await import('../src/app.js');
  const server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://localhost:${server.address().port}`;

  try {
    const res = await fetch(`${baseUrl}/api/technologies/request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Svelte' }),
    });
    assert.equal(res.status, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('getAllTechnologies: returns only confirmed technologies and ignores new or rejected ones (FR-10, #317)', async (t) => {
  let isDbConnected = false;
  const TEST_DB = 'mjolnir_test';
  const runId = crypto.randomUUID().slice(0, 8);
  const confirmedKey = `test-confirmed-tech-${runId}`;
  const newKey = `test-new-tech-${runId}`;
  const rejectedKey = `test-rejected-tech-${runId}`;

  try {
    const connPromise = connectDatabase({ dbName: TEST_DB });
    const timer = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000));
    await Promise.race([connPromise, timer]);
    isDbConnected = true;
  } catch {
    return t.skip('MongoDB is not reachable');
  }

  try {
    await Technology.create([
      { name: `Confirmed Tech ${runId}`, key: confirmedKey, status: 'confirmed' },
      { name: `New Tech ${runId}`, key: newKey, status: 'new' },
      { name: `Rejected Tech ${runId}`, key: rejectedKey, status: 'rejected' },
    ]);

    const result = await getAllTechnologies();
    const names = result.map((item) => item.name);

    assert.ok(names.includes(`Confirmed Tech ${runId}`), 'confirmed technology must be included');
    assert.ok(!names.includes(`New Tech ${runId}`), 'new/unreviewed technology must NOT be included');
    assert.ok(!names.includes(`Rejected Tech ${runId}`), 'rejected technology must NOT be included');
  } finally {
    if (isDbConnected) {
      await Technology.deleteMany({ key: { $in: [confirmedKey, newKey, rejectedKey] } });
      await disconnectDatabase();
    }
  }
});

test('requestTechnology: safely escapes special regex characters like C++ without ReDoS or crashing (ASVS V15.3.7)', async () => {
  const { requestTechnology } = await import('#features/technologies/index.js');
  const result = await requestTechnology({ name: 'C++', category: 'Language' });
  assert.ok(result.technology);
  assert.equal(result.technology.name, 'C++');
});



