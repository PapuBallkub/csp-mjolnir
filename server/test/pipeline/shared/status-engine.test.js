import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveStatus } from '#pipeline/shared/status-engine.js';

test('empty history defaults to Open, not amended', () => {
  const result = deriveStatus([]);
  assert.equal(result.status, 'Open');
  assert.equal(result.isAmended, false);
});

test('B0 only → Draft', () => {
  const result = deriveStatus([{ code: 'B0' }]);
  assert.equal(result.status, 'Draft');
  assert.equal(result.isAmended, false);
});

test('B0 then D0 → Open', () => {
  const result = deriveStatus([{ code: 'B0' }, { code: 'D0' }]);
  assert.equal(result.status, 'Open');
  assert.equal(result.isAmended, false);
});

test('D0 then D1 → Open + amended', () => {
  const result = deriveStatus([{ code: 'D0' }, { code: 'D1' }]);
  assert.equal(result.status, 'Open');
  assert.equal(result.isAmended, true);
});

test('B0 then D1 (no D0) → Open + amended (amendment implies bidding is open)', () => {
  const result = deriveStatus([{ code: 'B0' }, { code: 'D1' }]);
  assert.equal(result.status, 'Open');
  assert.equal(result.isAmended, true);
});

test('D0 then D1 then D2 → Open + amended', () => {
  const result = deriveStatus([{ code: 'D0' }, { code: 'D1' }, { code: 'D2' }]);
  assert.equal(result.status, 'Open');
  assert.equal(result.isAmended, true);
});

test('reference price (15) alone → Open, not amended', () => {
  const result = deriveStatus([{ code: '15' }]);
  assert.equal(result.status, 'Open');
  assert.equal(result.isAmended, false);
});

test('contract with winner overrides to Awarded', () => {
  const result = deriveStatus(
    [{ code: 'D0' }],
    { winnerName: 'บริษัท ABC จำกัด' },
  );
  assert.equal(result.status, 'Awarded');
});

test('contract with winner + amendment history → Awarded + amended', () => {
  const result = deriveStatus(
    [{ code: 'D0' }, { code: 'D1' }],
    { winnerName: 'บริษัท XYZ จำกัด' },
  );
  assert.equal(result.status, 'Awarded');
  assert.equal(result.isAmended, true);
});

test('unknown code is silently ignored', () => {
  const result = deriveStatus([{ code: 'ZZ' }, { code: 'D0' }]);
  assert.equal(result.status, 'Open');
  assert.equal(result.isAmended, false);
});
