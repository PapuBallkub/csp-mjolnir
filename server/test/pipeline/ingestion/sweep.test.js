import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';

import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { FeedPoll } from '#models/index.js';
import { SWEEP_INTERVAL_MS, loadAgencies, recordPoll, runSweepStep } from '#pipeline/ingestion/ingest.js';
import { ROUTINE_TYPES } from '#pipeline/ingestion/sources/process3.js';

const TEST_DB = 'mjolnir_test_sweep';
const AGENCIES = ['0304', '0307', '11012', 'A004', '0101'].map((code) => ({ code, name: `agency ${code}` }));

const answered = (extra = {}) => ({
  fetched: 0, discovered: 0, updated: 0, errors: [], unreachable: false, closed: false,
  requested: 7, answered: 7, itemsByType: { D0: 1 }, ...extra,
});
const noAnswer = () => answered({ unreachable: true, answered: 0, itemsByType: {}, errors: ['RSS B0 error: timeout'] });

/** A fake feed that answers each agency in turn with the next result given. */
function fakeFeed(...results) {
  const asked = [];
  const fetch = async ({ deptId, types, limit, pace }) => {
    asked.push({ deptId, types, limit, pace });
    return results[asked.length - 1] ?? answered();
  };
  return { fetch, asked };
}
const records = () => {
  const saved = [];
  return { saved, record: async (poll) => saved.push(poll) };
};

before(async () => {
  await connectDatabase({ dbName: TEST_DB });
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDatabase();
});

test('loadAgencies: the central-government list, with the codes the feed takes', () => {
  const agencies = loadAgencies();
  assert.ok(agencies.length > 200);
  const codes = new Set(agencies.map((a) => a.code));
  for (const code of ['0304', '0307', '11012', 'A004']) assert.ok(codes.has(code), code);
  assert.ok(agencies.every((a) => !/^\d{1,2}$/.test(a.code)), 'no ministry codes: the feed returns nothing for them');
});

test('runSweepStep: asks every agency for every routine code, no limit on new projects, and records each', async () => {
  const feed = fakeFeed(answered({ discovered: 2 }), answered({ updated: 1 }));
  const { saved, record } = records();

  const totals = await runSweepStep({ agencies: AGENCIES, fetch: feed.fetch, record, documentsDir: 'unused' });

  assert.deepEqual(feed.asked.map((a) => a.deptId), AGENCIES.map((a) => a.code));
  assert.ok(feed.asked.every((a) => a.types === ROUTINE_TYPES && a.limit === Infinity));
  assert.ok(!ROUTINE_TYPES.includes('15'), '15 has always timed out');
  assert.equal(saved.length, AGENCIES.length);
  assert.equal(saved[1].deptId, '0307');
  assert.equal(totals.asked, AGENCIES.length);
  assert.equal(totals.discovered, 2);
  assert.equal(totals.updated, 1);
  assert.equal(totals.stoppedBy, null);
});

test('runSweepStep: one silent agency is skipped, two in a row stop the sweep', async () => {
  const feed = fakeFeed(noAnswer(), answered(), noAnswer(), noAnswer(), answered());
  const { saved, record } = records();

  const totals = await runSweepStep({ agencies: AGENCIES, fetch: feed.fetch, record, documentsDir: 'unused' });

  assert.equal(feed.asked.length, 4, 'the fifth agency was not asked');
  assert.equal(saved.length, 4);
  assert.equal(totals.unanswered, 3);
  assert.equal(totals.stoppedBy, 'no-answer');
});

test('runSweepStep: stops when the feed closes, and when the time box is over', async () => {
  const closing = fakeFeed(answered(), answered({ closed: true, requested: 0, answered: 0 }));
  const closed = await runSweepStep({ agencies: AGENCIES, fetch: closing.fetch, record: async () => {}, documentsDir: 'unused' });
  assert.equal(closing.asked.length, 2);
  assert.equal(closed.asked, 1);
  assert.equal(closed.stoppedBy, 'closed');

  let clock = new Date('2026-10-14T12:00:00Z');
  const until = new Date('2026-10-14T12:00:02Z');
  const slow = fakeFeed();
  const timed = await runSweepStep({
    agencies: AGENCIES,
    fetch: async (options) => {
      clock = new Date(clock.getTime() + 1000); // each agency takes a second
      return slow.fetch(options);
    },
    record: async () => {},
    until,
    now: () => clock,
    documentsDir: 'unused',
  });
  assert.equal(timed.asked, 2);
  assert.equal(timed.stoppedBy, 'time');
});

