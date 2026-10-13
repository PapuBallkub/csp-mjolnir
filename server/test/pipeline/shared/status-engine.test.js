import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveStatus } from '#pipeline/shared/status-engine.js';

// Status and the amended flag; latestCode has its own test
const statusOf = (...args) => {
  const { status, isAmended } = deriveStatus(...args);
  return { status, isAmended };
};
const on = (code, day) => ({ code, publishedAt: new Date(`2026-10-${String(day).padStart(2, '0')}`) });

test('empty history defaults to Open, not amended', () => {
  assert.deepEqual(statusOf([]), { status: 'Open', isAmended: false });
});

test('B0 only → Draft', () => {
  assert.deepEqual(statusOf([{ code: 'B0' }]), { status: 'Draft', isAmended: false });
});

test('B0 then D0 → Open', () => {
  assert.deepEqual(statusOf([{ code: 'B0' }, { code: 'D0' }]), { status: 'Open', isAmended: false });
});

test('D0 then D2 (invitation changed) → Open + amended', () => {
  assert.deepEqual(statusOf([{ code: 'D0' }, { code: 'D2' }]), { status: 'Open', isAmended: true });
});

test('B0 then D2 (no D0 seen) → Open + amended: a changed invitation is a live one', () => {
  assert.deepEqual(statusOf([{ code: 'B0' }, { code: 'D2' }]), { status: 'Open', isAmended: true });
});

test('D0 then D1 (invitation cancelled) → Cancelled, not amended', () => {
  assert.deepEqual(statusOf([{ code: 'D0' }, { code: 'D1' }]), { status: 'Cancelled', isAmended: false });
});

test('a new invitation after a cancellation opens the project again', () => {
  assert.equal(deriveStatus([on('D0', 1), on('D1', 3), on('D0', 6)]).status, 'Open');
});

test('W0 (winner announced) → Awarded; W1 cancels it; W2 awards again', () => {
  assert.equal(deriveStatus([on('D0', 1), on('W0', 20)]).status, 'Awarded');
  assert.equal(deriveStatus([on('D0', 1), on('W0', 20), on('W1', 22)]).status, 'Cancelled');
  assert.equal(deriveStatus([on('D0', 1), on('W0', 20), on('W1', 22), on('W2', 25)]).status, 'Awarded');
});

test('reference price (15) alone → Open, and it never changes a status', () => {
  assert.equal(deriveStatus([{ code: '15' }]).status, 'Open');
  assert.equal(deriveStatus([{ code: 'B0' }, { code: '15' }]).status, 'Draft');
});

test('ordered by publish date, not by when the pipeline saw each one', () => {
  // The cancellation was seen first; its invitation arrived later from the
  // feed's 7-day backfill. The project is still cancelled.
  assert.equal(deriveStatus([on('D1', 5), on('D0', 1)]).status, 'Cancelled');
});

test('announcements from the same day keep their recorded order', () => {
  assert.equal(deriveStatus([on('D0', 7), on('D1', 7)]).status, 'Cancelled');
});

test('an entry with no date keeps its place after the one before it', () => {
  assert.equal(deriveStatus([on('D0', 1), { code: 'D1' }]).status, 'Cancelled');
});

test('contract with winner overrides to Awarded', () => {
  assert.equal(deriveStatus([{ code: 'D0' }], { winnerName: 'บริษัท ABC จำกัด' }).status, 'Awarded');
});

test('contract with winner + changed invitation → Awarded + amended', () => {
  assert.deepEqual(
    statusOf([{ code: 'D0' }, { code: 'D2' }], { winnerName: 'บริษัท XYZ จำกัด' }),
    { status: 'Awarded', isAmended: true },
  );
});

test('unknown code is silently ignored', () => {
  assert.deepEqual(statusOf([{ code: 'ZZ' }, { code: 'D0' }]), { status: 'Open', isAmended: false });
});

test('latestCode is the code of the latest announcement by publish date', () => {
  assert.equal(deriveStatus([on('D1', 6), on('D0', 3)]).latestCode, 'D1');
  assert.equal(deriveStatus([{ code: 'B0' }, { code: 'D0' }]).latestCode, 'D0');
  assert.equal(deriveStatus([]).latestCode, null);
});
