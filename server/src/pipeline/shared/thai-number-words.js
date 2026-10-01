/**
 * server/src/pipeline/shared/thai-number-words.js
 *
 * Reads amounts written in Thai words. Official documents write every amount
 * twice, in digits and in words, like a cheque:
 *
 *   ๕,๐๐๐,๐๐๐.- บาท (สี่ล้านบาทถ้วน)
 *
 * so the words are a built-in check on the digits. A misread digit, in the
 * document or in OCR, shows up as a disagreement between the two (R3).
 */

const DIGITS = {
  ศูนย์: 0,
  หนึ่ง: 1,
  เอ็ด: 1, // 1 in the last place: สิบเอ็ด = 11
  สอง: 2,
  ยี่: 2, // 2 before สิบ: ยี่สิบ = 20
  สาม: 3,
  สี่: 4,
  ห้า: 5,
  หก: 6,
  เจ็ด: 7,
  แปด: 8,
  เก้า: 9,
};
const PLACES = { สิบ: 10, ร้อย: 100, พัน: 1_000, หมื่น: 10_000, แสน: 100_000 };
const MILLION = 'ล้าน';

// Longest first, so a longer word is never read as a shorter one inside it
const WORDS = [...Object.keys(DIGITS), ...Object.keys(PLACES), MILLION].sort((a, b) => b.length - a.length);
const NUMBER_WORDS = `(?:${WORDS.join('|')})+`;
const AMOUNT_IN_WORDS = new RegExp(`(${NUMBER_WORDS})บาท(?:(${NUMBER_WORDS})สตางค์|ถ้วน)?`);

function tokenize(words) {
  const tokens = [];
  let rest = words;
  while (rest) {
    const word = WORDS.find((w) => rest.startsWith(w));
    if (!word) return null; // something that is not a number word
    tokens.push(word);
    rest = rest.slice(word.length);
  }
  return tokens;
}

/**
 * Reads a whole number written in Thai words, such as "สิบสองล้านห้าแสน" or
 * "หนึ่งร้อยเอ็ด". Returns null for anything it can't read with certainty.
 */
export function parseThaiNumberWords(words) {
  const tokens = tokenize(words);
  if (!tokens || tokens.length === 0) return null;

  let total = 0; // everything already multiplied by ล้าน
  let group = 0; // the part below a million being built up
  let digit = null; // a digit word waiting for its place word
  let lastPlace = Infinity; // places must shrink within a group

  for (const token of tokens) {
    if (token in DIGITS) {
      if (digit !== null) return null; // two digits in a row: not a number
      digit = DIGITS[token];
    } else if (token in PLACES) {
      const place = PLACES[token];
      if (place >= lastPlace) return null; // e.g. "ร้อยพัน"
      group += (digit ?? 1) * place; // "สิบ" alone is 10
      digit = null;
      lastPlace = place;
    } else {
      // ล้าน: everything so far is in millions, and a new group starts
      group += digit ?? 0;
      if (total === 0 && group === 0) return null;
      total = (total + group) * 1_000_000;
      group = 0;
      digit = null;
      lastPlace = Infinity;
    }
  }
  return total + group + (digit ?? 0);
}

/**
 * Finds the first amount written in words in a piece of text, such as
 * "(สิบสองล้านห้าแสนบาทถ้วน)", and reads it, satang included. Returns null when
 * there is none or it can't be read. That means "can't verify", never "wrong".
 */
export function findThaiAmountInWords(text) {
  if (typeof text !== 'string') return null;
  // OCR breaks words with spaces and line breaks; number words never contain any
  const compact = text.normalize('NFKC').replace(/\s+/g, '');
  const match = compact.match(AMOUNT_IN_WORDS);
  if (!match) return null;

  const baht = parseThaiNumberWords(match[1]);
  if (baht === null) return null;
  if (!match[2]) return baht;

  const satang = parseThaiNumberWords(match[2]);
  return satang === null || satang >= 100 ? null : baht + satang / 100;
}
