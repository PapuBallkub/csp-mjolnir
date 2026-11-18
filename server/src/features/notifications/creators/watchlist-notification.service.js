import { Notification, Tor, TorInsight, User } from '#models/index.js';
import { sendWatchlistDigestEmail } from '../email.service.js';

export const FIELD_NAMES_TH = {
  document: 'เอกสาร TOR',
  'facts.submissionDeadline': 'วันยื่นข้อเสนอ',
  'facts.referencePriceTHB': 'ราคากลาง',
  'facts.budgetTHB': 'วงเงินงบประมาณ',
  'facts.deliveryPeriodDays': 'ระยะเวลาส่งมอบ',
  'facts.contractDurationDays': 'ระยะเวลาสัญญา',
  'facts.warrantyYears': 'ระยะเวลารับประกัน',
  'eligibility.previousExperienceMinTHB': 'ผลงานในอดีตขั้นต่ำ',
  'technicalRequirements.requiredTechnologies': 'เทคโนโลยีที่กำหนด',
};

/**
 * Builds the immutable snapshot payload for an amendment notification event.
 *
 * @param {Object} tor - Live Tor document or raw data
 * @param {Object} insight - Live TorInsight document
 * @param {Object} [amendment] - The specific amendment entry from Tor.amendments
 * @returns {Object} Snapshot payload
 */
export function buildAmendmentSnapshot(tor = {}, insight = {}, amendment = {}) {
  const rawFields = Array.isArray(amendment.changes)
    ? [...new Set(amendment.changes.map((c) => c.field).filter(Boolean))]
    : Array.isArray(amendment.fields)
    ? amendment.fields
    : Array.isArray(insight.amendmentInfo?.changedSections)
    ? insight.amendmentInfo.changedSections
    : [];

  const changedFieldsTh = rawFields.map((f) => FIELD_NAMES_TH[f] || f);

  const budget =
    insight.facts?.referencePriceTHB ??
    insight.facts?.budgetTHB ??
    tor.facts?.referencePriceTHB?.value ??
    tor.facts?.budgetTHB?.value ??
    null;

  return {
    projectId: String(tor.projectId || insight.projectId || ''),
    projectTitle: String(insight.identification?.titleTh || tor.projectTitle || tor.title || ''),
    agency: String(insight.identification?.agency || tor.agency || ''),
    budget,
    amendmentHeadline: String(
      amendment.headline ||
        insight.amendmentInfo?.amendmentSummary ||
        'ประกาศแก้ไขเปลี่ยนแปลงเงื่อนไขหรือเอกสาร TOR',
    ),
    changedFields: rawFields,
    changedFieldsTh,
    detectedAt: amendment.detectedAt || tor.lastChangeAt || new Date(),
  };
}

/**
 * Builds the immutable snapshot payload for a lifecycle status change.
 *
 * @param {Object} insight - Live TorInsight document
 * @param {string} previousStatus - Status when saved
 * @param {string} newStatus - Current status
 * @returns {Object} Snapshot payload
 */
export function buildStatusSnapshot(insight = {}, previousStatus = 'Open', newStatus = 'Open') {
  const budget =
    insight.facts?.referencePriceTHB ??
    insight.facts?.budgetTHB ??
    null;

  return {
    projectId: String(insight.projectId || ''),
    projectTitle: String(insight.identification?.titleTh || ''),
    agency: String(insight.identification?.agency || ''),
    budget,
    previousStatus: String(previousStatus || 'Open'),
    newStatus: String(newStatus || insight.identification?.status || 'Open'),
    changedAt: new Date(),
  };
}

/**
 * Builds the immutable snapshot payload for an approaching deadline warning.
 *
 * @param {Object} insight - Live TorInsight document
 * @param {number} daysRemaining - Days left until deadline
 * @param {'submission'|'comment'} [deadlineType='submission']
 * @returns {Object} Snapshot payload
 */
