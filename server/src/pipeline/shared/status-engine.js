/**
 * server/src/pipeline/shared/status-engine.js
 *
 * Works out a project's public status from its announcements (FR-02, FR-15).
 * The five statuses match the Tor model enum:
 *
 *   Draft → Open → Awarded | Closed | Cancelled
 *
 * Rules (ADR 0017):
 * 1. A contract with a winner (data.go.th) means Awarded, whatever the feed says.
 * 2. Otherwise the latest announcement that implies a status decides:
 *    B0 Draft · D0, D2 Open · D1 Cancelled · W0, W2 Awarded · W1 Cancelled.
 *    15 (ราคากลาง) changes nothing. A new invitation after a cancellation
 *    opens the project again.
 * 3. "Latest" means by publish date. Announcements from the same day keep the
 *    order they were recorded in, which follows the lifecycle (FETCHABLE_CODES).
 * 4. Closed is never set here: the API works it out from the deadline.
 * 5. isAmended is true once a D2 (changed invitation) has appeared.
 */

import { EGP_ANNOUNCEMENT_CODES, AMENDMENT_CODES } from './announcement-codes.js';

const timeOf = (value) => {
  const time = value ? new Date(value).getTime() : Number.NaN;
  return Number.isNaN(time) ? null : time;
};

/**
 * The history by publish date. An entry without one takes the time of the
 * entry before it, so undated and same-day entries keep their recorded order.
 */
function chronological(history) {
  let previous = Number.NEGATIVE_INFINITY;
  return history
    .map((entry, index) => {
      previous = timeOf(entry.publishedAt) ?? timeOf(entry.receivedAt) ?? previous;
      return { entry, index, time: previous };
    })
    .sort((a, b) => a.time - b.time || a.index - b.index)
    .map(({ entry }) => entry);
}

/**
 * @param {Array<{ code: string, publishedAt?: Date|string|null, receivedAt?: Date|string|null }>} history
 *   the announcementHistory array from the Tor document
 * @param {{ winnerName?: string | null }} [contract] the contract sub-document from data.go.th
 * @returns {{ status: string, isAmended: boolean, latestCode: string | null }}
 *   latestCode: the code of the latest announcement, for Tor.announceType
 */
export function deriveStatus(history = [], contract = {}) {
  const ordered = chronological(history ?? []);
  const isAmended = ordered.some((entry) => AMENDMENT_CODES.includes(entry.code));
  const latestCode = ordered.at(-1)?.code ?? null;

  if (contract?.winnerName) return { status: 'Awarded', isAmended, latestCode };

  // No history at all: Open, as data.go.th imports have always been
  let status = 'Open';
  for (const entry of ordered) {
    const implied = EGP_ANNOUNCEMENT_CODES[entry.code]?.impliedStatus;
    if (implied) status = implied;
  }
  return { status, isAmended, latestCode };
}
