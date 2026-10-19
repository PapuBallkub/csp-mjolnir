import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';

import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { BURSTS, EGP_BURST, createPacer, siteOf, storedCounter } from '#pipeline/shared/request-pacer.js';

// For the count kept between processes
const TEST_DB = 'mjolnir_test_request_pacer';

before(async () => {
  await connectDatabase({ dbName: TEST_DB });
  await mongoose.connection.dropDatabase();
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDatabase();
});

// A small limit, so a test needs only a few requests
const EGP = 'https://process5.gprocurement.go.th/x';
const BURST = { 'gprocurement.go.th': { limit: 3, pauseMs: 600_000 } };

/** A clock that only moves when the pacer sleeps, so nothing waits for real. */
function fakeClock() {
  const clock = { time: 0, sleeps: [] };
  clock.now = () => clock.time;
  clock.sleep = async (ms) => {
    clock.sleeps.push(ms);
    clock.time += ms;
  };
  return clock;
}

test('siteOf: every e-GP host is one site, and data.go.th another', () => {
  assert.equal(siteOf('process3.gprocurement.go.th'), 'gprocurement.go.th');
  assert.equal(siteOf('process5.gprocurement.go.th'), 'gprocurement.go.th');
  assert.equal(siteOf('data.go.th'), 'data.go.th');
  assert.equal(siteOf('api.example.com'), 'example.com');
});

test('pacer: requests to one site go out at least a second apart (NFR-03)', async () => {
  const clock = fakeClock();
  const pace = createPacer({ now: clock.now, sleep: clock.sleep });

  await pace('https://process3.gprocurement.go.th/rss.xml');
  await pace('https://process5.gprocurement.go.th/probe');
  await pace('https://process5.gprocurement.go.th/download');

  assert.deepEqual(clock.sleeps, [1000, 1000]);
});

test('pacer: a request that comes late enough does not wait', async () => {
  const clock = fakeClock();
  const pace = createPacer({ now: clock.now, sleep: clock.sleep });

  await pace('https://data.go.th/api');
  clock.time += 5000; // a slow download in between
  await pace('https://data.go.th/api');

  assert.deepEqual(clock.sleeps, []);
});

test('pacer: different sites do not wait for each other', async () => {
  const clock = fakeClock();
  const pace = createPacer({ now: clock.now, sleep: clock.sleep });

  await pace('https://process3.gprocurement.go.th/rss.xml');
  await pace('https://data.go.th/api');

  assert.deepEqual(clock.sleeps, []);
});

test('pacer: callers that arrive together still go out one interval apart', async () => {
  const sleeps = [];
  const pace = createPacer({ now: () => 0, sleep: async (ms) => sleeps.push(ms) });

  await Promise.all([1, 2, 3].map(() => pace('https://process5.gprocurement.go.th/x')));

  assert.deepEqual(sleeps, [1000, 2000]);
});

test('pacer: e-GP gets a pause before its limit on requests in a row', () => {
  assert.ok(EGP_BURST < 240, 'e-GP refuses the 240th request');
  assert.equal(BURSTS['gprocurement.go.th'].limit, EGP_BURST);
});

test('pacer: after the limit, the next request waits out the pause, and the count starts again', async () => {
  const clock = fakeClock();
  const said = [];
  const pace = createPacer({ now: clock.now, sleep: clock.sleep, bursts: BURST, log: (line) => said.push(line) });

  for (let i = 0; i < 7; i++) await pace(EGP);

  // 1 s apart; the 4th waits 10 minutes, then 3 more go out before the next pause
  assert.deepEqual(clock.sleeps, [1000, 1000, 1000, 600_000, 1000, 1000, 1000, 600_000]);
  assert.equal(said.length, 2);
  assert.match(said[0], /3 requests in a row to gprocurement\.go\.th: pausing 10 min/);
});

test('pacer: a quiet spell as long as the pause starts the count again', async () => {
  const clock = fakeClock();
  const pace = createPacer({ now: clock.now, sleep: clock.sleep, bursts: BURST });

  await pace(EGP);
  await pace(EGP);
  clock.time += 600_000; // a long OCR between two downloads
  for (let i = 0; i < 3; i++) await pace(EGP);

  assert.deepEqual(clock.sleeps, [1000, 1000, 1000]);
});

test('pacer: a site without a limit is never paused', async () => {
  const clock = fakeClock();
  const pace = createPacer({ now: clock.now, sleep: clock.sleep, bursts: BURST });

  for (let i = 0; i < 6; i++) await pace('https://data.go.th/api');

  assert.ok(clock.sleeps.every((ms) => ms === 1000));
});

test('pacer: steps in their own processes share one count, through the database', async () => {
  const clock = fakeClock();
  clock.time = Date.parse('2026-10-20T22:00:00+07:00');
  // Two pacers, as two steps of a job would have: the recheck, then download
  const recheck = createPacer({ now: clock.now, sleep: clock.sleep, bursts: BURST, counter: storedCounter(), log: () => {} });
  const download = createPacer({ now: clock.now, sleep: clock.sleep, bursts: BURST, counter: storedCounter(), log: () => {} });

  await recheck(EGP);
  await recheck(EGP);
  clock.time += 30_000; // the next step starts
  await download(EGP);
  await download(EGP);

  // Each step's second request waits its second; the download's is the 4th in
  // a row, so it waits out the pause too
  assert.deepEqual(clock.sleeps, [1000, 1000, 600_000]);
});
