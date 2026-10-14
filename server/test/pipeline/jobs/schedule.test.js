import assert from 'node:assert/strict';
import { test } from 'node:test';

import { HANDOVER_MS, SCHEDULE, bangkokTime, nextSlot, untilFor } from '#pipeline/jobs/schedule.js';

// Bangkok is UTC+7 all year: 08:00 there is 01:00 UTC
const bangkok = (iso) => new Date(`${iso}+07:00`);

test('nextSlot: the next job today, in Bangkok time whatever the machine is set to', () => {
  assert.deepEqual(nextSlot(bangkok('2026-10-14T07:59:00')), { at: bangkok('2026-10-14T08:00:00'), job: 'poll' });
  assert.deepEqual(nextSlot(bangkok('2026-10-14T12:30:00')), { at: bangkok('2026-10-14T17:05:00'), job: 'poll' });
  assert.deepEqual(nextSlot(bangkok('2026-10-14T17:30:00')), { at: bangkok('2026-10-14T18:00:00'), job: 'sweep' });
});

test('nextSlot: strictly after now, and over midnight to tomorrow', () => {
  assert.deepEqual(nextSlot(bangkok('2026-10-14T08:00:00')), { at: bangkok('2026-10-14T17:05:00'), job: 'poll' });
  assert.deepEqual(nextSlot(bangkok('2026-10-14T22:00:00')), { at: bangkok('2026-10-15T08:00:00'), job: 'poll' });
  // 23:30 in Bangkok is still 16:30 UTC the same day
  assert.deepEqual(nextSlot(bangkok('2026-10-14T23:30:00')), { at: bangkok('2026-10-15T08:00:00'), job: 'poll' });
  // 00:30 in Bangkok is 17:30 UTC the day before
  assert.deepEqual(nextSlot(bangkok('2026-10-15T00:30:00')), { at: bangkok('2026-10-15T08:00:00'), job: 'poll' });
});

test('untilFor: a job stops taking work shortly before the next one starts', () => {
  const until = untilFor(bangkok('2026-10-14T18:00:00'));
  assert.equal(until.getTime(), bangkok('2026-10-14T22:00:00').getTime() - HANDOVER_MS);
  assert.equal(bangkokTime(until), '2026-10-14 21:55');
});

test('SCHEDULE: polls only while the feed is open; times in order', () => {
  const minutes = (at) => Number(at.slice(0, 2)) * 60 + Number(at.slice(3));
  // The feed is open 17:01–08:29 only (manual 4.8)
  const open = (m) => m >= 17 * 60 + 1 || m <= 8 * 60 + 29;
  for (const slot of SCHEDULE.filter((s) => s.job !== 'process')) assert.ok(open(minutes(slot.at)), `${slot.job} at ${slot.at}`);
  const times = SCHEDULE.map((s) => minutes(s.at));
  assert.deepEqual(times, [...times].sort((a, b) => a - b));
});
