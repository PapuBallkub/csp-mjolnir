import { badRequest, notFound } from '#common/errors/http-error.js';
import { Tor, TorInsight, User } from '#models/index.js';
import { toPublic, visibilityFilter } from '#features/tors/tor.service.js';

const MAX_WATCHLIST_ITEMS = 200;

/**
 * Retrieves the user's saved TORs with full public summaries.
 * Ordered by savedAt descending (most recently saved first).
 */
export async function getWatchlist(userId, now = new Date()) {
  const user = await User.findById(userId).select('watchlist').lean();
  if (!user) throw notFound('User not found.');

  const items = user.watchlist ?? [];
  if (items.length === 0) {
    return { tors: [], savedIds: [] };
  }

  // Preserve saved order: map of projectId -> savedAt
  const savedAtMap = new Map(items.map((i) => [i.projectId, i.savedAt]));
  const projectIds = items.map((i) => i.projectId);

  // Query TorInsights that match projectIds and pass visibilityFilter
  const insights = await TorInsight.aggregate([
    {
      $match: {
        projectId: { $in: projectIds },
        ...visibilityFilter(),
      },
    },
    // Join with Tor collection for real-time feed status (ADR 0013)
    {
      $lookup: {
        from: Tor.collection.collectionName,
        localField: 'projectId',
        foreignField: 'projectId',
        pipeline: [
          {
            $project: {
              _id: 0,
              isAmended: 1,
              status: 1,
              contract: 1,
            },
          },
        ],
        as: '_tor',
      },
    },
    {
      $addFields: {
        _rawTor: { $arrayElemAt: ['$_tor', 0] },
      },
    },
    {
      $project: {
        _tor: 0,
      },
    },
  ]);

  // Transform insights to public summaries and attach live status
  const summaries = insights.map((insight) => {
    const rawTor = insight._rawTor;
    delete insight._rawTor;

    const merged = {
      ...insight,
      identification: {
        ...insight.identification,
        status: rawTor?.status ?? insight.identification?.status,
        isAmended: rawTor?.isAmended ?? insight.identification?.isAmended,
      },
    };

    return {
      ...toPublic(merged, now),
      savedAt: savedAtMap.get(insight.projectId),
    };
  });

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
  // Ensure the TOR actually exists in TorInsight
  const exists = await TorInsight.exists({ projectId });
  if (!exists) {
    throw notFound('TOR project not found.');
  }

  const user = await User.findById(userId).select('watchlist');
  if (!user) throw notFound('User not found.');

  const current = user.watchlist ?? [];
  const isAlreadySaved = current.some((item) => item.projectId === projectId);

  if (isAlreadySaved) {
    return { saved: true, projectId, count: current.length };
  }

  if (current.length >= MAX_WATCHLIST_ITEMS) {
    throw badRequest(`You can save at most ${MAX_WATCHLIST_ITEMS} items to your watchlist.`, {
      watchlist: `Watchlist limit of ${MAX_WATCHLIST_ITEMS} items reached.`,
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

  if (!result) throw notFound('User not found.');

  return {
    saved: false,
    projectId,
    count: result.watchlist?.length ?? 0,
  };
}
