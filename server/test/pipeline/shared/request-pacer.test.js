import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createPacer, siteOf } from '#pipeline/shared/request-pacer.js';

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
