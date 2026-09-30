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
