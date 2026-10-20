import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';

import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { Tor, TorInsight } from '#models/index.js';
import { recheckCandidates, runRecheckStep } from '#pipeline/ingestion/ingest.js';

const TEST_DB = 'mjolnir_test_recheck';

const NOW = new Date('2026-10-20T22:00:00+07:00');
const days = (n) => new Date(NOW.getTime() + n * 86_400_000);

const announced = (code) => [{ code, type: code === 'B0' ? 'draft_tor' : 'invitation', publishedAt: days(-10) }];
const packages = (...zips) => zips.map(([kind, zipId]) => ({ kind, zipId, name: `${zipId}.zip`, files: [] }));

// Draft and open TORs, IT and read in full unless said otherwise
const TORS = {
  o1: { projectId: '69100000001', status: 'Open', deadline: days(2), packages: packages(['announcement', 'zo1'], ['price', 'po1']) },
  o2: { projectId: '69100000002', status: 'Open', deadline: days(9), packages: packages(['announcement', 'zo2']) },
  o3: { projectId: '69100000003', status: 'Open', deadline: days(20), packages: packages(['announcement', 'zo3']) },
  d1: { projectId: '69100000004', status: 'Draft', deadline: null, packages: packages(['announcement', 'zd1']) },
  // Not watched: bids closed, not IT, nothing downloaded yet, awarded, a winner already
  late: { projectId: '69100000005', status: 'Open', deadline: days(-1), packages: packages(['announcement', 'zl']) },
  notIt: { projectId: '69100000006', status: 'Open', deadline: days(5), packages: packages(['announcement', 'zn']), excluded: true },
  bare: { projectId: '69100000007', status: 'Open', deadline: days(5), packages: [] },
  won: { projectId: '69100000008', status: 'Awarded', deadline: days(5), packages: packages(['announcement', 'zw']) },
  signed: { projectId: '69100000009', status: 'Open', deadline: days(5), packages: packages(['announcement', 'zs']), winner: 'บริษัท ผู้ชนะ จำกัด' },
};
const NAME = new Map(Object.entries(TORS).map(([name, { projectId }]) => [projectId, name]));

before(async () => {
  await connectDatabase({ dbName: TEST_DB });
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
  await Tor.collection.insertMany(
    Object.values(TORS).map((tor) => ({
      projectId: tor.projectId,
      source: 'process3',
      title: 'จ้างพัฒนาระบบสารสนเทศ',
      status: tor.status,
      submissionDeadline: tor.deadline,
      announcementHistory: announced(tor.status === 'Draft' ? 'B0' : 'D0'),
      packages: tor.packages,
      contract: tor.winner ? { winnerName: tor.winner } : undefined,
      pipelineStatus: 'ocr_done',
    })),
  );
  await TorInsight.collection.insertMany(
    Object.values(TORS).map((tor) => ({
      projectId: tor.projectId,
      identification: { titleTh: 'จ้างพัฒนาระบบสารสนเทศ', category: 'software-development' },
      metadata: { excluded: tor.excluded ? { reason: 'ซื้อครุภัณฑ์' } : null },
    })),
  );
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDatabase();
});

/** A stand-in for e-GP's lookups: answers by project and kind, and keeps the calls. */
function fakeLookup(answers = {}) {
  const calls = [];
  const lookup = async ({ kind, projectId }) => {
    calls.push([NAME.get(projectId), kind]);
    return answers[`${NAME.get(projectId)} ${kind}`] ?? { none: true };
  };
  return { lookup, calls };
}

const snapshotTors = async () => JSON.stringify(await Tor.find().sort({ projectId: 1 }).lean());

test('recheck: draft and open IT TORs, soonest deadline first, drafts after', async () => {
  const tors = await recheckCandidates(NOW);

  assert.deepEqual(tors.map((tor) => NAME.get(tor.projectId)), ['o1', 'o2', 'o3', 'd1']);
});

test('recheck: says what differs from the packages we have, and changes nothing', async () => {
  const { lookup, calls } = fakeLookup({
    'o1 announcement': { zipId: 'zo1', name: 'zo1.zip' },
    'o1 price': { zipId: 'po1-new', name: 'pricebuild_0307_69100000001.zip' },
    'o2 announcement': { zipId: 'zo2-new', name: '69100000002_20102569.zip' },
    'o3 adjustment': { zipId: 'adj3', name: 'adj3.zip', data: { zipId: 'adj3', buildName1: 'adj3.zip' } },
    'd1 announcement': { zipId: 'zd1', name: 'zd1.zip' },
  });
  const before = await snapshotTors();

  const totals = await runRecheckStep({ dryRun: true, now: NOW, lookup });

  assert.deepEqual(
    calls.filter(([, kind]) => kind === 'announcement').map(([name]) => name),
    ['o1', 'o2', 'o3', 'd1'],
  );
  assert.equal(calls.length, 12, 'the announcement, price and amendment services, for each');
  assert.deepEqual(
    { ...totals },
    { checked: 4, drafts: 1, open: 3, newAnnouncement: 1, newPrice: 1, amendmentAnswers: 1, failed: 0, stoppedBy: null },
  );
  assert.equal(await snapshotTors(), before, 'watch mode writes nothing');
});

test('recheck: asks nothing unless it is only watching', async () => {
  const { lookup, calls } = fakeLookup();

  assert.equal(await runRecheckStep({ now: NOW, lookup }), null);
  assert.deepEqual(calls, []);
});

test('recheck: stops when e-GP stops answering, and at the time box', async () => {
  const silent = async () => ({ failed: { success: false, error: 'e-GP did not answer', transient: true } });
  const stopped = await runRecheckStep({ dryRun: true, now: NOW, lookup: silent });

  assert.equal(stopped.checked, 3, 'three TORs in a row without an answer, of four');
  assert.equal(stopped.stoppedBy, 'no-answer');

  const { lookup, calls } = fakeLookup();
  const late = await runRecheckStep({ dryRun: true, now: NOW, until: new Date(Date.now() - 60_000), lookup });

  assert.equal(late.stoppedBy, 'time');
  assert.deepEqual(calls, []);
});
