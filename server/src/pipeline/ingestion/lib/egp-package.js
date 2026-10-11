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

import { findThaiAmountInWords } from '../../shared/thai-number-words.js';
import { convertThaiDigitsToArabic, parseThaiAmount } from '../../shared/thai-text.js';

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

const flatten = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();

/**
 * The agency, from the announcement's heading: "ประกาศกรมการค้าภายใน" above
 * "เรื่อง …". A draft's may start with "(ร่าง)"; a long name may wrap.
 */
export function readAgency(text) {
  const lines = String(text ?? '')
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
