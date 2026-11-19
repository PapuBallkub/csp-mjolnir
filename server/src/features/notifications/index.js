// The public export for the notifications feature. Other features and app.js import from here.
export { createNotificationRoutes } from './notification.routes.js';
export { getTransporter, sendEmail, sendMatchDigestEmail, sendWatchlistDigestEmail } from './email.service.js';
export {
  generateMatchNotifications,
  generateMatchNotificationsForUser,
  dispatchPendingMatchEmails,
  runMatchNotificationCycle,
} from './creators/match-notification.service.js';
export {
  generateWatchlistNotifications,
  generateWatchlistNotificationsForUser,
  dispatchPendingWatchlistEmails,
  runWatchlistNotificationCycle,
  buildAmendmentSnapshot,
  buildStatusSnapshot,
  buildDeadlineSnapshot,
  evaluateWatchlistItemUpdates,
} from './creators/watchlist-notification.service.js';
export {
  listUserNotifications,
  getNotificationById,
  markAsRead,
  markAllAsRead,
} from './notification-feed.service.js';
