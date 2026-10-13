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
import { feedAmount, feedDate, toAmount, toDate, toNumber, toText } from './convert.js';
import { DOCUMENTS, biddingTextOf, textsOf } from './documents.js';

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
  'facts.commentDeadline': toDate,
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

// A filled-in form's quote may sit within this many characters (spaces out)
// either side of its longest chunk. On real bidding documents a quote's
// chunks lay up to 1.34 times its length from it.
const FORM_SPAN_MIN = 200;
const FORM_SPAN_PER_QUOTE_CHAR = 1.5;
const digitsOnly = (chunk) => /^[\d.,]+$/.test(chunk);
// A filled-in value keeps its unit right after its number, however the
// layout moves it: "๑ ปี", "๑๙ ตุลาคม", "๐๙.๐๐ น."
const UNIT = new RegExp(
  '^(?:ปี|เดือน|วัน|ชั่วโมง|นาที|น\\.|บาท|งวด|ครั้ง|' +
    'มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)',
);

/**
 * Whether a quote from a filled-in form, the bidding document (ADR 0025), is
 * in it. The form's values come out after its words, on the same line or the
 * next ("ในวันที่ และเวลาในการเสนอ ⇥ ๑๙ ตุลาคม ๒๕๖๙ ระหว่างเวลา …"), so a quote
 * that puts a value back into its sentence has the right pieces in another
 * order. In order first; failing that, every chunk of the quote, as split by
 * its spaces, must be there, close together. A number counts only as a whole
 * number, and together with the unit the quote gives it: "๓ ปี" needs a "๓ปี"
 * in the form, so a made-up value can't borrow a ๓ from a nearby clause.
 */
export function isFormQuoteInSource(quote, source) {
  if (isQuoteInSource(quote, source)) return true;
  const chunks = convertThaiDigitsToArabic(String(quote ?? '').normalize('NFKC'))
    .toLowerCase()
    .split(/[\s​]+/)
    .filter(Boolean);
  if (chunks.length < QUOTE_MIN_PIECES) return false;

  // What each chunk must match: a number with its unit when the quote gives one
  const needles = chunks.map((chunk, index) => {
    if (!digitsOnly(chunk)) return { text: chunk };
    const unit = chunks[index + 1]?.match(UNIT)?.[0] ?? '';
    const escaped = `${chunk}${unit}`.replace(/[.]/g, '\\.');
    return { pattern: new RegExp(`(?<![\\d.,])${escaped}${unit ? '' : '(?![\\d])'}`) };
  });

  const span = Math.max(FORM_SPAN_MIN, normalizeForMatch(quote).length * FORM_SPAN_PER_QUOTE_CHAR);
  const longest = [...chunks].sort((a, b) => b.length - a.length)[0];
  for (let at = source.indexOf(longest); at !== -1; at = source.indexOf(longest, at + 1)) {
    const window = source.slice(Math.max(0, at - span), at + longest.length + span);
    if (needles.every((needle) => (needle.text ? window.includes(needle.text) : needle.pattern.test(window)))) return true;
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
  // Each quote is looked for in the document it says it's from (ADR 0025)
  const sources = {
    [DOCUMENTS.tor]: normalizeForMatch(tor.ocr?.rawText),
    [DOCUMENTS.bidding]: normalizeForMatch(biddingTextOf(tor)),
  };
  const isGrounded = (quote, document = DOCUMENTS.tor) =>
    document === DOCUMENTS.bidding
      ? isFormQuoteInSource(quote, sources.bidding) // a filled-in form: its values sit out of order
      : isQuoteInSource(quote, sources.tor);

  // 1. Grounding: every quote must really be in the document
  if (classification && !isGrounded(classification.quote)) {
    fail('grounding', 'classification', { quote: classification.quote });
  }
  for (const field of Object.keys(EVIDENCED_FIELDS)) {
    const evidence = at(extracted, field);
    if (evidence && !isGrounded(evidence.quote, evidence.document)) {
      fail('grounding', field, { quote: evidence.quote, page: evidence.page, document: evidence.document ?? DOCUMENTS.tor });
    }
  }
  for (const list of QUOTED_LISTS) {
    for (const item of keepGroundedItems(at(extracted, list), textsOf(tor)).dropped) {
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
  // The bid date read from the package's documents (ADR 0020) is the one
  // shown, so the AI misreading it can't mislead anyone: a minor failure,
  // there for a reviewer, which doesn't hide the TOR
  const bidsClose = tor.submissionDeadline ? new Date(tor.submissionDeadline) : null;
  const aiBidsClose = values['facts.submissionDeadline'];
  if (bidsClose && aiBidsClose && bangkokDay(bidsClose) !== bangkokDay(aiBidsClose)) {
    fail(
      'cross-source',
      'facts.submissionDeadline',
      { feed: bidsClose.toISOString(), ai: aiBidsClose.toISOString() },
      'minor',
    );
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
  const commentBy = values['facts.commentDeadline'];
  if (commentBy && aiPosted && commentBy < aiPosted) {
    // A wrong comment date doesn't hide the TOR; a wrong bid date does
    fail('sanity', 'facts.commentDeadline', {
      reason: 'before the posted date',
      deadline: commentBy.toISOString(),
      posted: aiPosted.toISOString(),
    }, 'minor');
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
