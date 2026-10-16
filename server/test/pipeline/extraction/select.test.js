import assert from 'node:assert/strict';
import { test } from 'node:test';

import { decide, fingerprintFor, sourceFingerprint } from '#pipeline/extraction/select.js';

const tor = { document: { contentHash: 'pdf-1' }, amendments: [], ocr: { rawText: '=== Page 1 ===\nข้อความ' } };
const NOW = { fingerprint: sourceFingerprint(tor), promptVersion: 'extract-v3', model: 'gemini-3.7-flash' };
const insight = (meta = {}) => ({
  metadata: {
    sourceFingerprint: NOW.fingerprint,
    promptVersion: NOW.promptVersion,
    modelName: NOW.model,
    reviewStatus: 'pending',
    ...meta,
  },
});
const run = (existing, flags = {}) => {
  const { action, reason, warn } = decide({ insight: existing, ...NOW, flags });
  return `${action}:${reason}${warn ? ':warn' : ''}`;
};

test('sourceFingerprint changes with the PDF, an amendment document, or the OCR text', () => {
  const base = sourceFingerprint(tor);
  assert.equal(sourceFingerprint({ ...tor }), base, 'the same source gives the same fingerprint');
  assert.notEqual(sourceFingerprint({ ...tor, document: { contentHash: 'pdf-2' } }), base);
  assert.notEqual(sourceFingerprint({ ...tor, amendments: [{ contentHash: 'amend-1' }] }), base);
  assert.notEqual(sourceFingerprint({ ...tor, ocr: { rawText: 'all 83 pages this time' } }), base);
});

// The D10 table, row by row
test('a TOR with no insight yet is always processed', () => {
  assert.equal(run(null), 'process:new');
});

test('a changed source is always processed, and warns if a person had reviewed it', () => {
  assert.equal(run(insight({ sourceFingerprint: 'old' })), 'process:source-changed');
  assert.equal(run(insight({ sourceFingerprint: 'old', reviewStatus: 'approved' })), 'process:source-changed:warn');
});

test('an older prompt or model is counted but only re-run with --outdated', () => {
  assert.equal(run(insight({ promptVersion: 'extract-v1' })), 'skip:outdated');
  assert.equal(run(insight({ modelName: 'gemini-3.6-flash' })), 'skip:outdated');
  assert.equal(run(insight({ promptVersion: 'extract-v1' }), { outdated: true }), 'process:outdated');
});

test('a reviewed result survives --outdated, and is only redone when forced, with a warning', () => {
  const reviewed = insight({ promptVersion: 'extract-v1', reviewStatus: 'approved' });
  assert.equal(run(reviewed, { outdated: true }), 'skip:reviewed');
  assert.equal(run(reviewed, { force: true }), 'process:forced:warn');
  assert.equal(run(reviewed, { id: true }), 'process:forced:warn');
});

test('an up-to-date result is skipped unless forced', () => {
  assert.equal(run(insight()), 'skip:current');
  assert.equal(run(insight(), { force: true }), 'process:forced');
});

test('a title-level record is replaced once the project has been read (ADR 0028)', () => {
  // Built from the title and data.go.th's figures: a hash of those, not of any document
  const titleLevel = insight({ sourceFingerprint: 'title-level-hash', titleOnly: true });
  assert.equal(run(titleLevel), 'process:source-changed');
});

test('an extraction is fingerprinted with its bidding document, an excluded result without it (ADR 0025)', () => {
  const withBidding = {
    ...tor,
    packages: [{ kind: 'announcement', biddingText: 'เอกสารประกวดราคา ฉบับแรก' }],
  };
  const changedBidding = {
    ...tor,
    packages: [{ kind: 'announcement', biddingText: 'เอกสารประกวดราคา ฉบับแก้ไข' }],
  };

  // An extraction read the bidding document: a new one makes its result wrong
  assert.notEqual(sourceFingerprint(withBidding, { bidding: true }), sourceFingerprint(changedBidding, { bidding: true }));
  // An excluded or awaiting result was built from the TOR alone: it isn't classified again for one
  assert.equal(sourceFingerprint(withBidding), sourceFingerprint(changedBidding));
  assert.equal(sourceFingerprint(withBidding), sourceFingerprint(tor));
  // A TOR with no bidding document fingerprints as it always did
  assert.equal(sourceFingerprint(tor, { bidding: true }), sourceFingerprint(tor));

  // fingerprintFor picks by what the existing result was built from
  assert.equal(fingerprintFor(withBidding, { excluded: { reason: 'ก่อสร้างถนน' } }), sourceFingerprint(withBidding));
  assert.equal(fingerprintFor(withBidding, { awaitingFullText: true }), sourceFingerprint(withBidding));
  assert.equal(fingerprintFor(withBidding, { excluded: null }), sourceFingerprint(withBidding, { bidding: true }));
  assert.equal(fingerprintFor(withBidding, undefined), sourceFingerprint(withBidding), 'nothing yet: decide calls it new anyway');
});
