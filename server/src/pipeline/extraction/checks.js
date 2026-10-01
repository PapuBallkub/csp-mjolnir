/**
 * server/src/pipeline/extraction/checks.js
 *
 * The checks that decide whether an extraction can be trusted (ADR 0013).
 * Confidence comes from here, never from the model: each check that fails is
 * recorded with what a reviewer needs to see, and the score is worked out
 * from those. Everything here is pure (no Gemini, no database), so all of it
 * is tested for free.
 */

import { convertThaiDigitsToArabic, parseThaiAmount } from '../shared/thai-text.js';
import { findThaiAmountInWords } from '../shared/thai-number-words.js';
import { toAmount, toDate, toNumber, toText } from './convert.js';

// A failed check on one of these caps the score below 80, so the TOR is hidden
// and waits for review (D6, NFR-17).
export const CRITICAL_FIELDS = new Set([
  'classification',
  'identification.titleTh',
  'identification.agency',
  'facts.referencePrice',
  'facts.submissionDeadline',
]);

const OCR_CONFIDENCE_REVIEW = 0.8; // below this the scan is suspect (D3)
const OCR_CONFIDENCE_CRITICAL = 0.6;
const TEXT_SIMILARITY_MIN = 0.8;
const BANGKOK_OFFSET_MS = 7 * 3_600_000;
// Grounding across OCR junk: a quote is cut into pieces, and the pieces must
// appear in order with at most this much junk between neighbours
const QUOTE_PIECE = 12;
const QUOTE_MAX_GAP = 40;
// A sentence that crosses a page skips the page's footer (TOR committees sign
// every page) and the "=== Page N ===" marker: a longer gap, allowed only when
// it holds a page marker
const QUOTE_MAX_PAGE_GAP = 400;
const PAGE_MARKER = normalizeForMatch('=== Page');
const QUOTE_MIN_PIECES = 4; // shorter quotes must match exactly
const QUOTE_MISSING_SHARE = 0.15; // pieces broken by junk that may go unmatched
const AMOUNT_DIGITS = /[0-9][0-9,]*(?:\.[0-9]+)?/g;

// Fields the model answers with { quote, page, value }, and how to read each
const EVIDENCED_FIELDS = {
  'identification.titleTh': toText,
  'identification.agency': toText,
  'facts.budget': toAmount,
  'facts.referencePrice': toAmount,
  'facts.submissionDeadline': toDate,
  'facts.postedDate': toDate,
  'facts.deliveryPeriodDays': toNumber,
  'facts.contractDurationDays': toNumber,
  'facts.warrantyYears': toNumber,
  'facts.procurementMethod': toText,
  'facts.penaltyClause': toText,
  'eligibility.previousExperienceMin': toAmount,
};
const AMOUNT_FIELDS = ['facts.budget', 'facts.referencePrice', 'eligibility.previousExperienceMin'];

// Lists where every item carries a quote; an item whose quote isn't in the
// document is dropped, never shown (R5)
export const QUOTED_LISTS = [
  'technicalRequirements.requiredTechnologies',
  'eligibility.requiredCertifications',
  'eligibility.manufacturerAuthorizations',
];

const at = (object, path) => path.split('.').reduce((value, key) => value?.[key], object);
const severityOf = (field) => (CRITICAL_FIELDS.has(field) ? 'critical' : 'minor');

/**
 * Text in the form both sides are compared in. NFKC, not NFC: the OCR text
 * writes ำ as two characters (U+0E4D U+0E32) and the model writes one
 * (U+0E33), and only NFKC treats them as equal. Thai digits become Arabic, and
 * spaces and line breaks go, because OCR puts them in odd places.
 */
export function normalizeForMatch(text) {
  return convertThaiDigitsToArabic(String(text ?? '').normalize('NFKC'))
    .replace(/[\s​]+/g, '')
    .toLowerCase();
}

/**
 * Whether a quote is really in the (normalized) document. Exact first.
 *
 * Failing that: OCR junk can sit inside a sentence (a real TOR had "...มัมชล"
 * mid-line), and the model quotes across it. So a long quote is cut into
 * pieces, and the pieces must appear in order, each close to the last. A few
 * pieces may be missing, because junk can land inside one and break it. An
 * invented quote, even one stitched from real fragments, doesn't line up.
 */
