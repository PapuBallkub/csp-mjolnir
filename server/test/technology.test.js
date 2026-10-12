import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Technology } from '#models/index.js';

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


