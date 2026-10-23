import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import {
  PipelineFailure,
  PipelineRun,
  RequestStreak,
  TitleScreen,
  Tor,
  TorInsight,
  User,
} from '#models/index.js';

import { createApp } from '../src/app.js';

const TEST_DB = 'mjolnir_test';
const PASSWORD = 'correct horse battery';
const NAME = 'Somchai Admin';

const runId = crypto.randomUUID().slice(0, 8);
const emailFor = (name) => `${name}-${runId}@example.test`;

const UNLIMITED = { windowMs: 60_000, limit: 10_000 };
const NO_RATE_LIMITS = {
  loginByIp: UNLIMITED,
  loginByEmail: UNLIMITED,
  registerByIp: UNLIMITED,
};

let server;
let baseUrl;

before(async () => {
  await connectDatabase({ dbName: TEST_DB });

  server = createApp({ rateLimits: NO_RATE_LIMITS }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));

  baseUrl = `http://localhost:${server.address().port}`;
});

after(async () => {
  await User.deleteMany({ email: new RegExp(`-${runId}@example\\.test$`) });
  await PipelineFailure.deleteMany({ projectId: new RegExp(`^TEST-${runId}`) });
  await PipelineRun.deleteMany({ host: `test-${runId}` });
  await Tor.deleteMany({ projectId: new RegExp(`^TEST-${runId}`) });
  await TorInsight.deleteMany({ projectId: new RegExp(`^TEST-${runId}`) });
  await TitleScreen.deleteMany({ projectId: new RegExp(`^TEST-${runId}`) });
  await RequestStreak.deleteMany({ _id: 'gprocurement.go.th' });

  await new Promise((resolve) => server.close(resolve));
  await disconnectDatabase();
});

async function signUp(name, { role } = {}) {
  const email = emailFor(name);

  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, name: NAME }),
  });
  assert.equal(response.status, 201);

  const setCookie = response.headers.get('set-cookie');
  assert.ok(setCookie);
  const cookie = setCookie.split(';')[0];

  if (role) {
    await User.updateOne({ email }, { $set: { role } });
  }

  return cookie;
}

test('FR-24: guest receives 401 when calling pipeline retry or dismiss', async () => {
  const resRetry = await fetch(`${baseUrl}/api/admin/pipeline/retry`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectId: '123', step: 'ocr' }),
  });
  assert.equal(resRetry.status, 401);

  const resDismiss = await fetch(`${baseUrl}/api/admin/pipeline/dismiss`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectId: '123', step: 'ocr' }),
  });
  assert.equal(resDismiss.status, 401);
});

test('FR-24: non-admin receives 403 when calling pipeline retry or dismiss', async () => {
  const userCookie = await signUp('regular-user', { role: 'user' });

  const resRetry = await fetch(`${baseUrl}/api/admin/pipeline/retry`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: userCookie },
    body: JSON.stringify({ projectId: '123', step: 'ocr' }),
  });
  assert.equal(resRetry.status, 403);

  const resDismiss = await fetch(`${baseUrl}/api/admin/pipeline/dismiss`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: userCookie },
    body: JSON.stringify({ projectId: '123', step: 'ocr' }),
  });
  assert.equal(resDismiss.status, 403);
});

test('FR-24: GET /api/admin/operations surfaces pipelineFailures, stageSnapshot, and pipelineRuns', async () => {
  const adminCookie = await signUp('ops-admin', { role: 'admin' });
  const projId = `TEST-${runId}-001`;

  await Tor.create({
    projectId: projId,
    title: 'โครงการทดสอบระบบเครือข่าย',
    agency: 'สำนักการระบายน้ำ',
    pipelineStatus: 'downloaded',
    source: 'process3',
  });

  await PipelineFailure.create({
    projectId: projId,
    step: 'ocr',
    attempts: 2,
    lastError: 'OCR timeout: 50 pages',
    lastTransient: false,
    firstFailedAt: new Date(Date.now() - 3600_000),
    lastFailedAt: new Date(),
  });

  await PipelineRun.create({
    job: 'poll',
    host: `test-${runId}`,
    startedAt: new Date(Date.now() - 10000),
    finishedAt: new Date(),
    outcome: 'done',
    steps: [{ name: 'ingest fetch', exitCode: 0, ms: 1200 }],
  });

  const res = await fetch(`${baseUrl}/api/admin/operations`, {
    headers: { cookie: adminCookie },
  });
  assert.equal(res.status, 200);

  const data = await res.json();
  assert.ok(Array.isArray(data.pipelineFailures));
  assert.ok(data.stageSnapshot);
  assert.ok(Array.isArray(data.pipelineRuns));

  const foundFailure = data.pipelineFailures.find((f) => f.projectId === projId);
  assert.ok(foundFailure);
  assert.equal(foundFailure.step, 'ocr');
  assert.equal(foundFailure.projectTitle, 'โครงการทดสอบระบบเครือข่าย');
  assert.equal(foundFailure.agency, 'สำนักการระบายน้ำ');
  assert.equal(foundFailure.attempts, 2);
  assert.equal(foundFailure.lastTransient, false);
});

