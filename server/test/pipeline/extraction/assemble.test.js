import assert from 'node:assert/strict';
import { test } from 'node:test';

import { TorInsight } from '#models/index.js';
import { buildExcluded, buildInsight } from '#pipeline/extraction/assemble.js';
import { RUN, fixture } from './fixtures.js';

const TECHNOLOGIES = [
  { name: 'PostgreSQL', version: '16' },
  { name: 'Kubernetes', version: null },
];

function build({ checks = [], change = () => {} } = {}) {
  const input = fixture();
  change(input);
  return buildInsight({
    ...input,
    technologies: TECHNOLOGIES,
    certifications: ['ISO/IEC 27001'],
    authorizations: [],
    checkResult: { checks, score: checks.length ? 79 : 100 },
    run: RUN,
  });
}

test('the assembled record passes the TorInsight model\'s own validation', () => {
  assert.equal(new TorInsight(build()).validateSync(), undefined);
});

test("the package's bid date and ราคากลาง win, quoting the document that states them (ADR 0020)", () => {
  const closes = new Date('2026-08-19T05:00:00Z'); // 19 Aug 2569, 12:00 Bangkok
  const statedPrice = { value: 12_400_000, quote: '๑๒,๔๐๐,๐๐๐.๐๐ บาท (สิบสองล้านสี่แสนบาทถ้วน)', document: 'announcement' };
  const record = build({
    change: (input) => {
      input.tor.referencePriceTHB = 12_400_000;
      input.tor.submissionDeadline = closes;
      input.tor.packages = [
        {
          facts: {
            referencePriceTHB: statedPrice,
            submissionWindow: {
              opensAt: new Date('2026-08-19T02:00:00Z'),
              closesAt: closes,
              quote: '๑๙ สิงหาคม ๒๕๖๙ ระหว่างเวลา ๐๙.๐๐ น. ถึง ๑๒.๐๐ น.',
              document: 'bidding',
            },
          },
        },
        // A later package that doesn't state them leaves the earlier sentences standing
        { facts: { referencePriceTHB: null, submissionWindow: null } },
      ];
    },
  });

  // The TOR said 18 Aug 16:30; the documents' value is the one kept, with their quote
  assert.equal(record.facts.submissionDeadline.toISOString(), closes.toISOString());
  assert.deepEqual(record.evidence.submissionDeadline, {
    quote: '๑๙ สิงหาคม ๒๕๖๙ ระหว่างเวลา ๐๙.๐๐ น. ถึง ๑๒.๐๐ น.',
    page: null,
    document: 'bidding',
  });
  assert.equal(record.facts.referencePriceTHB, 12_400_000);
  assert.deepEqual(record.evidence.referencePriceTHB, { quote: statedPrice.quote, page: null, document: 'announcement' });
  assert.equal(new TorInsight(record).validateSync(), undefined);
});

test('an AI value quoted from the bidding document says so; one from the TOR keeps document null (ADR 0025)', () => {
  const record = build({
    change: (input) => {
      input.extracted.facts.warrantyYears = {
        quote: 'รับประกันความชำรุดบกพร่อง … ๑ ปี',
        document: 'bidding',
        page: 9,
        value: 1,
      };
    },
  });
  assert.deepEqual(record.evidence.warrantyYears, { quote: 'รับประกันความชำรุดบกพร่อง … ๑ ปี', page: 9, document: 'bidding' });
  // The fixture's delivery period is quoted from the TOR
  assert.equal(record.evidence.deliveryPeriodDays.document, null);
  assert.equal(new TorInsight(record).validateSync(), undefined);
});

test("the price form's budget wins, quoting the form, and its ราคากลาง never stands in for the announcement's (ADR 0023)", () => {
  const formBudget = { value: 12_450_000, quote: 'วงเงินงบประมาณที่ได้รับจัดสรร … (สิบสองล้านสี่แสนห้าหมื่นบาทถ้วน)', document: 'price-form' };
  const record = build({
    change: (input) => {
      input.tor.budgetTHB = 12_450_000; // the TOR's OCR said 12,500,000
      input.tor.packages = [
        {
          kind: 'price',
          facts: {
            budgetTHB: formBudget,
            referencePriceTHB: { value: 12_492_771, quote: 'กำหนดราคากลาง …', document: 'price-form' },
          },
        },
      ];
    },
  });

  assert.equal(record.facts.budgetTHB, 12_450_000);
  assert.deepEqual(record.evidence.budgetTHB, { quote: formBudget.quote, page: null, document: 'price-form' });
  // ราคากลาง is quoted only from an announcement; there is none here
  assert.equal(record.evidence.referencePriceTHB, undefined);
  assert.equal(new TorInsight(record).validateSync(), undefined);
});

