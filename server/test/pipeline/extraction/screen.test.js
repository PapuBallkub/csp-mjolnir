import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';

import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { TitleScreen, Tor, TorInsight } from '#models/index.js';
import { SCREEN_VERSION, buildScreenContents } from '#pipeline/extraction/prompts.js';
import {
  BATCH_SIZE,
  findUnscreened,
  isAudited,
  runScreen,
  saveScreens,
  saveTitleLevel,
  screenBatch,
  titleLevelFingerprint,
} from '#pipeline/extraction/screen.js';

// A database of its own: the screen takes every new project
const TEST_DB = 'mjolnir_test_screen';
const CONFIG = { model: 'gemini-test' };
const quiet = { log() {}, error() {} };

/** Plays back one answer per call, and records the requests. */
function fakeClient(...answers) {
  const calls = [];
  return {
    calls,
    models: {
      async generateContent(request) {
        calls.push(request);
        const answer = answers[calls.length - 1];
        if (answer instanceof Error) throw answer;
        return {
          text: JSON.stringify(answer),
          candidates: [{ finishReason: 'STOP' }],
          usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 10 },
        };
      },
    },
  };
}

const tor = (projectId, title, extra = {}) => ({
  projectId,
  source: 'process3',
  title,
  procurementMethod: 'ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)',
  pipelineStatus: 'fetched',
  announcementHistory: [{ code: 'D0', type: 'invitation', publishedAt: new Date('2026-10-13') }],
  ...extra,
});

before(async () => {
  await connectDatabase({ dbName: TEST_DB });
});

beforeEach(async () => {
  await Tor.deleteMany({});
  await TitleScreen.deleteMany({});
  await TorInsight.deleteMany({});
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDatabase();
});

test('isAudited: fixed by the project ID, and about the given share', () => {
  const ids = Array.from({ length: 2000 }, (_, i) => String(69000000000 + i));
  assert.equal(isAudited(ids[0], 0.1), isAudited(ids[0], 0.1), 'the same ID always gets the same answer');
  assert.ok(ids.every((id) => !isAudited(id, 0)));
  assert.ok(ids.every((id) => isAudited(id, 1)));
  const share = ids.filter((id) => isAudited(id, 0.1)).length / ids.length;
  assert.ok(share > 0.07 && share < 0.13, `about a tenth, got ${share}`);
});

test('buildScreenContents: one project a line, its ID, method and title', () => {
  const contents = buildScreenContents([tor('69100000001', 'จ้างพัฒนา\nระบบ  สารบรรณ')]);
  assert.match(contents, /^69100000001 \| ประกวดราคาอิเล็กทรอนิกส์ \(e-bidding\) \| จ้างพัฒนา ระบบ สารบรรณ$/m);
  assert.match(SCREEN_VERSION, /^screen-v\d+$/);
});

test('screenBatch: keeps each verdict once, and leaves out what Gemini skipped, invented or answered twice', async () => {
  const batch = [
    tor('69100000001', 'จ้างพัฒนาระบบสารบรรณอิเล็กทรอนิกส์'),
    tor('69100000002', 'ซื้อรถบรรทุก (ดีเซล) ขนาด 1 ตัน'),
    tor('69100000003', 'ซื้อครุภัณฑ์คอมพิวเตอร์'),
    tor('69100000004', 'จ้างเหมาทำความสะอาด'),
  ];
  const client = fakeClient({
    results: [
      { projectId: '69100000001', reason: 'พัฒนาระบบ', verdict: 'it' },
      { projectId: '69100000002', reason: 'ซื้อรถ', verdict: 'not_it' },
      { projectId: '69100000004', reason: 'ทำความสะอาด', verdict: 'not_it' },
      { projectId: '69100000004', reason: 'ทำความสะอาด', verdict: 'unsure' },
      { projectId: '69999999999', reason: 'ไม่มีในชุด', verdict: 'it' },
    ],
  });

  const { screens, missing } = await screenBatch(batch, { client, config: CONFIG, auditRate: 0 });

  assert.deepEqual(screens.map((s) => [s.projectId, s.verdict]), [['69100000001', 'it'], ['69100000002', 'not_it']]);
  assert.deepEqual(missing.sort(), ['69100000003', '69100000004']);
  assert.equal(screens[0].promptVersion, SCREEN_VERSION);
  assert.equal(screens[0].title, 'จ้างพัฒนาระบบสารบรรณอิเล็กทรอนิกส์');
  assert.match(client.calls[0].contents, /69100000003 \|/);
});

test('screenBatch: only not_it is ever audited', async () => {
  const client = fakeClient({
    results: [
      { projectId: '69100000001', reason: 'ก', verdict: 'it' },
      { projectId: '69100000002', reason: 'ข', verdict: 'not_it' },
      { projectId: '69100000003', reason: 'ค', verdict: 'unsure' },
    ],
  });
  const batch = ['69100000001', '69100000002', '69100000003'].map((id) => tor(id, 'x'));

  const { screens } = await screenBatch(batch, { client, config: CONFIG, auditRate: 1 });

  assert.deepEqual(screens.map((s) => s.audit), [false, true, false]);
});

