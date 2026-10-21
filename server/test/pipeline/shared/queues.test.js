import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';

import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { Tor } from '#models/index.js';
import { QUEUES, inQueues, parseQueues, queueFilter, soonestFirst } from '#pipeline/shared/queues.js';

const TEST_DB = 'mjolnir_test_queues';

const announced = [{ code: 'D0', type: 'invitation', publishedAt: new Date('2026-10-15') }];
const open = (extra) => ({ source: 'process3', title: 'จ้างพัฒนาระบบ', status: 'Open', announcementHistory: announced, ...extra });

// One TOR of each state the queues tell apart
const TORS = {
  fresh: open({ projectId: '69200000001', pipelineStatus: 'fetched' }),
  read: open({ projectId: '69200000002', pipelineStatus: 'ocr_done', document: { version: 1 } }),
  // e-GP announced a new stage: download takes it as a change
  flagged: open({ projectId: '69200000003', pipelineStatus: 'ocr_done', packageCheckNeeded: true, document: { version: 1 } }),
  // Its document was replaced: OCR and extract take it as a change
  replaced: open({ projectId: '69200000004', pipelineStatus: 'downloaded', document: { version: 2 } }),
  past: {
    projectId: '68200000005',
    source: 'datago',
    title: 'จ้างพัฒนาระบบ ปี 2568',
    status: 'Awarded',
    contract: { winnerName: 'บริษัท ผู้ชนะ จำกัด' },
    pipelineStatus: 'fetched',
    historyRequestedAt: new Date('2026-10-20'),
  },
};
const NAME = new Map(Object.entries(TORS).map(([name, tor]) => [tor.projectId, name]));
const namesIn = async (filter) => (await Tor.find(filter, { projectId: 1 }).lean()).map((tor) => NAME.get(tor.projectId)).sort();

before(async () => {
  await connectDatabase({ dbName: TEST_DB });
  await mongoose.connection.dropDatabase();
  await Tor.collection.insertMany(Object.values(TORS));
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDatabase();
});

test('queues: download tells a change by the flag e-GP set; OCR and extract by the replaced document', async () => {
  assert.deepEqual(await namesIn(queueFilter(['changed'], 'download')), ['flagged']);
  assert.deepEqual(await namesIn(queueFilter(['changed'], 'read')), ['replaced']);
  assert.deepEqual(await namesIn(queueFilter(['past'], 'download')), ['past']);
  assert.deepEqual(await namesIn(queueFilter(['past'], 'read')), ['past']);
  assert.deepEqual(await namesIn(queueFilter(['new'], 'download')), ['fresh', 'read', 'replaced']);
  assert.deepEqual(await namesIn(queueFilter(['new'], 'read')), ['flagged', 'fresh', 'read']);
});

test('queues: at each step, every TOR is in exactly one queue', async () => {
  for (const step of ['download', 'read']) {
    const seen = [];
    for (const queue of QUEUES) seen.push(...(await namesIn(queueFilter([queue], step))));
    assert.deepEqual(seen.sort(), Object.keys(TORS).sort(), step);
  }
});

test('queues: several at once, and none named is every TOR', async () => {
  assert.deepEqual(await namesIn(queueFilter(['new', 'changed'], 'download')), ['flagged', 'fresh', 'read', 'replaced']);
  assert.equal(queueFilter(null, 'download'), null);
  const own = { pipelineStatus: 'ocr_done' };
  assert.equal(inQueues(own, null, 'read'), own, 'no --queue leaves a step as it was');
  assert.deepEqual(await namesIn(inQueues(own, ['changed'], 'read')), []);
  assert.deepEqual(await namesIn(inQueues(own, ['new'], 'read')), ['flagged', 'read']);
});

test('parseQueues: one or several, comma-separated; anything else is refused', () => {
  assert.equal(parseQueues(undefined), null);
  assert.deepEqual(parseQueues('new'), ['new']);
  assert.deepEqual(parseQueues('NEW, past,new'), ['new', 'past']);
  assert.throws(() => parseQueues('old'), /--queue takes new, changed, past/);
  assert.throws(() => parseQueues(''), /--queue takes/);
});

test('soonestFirst: the soonest bid deadline first, those without one last, ties as they came', () => {
  const tors = [
    { id: 'none', submissionDeadline: null },
    { id: 'later', submissionDeadline: new Date('2026-11-01') },
    { id: 'soon-a', submissionDeadline: new Date('2026-10-25') },
    { id: 'soon-b', submissionDeadline: new Date('2026-10-25') },
  ];

  assert.deepEqual(soonestFirst(tors).map((tor) => tor.id), ['soon-a', 'soon-b', 'later', 'none']);
  assert.equal(tors[0].id, 'none', 'the list given is left as it was');
});
