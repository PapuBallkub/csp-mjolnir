import { generateMatchNotificationsForUser } from './creators/match-notification.service.js';
import {
  getNotificationById,
  listUserNotifications,
  markAllAsRead,
  markAsRead,
  unsubscribeUserByToken,
} from './notification-feed.service.js';

/**
 * GET /api/notifications
 * Returns paginated notifications and unreadCount for the authenticated user.
 */
export async function getFeed(req, res) {
  let result = await listUserNotifications(req.user.id, {
    limit: req.query.limit,
    skip: req.query.skip,
    type: req.query.type,
  });

  // If user has consented and enabled match notifications, but has 0 notifications so far,
  // proactively generate matches on first feed visit so they don't see an artificial empty state!
  if (
    result.total === 0 &&
    req.user.notificationConsent &&
    req.user.profile?.matchNotification?.enabled !== false
  ) {
    await generateMatchNotificationsForUser(req.user).catch(() => null);
    result = await listUserNotifications(req.user.id, {
      limit: req.query.limit,
      skip: req.query.skip,
      type: req.query.type,
    });
  }

  res.json(result);
}

/**
 * GET /api/notifications/:id
 * Returns the frozen snapshot of a specific notification and marks it as read.
 */
export async function getDetail(req, res) {
  const notification = await getNotificationById(req.params.id, req.user.id);
  res.json({ notification, ...notification });
}

/**
 * PATCH /api/notifications/:id/read
 * Marks a single notification as read (e.g. dismissing a toast).
 */
export async function markSingleRead(req, res) {
  const result = await markAsRead(req.params.id, req.user.id);
  res.json(result);
}

/**
 * PATCH /api/notifications/read-all
 * Marks all unread notifications as read for the user.
 */
export async function markAllRead(req, res) {
  const result = await markAllAsRead(req.user.id);
  res.json(result);
}

/**
 * GET|POST /api/notifications/unsubscribe
 * Public endpoint: verifies HMAC token from email link and turns off notifications.
 */
export async function unsubscribe(req, res) {
  const userId = req.query.uid || req.query.userId || req.body?.userId;
  const token = req.query.token || req.body?.token;
  const result = await unsubscribeUserByToken(userId, token);
  res.json(result);
}