test('runSweepStep: paces its requests with its own, slower pacer', async () => {
  const feed = fakeFeed();
  const pace = async () => {};

  await runSweepStep({ agencies: AGENCIES.slice(0, 2), fetch: feed.fetch, record: async () => {}, pace, documentsDir: 'unused' });

  assert.ok(SWEEP_INTERVAL_MS >= 2000, 'slower than one a second: e-GP refused that');
  assert.ok(feed.asked.every((options) => options.pace === pace));
});

test('runSweepStep: when e-GP asks us to slow down, pauses and asks the same agency again', async () => {
  const refused = () => answered({ rateLimited: true, answered: 2, discovered: 1 });
  const feed = fakeFeed(answered(), refused(), answered({ discovered: 2 }), answered(), answered(), answered());
  const pauses = [];
  const { saved, record } = records();

  const totals = await runSweepStep({
    agencies: AGENCIES,
    fetch: feed.fetch,
    record,
    sleep: async (ms) => pauses.push(ms),
    pauseMs: 600_000,
    documentsDir: 'unused',
  });

  assert.deepEqual(feed.asked.map((a) => a.deptId), ['0304', '0307', '0307', '11012', 'A004', '0101']);
  assert.deepEqual(pauses, [600_000]);
  assert.equal(saved.length, 6, 'the refused poll is recorded too');
  assert.equal(totals.asked, AGENCIES.length);
  assert.equal(totals.pauses, 1);
  assert.equal(totals.discovered, 3, 'what it found before refusing still counts');
  assert.equal(totals.stoppedBy, null);
});

test('runSweepStep: stops after three pauses in a row, or when a pause would pass the time box', async () => {
  const refused = () => answered({ rateLimited: true, answered: 0 });
  const stubborn = fakeFeed(refused(), refused(), refused(), refused(), answered());
  const pauses = [];
  const totals = await runSweepStep({
    agencies: AGENCIES, fetch: stubborn.fetch, record: async () => {}, sleep: async (ms) => pauses.push(ms), documentsDir: 'unused',
  });
  assert.equal(pauses.length, 3);
  assert.equal(stubborn.asked.length, 4);
  assert.equal(totals.stoppedBy, 'rate-limit');

  const late = fakeFeed(refused());
  const boxed = await runSweepStep({
    agencies: AGENCIES,
    fetch: late.fetch,
    record: async () => {},
    sleep: async () => assert.fail('no pause past the time box'),
    until: new Date(Date.now() + 60_000),
    pauseMs: 600_000,
    documentsDir: 'unused',
  });
  assert.equal(boxed.stoppedBy, 'rate-limit');
});

test('runSweepStep: counts agencies whose list was full, since 20 is all a list holds', async () => {
  const feed = fakeFeed(answered({ itemsByType: { W0: 20, D0: 3 } }), answered({ itemsByType: { D0: 20 } }));
  const totals = await runSweepStep({ agencies: AGENCIES.slice(0, 3), fetch: feed.fetch, record: async () => {}, documentsDir: 'unused' });
  assert.equal(totals.full, 2);
});

test('recordPoll: saves what was asked and what came back', async () => {
  const startedAt = new Date('2026-10-14T11:00:00Z');
  await recordPoll({
    deptId: '0307',
    startedAt,
    finishedAt: new Date('2026-10-14T11:00:09Z'),
    result: answered({ discovered: 1, itemsByType: { D0: 4, W0: 11 }, errors: ['a', 'b', 'c', 'd', 'e', 'f'] }),
  });

  const poll = await FeedPoll.findOne({ deptId: '0307' }).lean();
  assert.equal(poll.source, 'process3');
  assert.equal(poll.requested, 7);
  assert.equal(poll.answered, 7);
  assert.equal(poll.discovered, 1);
  assert.equal(poll.itemsByType.W0, 11);
  assert.deepEqual(poll.problems, ['a', 'b', 'c', 'd', 'e'], 'the first few errors only');
});
