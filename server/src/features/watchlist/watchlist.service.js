import { badRequest, notFound } from '#common/errors/http-error.js';
import { TorInsight, User } from '#models/index.js';
import { LIVE_STATUS, toPublic, visibilityFilter } from '#features/tors/index.js';

const MAX_WATCHLIST_ITEMS = 200;

/**
 * Retrieves the user's saved TORs with full public summaries.
 * Ordered by savedAt descending (most recently saved first).
 */
export async function getWatchlist(userId, now = new Date()) {
  const user = await User.findById(userId).select('watchlist').lean();
  if (!user) throw notFound('ไม่พบผู้ใช้งาน');

  const items = user.watchlist ?? [];
  if (items.length === 0) {
    return { tors: [], savedIds: [] };
  }

  // Preserve saved order: map of projectId -> savedAt
  const savedAtMap = new Map(items.map((i) => [i.projectId, i.savedAt]));
  const projectIds = items.map((i) => i.projectId);

  // Query TorInsights that match projectIds and pass visibilityFilter, with
  // the live status, facts and latest change the catalog shows (ADR 0013, 0032)
  const insights = await TorInsight.aggregate([
    {
      $match: {
        projectId: { $in: projectIds },
        ...visibilityFilter(),
      },
    },
    ...LIVE_STATUS,
  ]);

  // Changed since it was saved when lastChangeAt is later than savedAt (FR-17)
  const summaries = insights.map((insight) => ({
    ...toPublic(insight, now),
    savedAt: savedAtMap.get(insight.projectId),
  }));

  // Sort by savedAt descending (newest saved first)
  summaries.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());

  return {
    tors: summaries,
    savedIds: projectIds,
  };
}

/**
 * Saves a TOR to the user's watchlist.
 * Idempotent: prevents duplicate entries.
 */
export async function addToWatchlist(userId, projectId) {
  // Ensure the TOR exists, and is one the user can see: saving a project
  // the catalog never shows would leave an entry the watchlist hides
  const exists = await TorInsight.exists({ projectId, ...visibilityFilter() });
  if (!exists) {
    throw notFound('ไม่พบข้อมูลโครงการ TOR');
  }

  const user = await User.findById(userId).select('watchlist');
  if (!user) throw notFound('ไม่พบผู้ใช้งาน');

  const current = user.watchlist ?? [];
  const isAlreadySaved = current.some((item) => item.projectId === projectId);

  if (isAlreadySaved) {
    return { saved: true, projectId, count: current.length };
  }

  if (current.length >= MAX_WATCHLIST_ITEMS) {
    throw badRequest(`คุณสามารถบันทึกโครงการในรายการติดตามได้สูงสุด ${MAX_WATCHLIST_ITEMS} รายการ`, {
      watchlist: `คุณบันทึกโครงการในรายการติดตามครบตามจำนวนสูงสุด ${MAX_WATCHLIST_ITEMS} รายการแล้ว`,
    });
  }

  user.watchlist.push({ projectId, savedAt: new Date() });
  await user.save();

  return { saved: true, projectId, count: user.watchlist.length };
}

/**
 * Removes a TOR from the user's watchlist.
 * Idempotent: succeeds even if the item was not in the list.
 */
export async function removeFromWatchlist(userId, projectId) {
  const result = await User.findByIdAndUpdate(
    userId,
    { $pull: { watchlist: { projectId } } },
    { returnDocument: 'after' },
  )
    .select('watchlist')
    .lean();

  if (!result) throw notFound('ไม่พบผู้ใช้งาน');

  return {
    saved: false,
    projectId,
    count: result.watchlist?.length ?? 0,
  };
}