test('FR-24: POST /api/admin/pipeline/retry validates input parameters', async () => {
  const adminCookie = await signUp('retry-val-admin', { role: 'admin' });

  // Missing projectId
  const res1 = await fetch(`${baseUrl}/api/admin/pipeline/retry`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ step: 'ocr' }),
  });
  assert.equal(res1.status, 400);

  // Invalid step
  const res2 = await fetch(`${baseUrl}/api/admin/pipeline/retry`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ projectId: '123', step: 'invalid_step' }),
  });
  assert.equal(res2.status, 400);
});

test('FR-24: POST /api/admin/pipeline/retry clears failure and resets Tor status', async () => {
  const adminCookie = await signUp('retry-exec-admin', { role: 'admin' });
  const projId = `TEST-${runId}-002`;

  await Tor.create({
    projectId: projId,
    title: 'โครงการระบบสารสนเทศ',
    agency: 'กรุงเทพมหานคร',
    pipelineStatus: 'ocr_preview',
    source: 'process3',
  });

  await PipelineFailure.create({
    projectId: projId,
    step: 'ocr',
    attempts: 3,
    lastError: 'PDF corrupted',
    lastTransient: false,
    firstFailedAt: new Date(),
    lastFailedAt: new Date(),
  });

  const res = await fetch(`${baseUrl}/api/admin/pipeline/retry`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ projectId: projId, step: 'ocr' }),
  });
  assert.equal(res.status, 200);

  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.status, 're-queued');

  // Verify failure record was deleted
  const failure = await PipelineFailure.findOne({ projectId: projId, step: 'ocr' });
  assert.equal(failure, null);

  // Verify Tor status was reset to 'downloaded' for OCR step
  const tor = await Tor.findOne({ projectId: projId });
  assert.equal(tor.pipelineStatus, 'downloaded');
});

test('FR-24: POST /api/admin/pipeline/dismiss clears failure and excludes document', async () => {
  const adminCookie = await signUp('dismiss-admin', { role: 'admin' });
  const projId = `TEST-${runId}-003`;

  await Tor.create({
    projectId: projId,
    title: 'โครงการก่อสร้างปรับปรุงอาคาร (ไม่ใช่ IT)',
    agency: 'สำนักการโยธา',
    pipelineStatus: 'downloaded',
    source: 'process3',
  });

  await PipelineFailure.create({
    projectId: projId,
    step: 'download',
    attempts: 3,
    lastError: '404 not found on e-GP',
    lastTransient: false,
    firstFailedAt: new Date(),
    lastFailedAt: new Date(),
  });

  const res = await fetch(`${baseUrl}/api/admin/pipeline/dismiss`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({
      projectId: projId,
      step: 'download',
      reason: 'Permanently missing on agency portal',
    }),
  });
  assert.equal(res.status, 200);

  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.status, 'dismissed');

  // Failure deleted
  const failure = await PipelineFailure.findOne({ projectId: projId, step: 'download' });
  assert.equal(failure, null);

  // Document excluded in TorInsight
  const insight = await TorInsight.findOne({ projectId: projId });
  assert.ok(insight);
  assert.equal(insight.metadata.excluded.reason, 'Permanently missing on agency portal');
});

test('FR-24: GET /api/admin/pipeline/record/:projectId enforces authentication and role guards', async () => {
  const projId = `TEST-${runId}-004`;

  // Guest receives 401
  const resGuest = await fetch(`${baseUrl}/api/admin/pipeline/record/${projId}`);
  assert.equal(resGuest.status, 401);

  // Normal user receives 403
  const userCookie = await signUp('diag-user', { role: 'user' });
  const resUser = await fetch(`${baseUrl}/api/admin/pipeline/record/${projId}`, {
    headers: { cookie: userCookie },
  });
  assert.equal(resUser.status, 403);
});

