import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { AxiosError } from 'axios';

import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { PipelineFailure } from '#models/index.js';
import { clearFailure, isOutage, loadGivenUp, recordFailure } from '#pipeline/shared/failures.js';

const TEST_DB = 'mjolnir_test';
const PROJECT = '66666000001';
const OTHER = '66666000002';

const httpError = (status) =>
  new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_RESPONSE', undefined, undefined, { status });

before(async () => {
  await connectDatabase({ dbName: TEST_DB });
});

beforeEach(async () => {
  await PipelineFailure.deleteMany({ projectId: { $in: [PROJECT, OTHER] } });
});

after(async () => {
  await PipelineFailure.deleteMany({ projectId: { $in: [PROJECT, OTHER] } });
  await disconnectDatabase();
});

test('isOutage: a source that did not answer, is down, or rate-limits us', () => {
  assert.equal(isOutage(new AxiosError('timeout of 10000ms exceeded', 'ECONNABORTED')), true);
  assert.equal(isOutage(httpError(503)), true);
  assert.equal(isOutage(httpError(429)), true);
  // Gemini's errors carry the status directly; fetch puts the network code in `cause`
  assert.equal(isOutage({ status: 500, message: 'internal' }), true);
  assert.equal(isOutage(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } })), true);
});

test('isOutage: an answer about this TOR is not an outage', () => {
  assert.equal(isOutage(httpError(404)), false);
  assert.equal(isOutage({ status: 400, message: 'bad request' }), false);
  assert.equal(isOutage(new Error('Gemini stopped early (MAX_TOKENS)')), false);
  assert.equal(isOutage('No online attachment archive found'), false);
});

test('recordFailure: counts the TOR\'s own failures, and gives up at the limit', async () => {
  const first = await recordFailure({ projectId: PROJECT, step: 'download', error: 'no archive', maxAttempts: 3 });
  const second = await recordFailure({ projectId: PROJECT, step: 'download', error: 'no archive', maxAttempts: 3 });
  const third = await recordFailure({ projectId: PROJECT, step: 'download', error: 'still none', maxAttempts: 3 });

  assert.deepEqual([first.attempts, second.attempts, third.attempts], [1, 2, 3]);
  assert.deepEqual([first.gaveUp, second.gaveUp, third.gaveUp], [false, false, true]);

  const saved = await PipelineFailure.findOne({ projectId: PROJECT, step: 'download' }).lean();
  assert.equal(saved.lastError, 'still none');
  assert.ok(saved.firstFailedAt <= saved.lastFailedAt);
});

test('recordFailure: an outage is recorded but not counted', async () => {
  await recordFailure({ projectId: PROJECT, step: 'download', error: 'no archive' });
  const outage = await recordFailure({
    projectId: PROJECT,
    step: 'download',
    error: new AxiosError('timeout of 10000ms exceeded', 'ECONNABORTED'),
  });

  assert.equal(outage.counted, false);
  assert.equal(outage.attempts, 1);
  const saved = await PipelineFailure.findOne({ projectId: PROJECT, step: 'download' }).lean();
  assert.equal(saved.lastTransient, true);
  assert.match(saved.lastError, /timeout/);
});

test('recordFailure: a new input starts the count again', async () => {
  await recordFailure({ projectId: PROJECT, step: 'extract', error: 'MAX_TOKENS', inputKey: 'source-a|v3|m' });
  await recordFailure({ projectId: PROJECT, step: 'extract', error: 'MAX_TOKENS', inputKey: 'source-a|v3|m' });
  const afterNewPrompt = await recordFailure({ projectId: PROJECT, step: 'extract', error: 'x', inputKey: 'source-a|v4|m' });

  assert.equal(afterNewPrompt.attempts, 1);
});

test('loadGivenUp: lists TORs at the limit, unless their input has changed', async () => {
  for (let i = 0; i < 3; i++) {
    await recordFailure({ projectId: PROJECT, step: 'ocr', error: 'crash', inputKey: 'pdf-1' });
  }
  await recordFailure({ projectId: OTHER, step: 'ocr', error: 'crash', inputKey: 'pdf-2' });

  const gaveUp = await loadGivenUp('ocr', { maxAttempts: 3 });
  assert.equal(gaveUp(PROJECT, 'pdf-1'), true);
  assert.equal(gaveUp(PROJECT, 'pdf-1-amended'), false); // a new PDF gets new tries
  assert.equal(gaveUp(OTHER, 'pdf-2'), false); // one failure isn't enough
  assert.equal((await loadGivenUp('download', { maxAttempts: 3 }))(PROJECT, 'pdf-1'), false);
});

test('clearFailure: a step that succeeds forgets its failures', async () => {
  await recordFailure({ projectId: PROJECT, step: 'download', error: 'no archive' });
  await clearFailure({ projectId: PROJECT, step: 'download' });

  assert.equal(await PipelineFailure.findOne({ projectId: PROJECT, step: 'download' }), null);
});
