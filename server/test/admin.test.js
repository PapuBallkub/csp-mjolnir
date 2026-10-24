// The admin routes over HTTP, because the guard is the entire reason this
// feature exists. requireRole is unit-tested in auth-role.test.js; what is
// checked here is that it is actually mounted, in the right order, in front of
// data that used to be public.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { IngestionLog, TitleScreen, Tor, TorInsight, TorInsightVersion, User } from '#models/index.js';

import { createApp } from '../src/app.js';

const TEST_DB = 'mjolnir_test';
const PASSWORD = 'correct horse battery';
const NAME = 'Somchai Test';

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
  await IngestionLog.deleteMany({ source: new RegExp(`^test-`) });
  await TorInsight.deleteMany({ projectId: new RegExp(`^TEST-${runId}`) });
  await TorInsightVersion.deleteMany({ projectId: new RegExp(`^TEST-${runId}`) });
  await Tor.deleteMany({ projectId: new RegExp(`^TEST-${runId}`) });
  await TitleScreen.deleteMany({ projectId: new RegExp(`^TEST-${runId}`) });

  await new Promise((resolve) => server.close(resolve));
  await disconnectDatabase();
});

/** Registers an account and returns its session cookie. */
async function signUp(name, { role } = {}) {
  const email = emailFor(name);

  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, name: NAME }),
  });
  assert.equal(response.status, 201);

  if (role) {
    // What `npm run role` does, which is the only way an account becomes an
    // admin. requireAuth re-reads the user per request, so this takes effect
    // on the very next one — no need to sign in again.
    await User.updateOne({ email }, { $set: { role } });
  }

  const header = response.headers.getSetCookie().find((c) => c.startsWith('mjolnir_session='));
  return header.split(';')[0];
}

const operations = (cookie) =>
  fetch(`${baseUrl}/api/admin/operations`, { headers: cookie ? { cookie } : {} });

test('an anonymous caller gets 401, not 403', async () => {
  const response = await operations();

  // 403 would tell someone who is nobody that they are the wrong kind of
  // person. 401 is the honest answer and matches the rest of the API.
  assert.equal(response.status, 401);
  assert.match((await response.json()).error.message, /Sign in/i);
});

test('an ordinary signed-in user is forbidden, and gets no data with it', async () => {
  const response = await operations(await signUp('plain-user'));

  assert.equal(response.status, 403);

  const body = await response.json();
  assert.match(body.error.message, /administrator/i);

  // The whole point: the payload must not ride along with the refusal.
  const raw = JSON.stringify(body);
  assert.equal(raw.includes('gprocurement'), false, 'scraper internals leaked in a 403');
  assert.equal(raw.includes('BMA-2569'), false, 'document ids leaked in a 403');
});

test('an admin gets the operations payload', async () => {
  const response = await operations(await signUp('an-admin', { role: 'admin' }));

  assert.equal(response.status, 200);

  const body = await response.json();
  assert.ok(Array.isArray(body.sources) && body.sources.length > 0);
  assert.ok(Array.isArray(body.reviewQueue));
  assert.equal(typeof body.stats.docsAwaitingReview, 'number');

  // All scrapers arrive with valid operational health telemetry
  assert.ok(
    body.sources.every((source) => ['ok', 'degraded', 'failed'].includes(source.health)),
    'all scrapers must arrive with a valid health state',
  );
  assert.ok(
    body.reviewQueue.some((item) => item.misclassified),
    'a misclassified document must arrive flagged',
  );
});

test('losing the role closes the door again on the next request', async () => {
  const email = emailFor('demoted');

  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, name: NAME }),
  });
  const cookie = response.headers
    .getSetCookie()
    .find((c) => c.startsWith('mjolnir_session='))
    .split(';')[0];

  await User.updateOne({ email }, { $set: { role: 'admin' } });
  assert.equal((await operations(cookie)).status, 200);

  await User.updateOne({ email }, { $set: { role: 'user' } });

  // The same cookie, still perfectly valid as a session. Revoking the role has
  // to be enough on its own — nobody is going to hunt down their sessions.
  assert.equal((await operations(cookie)).status, 403);
});

