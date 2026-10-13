/**
 * server/src/pipeline/jobs/schedule.js
 *
 * When each job runs, in Bangkok time (ADR 0027). Only fetching depends on
 * the feed's hours, 12:01–12:59 and 17:01–08:59; downloads, OCR and Gemini
 * run whenever there's work.
 *
 * Each job stops taking new work HANDOVER_MS before the next one starts, so
 * jobs don't queue up behind each other.
 */

export const SCHEDULE = [
  { at: '08:00', job: 'poll' }, // what was posted after the 17:05 poll
  { at: '12:05', job: 'poll' }, // the morning's posts
  { at: '17:05', job: 'poll' }, // the afternoon's posts
  { at: '18:00', job: 'sweep' }, // every agency: what the national feed dropped, and stage changes
  { at: '22:00', job: 'process' }, // the night: OCR and Gemini on whatever is waiting
];

export const HANDOVER_MS = 5 * 60 * 1000;

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000; // no daylight saving
const DAY_MS = 24 * 60 * 60 * 1000;

/** A slot's time on the Bangkok day that `dayStart` (UTC ms of Bangkok midnight) begins. */
function slotTime(dayStart, at) {
  const [hours, minutes] = at.split(':').map(Number);
  return new Date(dayStart + (hours * 60 + minutes) * 60 * 1000);
}

/**
 * The next scheduled job after `now`.
 *
 * @returns {{ at: Date, job: string }}
 */
export function nextSlot(now = new Date(), schedule = SCHEDULE) {
  const local = now.getTime() + BANGKOK_OFFSET_MS;
  const todayStart = local - (local % DAY_MS) - BANGKOK_OFFSET_MS;
  for (const dayStart of [todayStart, todayStart + DAY_MS]) {
    for (const slot of schedule) {
      const at = slotTime(dayStart, slot.at);
      if (at > now) return { at, job: slot.job };
    }
  }
  throw new Error('The schedule is empty.');
}

/** The time box of a job started at `now`: until shortly before the next one. */
export const untilFor = (now = new Date(), schedule = SCHEDULE) =>
  new Date(nextSlot(now, schedule).at.getTime() - HANDOVER_MS);

/** A time as Bangkok shows it, e.g. "2026-10-14 08:00". */
export function bangkokTime(date) {
  return new Date(date.getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 16).replace('T', ' ');
}
