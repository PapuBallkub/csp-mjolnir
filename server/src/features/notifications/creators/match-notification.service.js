import { env } from '#common/config/env.js';
import { calculateMatchScore, isProfileBaseline } from '#features/match/matchmaker.js';
import { Notification, TorInsight, User } from '#models/index.js';
import { sendMatchDigestEmail } from '../email.service.js';
import { getNotifiedProjectIds } from './find-notification-duplication.js';

/**
 * Builds the immutable snapshot payload for a match notification.
 * Receipts are frozen at alert time so history remains 100% stable.
 *
 * @param {Array<{ tor: Object, matchResult: Object }>} matchedPairs
 * @returns {{ matchedItems: Array }}
 */
export function buildMatchSnapshot(matchedPairs) {
  return {
    matchedItems: matchedPairs.map(({ tor, matchResult }) => {
      const budget =
        tor.facts?.referencePriceTHB ??
        tor.facts?.budgetTHB ??
        tor.budget ??
        null;

      const submissionDeadline =
        tor.facts?.submissionDeadline ??
        tor.submissionDeadline ??
        null;

      return {
        projectId: String(tor.projectId || tor.identification?.egpReference || ''),
        projectTitle: String(tor.identification?.titleTh || tor.projectTitle || tor.title || ''),
        agency: String(tor.identification?.agency || tor.agency || ''),
        budget,
        matchScore: Number(matchResult.score || 0),
        matchedSkills: Array.isArray(matchResult.matched) ? matchResult.matched : [],
        submissionDeadline,
      };
    }),
  };
}

/**
 * Evaluates active candidate TORs against a single user's profile in memory.
 * Pure functional evaluation — zero DB mutations inside.
 *
 * @param {Object} user - User document with profile
 * @param {Array} candidateTors - Active TOR documents
 * @param {Object} options
 * @param {number} [options.minScore=70]
 * @returns {Array<{ tor: Object, matchResult: Object }>}
 */
export function evaluateUserCandidateMatches(user, candidateTors, { minScore = 70, now = new Date() } = {}) {
  const profile = user.profile ?? {};

  // If match notifications are disabled by the user or profile is completely unconfigured
  if (profile.matchNotification?.enabled === false || isProfileBaseline(profile)) {
    return [];
  }

  const effectiveMinScore = user.profile?.matchNotification?.minScore ?? minScore;
  const matches = [];

  for (const tor of candidateTors) {
    const deadline = tor.facts?.submissionDeadline ?? tor.submissionDeadline ?? null;
    if (deadline && new Date(deadline) < now) {
      continue;
    }

    const matchResult = calculateMatchScore(tor, profile);
    if (!matchResult || matchResult.score < effectiveMinScore) {
      continue;
    }

    // Filter strictly by the user's entity type (Company vs Individual):
    // If user is a single person (individual), do not notify them for companies-only tenders
    // unless they have subcontracting/consortium opportunities enabled (includeSubcontract: true).
    if (
      matchResult.breakdown?.entity?.disqualifiedDirectBid &&
      profile.matchNotification?.includeSubcontract === false
    ) {
      continue;
    }

    matches.push({ tor, matchResult });
  }

  // Rank matches by highest score first
  matches.sort((a, b) => b.matchResult.score - a.matchResult.score);

  return matches;
}

/**
 * Finds candidate active IT TORs from the database that are eligible for matching.
 * Per NFR-17, in production only approved extractions with confidence >= 80% are surfaced.
 * Active TORs must be Open or Draft, and must not have passed their submission deadline.
 *
 * @param {Date} [now=new Date()]
 */