test('findUnscreened: new workable projects not screened on this title and prompt', async () => {
  await Tor.create([
    tor('69100000001', 'ใหม่'),
    tor('69100000002', 'ตรวจแล้ว'),
    tor('69100000003', 'ชื่อเปลี่ยน'),
    tor('69100000004', 'ด้วยพรอมต์เก่า'),
    tor('69100000005', 'ดาวน์โหลดแล้ว', { pipelineStatus: 'downloaded' }),
    tor('69100000006', 'ยกเลิกแล้ว', { status: 'Cancelled' }),
  ]);
  const screen = (projectId, title, promptVersion = SCREEN_VERSION) => ({
    projectId, title, verdict: 'not_it', audit: false, reason: '', modelName: 'm', promptVersion, screenedAt: new Date(),
  });
  await saveScreens([
    screen('69100000002', 'ตรวจแล้ว'),
    screen('69100000003', 'ชื่อเดิม'),
    screen('69100000004', 'ด้วยพรอมต์เก่า', 'screen-v0'),
  ]);

  const waiting = (await findUnscreened()).map((t) => t.projectId).sort();

  assert.deepEqual(waiting, ['69100000001', '69100000003', '69100000004']);
});

test('runScreen: screens in batches and saves, replacing an older verdict', async () => {
  const ids = Array.from({ length: BATCH_SIZE + 2 }, (_, i) => String(69100000100 + i));
  await Tor.create(ids.map((id) => tor(id, `จ้างพัฒนาระบบ ${id}`)));
  await saveScreens([{ projectId: ids[0], title: 'old', verdict: 'not_it', audit: false, reason: '', modelName: 'm', promptVersion: 'screen-v0', screenedAt: new Date() }]);
  // Answers "it" for every project in the request it's sent
  const calls = [];
  const client = {
    calls,
    models: {
      async generateContent(request) {
        calls.push(request);
        const sent = [...request.contents.matchAll(/^(\d{11}) \|/gm)].map((match) => match[1]);
        return {
          text: JSON.stringify({ results: sent.map((projectId) => ({ projectId, reason: 'พัฒนาระบบ', verdict: 'it' })) }),
          candidates: [{ finishReason: 'STOP' }],
          usageMetadata: {},
        };
      },
    },
  };

  const counts = await runScreen({ client, config: CONFIG, log: quiet });

  assert.equal(client.calls.length, 2);
  assert.equal(counts.it, ids.length);
  assert.equal(await TitleScreen.countDocuments({ verdict: 'it', promptVersion: SCREEN_VERSION }), ids.length);
  assert.equal(await TitleScreen.countDocuments(), ids.length, 'the older verdict was replaced, not added to');
});

test('runScreen: a dry run saves nothing', async () => {
  await Tor.create(tor('69100000001', 'จ้างพัฒนาระบบ'));
  const client = fakeClient({ results: [{ projectId: '69100000001', reason: 'ก', verdict: 'it' }] });

  await runScreen({ client, config: CONFIG, dryRun: true, log: quiet });

  assert.equal(await TitleScreen.countDocuments(), 0);
});

test('runScreen: stops after two failed batches in a row, and after the time box', async () => {
  const ids = Array.from({ length: BATCH_SIZE * 3 }, (_, i) => String(69100000200 + i));
  await Tor.create(ids.map((id) => tor(id, 'x')));
  const down = Object.assign(new Error('bad request'), { status: 400 });
  const client = fakeClient(down, down, { results: [] });

  const counts = await runScreen({ client, config: CONFIG, log: quiet });
  assert.equal(client.calls.length, 2, 'the third batch was not sent');
  assert.equal(counts.failedBatches, 2);
  assert.equal(counts.left, BATCH_SIZE);

  const later = fakeClient();
  const boxed = await runScreen({ client: later, config: CONFIG, until: new Date(Date.now() - 1000), log: quiet });
  assert.equal(later.calls.length, 0);
  assert.equal(boxed.left, ids.length);
});

// A past project as history:import leaves it (ADR 0028)
const past = (projectId, title, extra = {}) => ({
  projectId,
  source: 'datago',
  title,
  agency: 'กรุงเทพมหานคร',
  subAgency: 'สำนักยุทธศาสตร์',
  procurementMethod: 'ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)',
  budgetTHB: 96469000,
  referencePriceTHB: 96469000,
  announceDate: '2025-04-28',
  status: 'Awarded',
  pipelineStatus: 'fetched',
  contract: { winnerTaxId: '0993000524276', contractNo: '12-12-2568', agreedPriceTHB: 95842000, fiscalYear: 2568 },
  ...extra,
});