test('the feed wins on prices, and the document fills what the feed lacks', () => {
  const { facts, evidence } = build();

  // ราคากลาง: only the feed has it, so no document quote comes with it
  assert.equal(facts.referencePriceTHB, 12_492_771);
  assert.equal(evidence.referencePriceTHB, undefined);
  // Budget: feed and document agree, so the document's quote shows where
  assert.equal(facts.budgetTHB, 12_500_000);
  assert.equal(evidence.budgetTHB.page, 3);
  // Deadline and delivery: only the document has them, with their quotes
  assert.equal(facts.submissionDeadline.toISOString(), '2026-08-18T09:30:00.000Z');
  assert.equal(evidence.submissionDeadline.page, 3);
  assert.equal(facts.deliveryPeriodDays, 150);
  // Not stated anywhere: null, never a guess
  assert.equal(facts.warrantyYears, null);
});

test('a quote that contradicts the feed\'s value is not kept as its evidence', () => {
  const { facts, evidence } = build({
    change: (input) => {
      input.extracted.facts.budget = { quote: 'งบประมาณ ๙,๐๐๐,๐๐๐ บาท', page: 2, value: '๙,๐๐๐,๐๐๐' };
    },
  });
  assert.equal(facts.budgetTHB, 12_500_000);
  assert.equal(evidence.budgetTHB, undefined);
});

test('the title: the document\'s clean one when they agree, the feed\'s when they don\'t', () => {
  assert.equal(build().identification.titleTh, 'โครงการจ้างพัฒนาคลังข้อมูลสุขภาพดิจิทัล');

  const disagree = [{ check: 'cross-source', field: 'identification.titleTh', severity: 'critical' }];
  assert.match(build({ checks: disagree }).identification.titleTh, /^ประกวดราคา/);
});

test('status, links and category come from the feed, the helper and the classifier', () => {
  const insight = build();
  assert.equal(insight.identification.status, 'Open');
  assert.equal(insight.identification.category, 'software-development');
  assert.equal(insight.identification.titleEn, null);
  assert.match(insight.facts.webUrl, /keywordSearch=test-extract-99999999999$/);
  assert.match(insight.facts.sourceUrl, /process3/);
});

test('lists keep only what was resolved and grounded, without repeats', () => {
  const { technicalRequirements, eligibility } = build();
  assert.deepEqual(technicalRequirements.requiredTechnologies, TECHNOLOGIES);
  assert.deepEqual(eligibility.standardConditions, ['juristic-person', 'egp-registered']);
  assert.deepEqual(eligibility.requiredCertifications, ['ISO/IEC 27001']);
  assert.equal(eligibility.previousExperienceMinTHB, null);
});

test('every new result waits for review, with its score and failed checks', () => {
  const checks = [{ check: 'truncation', field: null, severity: 'critical', detail: null }];
  const { metadata } = build({ checks });
  assert.equal(metadata.reviewStatus, 'pending');
  assert.equal(metadata.confidenceScore, 79);
  assert.deepEqual(metadata.checks, checks);
  assert.equal(metadata.promptVersion, 'extract-v3');
  assert.equal(metadata.excluded, null);
});

test('a non-IT TOR gets a minimal record that still validates', () => {
  const { tor, classification } = fixture();
  tor.agency = ''; // an RSS record has no agency name
  const excluded = buildExcluded({
    tor,
    classification: { ...classification, isIT: false, category: null, reason: 'ซื้อคอมพิวเตอร์อย่างเดียว' },
    run: RUN,
  });

  assert.equal(new TorInsight(excluded).validateSync(), undefined);
  assert.equal(excluded.identification.agency, 'สำนักงานปลัดกระทรวงสาธารณสุข', 'from the classify step');
  assert.equal(excluded.metadata.excluded.reason, 'ซื้อคอมพิวเตอร์อย่างเดียว');
  assert.equal(excluded.overview, undefined, 'nothing else was extracted');
});

test('a TOR with no agency anywhere is refused, rather than saved without one', () => {
  const { tor, classification } = fixture();
  tor.agency = '';
  assert.throws(
    () => buildExcluded({ tor, classification: { ...classification, agency: null }, run: RUN }),
    /No agency/,
  );
});

test('a draft out for hearing keeps its comment deadline apart from the bid deadline (extract-v4)', () => {
  const insight = build({
    change: (input) => {
      input.extracted.facts.submissionDeadline = null; // a draft has no bid date yet
      input.extracted.facts.commentDeadline = {
        quote: 'เสนอแนะ วิจารณ์ ภายในวันที่ ๒๐ ตุลาคม ๒๕๖๙',
        page: 1,
        value: { day: 20, month: 10, year: 2569, era: 'BE', hour: null, minute: null },
      };
    },
  });

  assert.ok(insight.facts.commentDeadline instanceof Date);
  assert.equal(insight.facts.commentDeadline.getUTCFullYear(), 2026);
  assert.equal(insight.facts.submissionDeadline, null);
});
