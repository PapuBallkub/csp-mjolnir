import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { Tor, TorInsight } from '#models/index.js';
import { getTorByProjectId, listTors } from '../src/features/tors/tor.service.js';
import { createApp } from '../src/app.js';

const TEST_DB = 'mjolnir_test';
const testProjectId = '99999000001';

// One record per visibility rule, beside the main test record
const DAY = 24 * 60 * 60 * 1000;
const insight = (projectId, { metadata = {}, ...fields } = {}) => ({
  projectId,
  identification: { titleTh: `ทดสอบการแสดงผล ${projectId}`, agency: 'หน่วยงานทดสอบ', status: 'Open' },
  facts: { referencePriceTHB: 2_000_000, submissionDeadline: new Date(Date.now() + 7 * DAY) },
  ...fields,
  metadata: { reviewStatus: 'pending', confidenceScore: 72, ...metadata },
});
const EXTRA = [
  insight('99999000002'), // unreviewed pipeline result: shown in pilot mode only
  insight('99999000003', { metadata: { reviewStatus: 'approved', confidenceScore: 92 } }), // shown always
  insight('99999000004', { metadata: { reviewStatus: 'approved', confidenceScore: 92, origin: 'demo' } }),
  insight('99999000005', { metadata: { excluded: { reason: 'ไม่ใช่งานไอที' } } }), // never shown
  insight('99999000006', { metadata: { reviewStatus: 'rejected', confidenceScore: 90 } }), // never shown
  insight('99999000007', {
    // Open, but past its deadline: reads as Closed; companies only
    facts: { referencePriceTHB: 500_000, submissionDeadline: new Date(Date.now() - 3 * DAY) },
    eligibility: { standardConditions: ['juristic-person'] },
  }),
];
const EXTRA_IDS = EXTRA.map((record) => record.projectId);

let server;
let baseUrl;

before(async () => {
  await connectDatabase({ dbName: TEST_DB });

  // Clean up any test records
  await Tor.deleteOne({ projectId: testProjectId });
  await TorInsight.deleteMany({ projectId: { $in: [testProjectId, ...EXTRA_IDS] } });
  await TorInsight.insertMany(EXTRA);

  // Insert a test Tor and TorInsight record
  await Tor.create({
    projectId: testProjectId,
    title: 'โครงการทดสอบระบบปัญญาประดิษฐ์และคลาวด์',
    agency: 'สำนักทดสอบรัฐบาลดิจิทัล',
    budgetTHB: 15000000,
    referencePriceTHB: 15000000,
    status: 'Open',
    pipelineStatus: 'ocr_done',
    source: 'process3',
    document: {
      fileName: `${testProjectId}_TOR.pdf`,
      pages: 12,
      documentType: 'DIGITAL_TEXT_PDF',
    },
    ocr: {
      rawText: 'ข้อกำหนดโครงการทดสอบ...',
      confidence: 1.0,
      usedOcr: false,
    },
  });

  await TorInsight.create({
    projectId: testProjectId,
    identification: {
      titleTh: 'โครงการทดสอบระบบปัญญาประดิษฐ์และคลาวด์',
      agency: 'สำนักทดสอบรัฐบาลดิจิทัล',
      status: 'Open',
      category: 'Software & IT Services',
    },
    facts: {
      budgetTHB: 15000000,
      referencePriceTHB: 15000000,
      submissionDeadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      procurementMethod: 'ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)',
      penaltyClause: '0.20%/วัน',
    },
    technicalRequirements: {
      requiredTechnologies: [
        { name: 'Python', version: '3.11' },
        { name: 'Docker', version: null },
      ],
    },
    analytics: {
      lockSpec: {
        riskScore: 25,
        verdictText: 'ความเสี่ยงต่ำ',
        findings: [],
      },
      priceAnalysis: {
        referencePriceTHB: 15000000,
        historicalMedianTHB: 14500000,
        diffPercentage: 3.4,
      },
    },
  });

  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://localhost:${server.address().port}`;
});

after(async () => {
  await Tor.deleteOne({ projectId: testProjectId });
  await TorInsight.deleteMany({ projectId: { $in: [testProjectId, ...EXTRA_IDS] } });

  await new Promise((resolve) => server.close(resolve));
  await disconnectDatabase();
});

test('GET /api/tors: returns paginated list of TOR summaries', async () => {
  const res = await fetch(`${baseUrl}/api/tors`);
  assert.equal(res.status, 200);

  const data = await res.json();
  assert.ok(Array.isArray(data.tors));
  assert.ok(typeof data.total === 'number');
  assert.ok(data.page >= 1);
  assert.ok(data.pages >= 1);

  const found = data.tors.find((t) => t.projectId === testProjectId);
  assert.ok(found);
  assert.equal(found.identification.titleTh, 'โครงการทดสอบระบบปัญญาประดิษฐ์และคลาวด์');
  assert.equal(found.facts.referencePriceTHB, 15000000);
});