export function buildDeadlineSnapshot(insight = {}, daysRemaining = 0, deadlineType = 'submission') {
  const deadlineDate =
    deadlineType === 'comment'
      ? insight.facts?.commentDeadline
      : insight.facts?.submissionDeadline;

  const budget =
    insight.facts?.referencePriceTHB ??
    insight.facts?.budgetTHB ??
    null;

  return {
    projectId: String(insight.projectId || ''),
    projectTitle: String(insight.identification?.titleTh || ''),
    agency: String(insight.identification?.agency || ''),
    budget,
    deadlineType,
    deadlineDate: deadlineDate ? new Date(deadlineDate) : null,
    daysRemaining,
  };
}

/**
 * Pure evaluation function: checks a single watchlisted item against live TOR and Insight data.
 * Returns an array of candidate alert descriptors ready to be staged.
 *
 * @param {Object} watchlistItem - { projectId, savedAt, savedStatus }
 * @param {Object} liveData - { tor, insight }
 * @param {Object} [options]
 * @param {Date} [options.now=new Date()]
 * @param {number[]} [options.deadlineAlertDays=[3, 7]]
 * @returns {Array<{ type: string, snapshot: Object, deduplicationKey: string }>}
 */
export function evaluateWatchlistItemUpdates(
  watchlistItem,
  { tor, insight },
  { now = new Date(), deadlineAlertDays, userNoticeDays, pastAlertedDays = [] } = {},
) {
  if (!watchlistItem || (!tor && !insight)) return [];

  const candidateAlerts = [];
  const savedAtTime = watchlistItem.savedAt ? new Date(watchlistItem.savedAt).getTime() : 0;
  const projectId = String(watchlistItem.projectId);

  // 1. Check for Amendments (Tor.lastChangeAt > savedAt or insight.amendmentInfo.lastAmendedDate > savedAt)
  const lastChangeTime = tor?.lastChangeAt
    ? new Date(tor.lastChangeAt).getTime()
    : insight?.amendmentInfo?.isAmended && insight?.amendmentInfo?.lastAmendedDate
    ? new Date(insight.amendmentInfo.lastAmendedDate).getTime()
    : 0;

  if (lastChangeTime > savedAtTime) {
    // Find standing amendments detected after savedAt
    const recentAmendments = Array.isArray(tor?.amendments)
      ? tor.amendments.filter((a) => !a.rolledBack && a.detectedAt && new Date(a.detectedAt).getTime() > savedAtTime)
      : [];

    const latestAmendment = recentAmendments.at(-1) || {
      detectedAt: tor?.lastChangeAt || insight?.amendmentInfo?.lastAmendedDate || new Date(),
      headline: insight?.amendmentInfo?.amendmentSummary || '',
      changes: (insight?.amendmentInfo?.changedSections || []).map((field) => ({ field })),
    };

    const snapshot = buildAmendmentSnapshot(tor, insight, latestAmendment);
    const dateKey = new Date(snapshot.detectedAt).toISOString();
    candidateAlerts.push({
      type: 'amendment',
      snapshot,
      deduplicationKey: `${projectId}:amendment:${dateKey}`,
    });
  }

  // 2. Check for Status Change (current status != savedStatus)
  const currentStatus = insight?.identification?.status || tor?.status;
  if (
    watchlistItem.savedStatus &&
    currentStatus &&
    currentStatus !== watchlistItem.savedStatus
  ) {
    const snapshot = buildStatusSnapshot(insight, watchlistItem.savedStatus, currentStatus);
    candidateAlerts.push({
      type: 'status_change',
      snapshot,
      deduplicationKey: `${projectId}:status:${currentStatus}`,
    });
  }

  // 3. Check for Approaching Submission Deadline (or commentDeadline for Drafts)
  const deadlineValue =
    currentStatus === 'Draft'
      ? insight?.facts?.commentDeadline
      : insight?.facts?.submissionDeadline;

  if (deadlineValue) {
    const deadlineTime = new Date(deadlineValue).getTime();
    const diffMs = deadlineTime - now.getTime();
    const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    const effectiveNoticeDays =
      typeof userNoticeDays === 'number'
        ? userNoticeDays
        : Array.isArray(deadlineAlertDays) && deadlineAlertDays.length > 0
        ? Math.max(...deadlineAlertDays)
        : 3;

    // Standard reminders that fire at milestone counts below the user's initial notice threshold
    const standardMilestones = [7, 3, 1].filter((m) => m < effectiveNoticeDays);
    const effectiveMilestones = Array.isArray(deadlineAlertDays) && deadlineAlertDays.length > 0
      ? [...new Set([...deadlineAlertDays, ...standardMilestones])]
      : [effectiveNoticeDays, ...standardMilestones];

    if (daysRemaining > 0 && daysRemaining <= effectiveNoticeDays) {
      const isMilestone = effectiveMilestones.includes(daysRemaining);
      const hasAlertWithinThreshold = pastAlertedDays.some((d) => d <= effectiveNoticeDays);

      // Trigger if it hits a milestone, OR if this is the first alert within user's notice threshold
      if (isMilestone || !hasAlertWithinThreshold) {
        const deadlineType = currentStatus === 'Draft' ? 'comment' : 'submission';
        const snapshot = buildDeadlineSnapshot(insight, daysRemaining, deadlineType);
        candidateAlerts.push({
          type: 'deadline',
          snapshot,
          deduplicationKey: `${projectId}:deadline:${daysRemaining}`,
        });
      }
    }
  }

  return candidateAlerts;
}

