import assert from 'node:assert/strict';
import { test } from 'node:test';

import { IngestionLog } from '#models/index.js';

test('IngestionLog schema: validates required fields and sets defaults', async () => {
  const log = new IngestionLog({
    source: 'process3',
    status: 'ok',
    itemsDiscovered: 10,
    itemsIngested: 8,
  });

  assert.equal(await log.validate().catch((err) => err), undefined);
  assert.equal(log.source, 'process3');
  assert.equal(log.status, 'ok');
  assert.equal(log.itemsDiscovered, 10);
  assert.equal(log.itemsIngested, 8);
  assert.ok(log.startedAt instanceof Date);
  assert.equal(log.error, null);
});

test('IngestionLog schema: requires source and valid status enum', async () => {
  const invalidLog = new IngestionLog({
    status: 'unknown-status',
  });

  const err = await invalidLog.validate().catch((e) => e);
  assert.ok(err?.errors?.source, 'source should be required');
  assert.ok(err?.errors?.status, 'status should enforce enum ok | degraded | failed');
});
