/**
 * server/src/pipeline/ingestion/lib/egp-package.js
 *
 * What's in an e-GP document package, and what its announcement and bidding
 * document state (ADR 0020). Pure: no network and no disk, so it's tested on
 * the text real documents give.
 *
 * A package holds the announcement (annoudoc_*), the bidding document (doc_*),
 * the TOR under any name, and blank forms that are the same in every project.
 * The announcement and the bidding document are filled-in forms with a real
 * text layer: their values come out after the template's words, not inside
 * them ("ในวันที่ ๑๙ / ระหว่างเวลา น. ถึง น. … ตุลาคม ๒๕๖๙ ๐๙.๐๐ ๑๒.๐๐"), so
 * they're read by what they look like, not where they sit.
 */

import { findThaiAmountInWords, parseThaiNumberWords } from '../../shared/thai-number-words.js';
import { convertThaiDigitsToArabic, normalizeThaiPua, parseThaiAmount } from '../../shared/thai-text.js';

// The blank forms e-GP puts in every package, byte for byte the same
const FORM_NAMES = [
  /^advance payment bond\.pdf$/i,
  /^bid bond\.pdf$/i,
  /^performance bond\.pdf$/i,
  /^retention bond\.pdf$/i,
  /^bidding noltice\.pdf$/i, // e-GP's spelling
  /^contract_\d+\.pdf$/i,
  /^definition_\d+\.pdf$/i,
  /^document part\s*\d+\.pdf$/i,
  /^domestic material use plan\.pdf$/i,
  /^performance\.pdf$/i,
  /^quotation\.pdf$/i,
  /^action_plan\.xlsx$/i,
  /^price adjustment\.pdf$/i, // construction's price-adjustment (ค่า K) form, 14 scanned pages
];

/** A zip entry's own name, without the folders it may sit in. */
export const baseName = (entryName) => String(entryName).split(/[\\/]/).pop();

/**
 * What a file in a package is.
 *
 * @param {string} entryName
 * @returns {'announcement' | 'bidding' | 'form' | 'other'}
 */
export function roleOfEntry(entryName) {
  const name = baseName(entryName);
  if (/^annoudoc_.*\.pdf$/i.test(name)) return 'announcement';
  if (/^doc_.*\.pdf$/i.test(name)) return 'bidding';
  if (FORM_NAMES.some((form) => form.test(name))) return 'form';
  return 'other';
}

// "tor" as a word of its own, so "Attach_TOR_1" and "TOR Smart" count and
// "monitor" doesn't; or the Thai name of a TOR
const NAMED_TOR = /(^|[^a-z])tor([^a-z]|$)|ขอบเขต|คุณลักษณะ/i;
// e-GP's own TOR form, which an agency types into: tor_<projectId>_<uuid>.pdf
const TYPED_TOR = /^tor_\d{11}_[0-9a-f-]+\.pdf$/i;
// Kept, but never the TOR, however large:
const NOT_TOR = [
  // a construction price build-up from e-GP's price calculator ("แบบแสดง
  // รายการ ปริมาณงาน และราคา"), next to its <number>.xls
  /^\d+_02\.pdf$/i,
  // the form for paying a bid bond (แบบแจ้งยืนยันรายการชำระเงินค่าหลักประกัน)
  /^bill_payment\.pdf$/i,
];

const inNameOrder = (a, b) =>
  baseName(a.name).localeCompare(baseName(b.name), 'en', { numeric: true, sensitivity: 'base' });

/**
 * The TOR's files, in reading order, by elimination among the PDFs that are
 * neither announcement, bidding document nor form (ADR 0020):
 * 1. e-GP's own TOR form, typed in: the TOR in real text, when it has one.
 * 2. Otherwise every file named as a TOR, in order. Agencies split a TOR
 *    over several ("Attach_TOR_1" to "_3"), and the main part isn't always
 *    the first or the largest, so all of them are the TOR.
 * 3. Otherwise the largest file: agencies name it as they like
 *    ("PPC.29092569.pdf"). A guess, and the best one we found: of the
 *    packages we checked, it was the TOR or its specification in 3 of 4; the
 *    fourth held no TOR at all, only drawings. Pages would guess worse: a
 *    six-page price form outnumbers a three-page specification.
 *
 * @param {{ name: string, role: string, sizeBytes: number, textLayer?: string }[]} files
 * @returns {object[]} Some of `files`; empty when no file is left
 */