test('FR-24: GET /api/admin/pipeline/record/:projectId returns 404 when project not found', async () => {
  const adminCookie = await signUp('diag-404-admin', { role: 'admin' });
  const missingId = `TEST-${runId}-MISSING`;

  const res = await fetch(`${baseUrl}/api/admin/pipeline/record/${missingId}`, {
    headers: { cookie: adminCookie },
  });
  assert.equal(res.status, 404);
  const data = await res.json();
  assert.match(data.error.message, /not found/i);
});

test('FR-24: GET /api/admin/pipeline/record/:projectId aggregates full lifecycle diagnostics', async () => {
  const adminCookie = await signUp('diag-success-admin', { role: 'admin' });
  const projId = `TEST-${runId}-005`;

  await Tor.create({
    projectId: projId,
    title: 'โครงการพัฒนาระบบคลาวด์ภาครัฐ',
    agency: 'กระทรวงดิจิทัลเพื่อเศรษฐกิจและสังคม',
    pipelineStatus: 'downloaded',
    source: 'process3',
    budgetTHB: 50_000_000,
    referencePriceTHB: 49_500_000,
    submissionDeadline: new Date(Date.now() + 86400_000),
    status: 'Open',
    document: {
      fileName: 'tor-test-cloud.pdf',
      pages: 35,
      sizeBytes: 2_450_000,
      documentType: 'application/pdf',
      downloadedAt: new Date(),
    },
    ocr: {
      usedOcr: true,
      confidence: 0.92,
    },
  });

  await PipelineFailure.create({
    projectId: projId,
    step: 'ocr',
    attempts: 1,
    lastError: 'Temporary OCR worker timeout',
    lastTransient: true,
    firstFailedAt: new Date(),
    lastFailedAt: new Date(),
  });

  await TorInsight.create({
    projectId: projId,
    identification: {
      titleTh: 'โครงการพัฒนาระบบคลาวด์ภาครัฐ',
      agency: 'กระทรวงดิจิทัลเพื่อเศรษฐกิจและสังคม',
      status: 'Open',
    },
    confidence: 88,
    facts: {
      budgetTHB: 50_000_000,
      referencePriceTHB: 49_500_000,
      requiredTechStack: ['Kubernetes', 'PostgreSQL'],
    },
    analytics: {
      lockSpec: {
        riskScore: 50,
      },
    },
    metadata: {
      origin: 'pipeline',
      reviewStatus: 'pending',
      confidenceScore: 88,
    },
  });

  await TitleScreen.create({
    projectId: projId,
    title: 'โครงการพัฒนาระบบคลาวด์ภาครัฐ',
    verdict: 'it',
    category: 'Software/IT',
    reason: 'Government cloud system infrastructure and migration',
    modelName: 'gemini-1.5-flash',
    promptVersion: 'screen-v2',
    screenedAt: new Date(),
  });

  const res = await fetch(`${baseUrl}/api/admin/pipeline/record/${projId}`, {
    headers: { cookie: adminCookie },
  });
  assert.equal(res.status, 200);

  const data = await res.json();
  assert.equal(data.ok, true);
  assert.ok(data.record);
  assert.equal(data.record.projectId, projId);
  assert.equal(data.record.title, 'โครงการพัฒนาระบบคลาวด์ภาครัฐ');
  assert.equal(data.record.agency, 'กระทรวงดิจิทัลเพื่อเศรษฐกิจและสังคม');
  assert.equal(data.record.budgetTHB, 50_000_000);
  assert.equal(data.record.pipelineStatus, 'downloaded');

  // Verify stage progression flags
  assert.equal(data.record.stages.fetched.done, true);
  assert.equal(data.record.stages.downloaded.done, true);
  assert.equal(data.record.stages.ocr.done, false);
  assert.equal(data.record.stages.ocr.error, 'Temporary OCR worker timeout');

  // Verify active failure
  assert.ok(data.record.activeFailure);
  assert.equal(data.record.activeFailure.step, 'ocr');
  assert.equal(data.record.activeFailure.attempts, 1);
  assert.equal(data.record.activeFailure.lastTransient, true);

  // Verify insight & screening
  assert.ok(data.record.insight);
  assert.equal(data.record.insight.confidence, 88);
  assert.equal(data.record.insight.lockSpecRisk, 'medium');
  assert.ok(data.record.titleScreen);
  assert.equal(data.record.titleScreen.isItRelated, true);
});

