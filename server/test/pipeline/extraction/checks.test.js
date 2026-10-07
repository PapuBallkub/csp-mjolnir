import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  confidenceScore,
  isQuoteInSource,
  keepGroundedItems,
  normalizeForMatch,
  runChecks,
} from '#pipeline/extraction/checks.js';

// A short TOR with the quirks of the real one from the first trial: OCR writes
// ำ as two characters (U+0E4D U+0E32), lines break mid-sentence, and the
// past-work amount's digits and words disagree.
const SARA_AM_OCR = 'ํา';
const RAW_TEXT = [
  '=== Page 1 ===',
  'โครงการจ้างพัฒนาคลังข้อมูลสุขภาพดิจิทัล',
  `ส${SARA_AM_OCR}นักงานปลัดกระทรวงสาธารณสุข`,
  'ประกาศ ณ วันที่ ๒๐ สิงหาคม ๒๕๖๙',
  'ยื่นข้อเสนอภายในวันที่ ๑๘ สิงหาคม ๒๕๖๙',
  '=== Page 3 ===',
  `จ${SARA_AM_OCR}นวนเงิน ๑๒,๕๐๐,๐๐๐ บาท`,
  '(สิบสองล้านห้าแสนบาทถ้วน)',
  'ราคากลาง ๑๑,๐๐๐,๐๐๐ บาท',
  '=== Page 4 ===',
  'ในวงเงินไม่น้อยกว่า ๕,๐๐๐,๐๐๐.- บาท (สี่ล้านบาทถ้วน)',
  'ใช้ระบบฐานข้อมูล PostgreSQL',
  '=== Page 9 ===',
  'ให้แล้วเสร็จภายใน ๑๕๐ วัน',
].join('\n');

const evidence = (quote, page, value) => ({ quote, page, value });

// A correct extraction of RAW_TEXT. Each test changes one thing in a fresh copy.
function clean() {
  return {
    tor: {
      title: 'ประกวดราคาจ้างพัฒนาคลังข้อมูลสุขภาพดิจิทัล ด้วยวิธีประกวดราคาอิเล็กทรอนิกส์ (e-bidding)',
      agency: 'สำนักงานปลัดกระทรวงสาธารณสุข',
      budgetTHB: 12_500_000,
      referencePriceTHB: null,
      announceDate: null,
      ocr: { rawText: RAW_TEXT, usedOcr: true, confidence: 0.92, truncated: false },
    },
    classification: {
      quote: 'โครงการจ้างพัฒนาคลังข้อมูลสุขภาพดิจิทัล',
      reason: 'จ้างพัฒนาระบบซอฟต์แวร์',
      isIT: true,
      category: 'software-development',
    },
    extracted: {
      identification: {
        titleTh: evidence('โครงการจ้างพัฒนาคลังข้อมูลสุขภาพดิจิทัล', 1, 'โครงการจ้างพัฒนาคลังข้อมูลสุขภาพดิจิทัล'),
        // Gemini writes ำ as one character (U+0E33); the source has two
        agency: evidence('สำนักงานปลัดกระทรวงสาธารณสุข', 1, 'สำนักงานปลัดกระทรวงสาธารณสุข'),
      },
      facts: {
        // The quote spans a line break, and its words agree with its digits
        budget: evidence('จำนวนเงิน ๑๒,๕๐๐,๐๐๐ บาท\n(สิบสองล้านห้าแสนบาทถ้วน)', 3, '๑๒,๕๐๐,๐๐๐'),
        referencePrice: null,
        submissionDeadline: null,
        postedDate: null,
        deliveryPeriodDays: evidence('ให้แล้วเสร็จภายใน ๑๕๐ วัน', 9, 150),
        contractDurationDays: null,
        warrantyYears: null,
        procurementMethod: null,
        penaltyClause: null,
      },
      technicalRequirements: {
        requiredTechnologies: [{ quote: 'ใช้ระบบฐานข้อมูล PostgreSQL', name: 'PostgreSQL', version: null }],
      },
      eligibility: { previousExperienceMin: null, requiredCertifications: [], manufacturerAuthorizations: [] },
    },
  };
}

const failed = (result, check, field) =>
  result.checks.find((c) => c.check === check && (field === undefined || c.field === field));

test('a correct extraction passes every check, OCR quirks and all', () => {
  const result = runChecks(clean());
  assert.deepEqual(result.checks, []);
  assert.equal(result.score, 100);
});