export function pickTorFiles(files) {
  const candidates = files.filter(
    (file) => file.role === 'other' && /\.pdf$/i.test(file.name) && !NOT_TOR.some((name) => name.test(baseName(file.name))),
  );

  const typed = candidates.filter((file) => TYPED_TOR.test(baseName(file.name)) && file.textLayer === 'text');
  if (typed.length > 0) return [typed.sort((a, b) => b.sizeBytes - a.sizeBytes)[0]];

  const named = candidates.filter((file) => NAMED_TOR.test(baseName(file.name)));
  if (named.length > 0) return named.sort(inNameOrder);

  const largest = candidates.sort((a, b) => b.sizeBytes - a.sizeBytes)[0];
  return largest ? [largest] : [];
}

// One line of standard Thai: some fonts' text layers carry Private Use Area marks
const flatten = (text) => normalizeThaiPua(text).replace(/\s+/g, ' ').trim();

/**
 * The agency, from the announcement's heading: "ประกาศกรมการค้าภายใน" above
 * "เรื่อง …". A draft's may start with "(ร่าง)"; a long name may wrap.
 */
export function readAgency(text) {
  const lines = normalizeThaiPua(text)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const subject = lines.findIndex((line) => line.startsWith('เรื่อง'));
  if (subject <= 0) return null;

  // The heading is the closest line above "เรื่อง" that starts with ประกาศ
  let start = -1;
  for (let i = subject - 1; i >= Math.max(0, subject - 3); i--) {
    if (/^(?:\(ร่าง\)\s*)?ประกาศ/.test(lines[i])) {
      start = i;
      break;
    }
  }
  if (start === -1) return null;

  const quote = lines.slice(start, subject).join(' ');
  const value = quote.replace(/^\(ร่าง\)\s*/, '').replace(/^ประกาศ\s*/, '').trim();
  return value ? { value, quote } : null;
}

const DIGIT = '[0-9๐-๙]';
const AMOUNT = new RegExp(
  `(${DIGIT}{1,3}(?:,${DIGIT}{3})+|${DIGIT}+)(\\.${DIGIT}{1,2})?\\s*บาท\\s*\\(([^)]{3,200})\\)`,
);

// Where the template's ราคากลาง sentence starts. The layout can split the word
// itself across lines ("ราคา … / กลางของงาน ในการประกวดราคาครั้งนี้"), so the
// rest of the sentence marks it too.
const PRICE_ANCHORS = ['ราคากลาง', 'กลางของงาน', 'ในการประกวดราคาครั้งนี้'];

/**
 * ราคากลาง: the first amount after the word, "๑,๒๙๐,๔๒๐.๐๐ บาท (หนึ่งล้าน…บาทถ้วน)".
 * Kept only when its digits and its words agree; otherwise null, with the
 * reason, never a guess.
 *
 * @returns {{ value: number, quote: string } | { problem: string } | null}
 */
export function readReferencePrice(text) {
  const flat = flatten(text);
  const found = PRICE_ANCHORS.map((anchor) => flat.indexOf(anchor)).filter((index) => index !== -1);
  if (found.length === 0) return null;
  const at = Math.min(...found);
  const match = flat.slice(at).match(AMOUNT);
  if (!match) return null;

  const digits = parseThaiAmount(`${match[1]}${match[2] ?? ''}`);
  const words = findThaiAmountInWords(match[3]);
  if (digits === null || words === null || Math.abs(digits - words) >= 1) {
    return { problem: `ราคากลาง: digits and words don't agree in "${match[0]}"` };
  }
  return { value: digits, quote: match[0] };
}

const MONTHS = [
  ['มกราคม', 'ม.ค.'],
  ['กุมภาพันธ์', 'ก.พ.'],
  ['มีนาคม', 'มี.ค.'],
  ['เมษายน', 'เม.ย.'],
  ['พฤษภาคม', 'พ.ค.'],
  ['มิถุนายน', 'มิ.ย.'],
  ['กรกฎาคม', 'ก.ค.'],
  ['สิงหาคม', 'ส.ค.'],
  ['กันยายน', 'ก.ย.'],
  ['ตุลาคม', 'ต.ค.'],
  ['พฤศจิกายน', 'พ.ย.'],
  ['ธันวาคม', 'ธ.ค.'],
];
const escape = (word) => word.replace(/\./g, '\\.');
const MONTH = `(${MONTHS.flat().sort((a, b) => b.length - a.length).map(escape).join('|')})`;
const monthOf = (word) => MONTHS.findIndex((names) => names.includes(word)) + 1;
const TIME = `(${DIGIT}{1,2})[.:](${DIGIT}{2})`;
const number = (digits) => Number(convertThaiDigitsToArabic(digits));

