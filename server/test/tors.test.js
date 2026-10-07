import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { Tor, TorInsight } from '#models/index.js';
import { getTorByProjectId, listTors, torFacets } from '../src/features/tors/tor.service.js';
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
  insight('99999000003', {
    // shown always; high lock-spec risk
    analytics: { lockSpec: { riskScore: 80, verdictText: 'ความเสี่ยงสูง', findings: [] } },
    metadata: { reviewStatus: 'approved', confidenceScore: 92 },
  }),
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

// Extracted while Open; the feed changed the Tor afterwards. The insights
// still hold the copy made at extraction (the EXTRA ones have no Tor at all,
// so they also show an insight without a Tor keeps its copy).
const LIVE = {
  cancelled: '99999000008', // amended (D2), then cancelled (D1)
  awarded: '99999000009', // winner announced (W0) after its deadline passed
  contracted: '99999000010', // stored as Open, but data.go.th has its signed contract
};
const LIVE_IDS = Object.values(LIVE);
const liveInsight = (projectId, deadline) => ({
  projectId,
  identification: { titleTh: `ทดสอบสถานะสด ${projectId}`, agency: 'หน่วยงานทดสอบสถานะ', status: 'Open' },
  facts: { referencePriceTHB: 3_000_000, submissionDeadline: deadline },
  amendmentInfo: { isAmended: false },
  metadata: { reviewStatus: 'pending', confidenceScore: 75 },
});

let server;
let baseUrl;