test('GET /api/tors: filters by search keyword (q)', async () => {
  const res = await fetch(`${baseUrl}/api/tors?q=ปัญญาประดิษฐ์`);
  assert.equal(res.status, 200);

  const data = await res.json();
  assert.ok(data.tors.some((t) => t.projectId === testProjectId));

  const emptyRes = await fetch(`${baseUrl}/api/tors?q=nonexistent_xyz_query_12345`);
  const emptyData = await emptyRes.json();
  assert.equal(emptyData.total, 0);
  assert.equal(emptyData.tors.length, 0);
});

test('GET /api/tors: filters by technology', async () => {
  const res = await fetch(`${baseUrl}/api/tors?tech=Python`);
  assert.equal(res.status, 200);

  const data = await res.json();
  assert.ok(data.tors.some((t) => t.projectId === testProjectId));
});

test('GET /api/tors/:projectId: returns full TOR detail and raw document metadata', async () => {
  const res = await fetch(`${baseUrl}/api/tors/${testProjectId}`);
  assert.equal(res.status, 200);

  const data = await res.json();
  assert.equal(data.projectId, testProjectId);
  assert.equal(data.identification.titleTh, 'โครงการทดสอบระบบปัญญาประดิษฐ์และคลาวด์');
  assert.equal(data.document.documentType, 'DIGITAL_TEXT_PDF');
  assert.equal(data.document.pages, 12);
  assert.equal(data.analytics.lockSpec.riskScore, 25);
});

test('GET /api/tors/:projectId: returns 404 for unknown project ID', async () => {
  const res = await fetch(`${baseUrl}/api/tors/00000000000`);
  assert.equal(res.status, 404);

  const data = await res.json();
  assert.ok(data.error?.message?.includes('not found'));
});

const listedIds = async (options, query = { q: 'ทดสอบการแสดงผล', limit: 50 }) =>
  (await listTors(query, options)).tors.map((tor) => tor.projectId).sort();

test('visibility: pilot mode shows unreviewed and demo results, never non-IT or rejected ones', async () => {
  assert.deepEqual(await listedIds({ showUnreviewed: true }), ['99999000002', '99999000003', '99999000004', '99999000007']);
});

test('visibility: outside pilot mode, only approved pipeline results scored 80 or more', async () => {
  assert.deepEqual(await listedIds({ showUnreviewed: false }), ['99999000003']);
  assert.equal(await getTorByProjectId('99999000002', { showUnreviewed: false }), null, 'detail hides it too');
  assert.equal(await getTorByProjectId('99999000005', { showUnreviewed: true }), null, 'non-IT is never shown');
});

test('each TOR says whether a person checked it, and whether it is demo data', async () => {
  const unreviewed = await getTorByProjectId('99999000002', { showUnreviewed: true });
  assert.deepEqual(
    { origin: unreviewed.review.origin, status: unreviewed.review.status, checked: unreviewed.review.checked, score: unreviewed.review.score },
    { origin: 'pipeline', status: 'pending', checked: false, score: 72 },
  );
  assert.equal(unreviewed.metadata, undefined, 'internal metadata stays internal');

  const demo = await getTorByProjectId('99999000004', { showUnreviewed: true });
  assert.equal(demo.review.origin, 'demo');
  assert.equal(demo.review.checked, false, 'demo data is never "checked", even if marked approved');
});

test('analysis nobody ran comes back as null, never as a measured-looking 0', async () => {
  const { analytics } = await getTorByProjectId('99999000002', { showUnreviewed: true });
  assert.deepEqual(analytics, { lockSpec: null, priceAnalysis: null });
});

test('an Open TOR past its deadline reads as Closed, and filters as Closed', async () => {
  const tor = await getTorByProjectId('99999000007', { showUnreviewed: true });
  assert.equal(tor.identification.status, 'Closed');
  assert.equal(tor.companiesOnly, true);

  assert.deepEqual(await listedIds({ showUnreviewed: true }, { q: 'ทดสอบการแสดงผล', status: 'Closed' }), ['99999000007']);
  assert.ok(!(await listedIds({ showUnreviewed: true }, { q: 'ทดสอบการแสดงผล', status: 'Open' })).includes('99999000007'));
});

test('GET /api/tors: a budget filter on its own keeps only TORs in the range', async () => {
  const res = await fetch(`${baseUrl}/api/tors?minBudget=1000000`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(data.tors.every((tor) => tor.facts.referencePriceTHB >= 1_000_000));
});

test('GET /api/tors: search text is matched literally, not as a pattern', async () => {
  const res = await fetch(`${baseUrl}/api/tors?q=${encodeURIComponent('(.*')}`);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).total, 0);
});
