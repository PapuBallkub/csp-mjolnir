import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { PipelineLock } from '#models/index.js';
import { RunLockHeldError, acquireRunLock, withRunLock } from '#pipeline/shared/run-lock.js';

const TEST_DB = 'mjolnir_test';
const NAME = 'test-run-lock';

before(async () => {
  await connectDatabase({ dbName: TEST_DB });
});

beforeEach(async () => {
  await PipelineLock.deleteOne({ _id: NAME });
});

after(async () => {
  await PipelineLock.deleteOne({ _id: NAME });
  await disconnectDatabase();
});

test('run lock: a second run is refused while the first holds the lock', async () => {
  const first = await acquireRunLock(NAME);

  await assert.rejects(acquireRunLock(NAME), (error) => {
    assert.ok(error instanceof RunLockHeldError);
    assert.match(error.message, /Another test-run-lock run is in progress/);
    assert.match(error.message, new RegExp(`pid ${process.pid}`));
    return true;
  });

  await first.release();
  const second = await acquireRunLock(NAME);
  await second.release();
});

test('run lock: a crashed run stops renewing, and its expired lock is taken over', async () => {
  // Taken an hour ago with a one-minute lease, and never renewed since
  const crashed = await acquireRunLock(NAME, { leaseMs: 60_000, now: () => new Date(Date.now() - 3_600_000) });

  const next = await acquireRunLock(NAME);
  assert.notEqual(next.owner, crashed.owner);

  // The old holder finds out it lost the lock, and can't free the new one's
  assert.equal(await crashed.renew(), false);
  await crashed.release();
  assert.equal((await PipelineLock.findById(NAME).lean()).owner, next.owner);

  assert.equal(await next.renew(), true);
  await next.release();
});

test('withRunLock: holds the lock during the work and frees it after', async () => {
  const result = await withRunLock(NAME, async () => {
    await assert.rejects(acquireRunLock(NAME), RunLockHeldError);
    return 'done';
  });

  assert.equal(result, 'done');
  assert.equal(await PipelineLock.findById(NAME), null);
});

test('withRunLock: frees the lock when the work fails', async () => {
  await assert.rejects(
    withRunLock(NAME, async () => {
      throw new Error('OCR crashed');
    }),
    /OCR crashed/,
  );

  assert.equal(await PipelineLock.findById(NAME), null);
});
