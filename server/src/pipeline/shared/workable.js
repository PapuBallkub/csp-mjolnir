/**
 * server/src/pipeline/shared/workable.js
 *
 * The projects worth spending on: screening, downloading and reading (ADR
 * 0018). Still to come or open:
 * - announced by the e-GP feed, the only source of open projects (ADR 0017).
 *   With no announcement, "Open" is only the status engine's default.
 * - not past: a TOR with a contract winner is past, whatever its status says.
 */
export const WORKABLE = {
  status: { $in: ['Draft', 'Open'] },
  'announcementHistory.0': { $exists: true },
  'contract.winnerName': { $in: [null, ''] },
};