/* ------------------------------------------------------------------ */
/*  FR-22: Telemetry aggregation from IngestionLog                    */
/* ------------------------------------------------------------------ */

test('FR-22: operations dynamically incorporates IngestionLog metrics and errors', async () => {
  const adminCookie = await signUp('telemetry-admin', { role: 'admin' });
  const testSource = `test-src-${runId}`;

  // Create 3 runs: 2 ok, 1 failed with error
  await IngestionLog.create([
    {
      source: testSource,
      status: 'ok',
      startedAt: new Date(Date.now() - 3600_000 * 2),
      finishedAt: new Date(Date.now() - 3600_000 * 2 + 1500),
      durationMs: 1500,
      itemsIngested: 5,
    },
    {
      source: testSource,
      status: 'ok',
      startedAt: new Date(Date.now() - 3600_000),
      finishedAt: new Date(Date.now() - 3600_000 + 1200),
      durationMs: 1200,
      itemsIngested: 3,
    },
    {
      source: testSource,
      status: 'failed',
      startedAt: new Date(),
      finishedAt: new Date(),
      durationMs: 500,
      itemsIngested: 0,
      error: 'HTTP 429 Too Many Requests from test portal',
    },
  ]);

  const res = await operations(adminCookie);
  assert.equal(res.status, 200);
  const data = await res.json();

  const found = data.sources.find((s) => s.id === testSource);
  assert.ok(found, 'dynamically logged source should appear in operations.sources');
  assert.equal(found.health, 'failed');
  assert.match(found.error, /HTTP 429/);
  assert.equal(found.docsLast7Days, 8);
  assert.ok(found.uptime < 100);
});

/* ------------------------------------------------------------------ */
/*  FR-23: Manual editing of extracted data & reclassification       */
/* ------------------------------------------------------------------ */

