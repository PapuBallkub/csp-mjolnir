import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';

import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { PipelineFailure, Tor, TorInsight } from '#models/index.js';
import { runHistoryStep } from '#pipeline/ingestion/ingest.js';
import { requestPastProjects, selectPastProjects } from '#pipeline/ingestion/lib/past-requests.js';
import { MAX_ATTEMPTS } from '#pipeline/shared/failures.js';

// A database of its own: the selection reads every open TOR and past project
const TEST_DB = 'mjolnir_test_past_requests';

const NOW = new Date('2026-10-15T12:00:00+07:00');
const days = (n) => new Date(NOW.getTime() + n * 86_400_000);
// One title for all, so price alone sets the order
const TITLE = 'จ้างพัฒนาระบบสารสนเทศ';

// Open IT TORs: the sooner deadline first. The third's bids have closed, so
// it claims nothing, though `other` would be its closest.
const OPEN = [
  { projectId: '69000000001', category: 'software-development', price: 1_000_000, deadline: days(2) },
  { projectId: '69000000002', category: 'data-and-ai', price: 2_000_000, deadline: days(5) },
  { projectId: '69000000003', category: 'network-and-security', price: 1_000_000, deadline: days(-1) },
];

// Title-level past projects from data.go.th (ADR 0028)
const PAST = {
  a1: { projectId: '68000000001', category: 'software-development', price: 1_000_000, posted: '2025-01-10' },
  a2: { projectId: '68000000002', category: 'software-development', price: 1_500_000, posted: '2025-02-10' },
  a3: { projectId: '68000000003', category: 'software-development', price: 2_500_000, posted: '2025-03-10' },
  a4: { projectId: '68000000004', category: 'software-development', price: 2_900_000, posted: '2025-09-10' }, // 4th closest
  far: { projectId: '68000000005', category: 'software-development', price: 5_000_000, posted: '2025-08-10' }, // over 3×
  b1: { projectId: '68000000006', category: 'data-and-ai', price: 2_000_000, posted: '2025-04-10' },
  b2: { projectId: '68000000007', category: 'data-and-ai', price: 3_000_000, posted: '2025-05-10' },
  other: { projectId: '68000000008', category: 'network-and-security', price: 1_000_000, posted: '2025-07-10' },
};
const NAME = new Map(Object.entries(PAST).map(([name, { projectId }]) => [projectId, name]));
const names = (rows) => rows.map((row) => NAME.get(row.projectId));
const like = (index) => `like ${OPEN[index].projectId}`;

before(async () => {
  await connectDatabase({ dbName: TEST_DB });
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
  await Tor.insertMany([
    ...OPEN.map(({ projectId, deadline }) => ({
      projectId,
      source: 'process3',
      title: TITLE,
      status: 'Open',
      submissionDeadline: deadline,
      pipelineStatus: 'ocr_done',
    })),
    ...Object.values(PAST).map(({ projectId }) => ({
      projectId,
      source: 'datago',
      title: TITLE,
      status: 'Awarded',
      contract: { winnerName: 'บริษัท ผู้ชนะ จำกัด' },
      pipelineStatus: 'fetched',
    })),
  ]);
  // Only the fields the selection reads
  await TorInsight.collection.insertMany([
    ...OPEN.map(({ projectId, category, price }) => ({
      projectId,
      identification: { titleTh: TITLE, category },
      facts: { referencePriceTHB: price },
      metadata: { excluded: null },
    })),
    ...Object.values(PAST).map(({ projectId, category, price, posted }) => ({
      projectId,
      identification: { titleTh: TITLE, category },
      facts: { referencePriceTHB: price, postedDate: new Date(posted) },
      metadata: { excluded: null, titleOnly: true },
    })),
  ]);
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDatabase();
});

test("selection: every open TOR's closest past project first, soonest deadline first, then each one's next", async () => {
  const { pending, chosen } = await selectPastProjects({ perNight: 4, now: NOW });

  assert.equal(pending, 0);
  assert.deepEqual(
    chosen.map((pick) => [NAME.get(pick.projectId), pick.why]),
    [
      ['a1', like(0)],
      ['b1', like(1)],
      ['a2', like(0)],
      ['b2', like(1)],
    ],
  );
  assert.equal(chosen[0].title, TITLE);
});

test('selection: up to 3 each, in their category and price band; the rest of the night goes to the newest', async () => {
  const { chosen } = await selectPastProjects({ perNight: 20, now: NOW });

  // a4 is the 4th closest to the first TOR, far is over 3× its price, and
  // other's TOR has closed: they come in only as the newest
  assert.deepEqual(names(chosen), ['a1', 'b1', 'a2', 'b2', 'a3', 'a4', 'far', 'other']);
  assert.deepEqual(chosen.slice(5).map((pick) => pick.why), ['newest', 'newest', 'newest']);
});

test('selection: a project asked for before is not chosen again, and one still waiting takes a place', async () => {
  await requestPastProjects([{ projectId: PAST.a1.projectId }, { projectId: PAST.b1.projectId }], { now: days(-1) });
  // a1 was downloaded since; b1 still waits for its download
  await Tor.updateOne({ projectId: PAST.a1.projectId }, { pipelineStatus: 'downloaded' });

  const { pending, chosen } = await selectPastProjects({ perNight: 4, now: NOW });

  assert.equal(pending, 1);
  assert.deepEqual(names(chosen), ['a2', 'b2', 'a3']);
  assert.deepEqual((await selectPastProjects({ perNight: 1, now: NOW })).chosen, [], 'no room left tonight');
});

test('selection: a past project that gave up downloading no longer takes a place', async () => {
  await requestPastProjects([{ projectId: PAST.a1.projectId }], { now: days(-1) });
  await PipelineFailure.create({
    projectId: PAST.a1.projectId,
    step: 'download',
    attempts: MAX_ATTEMPTS,
    firstFailedAt: NOW,
    lastFailedAt: NOW,
  });

  const { pending, chosen } = await selectPastProjects({ perNight: 1, now: NOW });

  assert.equal(pending, 0);
  assert.deepEqual(names(chosen), ['a2'], 'and it is not chosen again');
});

test('history step: a dry run only shows the choice; a real run asks for it, once', async () => {
  const select = (options) => selectPastProjects({ ...options, perNight: 2 });
  const asked = () => Tor.find({ historyRequestedAt: { $ne: null } }).sort({ projectId: 1 }).lean();

  assert.equal(await runHistoryStep({ dryRun: true, now: NOW, select }), 0);
  assert.deepEqual(await asked(), []);

  assert.equal(await runHistoryStep({ now: NOW, select }), 2);
  const requested = await asked();
  assert.deepEqual(names(requested), ['a1', 'b1']);
  assert.equal(requested[0].historyRequestedAt.toISOString(), NOW.toISOString());

  // Both still wait for their download, so they fill the next night's budget
  assert.equal(await runHistoryStep({ now: days(1), select }), 0);
  assert.equal((await asked())[0].historyRequestedAt.toISOString(), NOW.toISOString(), 'asking again keeps the first date');
});