test('normalizeForMatch treats both ways of writing ำ, and Thai digits, as the same text', () => {
  assert.equal(normalizeForMatch(`ส${SARA_AM_OCR}นัก ๑๒`), normalizeForMatch('สำนัก\n12'));
});

test('grounding: a quote that is not in the document fails, and blocks on a critical field', () => {
  const input = clean();
  input.extracted.identification.agency.quote = 'กรมการแพทย์';
  const result = runChecks(input);

  assert.equal(failed(result, 'grounding', 'identification.agency').severity, 'critical');
  assert.ok(result.score < 80, 'a critical failure hides the TOR until review');
});

test('grounding: a real quote still counts when OCR junk sits in the middle of it', () => {
  const source = normalizeForMatch('มีผลงานภายใน ...มัมชล ระยะเวลา ๕ ปี ในวงเงินไม่น้อยกว่า');
  assert.ok(isQuoteInSource('มีผลงานภายในระยะเวลา ๕ ปี ในวงเงินไม่น้อยกว่า', source));
});

test('grounding: a sentence that crosses a page, over the signed footer, still counts', () => {
  // The real text: page 3 ends mid-sentence, the committee signs, page 4 goes on
  const source = normalizeForMatch(
    'ในงานจ้างสัญญาฉบับเดียวภายใน\nระยะเวลา...\nมัม ชล- Sh\n' +
      'นายนิรทร ศรีสุโข นางสาวนาฏอนงค์ เจริญสันติสุข นายศักดิ์ดา ศิริรักษ์\n' +
      '(ประธานกรรมการ) (กรรมการ) (กรรมการ)\n\n=== Page 4 ===\n2 [รี =\n' +
      'ระยะเวลา ๕ ปี ในวงเงินไม่น้อยกว่า ๕,๐๐๐,๐๐๐.- บาท (สี่ล้านบาทถ้วน)',
  );
  const quote = 'ในงานจ้างสัญญาฉบับเดียวภายใน\nระยะเวลา ๕ ปี ในวงเงินไม่น้อยกว่า ๕,๐๐๐,๐๐๐.- บาท (สี่ล้านบาทถ้วน)';
  assert.ok(isQuoteInSource(quote, source));

  // The same long gap without a page break in it is not allowed
  assert.equal(isQuoteInSource(quote, source.replace(normalizeForMatch('=== Page 4 ==='), '')), false);
});

test('grounding: real fragments from far-apart places do not make a quote', () => {
  const source = normalizeForMatch(RAW_TEXT);
  assert.equal(isQuoteInSource('โครงการจ้างพัฒนาให้แล้วเสร็จภายใน ๑๕๐ วัน', source), false);
});

test('grounding: a technology the document never names is dropped (R5)', () => {
  const items = [
    { quote: 'ใช้ระบบฐานข้อมูล PostgreSQL', name: 'PostgreSQL' },
    { quote: 'ใช้ Kubernetes', name: 'Kubernetes' }, // invented
  ];
  const { kept, dropped } = keepGroundedItems(items, RAW_TEXT);
  assert.deepEqual(kept.map((t) => t.name), ['PostgreSQL']);
  assert.deepEqual(dropped.map((t) => t.name), ['Kubernetes']);

  const input = clean();
  input.extracted.technicalRequirements.requiredTechnologies = items;
  const check = failed(runChecks(input), 'grounding', 'technicalRequirements.requiredTechnologies');
  assert.equal(check.detail.name, 'Kubernetes');
  assert.equal(check.severity, 'minor');
});

test('cross-source: an AI price that differs from the feed fails, showing both values', () => {
  const input = clean();
  input.tor.referencePriceTHB = 12_492_771;
  input.extracted.facts.referencePrice = evidence('ราคากลาง ๑๑,๐๐๐,๐๐๐ บาท', 3, '๑๑,๐๐๐,๐๐๐');
  const check = failed(runChecks(input), 'cross-source', 'facts.referencePrice');

  assert.deepEqual(check.detail, { feed: 12_492_771, ai: 11_000_000 });
  assert.equal(check.severity, 'critical');
});

test('cross-source: a feed with no value (null or an old 0) leaves the AI value unchallenged', () => {
  for (const missing of [null, 0]) {
    const input = clean();
    input.tor.referencePriceTHB = missing;
    input.extracted.facts.referencePrice = evidence('ราคากลาง ๑๑,๐๐๐,๐๐๐ บาท', 3, '๑๑,๐๐๐,๐๐๐');
    assert.equal(failed(runChecks(input), 'cross-source'), undefined);
  }
});