export async function getActiveCandidateTors(now = new Date()) {
  const conditions = [
    { 'identification.status': { $in: ['Open', 'Draft'] } },
    { 'metadata.excluded': null },
    { 'metadata.awaitingFullText': { $ne: true } },
    { 'metadata.titleOnly': { $ne: true } },
    {
      $or: [
        { 'facts.submissionDeadline': null },
        { 'facts.submissionDeadline': { $gte: now } },
      ],
    },
  ];

  // In production, strictly enforce >= 80 confidence (NFR-17).
  // In development/pilot, allow demo data or unreviewed records if configured.
  if (!env.showUnreviewedInsights) {
    conditions.push({
      $or: [
        { 'metadata.confidenceScore': { $gte: 80 } },
        { 'metadata.reviewStatus': 'approved' },
      ],
    });
  }

  return TorInsight.find({ $and: conditions }).lean();
}

/**
 * =========================================================================
 * PHASE 1: GENERATE NOTIFICATIONS (Data Preparation / Staging)
 * =========================================================================
 * Runs when new TORs arrive or during batch ingestion.
 * Evaluates matches and writes Notification records into MongoDB (emailSent: false).
 * In-app feed and toasts are immediately available.
 *
 * @param {Object} [options]
 * @param {number} [options.minScore=70]
 * @returns {Promise<{ usersChecked: number, matchedUsers: number, notificationsCreated: number }>}
 */
export async function generateMatchNotifications({ minScore = 70 } = {}) {
  const [candidateTors, candidateUsers] = await Promise.all([
    getActiveCandidateTors(),
    User.find({
      notificationConsent: true,
      'profile.matchNotification.enabled': true,
    }).lean(),
  ]);

  const summary = {
    usersChecked: candidateUsers.length,
    matchedUsers: 0,
    notificationsCreated: 0,
  };

  if (candidateTors.length === 0 || candidateUsers.length === 0) {
    return summary;
  }

  for (const user of candidateUsers) {
    const matchedPairs = evaluateUserCandidateMatches(user, candidateTors, { minScore });

    if (matchedPairs.length === 0) {
      continue;
    }

    // Deduplicate: check which project IDs were already notified to this user within the last 30 days
    const alreadyNotifiedIds = await getNotifiedProjectIds(user._id, { type: 'match' });

    // Keep only genuinely NEW projects that this user has never been notified about
    const newMatchedPairs = matchedPairs.filter(({ tor }) => {
      const pId = String(tor.projectId || tor.identification?.egpReference || '');
      return pId && !alreadyNotifiedIds.has(pId);
    });

    // If all matching projects were already notified previously, skip to avoid spamming
    if (newMatchedPairs.length === 0) {
      continue;
    }

    summary.matchedUsers += 1;

    const snapshot = buildMatchSnapshot(newMatchedPairs);

    await Notification.create({
      userId: user._id,
      type: 'match',
      snapshot,
      isRead: false,
      emailSent: false, // staged, ready for scheduled email dispatch
    });

    summary.notificationsCreated += 1;
  }

  return summary;
}

/**
 * Evaluates active candidate TORs for a single user and generates notifications immediately.
 * Called when a user saves profile preferences or opens the notifications feed.
 *
 * @param {Object} user - User document or lean object
 * @returns {Promise<Object|null>} Created notification document or null
 */
export async function generateMatchNotificationsForUser(user) {
  if (!user) return null;

  // Must have notification consent and match notification enabled
  const hasConsent = Boolean(user.notificationConsent);
  const isEnabled = user.profile?.matchNotification?.enabled !== false;
  if (!hasConsent || !isEnabled) {
    return null;
  }

  const candidateTors = await getActiveCandidateTors();
  if (candidateTors.length === 0) return null;

  const matchedPairs = evaluateUserCandidateMatches(user, candidateTors);
  if (matchedPairs.length === 0) return null;

  const userId = user._id ?? user.id;
  const alreadyNotifiedIds = await getNotifiedProjectIds(userId, { type: 'match' });

  const newMatchedPairs = matchedPairs.filter(({ tor }) => {
    const pId = String(tor.projectId || tor.identification?.egpReference || '');
    return pId && !alreadyNotifiedIds.has(pId);
  });

  if (newMatchedPairs.length === 0) return null;

  const snapshot = buildMatchSnapshot(newMatchedPairs);

  return Notification.create({
    userId,
    type: 'match',
    snapshot,
    isRead: false,
    emailSent: false,
  });
}