const BANGKOK_UTC_OFFSET_HOURS = 7;
const BUDDHIST_ERA_OFFSET = 543;

/** A Bangkok date and time as a Date, or null if it isn't a real one. */
function bangkokTime({ day, month, year, hour, minute }) {
  const ce = year > 2400 ? year - BUDDHIST_ERA_OFFSET : year;
  if (!(day >= 1 && day <= 31 && month >= 1 && hour <= 23 && minute <= 59)) return null;
  const time = new Date(Date.UTC(ce, month - 1, day, hour - BANGKOK_UTC_OFFSET_HOURS, minute));
  // Date.UTC rolls 31 November over into December; a rolled-over date was not real
  const local = new Date(time.getTime() + BANGKOK_UTC_OFFSET_HOURS * 3_600_000);
  return local.getUTCDate() === day ? time : null;
}

function windowOf({ day, month, year, opens, closes }, quote) {
  const date = { day: number(day), month: monthOf(month), year: number(year) };
  const opensAt = bangkokTime({ ...date, hour: number(opens[0]), minute: number(opens[1]) });
  const closesAt = bangkokTime({ ...date, hour: number(closes[0]), minute: number(closes[1]) });
  if (!opensAt || !closesAt || closesAt <= opensAt) return null;
  return { opensAt, closesAt, quote };
}

// The bidding document's layout: "๑๙ ตุลาคม ๒๕๖๙ ระหว่างเวลา ๐๙.๐๐ น. ถึง ๑๒.๐๐ น."
const CLEAN_WINDOW = new RegExp(
  `(${DIGIT}{1,2})\\s*${MONTH}\\s*(?:พ\\.ศ\\.\\s*)?(${DIGIT}{4})\\s*ระหว่างเวลา\\s*${TIME}\\s*น\\.?\\s*ถึง\\s*${TIME}\\s*น\\.?`,
  'g',
);

/**
 * The bid window as the bidding document states it. Only a date that follows
 * talk of bidding (เสนอ) counts: a site visit has a date and times too.
 */
export function readBiddingWindow(text) {
  const flat = flatten(text);
  for (const match of flat.matchAll(CLEAN_WINDOW)) {
    if (!flat.slice(Math.max(0, match.index - 120), match.index).includes('เสนอ')) continue;
    const [quote, day, month, year, openH, openM, closeH, closeM] = match;
    const window = windowOf({ day, month, year, opens: [openH, openM], closes: [closeH, closeM] }, quote);
    if (window) return window;
  }
  return null;
}

/**
 * The bid window as the announcement states it, in any order: item ๒ says
 * "ในวันที่ <day> ระหว่างเวลา <time> น. ถึง <time> น.", but the filled-in
 * values come out after the words. A draft leaves the values blank: then null.
 */
export function readAnnouncementWindow(text) {
  const flat = flatten(text);
  for (const found of flat.matchAll(/ในวันที่/g)) {
    if (!flat.slice(Math.max(0, found.index - 120), found.index).includes('เสนอราคา')) continue;

    // Item ๒ runs to item ๓ ("๓. ผู้สนใจ…"); "๑๓.๐๐" is a time, not item ๓
    const rest = flat.slice(found.index);
    const end = rest.search(/(?:^|\s)[๓3]\.\s/);
    const item = end === -1 ? rest.slice(0, 300) : rest.slice(0, end);

    const day = item.match(new RegExp(`^ในวันที่\\s*(${DIGIT}{1,2})(?!${DIGIT})`))?.[1];
    const month = item.match(new RegExp(MONTH))?.[1];
    const year = item.match(new RegExp(`(?<!${DIGIT})(${DIGIT}{4})(?!${DIGIT})`))?.[1];
    const times = [...item.matchAll(new RegExp(TIME, 'g'))];
    if (!day || !month || !year || times.length < 2) return null;

    return windowOf({ day, month, year, opens: times[0].slice(1, 3), closes: times[1].slice(1, 3) }, item.trim());
  }
  return null;
}

/* --------------------------- The price form (ADR 0023) --------------------------- */