test('FR-24: POST /api/admin/pipeline/add validates authentication, regex format, and duplicates', async () => {
  const adminCookie = await signUp('add-admin', { role: 'admin' });

  // Guest 401
  const resGuest = await fetch(`${baseUrl}/api/admin/pipeline/add`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectId: '69099683466' }),
  });
  assert.equal(resGuest.status, 401);

  // Non-admin 403
  const userCookie = await signUp('add-user', { role: 'user' });
  const resUser = await fetch(`${baseUrl}/api/admin/pipeline/add`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: userCookie },
    body: JSON.stringify({ projectId: '69099683466' }),
  });
  assert.equal(resUser.status, 403);

  // Invalid format (not 11 digits) -> 400
  const resBadId = await fetch(`${baseUrl}/api/admin/pipeline/add`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ projectId: '12345' }),
  });
  assert.equal(resBadId.status, 400);
  const badIdBody = await resBadId.json();
  assert.match(badIdBody.error.message, /11 digits/i);

  // Duplicate project already in database -> 409
  const existingId = '68099123456';
  await Tor.create({
    projectId: existingId,
    title: 'โครงการที่มีอยู่แล้ว',
    agency: 'กรุงเทพมหานคร',
    pipelineStatus: 'downloaded',
    source: 'manual',
  });

  const resDup = await fetch(`${baseUrl}/api/admin/pipeline/add`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ projectId: existingId }),
  });
  assert.equal(resDup.status, 409);
  const dupBody = await resDup.json();
  assert.match(dupBody.error.message, /already exists/i);

  // Clean up
  await Tor.deleteOne({ projectId: existingId });
});

test('FR-24: POST /api/admin/pipeline/retry-all guards auth and clears transient failures in bulk', async () => {
  const adminCookie = await signUp('retry-all-admin', { role: 'admin' });
  const userCookie = await signUp('retry-all-user', { role: 'user' });

  // Guest 401
  const resGuest = await fetch(`${baseUrl}/api/admin/pipeline/retry-all`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ transientOnly: true }),
  });
  assert.equal(resGuest.status, 401);

  // User 403
  const resUser = await fetch(`${baseUrl}/api/admin/pipeline/retry-all`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: userCookie },
    body: JSON.stringify({ transientOnly: true }),
  });
  assert.equal(resUser.status, 403);

  // Invalid step 400
  const resBadStep = await fetch(`${baseUrl}/api/admin/pipeline/retry-all`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ step: 'invalid_step' }),
  });
  assert.equal(resBadStep.status, 400);

  // Seed 3 failures (2 transient, 1 non-transient)
  const id1 = `TEST-${runId}-BULK1`;
  const id2 = `TEST-${runId}-BULK2`;
  const id3 = `TEST-${runId}-BULK3`;

  await Tor.create([
    { projectId: id1, title: 'Bulk OCR Project', agency: 'กทม.', pipelineStatus: 'ocr_preview', source: 'process3' },
    { projectId: id2, title: 'Bulk Download Project', agency: 'กทม.', pipelineStatus: 'fetched', source: 'process3' },
    { projectId: id3, title: 'Bulk Extract Project', agency: 'กทม.', pipelineStatus: 'downloaded', source: 'process3' },
  ]);

  await TorInsight.create([
    {
      projectId: id3,
      identification: { titleTh: 'Bulk Extract Project', agency: 'กทม.', status: 'Open' },
      metadata: { reviewStatus: 'rejected', excluded: { reason: 'Old failure' } },
    },
  ]);

  await PipelineFailure.create([
    { projectId: id1, step: 'ocr', attempts: 2, lastError: '429 Rate limit', lastTransient: true, firstFailedAt: new Date(), lastFailedAt: new Date() },
    { projectId: id2, step: 'download', attempts: 1, lastError: 'ETIMEDOUT', lastTransient: true, firstFailedAt: new Date(), lastFailedAt: new Date() },
    { projectId: id3, step: 'extract', attempts: 3, lastError: 'Unrecoverable schema crash', lastTransient: false, firstFailedAt: new Date(), lastFailedAt: new Date() },
  ]);

  // Bulk retry transient only
  const resTransient = await fetch(`${baseUrl}/api/admin/pipeline/retry-all`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ transientOnly: true }),
  });
  assert.equal(resTransient.status, 200);
  const dataTransient = await resTransient.json();
  assert.equal(dataTransient.ok, true);
  assert.ok(dataTransient.clearedCount >= 2);

  // Assert transient failures were cleared
  const f1 = await PipelineFailure.findOne({ projectId: id1, step: 'ocr' });
  const f2 = await PipelineFailure.findOne({ projectId: id2, step: 'download' });
  const f3 = await PipelineFailure.findOne({ projectId: id3, step: 'extract' });
  assert.equal(f1, null);
  assert.equal(f2, null);
  assert.ok(f3, 'Non-transient failure must NOT be cleared when transientOnly: true');

  // Assert statuses were reset
  const t1 = await Tor.findOne({ projectId: id1 });
  assert.equal(t1.pipelineStatus, 'downloaded');
  const t2 = await Tor.findOne({ projectId: id2 });
  assert.equal(t2.pipelineStatus, 'fetched');

  // Now clear remaining failure with transientOnly: false and step: 'extract'
  const resAllExtract = await fetch(`${baseUrl}/api/admin/pipeline/retry-all`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ step: 'extract', transientOnly: false }),
  });
  assert.equal(resAllExtract.status, 200);
  const dataAllExtract = await resAllExtract.json();
  assert.equal(dataAllExtract.ok, true);
  assert.ok(dataAllExtract.clearedCount >= 1);

  const f3After = await PipelineFailure.findOne({ projectId: id3, step: 'extract' });
  assert.equal(f3After, null);

  const ins3 = await TorInsight.findOne({ projectId: id3 });
  assert.equal(ins3.metadata.reviewStatus, 'pending');
  assert.equal(ins3.metadata.excluded, null);
});