export function isQuoteInSource(quote, source) {
  const q = normalizeForMatch(quote);
  if (!q) return false;
  if (source.includes(q)) return true;

  const pieces = [];
  for (let i = 0; i < q.length; i += QUOTE_PIECE) pieces.push(q.slice(i, i + QUOTE_PIECE));
  // A tiny last piece would match almost anywhere: fold it into the one before
  if (pieces.length > 1 && pieces.at(-1).length < QUOTE_PIECE / 2) pieces.push(pieces.pop() + pieces.pop());
  if (pieces.length < QUOTE_MIN_PIECES) return false;
  const allowedMissing = Math.max(1, Math.floor(pieces.length * QUOTE_MISSING_SHARE));

  // Anchor on the first piece, or on the second when junk broke the first
  for (const anchor of [0, 1]) {
    for (let start = source.indexOf(pieces[anchor]); start !== -1; start = source.indexOf(pieces[anchor], start + 1)) {
      let position = start + pieces[anchor].length;
      let missing = anchor;
      for (const piece of pieces.slice(anchor + 1)) {
        const next = source.indexOf(piece, position);
        const gap = next - position;
        const acrossPage =
          gap <= QUOTE_MAX_PAGE_GAP && source.slice(position, next).includes(PAGE_MARKER);
        if (next !== -1 && (gap <= QUOTE_MAX_GAP || acrossPage)) {
          position = next + piece.length;
        } else {
          missing++;
          position += piece.length; // assume it sat here, broken by junk
        }
        if (missing > allowedMissing) break;
      }
      if (missing <= allowedMissing) return true;
    }
  }
  return false;
}

/** Every amount written in digits in a quote, read with parseThaiAmount. */
export function amountsInQuote(quote) {
  const text = convertThaiDigitsToArabic(String(quote ?? '').normalize('NFKC'));
  return [...text.matchAll(AMOUNT_DIGITS)]
    .map((match) => parseThaiAmount(match[0]))
    .filter((amount) => amount !== null);
}

/** How alike two texts are, 0 to 1 (Dice coefficient on character pairs). */
export function textSimilarity(a, b) {
  const x = normalizeForMatch(a);
  const y = normalizeForMatch(b);
  if (x === y) return x ? 1 : 0;
  if (x.length < 2 || y.length < 2) return 0;

  const pairs = (s) => {
    const counts = new Map();
    for (let i = 0; i < s.length - 1; i++) counts.set(s.slice(i, i + 2), (counts.get(s.slice(i, i + 2)) ?? 0) + 1);
    return counts;
  };
  const px = pairs(x);
  const py = pairs(y);
  let shared = 0;
  for (const [pair, count] of px) shared += Math.min(count, py.get(pair) ?? 0);
  return (2 * shared) / (x.length - 1 + y.length - 1);
}

// Titles differ in packaging, not content: the feed often adds "ประกวดราคา…
// ด้วยวิธีประกวดราคาอิเล็กทรอนิกส์ (e-bidding)" around the same project name
function titleCore(title) {
  return normalizeForMatch(title)
    .replace(/^(โครงการ|ประกวดราคา|ประกาศ)+/, '')
    .replace(/ด้วยวิธี.*$/, '');
}

function sameText(a, b, core = normalizeForMatch) {
  const x = core(a);
  const y = core(b);
  if (!x || !y) return false;
  return x.includes(y) || y.includes(x) || textSimilarity(x, y) >= TEXT_SIMILARITY_MIN;
}

// The feed's own "missing": null, or 0 from records saved before ADR 0014 (R10)
const feedAmount = (value) => (Number.isFinite(value) && value > 0 ? value : null);

function feedDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  // A Thai source may give a Buddhist year that Date read as-is
  if (parsed.getUTCFullYear() > 2400) parsed.setUTCFullYear(parsed.getUTCFullYear() - 543);
  return parsed;
}

const bangkokDay = (date) => new Date(date.getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);

/**
 * Keeps the items of a quoted list whose quote really is in the document. The
 * rest are dropped: an invented technology would mislead a bidder (R5).
 */
export function keepGroundedItems(items, rawText) {
  const source = normalizeForMatch(rawText);
  const kept = [];
  const dropped = [];
  for (const item of items ?? []) {
    (isQuoteInSource(item?.quote, source) ? kept : dropped).push(item);
  }
  return { kept, dropped };
}

/** D6: start at 100; a critical failure caps the score below 80 (NFR-17). */
export function confidenceScore(checks) {
  const penalty = checks.reduce((sum, check) => sum + (check.severity === 'critical' ? 20 : 5), 0);
  const score = Math.max(0, 100 - penalty);
  return checks.some((check) => check.severity === 'critical') ? Math.min(score, 79) : score;
}

/**
 * Runs every check on one extraction.
 *
 * @param {object} input
 * @param {object} input.tor - The Tor record: the feed values and ocr
 * @param {object} input.classification - The classify step's answer
 * @param {object} input.extracted - The extract step's answer
 * @returns {{ checks: object[], score: number }} Failed checks only
 */
