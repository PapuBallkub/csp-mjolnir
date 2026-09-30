import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseThaiAmount } from '#pipeline/shared/thai-text.js';

test('parseThaiAmount reads the numbers data.go.th sends, satang included', () => {
  assert.equal(parseThaiAmount(9978750), 9978750);
  assert.equal(parseThaiAmount(2442861.36), 2442861.36);
});

test('parseThaiAmount reads clean amounts written as text', () => {
  assert.equal(parseThaiAmount('1,850,000.00'), 1850000);
  assert.equal(parseThaiAmount('1850000'), 1850000);
  assert.equal(parseThaiAmount('๑,๘๕๐,๐๐๐'), 1850000);
  assert.equal(parseThaiAmount('  1,850,000.5 บาท '), 1850000.5);
});

test('parseThaiAmount returns null, never 0, when there is no price', () => {
  for (const missing of [null, undefined, '', '   ', '-', 0, '0.00', Number.NaN]) {
    assert.equal(parseThaiAmount(missing), null, `${JSON.stringify(missing)} is not a price`);
  }
});

test('parseThaiAmount refuses to guess at anything that is not a clean amount', () => {
  // Stored as null and shown as "not specified", rather than stored wrong (ADR 0014)
  for (const unclear of [-5000, 'ประมาณ 1.8 ล้าน', '1,85,000', '1,850,000.000', '฿1,850,000', '1.850.000']) {
    assert.equal(parseThaiAmount(unclear), null, `${JSON.stringify(unclear)} is not read as a price`);
  }
});