test('FR-24: POST /api/admin/pipeline/retry supports runNow: true for immediate execution', async () => {
  const adminCookie = await signUp('retry-now-admin', { role: 'admin' });
  const projId = `TEST-${runId}-RUNNOW1`;

  await Tor.create({
    projectId: projId,
    title: 'โครงการทดสอบรันทันที',
    agency: 'สำนักยุทธศาสตร์',
    pipelineStatus: 'downloaded',
    source: 'process3',
  });

  await TorInsight.create({
    projectId: projId,
    identification: { titleTh: 'โครงการทดสอบรันทันที', agency: 'สำนักยุทธศาสตร์', status: 'Open' },
    facts: { budgetTHB: 2000000 },
    metadata: { reviewStatus: 'rejected', excluded: { reason: 'Test extract failure' } },
  });

  await PipelineFailure.create({
    projectId: projId,
    step: 'extract',
    attempts: 1,
    lastError: 'Gemini parse failure',
    lastTransient: true,
    firstFailedAt: new Date(),
    lastFailedAt: new Date(),
  });

  const res = await fetch(`${baseUrl}/api/admin/pipeline/retry`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ projectId: projId, step: 'extract', runNow: true }),
  });
  assert.equal(res.status, 200);

  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.executedImmediately, true);
  assert.equal(body.status, 'executed');

  // Verify failure record was cleared
  const failure = await PipelineFailure.findOne({ projectId: projId, step: 'extract' });
  assert.equal(failure, null);

  // Verify TorInsight was reset to pending
  const insight = await TorInsight.findOne({ projectId: projId });
  assert.equal(insight.metadata.reviewStatus, 'pending');
});