/**
 * =========================================================================
 * PHASE 1: STAGE WATCHLIST IN-APP NOTIFICATIONS
 * =========================================================================
 * Scans active users with saved items in User.watchlist, checks live TOR data,
 * and stages notification records in MongoDB.
 *
 * @param {Object} [options]
 * @param {Date} [options.now=new Date()]
 * @returns {Promise<{
 *   usersChecked: number,
 *   notificationsCreated: number,
 *   stagedAmendments: number,
 *   stagedStatusChanges: number,
 *   stagedDeadlines: number
 * }>}
 */
export async function generateWatchlistNotifications({ now = new Date(), userId = null } = {}) {
  const summary = {
    usersChecked: 0,
    notificationsCreated: 0,
    stagedAmendments: 0,
    stagedStatusChanges: 0,
    stagedDeadlines: 0,
  };

  // Find all users who have at least one item in their watchlist (or specific user if provided)
  const userFilter = {
    'watchlist.0': { $exists: true },
  };
  if (userId) {
    userFilter._id = userId;
  }

  const usersWithWatchlist = await User.find(userFilter)
    .select('_id email watchlist profile')
    .lean();

  if (usersWithWatchlist.length === 0) {
    return summary;
  }

  // Collect all unique projectIds watched across all users
  const allWatchedProjectIds = [
    ...new Set(usersWithWatchlist.flatMap((u) => (u.watchlist || []).map((w) => w.projectId))),
  ];

  if (allWatchedProjectIds.length === 0) {
    return summary;
  }

  // Batch fetch live Tors and TorInsights
  const [liveTors, liveInsights] = await Promise.all([
    Tor.find({ projectId: { $in: allWatchedProjectIds } })
      .select('projectId status lastChangeAt amendments facts')
      .lean(),
    TorInsight.find({ projectId: { $in: allWatchedProjectIds } })
      .select('projectId identification facts amendmentInfo')
      .lean(),
  ]);

  const torMap = new Map(liveTors.map((t) => [t.projectId, t]));
  const insightMap = new Map(liveInsights.map((i) => [i.projectId, i]));

  for (const user of usersWithWatchlist) {
    summary.usersChecked += 1;
    const watchlist = user.watchlist || [];

    // Group candidate alerts for this user by notification type
    const candidatesByType = {
      amendment: [],
      status_change: [],
      deadline: [],
    };

    // User-configured deadline advance notice (defaults to 3 days out)
    const userNoticeDays = user.profile?.deadlineNoticeDays ?? 3;

    // Fetch existing deadline notifications for this user to check past alerted days per project
    const pastDeadlineNotifs = await Notification.find({
      userId: user._id,
      type: 'deadline',
    })
      .select('snapshot')
      .lean();

    const pastAlertedDaysByProject = new Map();
    for (const notif of pastDeadlineNotifs) {
      const items = Array.isArray(notif.snapshot?.items) && notif.snapshot.items.length > 0
        ? notif.snapshot.items
        : notif.snapshot?.projectId
        ? [notif.snapshot]
        : [];

      for (const it of items) {
        if (!it.projectId) continue;
        const pId = String(it.projectId);
        if (!pastAlertedDaysByProject.has(pId)) {
          pastAlertedDaysByProject.set(pId, []);
        }
        if (typeof it.daysRemaining === 'number') {
          pastAlertedDaysByProject.get(pId).push(it.daysRemaining);
        }
      }
    }

    for (const item of watchlist) {
      const pId = String(item.projectId);
      const tor = torMap.get(pId);
      const insight = insightMap.get(pId);

      if (!tor && !insight) continue;

      const pastAlertedDays = pastAlertedDaysByProject.get(pId) || [];
      const candidates = evaluateWatchlistItemUpdates(
        item,
        { tor, insight },
        { now, userNoticeDays, pastAlertedDays }
      );
      for (const candidate of candidates) {
        if (candidatesByType[candidate.type]) {
          candidatesByType[candidate.type].push(candidate);
        }
      }
    }

    // Stage candidates with Daily Sum-Up rollup per type
    for (const type of ['amendment', 'status_change', 'deadline']) {
      const candidates = candidatesByType[type];
      if (candidates.length === 0) continue;

      const freshItems = [];

      for (const candidate of candidates) {
        const pId = candidate.snapshot.projectId;

        // De-duplication check: verify if a notification for this exact event was already staged
        const query = {
          userId: user._id,
          type: candidate.type,
          $or: [
            { 'snapshot.projectId': pId },
            { 'snapshot.items.projectId': pId },
          ],
        };

        if (candidate.type === 'status_change') {
          query.$and = [
            {
              $or: [
                { 'snapshot.newStatus': candidate.snapshot.newStatus },
                { 'snapshot.items.newStatus': candidate.snapshot.newStatus },
              ],
            },
          ];
        } else if (candidate.type === 'deadline') {
          query.createdAt = { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) };
          query.$and = [
            {
              $or: [
                { 'snapshot.daysRemaining': candidate.snapshot.daysRemaining },
                { 'snapshot.items.daysRemaining': candidate.snapshot.daysRemaining },
              ],
            },
          ];
        } else if (candidate.type === 'amendment') {
          query.$and = [
            {
              $or: [
                { 'snapshot.detectedAt': candidate.snapshot.detectedAt },
                { 'snapshot.items.detectedAt': candidate.snapshot.detectedAt },
              ],
            },
          ];
        }

        const alreadyExists = await Notification.exists(query);
        if (!alreadyExists) {
          freshItems.push(candidate.snapshot);
        }
      }

      if (freshItems.length === 0) continue;

      // Daily rollup: Check if an unread digest of this type already exists for today
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);

      const existingDigest = await Notification.findOne({
        userId: user._id,
        type,
        isRead: false,
        createdAt: { $gte: startOfDay },
      });

      if (existingDigest) {
        const existingItems = Array.isArray(existingDigest.snapshot?.items)
          ? existingDigest.snapshot.items
          : existingDigest.snapshot?.projectId
          ? [existingDigest.snapshot]
          : [];

        const existingIds = new Set(existingItems.map((it) => it.projectId));
        const newUnique = freshItems.filter((it) => !existingIds.has(it.projectId));

        if (newUnique.length > 0) {
          const merged = [...existingItems, ...newUnique];
          existingDigest.snapshot = {
            ...merged[0],
            items: merged,
          };
          existingDigest.markModified('snapshot');
          await existingDigest.save();
        }
      } else {
        // Create 1 consolidated notification for this type on this day
        await Notification.create({
          userId: user._id,
          type,
          snapshot: {
            ...freshItems[0],
            items: freshItems,
          },
          isRead: false,
          emailSent: false,
        });
        summary.notificationsCreated += 1;
      }

      if (type === 'amendment') summary.stagedAmendments += freshItems.length;
      if (type === 'status_change') summary.stagedStatusChanges += freshItems.length;
      if (type === 'deadline') summary.stagedDeadlines += freshItems.length;
    }
  }

  return summary;
}

