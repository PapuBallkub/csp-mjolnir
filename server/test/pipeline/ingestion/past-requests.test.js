import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';

import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { PipelineFailure, TitleScreen, Tor, TorInsight } from '#models/index.js';
import { runHistoryStep } from '#pipeline/ingestion/ingest.js';
import { requestPastProjects, selectPastProjects } from '#pipeline/ingestion/lib/past-requests.js';
import { MAX_ATTEMPTS } from '#pipeline/shared/failures.js';

// A database of its own: the selection reads every open TOR and past project
const TEST_DB = 'mjolnir_test_past_requests';

const NOW = new Date('2026-10-15T12:00:00+07:00');
const days = (n) => new Date(NOW.getTime() + n * 86_400_000);
// One title for all, so price alone sets the order
const TITLE = 'จ้างพัฒนาระบบสารสนเทศ';

// Open IT TORs, fully extracted. The third's bids have closed. The first and
// the fourth are alike, so each counts as related to the other.
const OPEN = {
  t1: { projectId: '69000000001', category: 'software-development', price: 1_000_000, deadline: days(2) },
  t2: { projectId: '69000000002', category: 'data-and-ai', price: 2_000_000, deadline: days(5) },
  t3: { projectId: '69000000003', category: 'network-and-security', price: 1_000_000, deadline: days(-1) },
  t4: { projectId: '69000000004', category: 'software-development', price: 1_000_000, deadline: days(9) },
};

// Past projects from data.go.th (ADR 0028): found IT by their title, with a
// title-level record, or unsure, with none
const PAST = {
  a1: { projectId: '68000000001', category: 'software-development', price: 1_000_000, posted: '2025-01-10' },
  a2: { projectId: '68000000002', category: 'software-development', price: 1_500_000, posted: '2025-02-10' },
  a3: { projectId: '68000000003', category: 'software-development', price: 2_500_000, posted: '2025-03-10' },
  a4: { projectId: '68000000004', category: 'software-development', price: 2_900_000, posted: '2025-09-10' },
  far: { projectId: '68000000005', category: 'software-development', price: 5_000_000, posted: '2025-08-10' }, // over 3×
  b1: { projectId: '68000000006', category: 'data-and-ai', price: 2_000_000, posted: '2025-04-10' },
  b2: { projectId: '68000000007', category: 'data-and-ai', price: 3_000_000, posted: '2025-05-10' },
  other: { projectId: '68000000008', category: 'network-and-security', price: 1_000_000, posted: '2025-07-10' },
  u1: { projectId: '68000000009', category: 'software-development', price: 1_000_000, posted: '2025-10-01', unsure: true },
};
const NAME = new Map(Object.entries(PAST).map(([name, { projectId }]) => [projectId, name]));
const names = (rows) => rows.map((row) => NAME.get(row.projectId));
const like = (key) => `like ${OPEN[key].projectId}`;

before(async () => {
  await connectDatabase({ dbName: TEST_DB });
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
  await Tor.insertMany([
    ...Object.values(OPEN).map(({ projectId, deadline }) => ({
      projectId,
      source: 'process3',
      title: TITLE,
      status: 'Open',
      submissionDeadline: deadline,
      pipelineStatus: 'ocr_done',
    })),
    ...Object.values(PAST).map(({ projectId, price }) => ({
      projectId,
      source: 'datago',
      title: TITLE,
      agency: 'กรมตัวอย่าง',
      status: 'Awarded',
      referencePriceTHB: price,
      contract: { winnerName: 'บริษัท ผู้ชนะ จำกัด' },
      pipelineStatus: 'fetched',
    })),
  ]);
  // Only the fields the selection reads
  await TorInsight.collection.insertMany([
    ...Object.values(OPEN).map(({ projectId, category, price }) => ({
      projectId,
      identification: { titleTh: TITLE, category },
      facts: { referencePriceTHB: price },
      metadata: { excluded: null },
    })),
    ...Object.values(PAST)
      .filter((past) => !past.unsure)
      .map(({ projectId, category, price, posted }) => ({
        projectId,
        identification: { titleTh: TITLE, category },
        facts: { referencePriceTHB: price, postedDate: new Date(posted) },
        metadata: { excluded: null, titleOnly: true },
      })),
  ]);
  await TitleScreen.collection.insertMany(
    Object.values(PAST).map(({ projectId, category, unsure }) => ({ projectId, title: TITLE, verdict: unsure ? 'unsure' : 'it', category })),
  );
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDatabase();
});

/** A past project read in full since: a full extraction of an awarded project. */
const readInFull = (key, price) =>
  TorInsight.collection.updateOne(
    { projectId: PAST[key].projectId },
    { $set: { 'metadata.titleOnly': false, 'facts.referencePriceTHB': price ?? PAST[key].price } },
  );