test('FR-24: GET /api/admin/pipeline/record/:projectId classifies wave priority according to ADR 0030', async () => {
  const adminCookie = await signUp('wave-admin', { role: 'admin' });

  // Wave 4 (Past Reference)
  const idWave4 = `TEST-${runId}-W4`;
  await Tor.create({
    projectId: idWave4,
    title: 'โครงการย้อนหลังเพื่อวิเคราะห์ราคา',
    agency: 'สำนักการคลัง',
    pipelineStatus: 'downloaded',
    source: 'datago',
    historyRequestedAt: new Date(),
  });
  const resW4 = await fetch(`${baseUrl}/api/admin/pipeline/record/${idWave4}`, { headers: { cookie: adminCookie } });
  const dataW4 = await resW4.json();
  assert.equal(dataW4.record.wavePriority, 'Wave 4 (Past Reference)');

  // Wave 1/3 (Changed Package) via packageCheckNeeded
  const idWave1 = `TEST-${runId}-W1`;
  await Tor.create({
    projectId: idWave1,
    title: 'โครงการเปลี่ยนแปลงขอบเขตงาน',
    agency: 'สำนักการแพทย์',
    pipelineStatus: 'downloaded',
    source: 'process3',
    packageCheckNeeded: true,
  });
  const resW1 = await fetch(`${baseUrl}/api/admin/pipeline/record/${idWave1}`, { headers: { cookie: adminCookie } });
  const dataW1 = await resW1.json();
  assert.equal(dataW1.record.wavePriority, 'Wave 1/3 (Changed Package / Amendment)');

  // Wave 1/3 via document.version > 1
  const idWave3 = `TEST-${runId}-W3`;
  await Tor.create({
    projectId: idWave3,
    title: 'โครงการปรับปรุง TOR ฉบับที่ 2',
    agency: 'สำนักการระบายน้ำ',
    pipelineStatus: 'downloaded',
    source: 'process3',
    document: { version: 2 },
  });
  const resW3 = await fetch(`${baseUrl}/api/admin/pipeline/record/${idWave3}`, { headers: { cookie: adminCookie } });
  const dataW3 = await resW3.json();
  assert.equal(dataW3.record.wavePriority, 'Wave 1/3 (Changed Package / Amendment)');

  // Wave 2 (New Active IT)
  const idWave2 = `TEST-${runId}-W2`;
  await Tor.create({
    projectId: idWave2,
    title: 'โครงการใหม่เปิดรับข้อเสนอ',
    agency: 'กทม.',
    status: 'Open',
    pipelineStatus: 'fetched',
    source: 'process3',
  });
  const resW2 = await fetch(`${baseUrl}/api/admin/pipeline/record/${idWave2}`, { headers: { cookie: adminCookie } });
  const dataW2 = await resW2.json();
  assert.equal(dataW2.record.wavePriority, 'Wave 2 (New Active IT)');

  // Completed / Inactive
  const idWaveComp = `TEST-${runId}-WCOMP`;
  await Tor.create({
    projectId: idWaveComp,
    title: 'โครงการประกาศผู้ชนะแล้ว',
    agency: 'กทม.',
    status: 'Awarded',
    pipelineStatus: 'downloaded',
    source: 'process3',
  });
  const resWComp = await fetch(`${baseUrl}/api/admin/pipeline/record/${idWaveComp}`, { headers: { cookie: adminCookie } });
  const dataWComp = await resWComp.json();
  assert.equal(dataWComp.record.wavePriority, 'Completed / Inactive');
});

test('FR-24: GET /api/admin/operations exposes e-GP requestStreak telemetry in stats', async () => {
  const adminCookie = await signUp('streak-admin', { role: 'admin' });

  // Update RequestStreak in MongoDB
  await RequestStreak.updateOne(
    { _id: 'gprocurement.go.th' },
    { $set: { inARow: 42, lastAt: new Date() } },
    { upsert: true },
  );

  const res = await fetch(`${baseUrl}/api/admin/operations`, {
    headers: { cookie: adminCookie },
  });
  assert.equal(res.status, 200);

  const data = await res.json();
  assert.ok(data.stats);
  assert.ok(data.stats.requestStreak);
  assert.equal(data.stats.requestStreak.inARow, 42);
  assert.equal(data.stats.requestStreak.limit, 230);
  assert.ok(typeof data.stats.requestStreak.cooldownRemainingMs === 'number');
});