/**
 * Proactively stages in-app watchlist notifications for a single user
 * (e.g. after updating profile settings or deadline notice threshold).
 *
 * @param {Object} user - User document with _id or id
 * @param {Object} [options]
 * @param {Date} [options.now=new Date()]
 * @returns {Promise<{
 *   notificationsCreated: number,
 *   stagedAmendments: number,
 *   stagedStatusChanges: number,
 *   stagedDeadlines: number
 * }>}
 */
export async function generateWatchlistNotificationsForUser(user, { now = new Date() } = {}) {
  const targetId = user?._id || user?.id;
  if (!targetId) {
    return { usersChecked: 0, notificationsCreated: 0, stagedAmendments: 0, stagedStatusChanges: 0, stagedDeadlines: 0 };
  }
  return generateWatchlistNotifications({ now, userId: targetId });
}

/**
 * =========================================================================
 * PHASE 2: DISPATCH WATCHLIST EMAILS (Scheduled Digest Sender)
 * =========================================================================
 * Runs at the scheduled digest time (08:00 AM).
 * Finds staged notifications of type 'amendment', 'status_change', 'deadline'
 * that haven't been emailed yet (emailSent: false).
 * Only dispatches to users with active notificationConsent.
 *
 * @param {Object} [options]
 * @param {number} [options.batchLimit=100]
 * @returns {Promise<{ notificationsProcessed: number, emailsSent: number, emailsSkipped: number }>}
 */