// Slips Tesseract makes in amounts written in words, as seen on real price
// forms: a dropped tone mark, or ล read as ด. Each is repaired only inside
// an amount in words, which must then read as one, so a repair can't make
// an amount out of ordinary text.
const OCR_WORD_SLIPS = [
  [/สี(?!่)/g, 'สี่'], // สีพัน → สี่พัน
  [/ยี(?!่)/g, 'ยี่'], // ยีสิบ → ยี่สิบ
  [/หนึง/g, 'หนึ่ง'],
  [/หมืน/g, 'หมื่น'],
  [/ด้าน/g, 'ล้าน'], // สี่ด้าน → สี่ล้าน
];

/**
 * An amount written in words, read whole: "(หนึ่งล้าน…บาทถ้วน)". Every word
 * must be a number word, so a slip OCR can't repair makes it unreadable
 * instead of leaving a tail that reads as a smaller amount: "เก้าแสนเจ็ด
 * หมืนห้าพันบาท" once read as ห้าพันบาท, 5,000.
 */
function readWordsWhole(words) {
  let thai = String(words).replace(/[^ก-๏]/g, ''); // OCR noise, spaces and digits out
  for (const [slip, fix] of OCR_WORD_SLIPS) thai = thai.replace(slip, fix);
  const match = thai.match(/^(.+?)บาท(.*)$/);
  if (!match) return null;
  const baht = parseThaiNumberWords(match[1]);
  if (baht === null) return null;
  // After บาท: satang, or ถ้วน, which OCR may garble ("ถ้าว"): only satang counts
  const satangWords = match[2].match(/^(.+)สตางค์$/)?.[1];
  if (!satangWords) return baht;
  const satang = parseThaiNumberWords(satangWords);
  return satang === null || satang >= 100 ? null : baht + satang / 100;
}

// OCR writes ำ as two characters (U+0E4D U+0E32)
const unifySaraAm = (text) => String(text ?? '').replace(/ํา/g, 'ำ');

/** The integer digits of a number, for a size check: 1194600 → 7. */
const digitCount = (value) => String(Math.trunc(value)).length;

// A whole number just before "บาท" (Tesseract sometimes reads it "UM"), maybe
// written "๑๓๕,๐๐๐.-บาท", with nothing glued to its front: a run OCR broke
// with a letter isn't one
const WHOLE_AMOUNT_BEFORE_BAHT = new RegExp(`(?:^|\\s)(${DIGIT}[0-9๐-๙,.]*${DIGIT})[.\\-\\s]*(?:บาท|um)`, 'gi');

/**
 * The amount an item of the form states. Forms write it in digits and
 * often in words too:
 * - **Words** give the value when they read whole: scanned digits are often
 *   misread (๑,๑๙๔,๖๐๐ came out ๑,๑๕๕,๒๐๐) while the words survive. The
 *   digits, when they read as a whole number, must have as many places: a
 *   word OCR got wrong would rarely keep the size.
 * - **Digits alone** otherwise. Whether OCR'd digits can be trusted is
 *   decided by readPriceForm.
 *
 * @returns {{ value: number, quote: string, basis: 'words' | 'digits' } | { problem: string } | null}
 */
function amountIn(segment, label) {
  // The innermost parentheses: OCR noise can open one far earlier
  const words = segment.match(/\(([^()]*บาท[^()]*)\)/);
  const before = words ? segment.slice(0, words.index) : segment;
  const digitsMatch = [...before.matchAll(WHOLE_AMOUNT_BEFORE_BAHT)].at(-1);
  const digits = digitsMatch ? parseThaiAmount(digitsMatch[1]) : null;

  if (words) {
    const value = readWordsWhole(words[1]);
    if (value !== null) {
      // Only digits that kept their separators: "๕๓๕๐๐๐๐๐๐" lost them, and its decimals with them
      if (digits !== null && digitsMatch[1].includes(',') && digitCount(digits) !== digitCount(value)) {
        return { problem: `${label}: the words say ${value.toLocaleString()}, the digits "${digitsMatch[1]}" a different size` };
      }
      return { value, basis: 'words', quote: segment.slice(0, words.index + words[0].length).trimEnd() };
    }
    if (digits === null) return { problem: `${label}: the amount in words can't be read in "${words[0]}"` };
  }
  if (digits === null) return null;
  return { value: digits, basis: 'digits', quote: segment.slice(0, digitsMatch.index + digitsMatch[0].length).trimEnd() };
}