/**
 * =========================================================================
 * PHASE 2: DISPATCH EMAILS (Scheduled Digest Sender)
 * =========================================================================
 * Runs at the scheduled digest time (e.g. 08:00 AM).
 * Finds staged notifications that haven't been emailed yet (emailSent: false).
 * Only dispatches to users with active notificationConsent.
 *
 * @param {Object} [options]
 * @param {number} [options.batchLimit=100]
 * @returns {Promise<{ notificationsProcessed: number, emailsSent: number, emailsSkipped: number }>}
 */
export async function dispatchPendingMatchEmails({ batchLimit = 100 } = {}) {
  // Find staged match notifications awaiting email dispatch
  const pendingNotifications = await Notification.find({
    type: 'match',
    emailSent: false,
    emailSkipped: { $ne: true },
  })
    .limit(batchLimit)
    .populate('userId', 'email name notificationConsent profile.matchNotification')
    .exec();

  const summary = {
    notificationsProcessed: pendingNotifications.length,
    emailsSent: 0,
    emailsSkipped: 0,
  };

  for (const notif of pendingNotifications) {
    const user = notif.userId;

    if (!user || !user.email) {
      console.warn(`[dispatch] Notification ${notif._id} skipped: user or email is missing.`);
      notif.emailSent = false;
      notif.emailSkipped = true;
      notif.emailSentAt = null;
      await notif.save();
      summary.emailsSkipped += 1;
      continue;
    }

    // Master consent check: user.notificationConsent is the primary PDPA consent switch
    const hasMasterConsent = Boolean(user.notificationConsent);
    // Specific match notification switch:
    const isMatchNotificationEnabled = Boolean(user.profile?.matchNotification?.enabled);

    if (!hasMasterConsent || !isMatchNotificationEnabled) {
      console.log(
        `[dispatch] Skipped ${user.email}: notifications not active (masterConsent=${hasMasterConsent}, matchNotification.enabled=${isMatchNotificationEnabled})`
      );
      notif.emailSent = false;
      notif.emailSkipped = true;
      notif.emailSentAt = null;
      await notif.save();
      summary.emailsSkipped += 1;
      continue;
    }

    // Deliver email
    const matchedItems = notif.snapshot?.matchedItems ?? [];
    if (matchedItems.length === 0) {
      console.warn(`[dispatch] Skipped ${user.email}: snapshot.matchedItems is empty.`);
      notif.emailSent = false;
      notif.emailSkipped = true;
      notif.emailSentAt = null;
      await notif.save();
      summary.emailsSkipped += 1;
      continue;
    }

    let emailDelivered = false;
    try {
      console.log(`[dispatch] Sending match digest to ${user.email} (${matchedItems.length} items)...`);
      const result = await sendMatchDigestEmail({
        user,
        matchedItems,
      });

      if (result?.sent) {
        console.log(`[dispatch] ✓ Email delivered to ${user.email} (MessageId: ${result.messageId})`);
        summary.emailsSent += 1;
        emailDelivered = true;
      } else {
        console.warn(`[dispatch] ⚠ Email delivery skipped for ${user.email}: ${result?.reason}`);
        summary.emailsSkipped += 1;
      }
    } catch (err) {
      console.error(`[dispatch] ❌ SMTP error for ${user.email}:`, err.message);
      summary.emailsSkipped += 1;
    }

    // Only mark as dispatched if delivery actually succeeded
    if (emailDelivered) {
      notif.emailSent = true;
      notif.emailSentAt = new Date();
      await notif.save();
    }
  }

  return summary;
}

/**
 * =========================================================================
 * ORCHESTRATOR: Run Phase 1 followed immediately by Phase 2
 * =========================================================================
 * Useful for local testing or when someone wants to run both in a single step.
 */
export async function runMatchNotificationCycle(options = {}) {
  const genSummary = await generateMatchNotifications(options);
  const emailSummary = await dispatchPendingMatchEmails(options);

  return {
    ...genSummary,
    ...emailSummary,
  };
}