before(async () => {
  await connectDatabase({ dbName: TEST_DB });

  // Clean up any test records
  await Tor.deleteOne({ projectId: testProjectId });
  await TorInsight.deleteMany({ projectId: { $in: [testProjectId, ...EXTRA_IDS, ...LIVE_IDS] } });
  await Tor.deleteMany({ projectId: { $in: LIVE_IDS } });
  await TorInsight.insertMany(EXTRA);

  await TorInsight.insertMany([
    liveInsight(LIVE.cancelled, new Date(Date.now() + 7 * DAY)),
    liveInsight(LIVE.awarded, new Date(Date.now() - 3 * DAY)),
    liveInsight(LIVE.contracted, new Date(Date.now() + 7 * DAY)),
  ]);
  await Tor.insertMany([
    {
      projectId: LIVE.cancelled,
      source: 'process3',
      title: 'ทดสอบสถานะสด',
      status: 'Cancelled',
      isAmended: true,
      announceType: 'D1',
      announcementHistory: [
        { code: 'D0', type: 'invitation', publishedAt: new Date('2026-10-01') },
        { code: 'D2', type: 'amendment', publishedAt: new Date('2026-10-03') },
        { code: 'D1', type: 'invitation_cancelled', publishedAt: new Date('2026-10-05') },
      ],
    },
    { projectId: LIVE.awarded, source: 'process3', title: 'ทดสอบสถานะสด', status: 'Awarded' },
    {
      projectId: LIVE.contracted,
      source: 'datago',
      title: 'ทดสอบสถานะสด',
      status: 'Open',
      contract: { winnerName: 'บริษัท ผู้ชนะ จำกัด' },
    },
  ]);

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
  await Tor.deleteMany({ projectId: { $in: [testProjectId, ...LIVE_IDS] } });
  await TorInsight.deleteMany({ projectId: { $in: [testProjectId, ...EXTRA_IDS, ...LIVE_IDS] } });

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

// Every test record, in the order a query returns them
const PILOT = { showUnreviewed: true };
const orderOf = async (query) =>
  (await listTors({ q: 'ทดสอบ', limit: 50, ...query }, PILOT)).tors
    .map((tor) => tor.projectId)
    .filter((id) => id === testProjectId || EXTRA_IDS.includes(id));

test('GET /api/tors: a repeated key matches any of its values', async () => {
  const res = await fetch(`${baseUrl}/api/tors?q=${encodeURIComponent('ทดสอบ')}&status=Closed&status=Draft&limit=50`);
  const ids = (await res.json()).tors.map((tor) => tor.projectId);
  assert.ok(ids.includes('99999000007'), 'Closed');
  assert.ok(!ids.includes('99999000002'), 'Open is not asked for');

  assert.deepEqual(await orderOf({ tech: ['Go', 'python'] }), [testProjectId]);
});

test('GET /api/tors: a technology matches by its whole name, not part of it', async () => {
  assert.deepEqual(await orderOf({ tech: 'Pyth' }), []);
});

test('GET /api/tors: filters by agency, deadline window and lock-spec risk (FR-11)', async () => {
  assert.deepEqual(await orderOf({ agency: 'สำนักทดสอบรัฐบาลดิจิทัล' }), [testProjectId]);

  // 7 days out are in; 14 days out and past the deadline are not
  const closing = await orderOf({ closingWithin: '10' });
  assert.deepEqual([...closing].sort(), ['99999000002', '99999000003', '99999000004']);

  const lowRisk = await orderOf({ excludeHighRisk: 'true' });
  assert.ok(!lowRisk.includes('99999000003'), 'scored 80');
  assert.ok(lowRisk.includes('99999000002'), 'not analysed is not hidden');
});

test('GET /api/tors: sorts by deadline and by price, putting what lacks one last', async () => {
  const byDeadline = await orderOf({ sort: 'deadline' });
  assert.ok(byDeadline.indexOf('99999000002') < byDeadline.indexOf(testProjectId), '7 days before 14 days');
  assert.equal(byDeadline.at(-1), '99999000007', 'past its deadline sinks');

  const cheapest = await orderOf({ sort: 'budget-asc' });
  assert.equal(cheapest[0], '99999000007', '฿500K');
  assert.equal(cheapest.at(-1), testProjectId, '฿15M, after the ฿2M ones');
});

test('facets count what the public sees, with Closed worked out from the deadline', async () => {
  const facets = await torFacets(PILOT);
  assert.deepEqual(Object.keys(facets.statuses), ['Draft', 'Open', 'Awarded', 'Closed', 'Cancelled']);
  assert.ok(facets.statuses.Closed >= 1);

  // 002, 003, 004 and 007: not the non-IT or the rejected one
  assert.equal(facets.agencies.find((row) => row.name === 'หน่วยงานทดสอบ')?.count, 4);
  assert.ok(facets.technologies.some((row) => row.name === 'Python'));
  assert.ok(facets.lastUpdated instanceof Date);

  const res = await fetch(`${baseUrl}/api/tors/facets`);
  assert.equal(res.status, 200, 'not read as a project ID');
});

const liveIds = async (query) =>
  (await listTors({ q: 'ทดสอบสถานะสด', limit: 50, ...query }, PILOT)).tors.map((tor) => tor.projectId).sort();

test('a TOR the feed cancelled after extraction reads as Cancelled: list, filters, detail, counts', async () => {
  assert.ok(!(await liveIds({ status: 'Open' })).includes(LIVE.cancelled), 'not offered as open');
  assert.ok(!(await liveIds({ closingWithin: '10' })).includes(LIVE.cancelled), 'not "closing soon" either');
  assert.deepEqual(await liveIds({ status: 'Cancelled' }), [LIVE.cancelled]);

  const listed = (await listTors({ q: 'ทดสอบสถานะสด', limit: 50 }, PILOT)).tors.find((tor) => tor.projectId === LIVE.cancelled);
  assert.equal(listed.identification.status, 'Cancelled');

  const detail = await getTorByProjectId(LIVE.cancelled, PILOT);
  assert.equal(detail.identification.status, 'Cancelled');
  assert.equal(detail.amendmentInfo.isAmended, true, 'the amended flag comes from the Tor too');
  assert.ok((await liveIds({ amended: 'true' })).includes(LIVE.cancelled));

  assert.ok((await torFacets(PILOT)).statuses.Cancelled >= 1);
});

test('an awarded TOR past its deadline reads as Awarded, not as Closed', async () => {
  assert.equal((await getTorByProjectId(LIVE.awarded, PILOT)).identification.status, 'Awarded');
  assert.ok((await liveIds({ status: 'Awarded' })).includes(LIVE.awarded));
  assert.ok(!(await liveIds({ status: 'Closed' })).includes(LIVE.awarded));
});

test('the total counts what a status filter shows', async () => {
  const { tors, total } = await listTors({ q: 'ทดสอบสถานะสด', status: 'Cancelled' }, PILOT);
  assert.equal(total, tors.length);
  assert.equal(total, 1);
});

test('a TOR with a signed contract reads as Awarded, even when its stored status says Open', async () => {
  assert.equal((await getTorByProjectId(LIVE.contracted, PILOT)).identification.status, 'Awarded');
  assert.ok((await liveIds({ status: 'Awarded' })).includes(LIVE.contracted));
  assert.ok(!(await liveIds({ status: 'Open' })).includes(LIVE.contracted), 'never offered as open');
});

test('each TOR says which e-GP stage it reached last, and whether a contract is signed', async () => {
  const listed = (await listTors({ q: 'ทดสอบสถานะสด', limit: 50 }, PILOT)).tors;
  const byId = Object.fromEntries(listed.map((tor) => [tor.projectId, tor]));

  assert.equal(byId[LIVE.cancelled].latestAnnouncement.code, 'D1');
  assert.equal(new Date(byId[LIVE.cancelled].latestAnnouncement.publishedAt).toISOString().slice(0, 10), '2026-10-05');
  assert.equal(byId[LIVE.cancelled].contractSigned, false);
  assert.equal(byId[LIVE.contracted].contractSigned, true);
  assert.equal(byId[LIVE.contracted].latestAnnouncement, null, 'never announced by the feed');

  const detail = await getTorByProjectId(LIVE.cancelled, PILOT);
  assert.equal(detail.latestAnnouncement.code, 'D1');
  assert.equal(new Date(detail.latestAnnouncement.publishedAt).toISOString().slice(0, 10), '2026-10-05');

  // An insight without a Tor has neither
  const orphan = await getTorByProjectId('99999000002', PILOT);
  assert.deepEqual([orphan.latestAnnouncement, orphan.contractSigned], [null, false]);
});