test('FR-23: non-admin cannot access review mutation endpoints', async () => {
  const userCookie = await signUp('review-user');
  const projId = `TEST-${runId}-001`;

  const patchRes = await fetch(`${baseUrl}/api/admin/review/${projId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie: userCookie },
    body: JSON.stringify({ action: 'approve', fields: { referencePriceTHB: 5000000 } }),
  });
  assert.equal(patchRes.status, 403);

  const reRes = await fetch(`${baseUrl}/api/admin/review/${projId}/re-extract`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: userCookie },
  });
  assert.equal(reRes.status, 403);

  const getRes = await fetch(`${baseUrl}/api/admin/review/${projId}`, {
    headers: { cookie: userCookie },
  });
  assert.equal(getRes.status, 403);
});

test('FR-23: GET /api/admin/review/:projectId retrieves single review item for dedicated editor', async () => {
  const adminCookie = await signUp('get-review-admin', { role: 'admin' });
  const projId = `TEST-${runId}-GETREV1`;

  // 404 when not found
  const notFoundRes = await fetch(`${baseUrl}/api/admin/review/${projId}-MISSING`, {
    headers: { cookie: adminCookie },
  });
  assert.equal(notFoundRes.status, 404);

  // Seed Tor and TorInsight
  await Tor.create({
    projectId: projId,
    title: 'โครงการระบบความปลอดภัยข้อมูล',
    agency: 'สำนักยุทธศาสตร์',
    source: 'process3',
    status: 'Open',
    budgetTHB: 5000000,
    referencePriceTHB: 4800000,
    submissionDeadline: new Date('2026-11-15'),
  });

  await TorInsight.create({
    projectId: projId,
    identification: {
      titleTh: 'โครงการระบบความปลอดภัยข้อมูล',
      agency: 'สำนักยุทธศาสตร์',
      status: 'Open',
    },
    overview: {
      objective: 'ยกระดับการป้องกันภัยไซเบอร์',
      systemArchetype: 'Security & Infrastructure',
      complexityTier: 'Tier 2',
    },
    facts: {
      budgetTHB: 5000000,
      referencePriceTHB: 4800000,
      contractDurationDays: 180,
      warrantyYears: 1,
      penaltyClause: '0.1% ต่อวัน',
    },
    eligibility: {
      companyRequirements: ['ขึ้นทะเบียนผู้ประกอบการ'],
      previousExperience: 'มีผลงานความปลอดภัยไซเบอร์',
      previousExperienceMinTHB: 2000000,
    },
    contractConditions: {
      paymentTerms: 'จ่าย 3 งวด',
    },
    technicalRequirements: {
      requiredTechnologies: [{ name: 'Firewall', version: 'v2' }, { name: 'Linux', version: null }],
    },
    metadata: {
      origin: 'pipeline',
      reviewStatus: 'pending',
      confidenceScore: 78,
    },
  });

  const res = await fetch(`${baseUrl}/api/admin/review/${projId}`, {
    headers: { cookie: adminCookie },
  });
  assert.equal(res.status, 200);

  const data = await res.json();
  assert.equal(data.ok, true);
  assert.ok(data.item);
  assert.equal(data.item.docId, projId);
  assert.equal(data.item.title, 'โครงการระบบความปลอดภัยข้อมูล');
  assert.equal(data.item.agency, 'สำนักยุทธศาสตร์');
  assert.equal(data.item.details.objective, 'ยกระดับการป้องกันภัยไซเบอร์');
  assert.equal(data.item.details.systemArchetype, 'Security & Infrastructure');
  assert.equal(data.item.details.contractDurationDays, 180);
  assert.equal(data.item.details.warrantyYears, 1);
  assert.equal(data.item.details.previousExperienceMinTHB, 2000000);
  assert.equal(data.item.details.paymentTerms, 'จ่าย 3 งวด');
  assert.match(data.item.details.requiredTechnologies, /Firewall/);
});

test('FR-23: an admin can manually edit extracted fields and approve a TOR (Save & Publish)', async () => {
  const adminCookie = await signUp('review-admin', { role: 'admin' });
  const projId = `TEST-${runId}-002`;

  await Tor.create({
    projectId: projId,
    title: 'โครงการทดสอบการแก้ไขข้อมูลโดย Admin',
    agency: 'สำนักการแพทย์',
    source: 'process3',
    status: 'Open',
    referencePriceTHB: 1000000,
  });

  await TorInsight.create({
    projectId: projId,
    identification: {
      titleTh: 'โครงการทดสอบการแก้ไขข้อมูลโดย Admin',
      agency: 'สำนักการแพทย์',
      category: 'software-development',
      status: 'Open',
    },
    facts: {
      referencePriceTHB: 1000000,
      budgetTHB: 1200000,
      penaltyClause: '0.1% ต่อวัน',
    },
    metadata: {
      origin: 'pipeline',
      reviewStatus: 'pending',
      confidenceScore: 65,
    },
  });

  // Admin edits title, agency, reference price, budget, penalty clause, and approves
  const res = await fetch(`${baseUrl}/api/admin/review/${projId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({
      action: 'approve',
      fields: {
        title: 'โครงการพัฒนาระบบเทคโนโลยีสารสนเทศทางการแพทย์ (แก้ไขแล้ว)',
        agency: 'สำนักการแพทย์ กรุงเทพมหานคร',
        referencePriceTHB: 1500000,
        budgetTHB: 1800000,
        penaltyClause: 'ร้อยละ 0.20 ต่อวัน',
        requiredTechnologies: 'Node.js, PostgreSQL',
      },
    }),
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(data.reviewStatus, 'approved');

  // Verify updates in database
  const updatedInsight = await TorInsight.findOne({ projectId: projId });
  assert.equal(updatedInsight.identification.titleTh, 'โครงการพัฒนาระบบเทคโนโลยีสารสนเทศทางการแพทย์ (แก้ไขแล้ว)');
  assert.equal(updatedInsight.identification.agency, 'สำนักการแพทย์ กรุงเทพมหานคร');
  // The extracted category stays: the comparison groups by it
  assert.equal(updatedInsight.identification.category, 'software-development');
  assert.equal(updatedInsight.facts.referencePriceTHB, 1500000);
  assert.equal(updatedInsight.facts.budgetTHB, 1800000);
  assert.equal(updatedInsight.facts.penaltyClause, 'ร้อยละ 0.20 ต่อวัน');
  assert.equal(updatedInsight.metadata.reviewStatus, 'approved');
  assert.ok(updatedInsight.metadata.reviewedAt);
  assert.ok(updatedInsight.metadata.confidenceScore >= 80, 'Approved score should be >= 80');

  const updatedTor = await Tor.findOne({ projectId: projId });
  assert.equal(updatedTor.title, 'โครงการพัฒนาระบบเทคโนโลยีสารสนเทศทางการแพทย์ (แก้ไขแล้ว)');
  assert.equal(updatedTor.agency, 'สำนักการแพทย์ กรุงเทพมหานคร');
  assert.equal(updatedTor.referencePriceTHB, 1500000);
  assert.equal(updatedTor.budgetTHB, 1800000);

  // The summary as it was before the edit is kept, with who changed it (ADR 0031)
  const admin = await User.findOne({ email: emailFor('review-admin') }).lean();
  const kept = await TorInsightVersion.findOne({ projectId: projId }).lean();
  assert.equal(kept.version, 1);
  assert.equal(kept.reason, 'corrected');
  assert.equal(String(kept.supersededBy), String(admin._id));
  assert.equal(kept.insight.facts.referencePriceTHB, 1000000);
  assert.equal(kept.tor.agency, 'สำนักการแพทย์', "the Tor's facts as they were too");
  assert.equal(updatedInsight.metadata.version, 2);
});

test('FR-23: approving with no field changed keeps no version', async () => {
  const adminCookie = await signUp('approve-only-admin', { role: 'admin' });
  const projId = `TEST-${runId}-005`;
  await TorInsight.create({
    projectId: projId,
    identification: { titleTh: 'ระบบลงทะเบียนออนไลน์', agency: 'สำนักทะเบียน', category: 'software-development', status: 'Open' },
    facts: { referencePriceTHB: 2_000_000 },
    metadata: { origin: 'pipeline', reviewStatus: 'pending', confidenceScore: 82 },
  });

  const res = await fetch(`${baseUrl}/api/admin/review/${projId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie: adminCookie },
    // The form sends the fields as they are
    body: JSON.stringify({ action: 'approve', fields: { title: 'ระบบลงทะเบียนออนไลน์', referencePriceTHB: 2_000_000 } }),
  });

  assert.equal(res.status, 200);
  assert.equal(await TorInsightVersion.countDocuments({ projectId: projId }), 0);
  assert.equal((await TorInsight.findOne({ projectId: projId }).lean()).metadata.version, 1);
});

test('FR-23: a reclassify keeps the summary; confirming brings its category back', async () => {
  const adminCookie = await signUp('category-admin', { role: 'admin' });
  const projId = `TEST-${runId}-006`;
  await TorInsight.create({
    projectId: projId,
    identification: { titleTh: 'ระบบคลังข้อมูลสุขภาพ', agency: 'กรมการแพทย์', category: 'data-and-ai', status: 'Open' },
    metadata: { origin: 'pipeline', reviewStatus: 'pending', confidenceScore: 78 },
  });
  const review = (body) =>
    fetch(`${baseUrl}/api/admin/review/${projId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      body: JSON.stringify(body),
    });

  assert.equal((await review({ action: 'reclassify', reclassifyReason: 'Hardware only' })).status, 200);
  const kept = await TorInsightVersion.findOne({ projectId: projId }).lean();
  assert.equal(kept.reason, 'corrected');
  assert.equal(kept.insight.identification.category, 'data-and-ai');

  assert.equal((await review({ action: 'confirm_classification' })).status, 200);
  const confirmed = await TorInsight.findOne({ projectId: projId }).lean();
  assert.equal(confirmed.identification.category, 'data-and-ai', 'not "IT / software"');
  assert.equal(confirmed.metadata.excluded, null);
});

test('NFR-07: an admin can list a TOR\'s versions and bring one back; nobody else can', async () => {
  const adminCookie = await signUp('rollback-admin', { role: 'admin' });
  const userCookie = await signUp('rollback-user');
  const projId = `TEST-${runId}-007`;
  await Tor.create({ projectId: projId, title: 'ระบบแจ้งเตือนน้ำท่วม', agency: 'สำนักการระบายน้ำ', source: 'process3', status: 'Open', referencePriceTHB: 3_000_000 });
  await TorInsight.create({
    projectId: projId,
    identification: { titleTh: 'ระบบแจ้งเตือนน้ำท่วม', agency: 'สำนักการระบายน้ำ', category: 'software-development', status: 'Open' },
    facts: { referencePriceTHB: 3_000_000 },
    metadata: { origin: 'pipeline', reviewStatus: 'pending', confidenceScore: 81 },
  });
  const send = (method, path, cookie, body) =>
    fetch(`${baseUrl}/api/admin/review/${projId}${path}`, {
      method,
      headers: { 'content-type': 'application/json', cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  // A wrong correction: the price typed with an extra zero
  await send('PATCH', '', adminCookie, { action: 'approve', fields: { referencePriceTHB: 30_000_000 } });
  assert.equal((await Tor.findOne({ projectId: projId }).lean()).referencePriceTHB, 30_000_000);

  assert.equal((await send('GET', '/versions', userCookie)).status, 403);
  assert.equal((await send('POST', '/rollback', userCookie, { version: 1 })).status, 403);

  const listed = await (await send('GET', '/versions', adminCookie)).json();
  assert.equal(listed.current, 2);
  assert.deepEqual(listed.versions.map((v) => [v.version, v.reason]), [[1, 'corrected']]);

  const rolled = await send('POST', '/rollback', adminCookie, { version: 1 });
  assert.equal(rolled.status, 200);
  assert.equal((await rolled.json()).version, 3);

  const insight = await TorInsight.findOne({ projectId: projId }).lean();
  assert.equal(insight.facts.referencePriceTHB, 3_000_000, 'the summary as it was');
  assert.equal(insight.metadata.version, 3);
  assert.equal((await Tor.findOne({ projectId: projId }).lean()).referencePriceTHB, 3_000_000, 'and the Tor too');
  const after = await (await send('GET', '/versions', adminCookie)).json();
  assert.deepEqual(after.versions.map((v) => [v.version, v.reason]), [[2, 'rollback'], [1, 'corrected']], 'the rollback can be undone too');

  assert.equal((await send('POST', '/rollback', adminCookie, { version: 9 })).status, 404);
  assert.equal((await send('POST', '/rollback', adminCookie, { version: 'latest' })).status, 400);
});

test('FR-23: invalid numeric inputs for referencePriceTHB or budgetTHB return 400 and do not erase data', async () => {
  const adminCookie = await signUp('numeric-val-admin', { role: 'admin' });
  const projId = `TEST-${runId}-NUMVAL`;

  await Tor.create({
    projectId: projId,
    title: 'โครงการทดสอบการตรวจสอบตัวเลข',
    agency: 'สำนักการคลัง',
    source: 'process3',
    status: 'Open',
    referencePriceTHB: 2500000,
    budgetTHB: 3000000,
  });

  await TorInsight.create({
    projectId: projId,
    identification: {
      titleTh: 'โครงการทดสอบการตรวจสอบตัวเลข',
      agency: 'สำนักการคลัง',
      status: 'Open',
    },
    facts: {
      referencePriceTHB: 2500000,
      budgetTHB: 3000000,
    },
  });

  // Sending string into referencePriceTHB should fail with 400
  const badRes = await fetch(`${baseUrl}/api/admin/review/${projId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({
      action: 'approve',
      fields: { referencePriceTHB: 'invalid-string' },
    }),
  });

  assert.equal(badRes.status, 400);
  const badData = await badRes.json();
  assert.match(badData.error.message, /referencePriceTHB/);

  // Verify that the existing data was NOT erased or set to null
  const unchangedTor = await Tor.findOne({ projectId: projId });
  assert.equal(unchangedTor.referencePriceTHB, 2500000);
  const unchangedInsight = await TorInsight.findOne({ projectId: projId });
  assert.equal(unchangedInsight.facts.referencePriceTHB, 2500000);
});

test('FR-23: an admin can reclassify a misclassified TOR as out-of-scope non-IT', async () => {
  const adminCookie = await signUp('reclassify-admin', { role: 'admin' });
  const projId = `TEST-${runId}-003`;

  await TorInsight.create({
    projectId: projId,
    identification: {
      titleTh: 'งานจัดสวนสาธารณะเฉลิมพระเกียรติ',
      agency: 'สำนักสิ่งแวดล้อม',
      status: 'Open',
    },
    metadata: {
      origin: 'pipeline',
      reviewStatus: 'pending',
      confidenceScore: 75,
    },
  });

  const res = await fetch(`${baseUrl}/api/admin/review/${projId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({
      action: 'reclassify',
      reclassifyReason: 'Civil landscaping — not IT',
    }),
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(data.reviewStatus, 'rejected');

  const reclassified = await TorInsight.findOne({ projectId: projId });
  assert.equal(reclassified.identification.category, 'non-IT');
  assert.equal(reclassified.metadata.reviewStatus, 'rejected');
  assert.equal(reclassified.metadata.excluded.reason, 'Civil landscaping — not IT');
});

test('FR-23: an admin can confirm classification or trigger re-extraction', async () => {
  const adminCookie = await signUp('reextract-admin', { role: 'admin' });
  const projId = `TEST-${runId}-004`;

  await TorInsight.create({
    projectId: projId,
    identification: {
      titleTh: 'ระบบประมวลผลข้อมูลกทม.',
      agency: 'สำนักยุทธศาสตร์',
      category: 'non-IT',
      status: 'Open',
    },
    metadata: {
      origin: 'pipeline',
      reviewStatus: 'pending',
      excluded: { reason: 'Previous misclassification' },
      confidenceScore: 70,
    },
  });

  // Trigger re-extract
  const reRes = await fetch(`${baseUrl}/api/admin/review/${projId}/re-extract`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: adminCookie },
  });
  assert.equal(reRes.status, 200);
  const reData = await reRes.json();
  assert.equal(reData.ok, true);
  assert.equal(reData.status, 're-queued');

  const reQueued = await TorInsight.findOne({ projectId: projId });
  assert.equal(reQueued.metadata.reviewStatus, 'pending');

  // Confirm classification: clears excluded; with no version holding an earlier
  // category, the category is left unstated rather than made up
  const confRes = await fetch(`${baseUrl}/api/admin/review/${projId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ action: 'confirm_classification' }),
  });
  assert.equal(confRes.status, 200);
  const confData = await confRes.json();
  assert.equal(confData.ok, true);
  assert.equal(confData.reviewStatus, 'approved');

  const confirmed = await TorInsight.findOne({ projectId: projId });
  assert.equal(confirmed.identification.category, null);
  assert.equal(confirmed.metadata.reviewStatus, 'approved');
  assert.equal(confirmed.metadata.excluded, null);
});

test('FR-22: POST /api/admin/health-check tests external sources connectivity and latency', async () => {
  const adminCookie = await signUp('health-checker-admin', { role: 'admin' });
  const response = await fetch(`${baseUrl}/api/admin/health-check`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ source: 'all' }),
  });

  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.ok, true);
  assert.ok(data.results.process3);
  assert.ok(data.results.datago);
  assert.ok(['ok', 'degraded', 'failed'].includes(data.results.process3.status));
  assert.ok(['ok', 'degraded', 'failed'].includes(data.results.datago.status));
});

