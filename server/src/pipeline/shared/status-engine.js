/**
 * server/src/pipeline/shared/status-engine.js
 *
 * Derives the public lifecycle status of a procurement from its announcement
 * history (FR-02, FR-15). The five statuses match the Tor model enum:
 *
 *   Draft → Open → Awarded | Closed | Cancelled
 *
 * Rules:
 * 1. If the latest announcement is B0, status = 'Draft'
 * 2. If D0 (or D1/D2) has been received, status = 'Open'
 * 3. If the data.go.th contract data has a winner, status = 'Awarded'
 * 4. 'Closed' is never set by the ingestion pipeline — it's inferred at read
 *    time by the API when a project is past its deadline with no agency update
 * 5. 'Cancelled' requires an explicit agency signal (not yet available in RSS)
 *
 * The isAmended flag is true when D1 or D2 appears in the history.
 */

import { EGP_ANNOUNCEMENT_CODES, AMENDMENT_CODES } from './announcement-codes.js';

/**
 * Given a project's announcement history, compute its status and amendment flag.
 *
 * @param {Array<{ code: string }>} history — the announcementHistory array from the Tor doc
 * @param {{ winnerName?: string | null }} [contract] — the contract sub-doc from data.go.th
 * @returns {{ status: string, isAmended: boolean }}
 */
export function deriveStatus(history = [], contract = {}) {
  // If contract data has a winner, the project is awarded regardless of RSS
  if (contract?.winnerName) {
    return {
      status: 'Awarded',
      isAmended: history ? history.some((h) => AMENDMENT_CODES.includes(h.code)) : false,
    };
  }

  // No history at all — default to Open (backward compat with data.go.th imports)
  if (!history || history.length === 0) {
    return { status: 'Open', isAmended: false };
  }

  // Walk the history to find the most authoritative status
  let latestStatus = 'Open';
  let hasAmendment = false;

  for (const entry of history) {
    const info = EGP_ANNOUNCEMENT_CODES[entry.code];
    if (!info) continue;

    if (info.impliedStatus) {
      latestStatus = info.impliedStatus;
    }
    if (info.setsAmended) {
      hasAmendment = true;
      // Amendments don't change status — project stays Open
      // but we ensure it's at least Open (can't amend a Draft)
      if (latestStatus === 'Draft') {
        latestStatus = 'Open';
      }
    }
  }

  return { status: latestStatus, isAmended: hasAmendment };
}