test('selection: soonest first, each TOR up to enough; then the soonest again, for more', async () => {
  const { pending, chosen } = await selectPastProjects({ perNight: 20, enough: 2, now: NOW });

  assert.equal(pending, 0);
  assert.deepEqual(
    chosen.map((pick) => [NAME.get(pick.projectId), pick.why]),
    [
      // Up to 2 each, soonest first; t1 and t4 already have each other
      ['a1', like('t1')],
      ['b1', like('t2')],
      ['b2', like('t2')],
      ['a2', like('t4')],
      // Every open TOR has 2: the soonest goes on to 4. t2 has none left, so t4
      // goes on, and gets the unsure one after every IT one
      ['a3', like('t1')],
      ['a4', like('t1')],
      ['u1', like('t4')],
      // No open TOR has a candidate left: the newest
      ['far', 'newest'],
      ['other', 'newest'],
    ],
  );
  assert.equal(chosen[0].for, OPEN.t1.projectId);
  assert.equal(chosen.at(-1).for, null);
  assert.equal(chosen[6].verdict, 'unsure');
});

test('selection: a short night all goes to the soonest TOR that still needs it', async () => {
  const { chosen } = await selectPastProjects({ perNight: 3, enough: 5, now: NOW });

  assert.deepEqual(names(chosen), ['a1', 'a2', 'a3']);
});

test("selection: unsure past projects come only after every IT one in the TOR's band", async () => {
  const { chosen } = await selectPastProjects({ perNight: 5, enough: 6, now: NOW });

  // u1 is as close in price as a1, but unsure; far is outside the band
  assert.deepEqual(names(chosen), ['a1', 'a2', 'a3', 'a4', 'u1']);
  assert.deepEqual(chosen.map((pick) => pick.verdict), ['it', 'it', 'it', 'it', 'unsure']);
});

test('selection: projects read in full, and those chosen and not read yet, count as related', async () => {
  // One read in full; one chosen for t1 last night, still waiting for its download
  await readInFull('a3', 1_200_000);
  await requestPastProjects([{ projectId: PAST.a1.projectId, for: OPEN.t1.projectId }], { now: days(-1) });

  const { pending, chosen } = await selectPastProjects({ perNight: 5, enough: 2, now: NOW });

  // t1 has three related (t4, a3, a1) and t4 two (t1, a3): t2, with none,
  // goes first. Then all have 2 or more: t1, the soonest, gets one, which
  // takes it to 4; then t4, still below 4, gets one.
  assert.equal(pending, 1);
  assert.deepEqual(
    chosen.map((pick) => [NAME.get(pick.projectId), pick.why]),
    [
      ['b1', like('t2')],
      ['b2', like('t2')],
      ['a2', like('t1')],
      ['a4', like('t4')],
    ],
  );
});

test("selection: a project found not IT, or that gave up, no longer counts: the TOR's turn comes again", async () => {
  await requestPastProjects(
    [
      { projectId: PAST.a1.projectId, for: OPEN.t1.projectId },
      { projectId: PAST.a2.projectId, for: OPEN.t1.projectId },
    ],
    { now: days(-1) },
  );
  // a1 was read and found not IT; a2 has no package in e-GP
  await Tor.updateOne({ projectId: PAST.a1.projectId }, { pipelineStatus: 'ocr_done' });
  await TorInsight.collection.updateOne(
    { projectId: PAST.a1.projectId },
    { $set: { 'metadata.titleOnly': false, 'metadata.excluded': { reason: 'ซื้อคอมพิวเตอร์' } } },
  );
  await PipelineFailure.create({
    projectId: PAST.a2.projectId,
    step: 'download',
    attempts: MAX_ATTEMPTS,
    firstFailedAt: NOW,
    lastFailedAt: NOW,
  });

  const { pending, chosen } = await selectPastProjects({ perNight: 2, enough: 3, now: NOW });

  // Only t4 counts for t1 now, so it needs two more
  assert.equal(pending, 0, 'one that gave up holds no place either');
  assert.deepEqual(names(chosen), ['a3', 'a4']);
  assert.ok(chosen.every((pick) => pick.for === OPEN.t1.projectId));
});

test('history step: a dry run only shows the choice; a real run asks for it, once, and says for which TOR', async () => {
  const select = (options) => selectPastProjects({ ...options, perNight: 2, enough: 2 });
  const asked = () => Tor.find({ historyRequestedAt: { $ne: null } }).sort({ projectId: 1 }).lean();

  assert.equal(await runHistoryStep({ dryRun: true, now: NOW, select }), 0);
  assert.deepEqual(await asked(), []);

  assert.equal(await runHistoryStep({ now: NOW, select }), 2);
  const requested = await asked();
  assert.deepEqual(names(requested), ['a1', 'b1']);
  assert.deepEqual(requested.map((tor) => tor.historyRequestedFor), [OPEN.t1.projectId, OPEN.t2.projectId]);
  assert.equal(requested[0].historyRequestedAt.toISOString(), NOW.toISOString());

  // Both still wait for their download, so they fill the next night
  assert.equal(await runHistoryStep({ now: days(1), select }), 0);
  assert.equal((await asked())[0].historyRequestedAt.toISOString(), NOW.toISOString(), 'asking again keeps the first date');
});
