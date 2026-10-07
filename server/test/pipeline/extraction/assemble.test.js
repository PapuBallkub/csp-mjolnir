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
