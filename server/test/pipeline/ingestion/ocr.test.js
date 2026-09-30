import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanOcrText, isTruncated } from '#pipeline/ingestion/lib/ocr.js';

test('cleanOcrText normalizes Unicode to NFC', () => {
  // Decomposed Thai character (e.g. 'ก' + upper vowel 'ิ')
  const decomposed = 'ก\u0E34';
  const cleaned = cleanOcrText(decomposed);
  assert.equal(cleaned, decomposed.normalize('NFC'));
});

test('cleanOcrText strips isolated page markers', () => {
  const input = 'เอกสารประกวดราคา\n-- 1 of 12 --\nรายละเอียดคุณลักษณะ';
  const cleaned = cleanOcrText(input);
  assert.ok(!cleaned.includes('-- 1 of 12 --'));
  assert.ok(cleaned.includes('เอกสารประกวดราคา'));
  assert.ok(cleaned.includes('รายละเอียดคุณลักษณะ'));
});

test('cleanOcrText preserves short Thai and English specifications', () => {
  const input = [
    '๑. คุณสมบัติทั่วไป',
    '๑ ชุด',
    '24 Core CPU',
    'RAM 64 GB',
    '๑๒ เดือน',
  ].join('\n');

  const cleaned = cleanOcrText(input);
  assert.ok(cleaned.includes('๑. คุณสมบัติทั่วไป'));
  assert.ok(cleaned.includes('๑ ชุด'));
  assert.ok(cleaned.includes('24 Core CPU'));
  assert.ok(cleaned.includes('RAM 64 GB'));
  assert.ok(cleaned.includes('๑๒ เดือน'));
});

test('cleanOcrText removes lines containing only scanner noise and punctuation', () => {
  const input = [
    'หัวข้อโครงการจัดซื้อ',
    '-----------------------',
    '_______~~~~~........***',
    '| | | / \\',
    'ข้อกำหนดทางเทคนิค',
  ].join('\n');

  const cleaned = cleanOcrText(input);
  const lines = cleaned.split('\n');
  assert.equal(lines.length, 2);
  assert.equal(lines[0], 'หัวข้อโครงการจัดซื้อ');
  assert.equal(lines[1], 'ข้อกำหนดทางเทคนิค');
});

test('cleanOcrText collapses horizontal spaces and excessive newlines', () => {
  const input = 'ข้อ ๑    ระบบฐานข้อมูล    ขนาดใหญ่\n\n\n\n\nข้อ ๒   การรับประกัน';
  const cleaned = cleanOcrText(input);
  assert.equal(cleaned, 'ข้อ ๑ ระบบฐานข้อมูล ขนาดใหญ่\n\nข้อ ๒ การรับประกัน');
});

test('cleanOcrText handles empty and non-string inputs safely', () => {
  assert.equal(cleanOcrText(''), '');
  assert.equal(cleanOcrText(null), '');
  assert.equal(cleanOcrText(undefined), '');
  assert.equal(cleanOcrText('    \n\n   '), '');
});

// Any page that did not reach rawText counts: a TOR is sent to review rather
// than trusted when the answer could sit on a page we never read (ADR 0013).
const complete = { stoppedEarly: null, skippedPages: [], pagesAttempted: 30, totalPages: 30 };

test('isTruncated is false only when every page of a known-length document was read', () => {
  assert.equal(isTruncated(complete), false);
});

test('isTruncated flags a document cut short by the page limit or the time budget', () => {
  assert.equal(
    isTruncated({ ...complete, stoppedEarly: 'page-limit', pagesAttempted: 150, totalPages: 210 }),
    true,
  );
  assert.equal(
    isTruncated({ ...complete, stoppedEarly: 'timeout', pagesAttempted: 40, totalPages: 83 }),
    true,
  );
});

test('isTruncated flags a single page whose OCR failed, even mid-document', () => {
  assert.equal(isTruncated({ ...complete, skippedPages: [7] }), true);
});

test('isTruncated flags a document whose page count is unknown', () => {
  assert.equal(isTruncated({ ...complete, pagesAttempted: 5, totalPages: 0 }), true);
});