export function runChecks({ tor, classification, extracted }) {
  const checks = [];
  const fail = (check, field, detail, severity = severityOf(field)) =>
    checks.push({ check, field, severity, detail });
  const source = normalizeForMatch(tor.ocr?.rawText);
  const isGrounded = (quote) => isQuoteInSource(quote, source);

  // 1. Grounding: every quote must really be in the document
  if (classification && !isGrounded(classification.quote)) {
    fail('grounding', 'classification', { quote: classification.quote });
  }
  for (const field of Object.keys(EVIDENCED_FIELDS)) {
    const evidence = at(extracted, field);
    if (evidence && !isGrounded(evidence.quote)) {
      fail('grounding', field, { quote: evidence.quote, page: evidence.page });
    }
  }
  for (const list of QUOTED_LISTS) {
    for (const item of keepGroundedItems(at(extracted, list), tor.ocr?.rawText).dropped) {
      fail('grounding', list, { name: item?.name, quote: item?.quote, dropped: true }, 'minor');
    }
  }

  // 2. Readable: a value the model gave must convert, or it can't be shown
  const values = {};
  for (const [field, convert] of Object.entries(EVIDENCED_FIELDS)) {
    const evidence = at(extracted, field);
    values[field] = convert(evidence);
    if (evidence && values[field] === null) {
      fail('sanity', field, { reason: 'unreadable', value: evidence.value });
    }
  }

  // 3. Cross-source: where the feed has the value, it wins, and a difference
  //    means someone must look: the AI misread, or the feed is out of date (D2)
  const compareAmount = (field, feed) => {
    if (feed !== null && values[field] !== null && Math.abs(feed - values[field]) >= 1) {
      fail('cross-source', field, { feed, ai: values[field] });
    }
  };
  compareAmount('facts.budget', feedAmount(tor.budgetTHB));
  compareAmount('facts.referencePrice', feedAmount(tor.referencePriceTHB));

  const aiTitle = values['identification.titleTh'];
  if (tor.title && aiTitle && !sameText(tor.title, aiTitle, titleCore)) {
    fail('cross-source', 'identification.titleTh', { feed: tor.title, ai: aiTitle });
  }
  const aiAgency = values['identification.agency'];
  const feedAgencies = [tor.agency, tor.subAgency].filter(Boolean);
  if (feedAgencies.length > 0 && aiAgency && !feedAgencies.some((agency) => sameText(agency, aiAgency))) {
    fail('cross-source', 'identification.agency', { feed: feedAgencies, ai: aiAgency });
  }
  const posted = feedDate(tor.announceDate);
  const aiPosted = values['facts.postedDate'];
  if (posted && aiPosted && bangkokDay(posted) !== bangkokDay(aiPosted)) {
    fail('cross-source', 'facts.postedDate', { feed: tor.announceDate, ai: aiPosted.toISOString() });
  }

  // 4. Amounts against their own quote. Read from the quote, not the value: in
  //    a real TOR the model quoted "๕,๐๐๐,๐๐๐ บาท (สี่ล้านบาทถ้วน)" and gave
  //    the value as ๔,๐๐๐,๐๐๐, siding with the words and hiding the conflict.
  const same = (a, b) => Math.abs(a - b) < 0.01;
  for (const field of AMOUNT_FIELDS) {
    const quote = at(extracted, field)?.quote;
    const value = values[field];
    const digits = amountsInQuote(quote);
    if (value !== null && !digits.some((amount) => same(amount, value))) {
      fail('value-quote', field, { value, inQuote: digits });
    }
    // Thai amounts are written in digits and in words, like a cheque (R3). Words
    // missing or unreadable mean "can't verify", never "wrong"
    const words = findThaiAmountInWords(quote);
    if (words !== null && digits.length > 0 && !digits.some((amount) => same(amount, words))) {
      fail('digits-words', field, { digits, words });
    }
  }

  // 5. Sanity: values that can't all be true at once
  const deadline = values['facts.submissionDeadline'];
  if (deadline && aiPosted && deadline < aiPosted) {
    fail('sanity', 'facts.submissionDeadline', {
      reason: 'before the posted date',
      deadline: deadline.toISOString(),
      posted: aiPosted.toISOString(),
    });
  }
  const budget = feedAmount(tor.budgetTHB) ?? values['facts.budget'];
  const referencePrice = feedAmount(tor.referencePriceTHB) ?? values['facts.referencePrice'];
  if (budget && referencePrice && referencePrice > budget) {
    // Unusual rather than impossible, so it doesn't block on its own
    fail('sanity', 'facts.referencePrice', { reason: 'above the budget', budget, referencePrice }, 'minor');
  }
  const outOfRange = (field, max) => values[field] !== null && (values[field] <= 0 || values[field] > max);
  if (outOfRange('facts.deliveryPeriodDays', 3650)) {
    fail('sanity', 'facts.deliveryPeriodDays', { reason: 'out of range', value: values['facts.deliveryPeriodDays'] });
  }
  if (outOfRange('facts.warrantyYears', 20)) {
    fail('sanity', 'facts.warrantyYears', { reason: 'out of range', value: values['facts.warrantyYears'] });
  }

  // 6. The text itself: a poor scan, or pages OCR never read, undermine
  //    every field at once
  const ocr = tor.ocr ?? {};
  if (ocr.usedOcr && ocr.confidence < OCR_CONFIDENCE_REVIEW) {
    const severity = ocr.confidence < OCR_CONFIDENCE_CRITICAL ? 'critical' : 'minor';
    fail('ocr-quality', null, { confidence: ocr.confidence }, severity);
  }
  if (ocr.truncated) {
    fail('truncation', null, { pages: tor.document?.pages ?? null }, 'critical');
  }

  return { checks, score: confidenceScore(checks) };
}
