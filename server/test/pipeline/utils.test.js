import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeContentHash,
  convertThaiDigitsToArabic,
} from '#pipeline/lib/tor-downloader.js';
import { decodeThaiXml } from '#pipeline/sources/process3.js';

test('computeContentHash generates deterministic 64-char SHA-256 hex string', () => {
  const content = 'Test TOR document content';
  const hash1 = computeContentHash(content);
  const hash2 = computeContentHash(Buffer.from(content));

  assert.equal(typeof hash1, 'string');
  assert.equal(hash1.length, 64);
  assert.equal(hash1, hash2);

  const differentHash = computeContentHash('Different content');
  assert.notEqual(hash1, differentHash);

  assert.equal(computeContentHash(''), '');
  assert.equal(computeContentHash(null), '');
});

test('convertThaiDigitsToArabic converts all Thai digits ๐-๙ to 0-9', () => {
  assert.equal(convertThaiDigitsToArabic('๐๑๒๓๔๕๖๗๘๙'), '0123456789');
  assert.equal(
    convertThaiDigitsToArabic('งบประมาณ ๑,๕๐๐,๐๐๐ บาท'),
    'งบประมาณ 1,500,000 บาท',
  );
  assert.equal(convertThaiDigitsToArabic('Already 12345'), 'Already 12345');
  assert.equal(convertThaiDigitsToArabic(''), '');
  assert.equal(convertThaiDigitsToArabic(null), '');
});

test('decodeThaiXml properly decodes UTF-8 Thai XML buffers', () => {
  const thaiText = '<?xml version="1.0"?><title>โครงการจัดซื้อคอมพิวเตอร์</title>';
  const buffer = Buffer.from(thaiText, 'utf-8');
  const result = decodeThaiXml(buffer);

  assert.equal(result.encoding, 'utf-8');
  assert.equal(result.isCorrupted, false);
  assert.match(result.xmlText, /โครงการจัดซื้อคอมพิวเตอร์/);
});

test('decodeThaiXml handles Windows-874 byte sequences cleanly', () => {
  // Simulate Windows-874 encoding for Thai characters (e.g. ก is 0xA1 in Windows-874)
  const win874Buffer = Buffer.from([0xa1, 0xa2, 0xa3]); // ก ข ค in win874
  const result = decodeThaiXml(win874Buffer);

  assert.ok(result.xmlText.length > 0);
});
