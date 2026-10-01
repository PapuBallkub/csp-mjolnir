import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { Tor, TorInsight } from '#models/index.js';
import { createApp } from '../src/app.js';

const TEST_DB = 'mjolnir_test';
const testProjectId = '99999000001';

let server;
let baseUrl;

before(async () => {
  await connectDatabase({ dbName: TEST_DB });

  // Clean up any test records
  await Tor.deleteOne({ projectId: testProjectId });
  await TorInsight.deleteOne({ projectId: testProjectId });

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
  await TorInsight.deleteOne({ projectId: testProjectId });

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
