import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import {
  PipelineFailure,
  PipelineRun,
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
