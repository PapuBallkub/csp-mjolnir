import assert from 'node:assert/strict';
import { test } from 'node:test';

import { findThaiAmountInWords, parseThaiNumberWords } from '#pipeline/shared/thai-number-words.js';

test('parseThaiNumberWords reads digits, places and millions', () => {
  const cases = {
    หนึ่ง: 1,
    สิบ: 10, // no หนึ่ง before สิบ
    สิบเอ็ด: 11, // เอ็ด is 1 in the last place
    ยี่สิบ: 20, // ยี่ is 2 before สิบ
    ยี่สิบเอ็ด: 21,
    หนึ่งร้อยเอ็ด: 101,
    สี่ล้าน: 4_000_000,
    สิบสองล้านห้าแสน: 12_500_000,
    หนึ่งล้านแปดแสนห้าหมื่น: 1_850_000,
    สองล้านล้าน: 2_000_000_000_000, // ล้าน repeats upward
    หนึ่งร้อยล้านห้าสิบ: 100_000_050,
  };
  for (const [words, expected] of Object.entries(cases)) {
    assert.equal(parseThaiNumberWords(words), expected, words);
  }
});

test('parseThaiNumberWords refuses anything it cannot read with certainty', () => {
  for (const words of ['', 'สองสาม', 'ร้อยพัน', 'ล้าน', 'สิบบาท', 'หนึ่งxสอง']) {
    assert.equal(parseThaiNumberWords(words), null, JSON.stringify(words));
  }
});

test('findThaiAmountInWords reads the amount in a real TOR sentence', () => {
  assert.equal(
    findThaiAmountInWords('จํานวนเงิน ๑๒,๕๐๐,๐๐๐ บาท\n(สิบสองล้านห้าแสนบาทถ้วน)'),
    12_500_000,
  );
  // The R3 case from the first trial: the words say four million
  assert.equal(findThaiAmountInWords('ในวงเงินไม่น้อยกว่า ๕,๐๐๐,๐๐๐.- บาท (สี่ล้านบาทถ้วน)'), 4_000_000);
});

test('findThaiAmountInWords copes with OCR spacing, and reads satang', () => {
  assert.equal(findThaiAmountInWords('(หนึ่ง ร้อย\nบาทถ้วน)'), 100);
  assert.equal(findThaiAmountInWords('ห้าสิบบาทยี่สิบห้าสตางค์'), 50.25);
});

test('findThaiAmountInWords returns null when there is nothing to verify against', () => {
  // Digits only, a damaged word, and a mixed form: all "can't verify", not "wrong"
  for (const text of ['๑,๘๕๐,๐๐๐ บาท', 'สี่ลาน บาท', '1.5 ล้านบาท', null]) {
    assert.equal(findThaiAmountInWords(text), null, JSON.stringify(text));
  }
});
