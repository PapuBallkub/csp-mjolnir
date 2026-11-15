import { Notification } from '#models/index.js';

/**
 * Pure helper that extracts a Set of project IDs from an array of past notification documents.
 * Supports both:
 * - Match notifications: snapshot.matchedItems contains an array of [{ projectId }, ...]
 * - Single-project notifications: snapshot.projectId contains a single project ID
 *
 * @param {Array<Object>} pastNotifications
 * @returns {Set<string>} Set of project IDs
 */
export function extractNotifiedProjectIds(pastNotifications = []) {
  const projectIds = new Set();

  for (const notif of pastNotifications) {
    // 1. For match notifications: snapshot.matchedItems has [{ projectId }, ...]
    if (Array.isArray(notif.snapshot?.matchedItems)) {
      for (const item of notif.snapshot.matchedItems) {
        if (item.projectId) {
          projectIds.add(String(item.projectId));
        }
      }
    }

    // 2. For future functionality like amendment, deadline notifications: snapshot.projectId
    if (notif.snapshot?.projectId) {
      projectIds.add(String(notif.snapshot.projectId));
    }
  }

  return projectIds;
}

/**
 * Retrieves the set of project IDs that has already been notified to a user
 * for a specific notification type within a safe lookback window (default: 30 days).
 *
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @param {Object} [options]
 * @param {string} [options.type] - e.g. 'match', 'amendment'
 * @param {number} [options.lookbackDays=30] - Max days to look back (default 30)
 * @param {number} [options.limit=50] - Safe query limit (default 50)
 * @returns {Promise<Set<string>>} Set of already notified project IDs
 */
export async function getNotifiedProjectIds(userId, { type, lookbackDays = 30, limit = 50 } = {}) {
  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  const query = {
    userId,
    createdAt: { $gte: cutoff },
  };
  if (type) {
    query.type = type;
  }

  const pastNotifs = await Notification.find(query)
    .select('snapshot')
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return extractNotifiedProjectIds(pastNotifs);
}