export async function dispatchPendingWatchlistEmails({ batchLimit = 100 } = {}) {
  const pendingNotifications = await Notification.find({
    type: { $in: ['amendment', 'status_change', 'deadline'] },
    emailSent: false,
    emailSkipped: { $ne: true },
  })
    .limit(batchLimit)
    .populate('userId', 'email name notificationConsent')
    .exec();

  const summary = {
    notificationsProcessed: pendingNotifications.length,
    emailsSent: 0,
    emailsSkipped: 0,
  };

  if (pendingNotifications.length === 0) {
    return summary;
  }

  // Group pending alerts by user
  const userAlertsMap = new Map();
  for (const notif of pendingNotifications) {
    const user = notif.userId;
    if (!user || !user.email) {
      notif.emailSent = false;
      notif.emailSkipped = true;
      await notif.save();
      summary.emailsSkipped += 1;
      continue;
    }

    const userIdStr = String(user._id || user.id);
    if (!userAlertsMap.has(userIdStr)) {
      userAlertsMap.set(userIdStr, { user, notifs: [] });
    }
    userAlertsMap.get(userIdStr).notifs.push(notif);
  }

  for (const [, { user, notifs }] of userAlertsMap) {
    const hasConsent = Boolean(user.notificationConsent);

    if (!hasConsent) {
      for (const n of notifs) {
        n.emailSent = false;
        n.emailSkipped = true;
        await n.save();
      }
      summary.emailsSkipped += notifs.length;
      continue;
    }

    // Attempt email dispatch via sendWatchlistDigestEmail if available
    try {
      const result = await sendWatchlistDigestEmail?.({
        user,
        alerts: notifs.map((n) => ({ type: n.type, ...n.snapshot })),
      });

      if (result?.sent) {
        summary.emailsSent += notifs.length;
      } else {
        summary.emailsSkipped += notifs.length;
      }
    } catch (err) {
      console.error(`[dispatch-watchlist] Error sending digest to ${user.email}:`, err.message);
      summary.emailsSkipped += notifs.length;
    }

    // Mark notifications as processed
    for (const n of notifs) {
      n.emailSent = true;
      n.emailSentAt = new Date();
      await n.save();
    }
  }

  return summary;
}

/**
 * Orchestrator: runs Phase 1 followed immediately by Phase 2 for watchlist updates.
 */
export async function runWatchlistNotificationCycle(options = {}) {
  const stagingSummary = await generateWatchlistNotifications(options);
  const dispatchSummary = await dispatchPendingWatchlistEmails(options);

  return {
    ...stagingSummary,
    ...dispatchSummary,
  };
}
