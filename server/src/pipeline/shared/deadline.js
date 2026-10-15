/**
 * server/src/pipeline/shared/deadline.js
 *
 * The time box of a scheduled run (ADR 0027). With `--until <time>`, a step
 * takes no new work after that time: the project in hand is finished, and
 * the rest waits for the next run. Without it, a step runs until it's done.
 */

/**
 * Reads `--until`. A time without a zone would be read in the machine's own,
 * so the scheduler always passes a full ISO time.
 *
 * @param {string|null|undefined} value
 * @returns {Date|null}
 */
export function parseUntil(value) {
  if (value == null) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`--until takes a date and time, e.g. 2026-10-14T07:55:00+07:00; got "${value}"`);
  }
  return date;
}

/** Whether the time box is over. No box never is. */
export const isPastDeadline = (until, now = new Date()) => Boolean(until) && now >= until;