/**
 * What the price form states (แบบ บก.: "ตารางแสดงวงเงินงบประมาณที่ได้รับจัดสรร
 * และราคากลาง"):
 * - the budget, from "วงเงินงบประมาณ" (the form's title says it too, without an
 *   amount, so each mention is tried until one gives an amount);
 * - ราคากลาง, from "กำหนดราคากลาง" (the date-and-amount item; the title's
 *   "และราคากลาง" has none).
 *
 * An amount OCR read in digits alone is kept only when this form's ราคากลาง
 * matches the announcement's, which is real text: proof that OCR read this
 * form's digits right. A form with a real text layer needs no such proof.
 * Construction's form (บก.01) lays its values out of order and isn't read.
 *
 * @param {string} text - The form's text layer, or its OCR text
 * @param {{ ocr?: boolean, announcedReferencePrice?: number | null }} [options]
 * @returns {{ budgetTHB: object | null, referencePriceTHB: object | null, problems: string[] }}
 */
export function readPriceForm(text, { ocr = true, announcedReferencePrice = null } = {}) {
  const flat = flatten(unifySaraAm(text));
  const problems = [];

  // Each mention of the anchor runs to the next one, or to where the item ends
  const firstAmount = (anchor, until, label) => {
    for (const found of flat.matchAll(new RegExp(anchor.source, 'g'))) {
      const rest = flat.slice(found.index + found[0].length);
      const end = rest.search(new RegExp(`${anchor.source}|${until.source}`));
      const segment = (end === -1 ? rest : rest.slice(0, end)).slice(0, 400);
      const amount = amountIn(segment, label);
      if (amount?.problem) {
        problems.push(amount.problem);
        return null;
      }
      if (amount) return { ...amount, quote: `${found[0]}${amount.quote}` };
    }
    return null;
  };

  // Forms word it "ที่ได้รับ(การ)จัดสรร", some text layers drop the tone mark
  // ("ที่ไดรับ"), and OCR has read วงเงิน as จงเงิน
  const budget = firstAmount(/(?:[วจ]งเงิน)?งบประมาณที่ได้?รับ(?:การ)?จัดสรร/, /ราคากลาง/, 'Budget');
  const price = firstAmount(/กำหนดราคากลาง/, /แหล่งที่มา|รายชื่อ|ที่มาของ/, 'ราคากลาง on the price form');

  const vouched = Boolean(price && announcedReferencePrice && Math.abs(price.value - announcedReferencePrice) < 1);
  const keep = (amount, label) => {
    if (!amount) return null;
    if (amount.basis === 'digits' && ocr && !vouched) {
      problems.push(
        `${label}: OCR read ${amount.value.toLocaleString()} in digits alone, and this form's ราคากลาง ` +
          "doesn't match the announcement's to vouch for them",
      );
      return null;
    }
    return { value: amount.value, quote: amount.quote, document: 'price-form' };
  };

  return {
    budgetTHB: keep(budget, 'Budget'),
    referencePriceTHB: keep(price, 'ราคากลาง on the price form'),
    problems,
  };
}

const sameWindow = (a, b) =>
  a.opensAt.getTime() === b.opensAt.getTime() && a.closesAt.getTime() === b.closesAt.getTime();

/**
 * What a package's announcement and bidding document state, read in code.
 * Each value keeps the sentence it came from and the document that said it.
 * A value neither states is null; so is one they disagree on, with the
 * reason in `problems`.
 *
 * @param {{ announcementText?: string, biddingText?: string }} texts
 */
export function readPackageFacts({ announcementText = '', biddingText = '' }) {
  const problems = [];
  const from = (document, read) => (read ? { ...read, document } : null);

  const agency = from('announcement', readAgency(announcementText));

  const price = readReferencePrice(announcementText);
  if (price?.problem) problems.push(price.problem);
  const referencePriceTHB = price && !price.problem ? from('announcement', price) : null;

  // The bidding document's layout is the cleaner one, so it's read first
  const inBidding = from('bidding', readBiddingWindow(biddingText));
  const inAnnouncement = from('announcement', readAnnouncementWindow(announcementText));
  let submissionWindow = inBidding ?? inAnnouncement;
  if (inBidding && inAnnouncement && !sameWindow(inBidding, inAnnouncement)) {
    problems.push(
      `Bid window: the bidding document says "${inBidding.quote}", the announcement "${inAnnouncement.quote}"`,
    );
    submissionWindow = null;
  }

  return { agency, referencePriceTHB, submissionWindow, problems };
}
