/**
 * server/src/pipeline/shared/request-pacer.js
 *
 * Keeps every request to a government site at least one second apart
 * (NFR-03). Fetch and download share one pacer, so a run that does both still
 * sends e-GP no more than one request a second, whichever code sends it.
 *
 * Paced per site, not per hostname: process3.gprocurement.go.th and
 * process5.gprocurement.go.th are one operator, and both count against e-GP.
 *
 * It also pauses before e-GP's limit. e-GP refuses the 240th request in a row
 * (HTTP 429), whatever the pace: at one a second and at one every 3 seconds
 * alike, then again after each 10-minute pause (the feed, 2026-10-14). So after
 * EGP_BURST requests in a row, the pacer rests EGP_PAUSE_MS. The count is kept
 * in the database: each step of a job runs as its own process, one right after
 * another, and e-GP sees their requests as one run. A pause may carry a step
 * past its time box by up to EGP_PAUSE_MS.
 */

import mongoose from 'mongoose';
import { RequestStreak } from '#models/index.js';

const MIN_INTERVAL_MS = 1000;

// EGP_FEED_BURST changes how many requests go out between pauses
const parsedBurst = Number.parseInt(process.env.EGP_FEED_BURST ?? '', 10);
export const EGP_BURST = parsedBurst > 0 ? parsedBurst : 230;
// Also how long a quiet spell resets e-GP's count: 10 minutes is enough
export const EGP_PAUSE_MS = 10 * 60 * 1000;

/** The sites with a limit on requests in a row, and how the pacer keeps under it. */
export const BURSTS = { 'gprocurement.go.th': { limit: EGP_BURST, pauseMs: EGP_PAUSE_MS } };

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The site a hostname belongs to: the last three labels under .th, where
 * names sit below go.th, co.th and the like, and the last two elsewhere.
 *
 *   process5.gprocurement.go.th → gprocurement.go.th
 *   data.go.th                  → data.go.th
 */
export function siteOf(hostname) {
  const labels = hostname.toLowerCase().split('.');
  return labels.slice(hostname.endsWith('.th') ? -3 : -2).join('.');
}

/**
 * Counts each site's requests in a row, in memory: the count one process
 * keeps. `next` counts a request and returns its number in the run; a quiet
 * spell of `quietMs` or more starts a new run. `restart` starts one with this
 * request.
 */
export function memoryCounter() {
  const runs = new Map();
  return {
    async next(site, at, quietMs) {
      const run = runs.get(site);
      const inARow = run && at - run.lastAt < quietMs ? run.inARow + 1 : 1;
      runs.set(site, { inARow, lastAt: at });
      return inARow;
    },
    async restart(site, at) {
      runs.set(site, { inARow: 1, lastAt: at });
    },
  };
}

/**
 * The same count, kept in the database, so the steps of a job count as one
 * run. Without a connection, it counts in memory.
 */
export function storedCounter({ fallback = memoryCounter() } = {}) {
  const connected = () => mongoose.connection.readyState === 1;
  return {
    async next(site, at, quietMs) {
      if (!connected()) return fallback.next(site, at, quietMs);
      const run = await RequestStreak.findById(site).lean();
      const inARow = run && at - run.lastAt.getTime() < quietMs ? run.inARow + 1 : 1;
      await RequestStreak.updateOne({ _id: site }, { $set: { inARow, lastAt: new Date(at) } }, { upsert: true });
      return inARow;
    },
    async restart(site, at) {
      if (!connected()) return fallback.restart(site, at);
      await RequestStreak.updateOne({ _id: site }, { $set: { inARow: 1, lastAt: new Date(at) } }, { upsert: true });
    },
  };
}

/**
 * Makes a pacer: an async function to await before each request. Each caller
 * reserves the next free slot for its site before it sleeps, so callers that
 * arrive together still go out one interval apart. A site in `bursts` gets a
 * pause before its limit on requests in a row.
 */
export function createPacer({
  intervalMs = MIN_INTERVAL_MS,
  now = Date.now,
  sleep = defaultSleep,
  bursts = {},
  counter = memoryCounter(),
  log = console.log,
} = {}) {
  const nextSlot = new Map();

  return async function pace(url) {
    const site = siteOf(new URL(url).hostname);
    const current = now();
    const slot = Math.max(current, nextSlot.get(site) ?? 0);
    nextSlot.set(site, slot + intervalMs);
    if (slot > current) await sleep(slot - current);

    const burst = bursts[site];
    if (!burst) return;
    const inARow = await counter.next(site, now(), burst.pauseMs);
    if (inARow > burst.limit) {
      log(`  -> ${burst.limit} requests in a row to ${site}: pausing ${Math.round(burst.pauseMs / 60_000)} min, before its limit`);
      await sleep(burst.pauseMs);
      await counter.restart(site, now());
      nextSlot.set(site, now() + intervalMs);
    }
  };
}

/** The one pacer every source and the downloader use. */
export const paceRequest = createPacer({ bursts: BURSTS, counter: storedCounter() });
