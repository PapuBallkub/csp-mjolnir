import assert from 'node:assert/strict';
import { test } from 'node:test';

import { toAmount, toDate, toNumber, toText } from '#pipeline/extraction/convert.js';

const evidence = (value) => ({ quote: 'q', page: 1, value });

test('toAmount reads the number the model copied, and nothing else', () => {
  assert.equal(toAmount(evidence('๑๒,๕๐๐,๐๐๐')), 12_500_000);
  assert.equal(toAmount(evidence('ประมาณ ๑๒ ล้าน')), null);
  assert.equal(toAmount(null), null);
});

test('toDate converts a Buddhist-era date, read as Bangkok time', () => {
  // ๑๘ สิงหาคม ๒๕๖๙ เวลา ๑๖.๓๐ น. is 09:30 UTC on 18 August 2026
  const deadline = toDate(evidence({ day: 18, month: 8, year: 2569, era: 'BE', hour: 16, minute: 30 }));
  assert.equal(deadline.toISOString(), '2026-08-18T09:30:00.000Z');

  // No time given: the start of that day in Bangkok
  const posted = toDate(evidence({ day: 1, month: 1, year: 2569, era: 'BE', hour: null, minute: null }));
  assert.equal(posted.toISOString(), '2025-12-31T17:00:00.000Z');
});

test('toDate refuses dates that cannot be real', () => {
  const cases = [
    { day: 31, month: 2, year: 2569, era: 'BE' }, // 31 February
    { day: 1, month: 1, year: 2525, era: 'BE' }, // 1982: an OCR misread of 2569
    { day: 1, month: 1, year: 2569, era: 'CE' }, // a Buddhist year marked as CE
  ];
  for (const parts of cases) assert.equal(toDate(evidence({ hour: null, minute: null, ...parts })), null);
});

test('toNumber and toText return null for anything unusable', () => {
  assert.equal(toNumber(evidence(150)), 150);
  assert.equal(toNumber(evidence(-1)), null);
  assert.equal(toText(evidence('  e-bidding ')), 'e-bidding');
  assert.equal(toText(evidence('   ')), null);
});
