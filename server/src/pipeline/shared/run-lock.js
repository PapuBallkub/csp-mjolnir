/**
 * server/src/pipeline/shared/run-lock.js
 *
 * One run of a pipeline at a time (ADR 0016). A scheduled run can start while
 * the last one is still going (OCR on an 83-page scan takes minutes), and two
 * runs would both pick the same TOR: OCR twice, and Gemini paid twice.
 *
 * The lock is a lease in MongoDB, so it holds across processes and machines.
 * The holder renews it while it runs. A run that crashed stops renewing, so
 * its lock frees itself after LEASE_MS, with nobody having to clear it.
 */

import crypto from 'node:crypto';
import os from 'node:os';
import { PipelineLock } from '#models/index.js';

const LEASE_MS = 5 * 60 * 1000;
const RENEW_EVERY_MS = 60 * 1000;

/** Another run holds the lock. Nothing was done. */
export class RunLockHeldError extends Error {
  constructor(name, holder) {
    const since = holder?.acquiredAt ? new Date(holder.acquiredAt).toLocaleString() : 'an unknown time';
    const until = holder?.expiresAt ? new Date(holder.expiresAt).toLocaleString() : 'soon';
    super(
      `Another ${name} run is in progress (${holder?.owner ?? 'unknown'}, since ${since}), so this one did nothing. ` +
        `If that run crashed, its lock expires by ${until}.`,
    );
    this.name = 'RunLockHeldError';
  }
}

/**
 * Takes the lock, or throws RunLockHeldError if a live run holds it. An
 * expired lock is taken over.
 *
 * @returns {Promise<{ owner: string, renew: () => Promise<boolean>, release: () => Promise<void> }>}
 */
export async function acquireRunLock(name, { leaseMs = LEASE_MS, now = () => new Date() } = {}) {
  const owner = `${os.hostname()} pid ${process.pid} ${crypto.randomUUID().slice(0, 8)}`;
  const takenAt = now();

  try {
    // Matches only an expired lock. When a live one exists, the upsert tries
    // to insert a second document with the same _id, and MongoDB refuses.
    await PipelineLock.findOneAndUpdate(
      { _id: name, expiresAt: { $lte: takenAt } },
      { $set: { owner, acquiredAt: takenAt, expiresAt: new Date(takenAt.getTime() + leaseMs) } },
      { upsert: true },
    );
  } catch (error) {
    if (error?.code !== 11000) throw error;
    throw new RunLockHeldError(name, await PipelineLock.findById(name).lean());
  }

  return {
    owner,
    /** Pushes the expiry forward. False when another run has taken the lock. */
    async renew() {
      const result = await PipelineLock.updateOne(
        { _id: name, owner },
        { $set: { expiresAt: new Date(now().getTime() + leaseMs) } },
      );
      return result.matchedCount === 1;
    },
    async release() {
      await PipelineLock.deleteOne({ _id: name, owner });
    },
  };
}

/**
 * Runs `work` while holding the lock, renewing it in the background, and
 * releases it afterwards: on success, on an error, and on Ctrl+C.
 */
export async function withRunLock(name, work, { leaseMs = LEASE_MS, renewEveryMs = RENEW_EVERY_MS } = {}) {
  const lock = await acquireRunLock(name, { leaseMs });

  const timer = setInterval(async () => {
    try {
      if (!(await lock.renew())) {
        console.error(`\nThe ${name} lock was lost: another run may be working on the same TORs.`);
      }
    } catch (error) {
      // A missed renewal is fine; the lease outlasts several of them
      console.warn(`\nCould not renew the ${name} lock: ${error.message}`);
    }
  }, renewEveryMs);
  timer.unref();

  // Without this, Ctrl+C would leave the lock held until the lease runs out,
  // and the next run would wait for nothing
  const onSignal = (signal) => {
    clearInterval(timer);
    lock.release().finally(() => process.exit(signal === 'SIGINT' ? 130 : 143));
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);

  try {
    return await work();
  } finally {
    clearInterval(timer);
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    await lock.release();
  }
}
