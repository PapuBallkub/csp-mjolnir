/**
 * server/src/pipeline/shared/queues.js
 *
 * The three kinds of work the pipeline does, in the order a day's delay costs
 * them (ADR 0030):
 *   new      TORs not read yet: a day late is a day of a short bid window lost
 *   changed  TORs we follow whose package changed: people deciding whether to
 *            bid would act on old terms
 *   past     past projects chosen to be read in full, for the price
 *            comparison: a fixed pool, so a night's wait costs almost nothing
 *
 * download, ocr and extract take `--queue`, so a job can run them one kind at
 * a time, in that order. When its time box runs out, what's left undone is
 * the kind that can wait.
 *
 * A queue is a state, not a history: which one a TOR is in follows from what
 * the database says about it now.
 */

import { WORKABLE } from './workable.js';

export const QUEUES = ['new', 'changed', 'past'];

// A past project chosen to be read in full (ADR 0028): awarded, so never workable
const PAST = { historyRequestedAt: { $ne: null }, $nor: [WORKABLE] };

// A TOR we follow whose package changed. Download takes it by the flag fetch
// sets for a new stage (ADR 0020). After that, a TOR whose document was
// replaced has a version above 1, until it's read and extracted again. One
// whose document changed before its first extraction counts as changed too:
// rare, and still done the same night.
const CHANGED = {
  download: { ...WORKABLE, packageCheckNeeded: true },
  read: { ...WORKABLE, 'document.version': { $gt: 1 } },
};

/**
 * The database filter for some queues at one step: `download`, or `read` for
 * ocr and extract. Null when no queue is named: every TOR, as before queues.
 *
 * @param {string[]|null} queues
 * @param {'download' | 'read'} step
 */
export function queueFilter(queues, step) {
  if (!queues) return null;
  const changed = CHANGED[step];
  const filters = { past: PAST, changed, new: { $nor: [PAST, changed] } };
  return { $or: queues.map((queue) => filters[queue]) };
}

/** A step's own filter, narrowed to some queues; unchanged when none is named. */
export const inQueues = (filter, queues, step) => (queues ? { $and: [filter, queueFilter(queues, step)] } : filter);

/**
 * Reads `--queue`: one or more of new, changed and past, comma-separated.
 *
 * @returns {string[]|null} Null when not given: every queue
 */
export function parseQueues(value) {
  if (value == null) return null;
  const queues = String(value)
    .split(',')
    .map((queue) => queue.trim().toLowerCase())
    .filter(Boolean);
  const unknown = queues.filter((queue) => !QUEUES.includes(queue));
  if (queues.length === 0 || unknown.length > 0) {
    throw new Error(`--queue takes ${QUEUES.join(', ')} or several, comma-separated; not "${value}"`);
  }
  return [...new Set(queues)];
}

/**
 * Soonest bid deadline first, those without one after: a TOR closing tomorrow
 * matters more than one closing next month. Stable, so ties keep their order.
 */
export function soonestFirst(tors) {
  const time = (tor) => (tor.submissionDeadline ? new Date(tor.submissionDeadline).getTime() : Infinity);
  return [...tors].sort((a, b) => time(a) - time(b));
}
