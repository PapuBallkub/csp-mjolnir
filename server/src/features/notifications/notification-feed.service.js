import { notFound, badRequest } from '#common/errors/http-error.js';
import { Notification, User } from '#models/index.js';
import { verifyUnsubscribeToken } from './email.service.js';

/**
 * Lists notifications for a given user, ordered newest first.
 * Also returns the current unread count to power the header bell badge.
 *
 * @param {string|mongoose.Types.ObjectId} userId
 * @param {Object} [options]
 * @param {number} [options.limit=50]
 * @param {number} [options.skip=0]
 * @param {string} [options.type] - Optional filter by type ('match', 'deadline', etc.)
 * @returns {Promise<{ notifications: Array, unreadCount: number, total: number }>}
 */
export async function listUserNotifications(userId, { limit = 50, skip = 0, type } = {}) {
  const query = { userId };
  if (type) {
    query.type = type;
  }

  const [notifications, unreadCount, total] = await Promise.all([
    Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(Number(skip) || 0)
      .limit(Math.min(Number(limit) || 50, 100))
      .lean(),
    Notification.countDocuments({ userId, isRead: false }),
    Notification.countDocuments(query),
  ]);

  return {
    notifications,
    unreadCount,
    total,
  };
}

/**
 * Retrieves a single notification snapshot by ID.
 * Automatically marks the notification as read upon inspection.
 *
 * @param {string} id - Notification ID
 * @param {string|mongoose.Types.ObjectId} userId - Requesting user's ID
 * @returns {Promise<Object>} The frozen notification document
 */
export async function getNotificationById(id, userId) {
  const notification = await Notification.findOne({ _id: id, userId });
  if (!notification) {
    throw notFound('Notification not found.');
  }

  // Mark read if it hasn't been read yet
  if (!notification.isRead) {
    notification.isRead = true;
    notification.readAt = new Date();
    await notification.save();
  }

  return notification.toObject();
}

/**
 * Marks a single notification as read.
 * Called when a user dismisses a toast or clicks "Mark as read".
 *
 * @param {string} id - Notification ID
 * @param {string|mongoose.Types.ObjectId} userId - Requesting user's ID
 * @returns {Promise<{ updated: boolean, id: string }>}
 */
export async function markAsRead(id, userId) {
  const result = await Notification.updateOne(
    { _id: id, userId, isRead: false },
    { $set: { isRead: true, readAt: new Date() } },
  );

  return {
    updated: result.modifiedCount > 0,
    id,
  };
}

/**
 * Marks all unread notifications as read for a given user.
 * Called by "ทำเครื่องหมายว่าอ่านทั้งหมดแล้ว" in the notifications feed.
 *
 * @param {string|mongoose.Types.ObjectId} userId
 * @returns {Promise<{ updatedCount: number }>}
 */
export async function markAllAsRead(userId) {
  const result = await Notification.updateMany(
    { userId, isRead: false },
    { $set: { isRead: true, readAt: new Date() } },
  );

  return {
    updatedCount: result.modifiedCount,
  };
}

/**
 * Handles 1-click PDPA email unsubscription via stateless HMAC token.
 * Disables notificationConsent and email notification toggles without requiring a login.
 *
 * @param {string} userId - User ID from the unsubscribe link query
 * @param {string} token - HMAC token from the unsubscribe link query
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function unsubscribeUserByToken(userId, token) {
  const isValid = verifyUnsubscribeToken(userId, token);
  if (!isValid) {
    throw badRequest('Invalid or expired unsubscribe link.', {
      token: 'The security token does not match or is invalid.',
    });
  }

  const updatedUser = await User.findByIdAndUpdate(
    userId,
    {
      $set: {
        notificationConsent: false,
        'profile.matchNotification.enabled': false,
      },
    },
    { returnDocument: 'after' },
  );

  if (!updatedUser) {
    throw notFound('User not found.');
  }

  return {
    success: true,
    message: 'ยกเลิกการรับการแจ้งเตือนทางอีเมลเรียบร้อยแล้ว (Successfully unsubscribed from email alerts)',
  };
}