test('FR-23 / FR-24: updateTorReview persists extended facts and exposes them in reviewQueue details', async () => {
  const adminCookie = await signUp('facts-ext-admin', { role: 'admin' });
  const projId = `TEST-${runId}-FACTSEXT`;

  await Tor.create({
    projectId: projId,
    title: 'โครงการพัฒนาระบบคลังข้อมูลขนาดใหญ่',
    agency: 'สำนักยุทธศาสตร์และประเมินผล',
    source: 'process3',
    status: 'Open',
    budgetTHB: 12000000,
  });

  await TorInsight.create({
    projectId: projId,
    identification: {
      titleTh: 'โครงการพัฒนาระบบคลังข้อมูลขนาดใหญ่',
      agency: 'สำนักยุทธศาสตร์และประเมินผล',
      status: 'Open',
    },
    facts: {
      budgetTHB: 12000000,
    },
    metadata: {
      origin: 'pipeline',
      reviewStatus: 'pending',
      confidenceScore: 68,
    },
  });

  // Edit extended facts via review PATCH
  const patchRes = await fetch(`${baseUrl}/api/admin/review/${projId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({
      action: 'approve',
      fields: {
        title: 'โครงการพัฒนาระบบ Data Warehouse และ AI Analytics (ฉบับสมบูรณ์)',
        objective: 'เพื่อบูรณาการข้อมูลบริการประชาชนและวิเคราะห์แนวโน้มเมือง',
        systemArchetype: 'Data Warehouse & AI Analytics',
        complexityTier: 'Enterprise Tier 3',
        contractDurationDays: '365',
        warrantyYears: '2',
        companyRequirements: [
          'นิติบุคคลจดทะเบียนในประเทศไทย',
          'มีทุนจดทะเบียนชำระแล้วไม่น้อยกว่า 10,000,000 บาท',
          'ได้รับมาตรฐาน ISO/IEC 29110 หรือ CMMI Level 3',
        ],
        previousExperience: 'มีผลงานพัฒนาระบบคลังข้อมูลภาครัฐหรือเอกชน',
        previousExperienceMinTHB: '5000000',
        paymentTerms: 'แบ่งจ่าย 5 งวดตามความคืบหน้ารายไตรมาส',
        penaltyClause: 'ร้อยละ 0.20 ต่อวัน',
        requiredTechnologies: 'PostgreSQL, Apache Kafka, Python',
      },
    }),
  });

  assert.equal(patchRes.status, 200);
  const patchData = await patchRes.json();
  assert.equal(patchData.ok, true);
  assert.equal(patchData.reviewStatus, 'approved');

  // Verify database persistence
  const updated = await TorInsight.findOne({ projectId: projId });
  assert.equal(updated.overview?.objective, 'เพื่อบูรณาการข้อมูลบริการประชาชนและวิเคราะห์แนวโน้มเมือง');
  assert.equal(updated.overview?.systemArchetype, 'Data Warehouse & AI Analytics');
  assert.equal(updated.overview?.complexityTier, 'Enterprise Tier 3');
  assert.equal(updated.facts?.contractDurationDays, 365);
  assert.equal(updated.facts?.warrantyYears, 2);
  assert.equal(updated.facts?.penaltyClause, 'ร้อยละ 0.20 ต่อวัน');
  assert.equal(updated.eligibility?.companyRequirements.length, 3);
  assert.match(updated.eligibility?.companyRequirements[0], /นิติบุคคล/);
  assert.equal(updated.eligibility?.previousExperience, 'มีผลงานพัฒนาระบบคลังข้อมูลภาครัฐหรือเอกชน');
  assert.equal(updated.eligibility?.previousExperienceMinTHB, 5000000);
  assert.equal(updated.contractConditions?.paymentTerms, 'แบ่งจ่าย 5 งวดตามความคืบหน้ารายไตรมาส');

  // Verify operations reviewQueue attaches structured details
  const opsRes = await fetch(`${baseUrl}/api/admin/operations`, {
    headers: { cookie: adminCookie },
  });
  assert.equal(opsRes.status, 200);
  const opsData = await opsRes.json();
  const queueItem = opsData.reviewQueue.find((item) => item.docId === projId);
  assert.ok(queueItem, 'Updated project should appear in reviewQueue');
  assert.ok(queueItem.details, 'Item must carry structured details');
  assert.equal(queueItem.details.objective, 'เพื่อบูรณาการข้อมูลบริการประชาชนและวิเคราะห์แนวโน้มเมือง');
  assert.equal(queueItem.details.systemArchetype, 'Data Warehouse & AI Analytics');
  assert.equal(queueItem.details.contractDurationDays, 365);
  assert.equal(queueItem.details.warrantyYears, 2);
  assert.equal(queueItem.details.previousExperienceMinTHB, 5000000);
  assert.equal(queueItem.details.paymentTerms, 'แบ่งจ่าย 5 งวดตามความคืบหน้ารายไตรมาส');
});