test('cross-source: a title for a different project fails', () => {
  const input = clean();
  input.tor.title = 'ประกวดราคาซื้อรถบรรทุกขยะ';
  assert.equal(failed(runChecks(input), 'cross-source', 'identification.titleTh').severity, 'critical');
});

test('digits against words: the R3 case from the first trial is caught', () => {
  const input = clean();
  input.extracted.eligibility.previousExperienceMin = evidence(
    'ในวงเงินไม่น้อยกว่า ๕,๐๐๐,๐๐๐.- บาท (สี่ล้านบาทถ้วน)',
    4,
    '๕,๐๐๐,๐๐๐',
  );
  const check = failed(runChecks(input), 'digits-words', 'eligibility.previousExperienceMin');
  assert.deepEqual(check.detail, { digits: [5_000_000], words: 4_000_000 });
});

test('digits against words: a model that quietly sides with the words is caught too', () => {
  // Seen in the second trial: the quote keeps ๕ million, the value says ๔ million
  const input = clean();
  input.extracted.eligibility.previousExperienceMin = evidence(
    'ในวงเงินไม่น้อยกว่า ๕,๐๐๐,๐๐๐.- บาท (สี่ล้านบาทถ้วน)',
    4,
    '๔,๐๐๐,๐๐๐',
  );
  const result = runChecks(input);

  assert.deepEqual(failed(result, 'value-quote', 'eligibility.previousExperienceMin').detail, {
    value: 4_000_000,
    inQuote: [5_000_000],
  });
  assert.ok(failed(result, 'digits-words', 'eligibility.previousExperienceMin'));
});

test('digits against words: a quote with no amount in words is "can\'t verify", not a failure', () => {
  const input = clean();
  input.extracted.facts.budget = evidence('จำนวนเงิน ๑๒,๕๐๐,๐๐๐ บาท', 3, '๑๒,๕๐๐,๐๐๐');
  assert.equal(failed(runChecks(input), 'digits-words'), undefined);
});

test('sanity: a value that cannot be read, or a deadline before the posting, fails', () => {
  const input = clean();
  input.extracted.facts.budget.value = 'ประมาณ ๑๒ ล้าน';
  input.extracted.facts.postedDate = evidence('ประกาศ ณ วันที่ ๒๐ สิงหาคม ๒๕๖๙', 1, {
    day: 20, month: 8, year: 2569, era: 'BE', hour: null, minute: null,
  });
  input.extracted.facts.submissionDeadline = evidence('ยื่นข้อเสนอภายในวันที่ ๑๘ สิงหาคม ๒๕๖๙', 1, {
    day: 18, month: 8, year: 2569, era: 'BE', hour: null, minute: null,
  });
  const result = runChecks(input);

  assert.equal(failed(result, 'sanity', 'facts.budget').detail.reason, 'unreadable');
  assert.equal(failed(result, 'sanity', 'facts.submissionDeadline').severity, 'critical');
});

test('the scan itself: a truncated text blocks, a weak scan is flagged', () => {
  const input = clean();
  input.tor.ocr.truncated = true;
  input.tor.ocr.confidence = 0.7;
  const result = runChecks(input);

  assert.equal(failed(result, 'truncation').severity, 'critical');
  assert.equal(failed(result, 'ocr-quality').severity, 'minor');

  input.tor.ocr.confidence = 0.5;
  assert.equal(failed(runChecks(input), 'ocr-quality').severity, 'critical');
});

test('confidenceScore: minor failures cost points, any critical one caps the score below 80', () => {
  const minor = { severity: 'minor' };
  const critical = { severity: 'critical' };
  assert.equal(confidenceScore([]), 100);
  assert.equal(confidenceScore([minor, minor]), 90);
  assert.equal(confidenceScore([critical]), 79);
  assert.equal(confidenceScore(Array(30).fill(critical)), 0);
});

test('grounding: a comment deadline is checked too, but a wrong one is minor, not hidden', () => {
  const input = clean();
  input.extracted.facts.commentDeadline = {
    quote: 'เสนอแนะ วิจารณ์ ภายในวันที่ ๓๑ ตุลาคม ๒๕๖๙', // not in the document
    page: 1,
    value: { day: 31, month: 10, year: 2569, era: 'BE', hour: null, minute: null },
  };

  assert.equal(failed(runChecks(input), 'grounding', 'facts.commentDeadline').severity, 'minor');
});