test('screenBatch: a category for it and unsure, none for not_it or an unknown kind; no audit for past projects', async () => {
  const client = fakeClient({
    results: [
      { projectId: '69100000001', reason: 'พัฒนาระบบ', verdict: 'it', category: 'software-development' },
      { projectId: '69100000002', reason: 'ซื้อรถ', verdict: 'not_it', category: 'software-development' },
      { projectId: '69100000003', reason: 'คอมพิวเตอร์', verdict: 'unsure', category: 'made-up-kind' },
    ],
  });
  const batch = ['69100000001', '69100000002', '69100000003'].map((id) => tor(id, 'x'));

  const { screens } = await screenBatch(batch, { client, config: CONFIG, auditRate: 1, past: true });

  assert.deepEqual(screens.map((s) => s.category), ['software-development', null, null]);
  assert.ok(screens.every((s) => s.audit === false), 'past projects are never audited');
});

test('findUnscreened: --past takes the imported past projects, and only those', async () => {
  await Tor.create([tor('69100000001', 'ใหม่จากประกาศ'), past('67099725090', 'โครงการในอดีต')]);

  assert.deepEqual((await findUnscreened()).map((t) => t.projectId), ['69100000001']);
  assert.deepEqual((await findUnscreened({ past: true })).map((t) => t.projectId), ['67099725090']);
});

test('runScreen --past: IT and unsure past projects get a title-level record, not_it ones none', async () => {
  await Tor.create([
    past('67099725090', 'ขยายทรัพยากรพื้นฐานดิจิทัลสำหรับศูนย์ข้อมูล'),
    past('67099725091', 'ซื้อครุภัณฑ์คอมพิวเตอร์'),
    past('67099725092', 'ก่อสร้างถนนคอนกรีต'),
  ]);
  const client = fakeClient({
    results: [
      { projectId: '67099725090', reason: 'ศูนย์ข้อมูล', verdict: 'it', category: 'systems-integration' },
      { projectId: '67099725091', reason: 'คอมพิวเตอร์', verdict: 'unsure', category: null },
      { projectId: '67099725092', reason: 'ก่อสร้าง', verdict: 'not_it', category: null },
    ],
  });

  const counts = await runScreen({ client, config: CONFIG, past: true, log: quiet });

  assert.equal(counts.titleLevel, 2);
  const record = await TorInsight.findOne({ projectId: '67099725090' }).lean();
  assert.equal(record.metadata.titleOnly, true);
  assert.equal(record.metadata.confidenceScore, null);
  assert.equal(record.identification.status, 'Awarded');
  assert.equal(record.identification.category, 'systems-integration');
  assert.equal(record.identification.department, 'สำนักยุทธศาสตร์');
  assert.equal(record.facts.referencePriceTHB, 96469000);
  assert.equal(record.facts.agreedPriceTHB, 95842000);
  assert.equal(record.facts.postedDate.toISOString().slice(0, 10), '2025-04-28');
  assert.equal(record.metadata.sourceFingerprint, titleLevelFingerprint(await Tor.findOne({ projectId: '67099725090' }).lean()));
  assert.equal(await TorInsight.countDocuments({ projectId: '67099725092' }), 0);
});

test('saveTitleLevel: never over a full extraction or a not-IT verdict; over an older title-level one, yes', async () => {
  await Tor.create([past('67099725090', 'ระบบ ก'), past('67099725091', 'ระบบ ข'), past('67099725092', 'ระบบ ค')]);
  await TorInsight.create([
    { projectId: '67099725090', identification: { titleTh: 'สกัดเต็มแล้ว', agency: 'ก', status: 'Awarded' }, metadata: { confidenceScore: 95 } },
    { projectId: '67099725091', identification: { titleTh: 'ไม่ใช่ไอที', agency: 'ข', status: 'Awarded' }, metadata: { excluded: { reason: 'ไม่ใช่' } } },
    { projectId: '67099725092', identification: { titleTh: 'ชื่อเก่า', agency: 'ค', status: 'Awarded' }, metadata: { titleOnly: true } },
  ]);
  const screen = (projectId) => ({ projectId, verdict: 'it', category: 'other-it', modelName: 'gemini-test', promptVersion: SCREEN_VERSION });

  const saved = await saveTitleLevel(['67099725090', '67099725091', '67099725092'].map(screen));

  assert.equal(saved, 1);
  assert.equal((await TorInsight.findOne({ projectId: '67099725090' }).lean()).metadata.confidenceScore, 95);
  assert.ok((await TorInsight.findOne({ projectId: '67099725091' }).lean()).metadata.excluded);
  assert.equal((await TorInsight.findOne({ projectId: '67099725092' }).lean()).identification.titleTh, 'ระบบ ค');
});
