import { toPublicUser } from '#features/auth/index.js';
import {
  generateMatchNotificationsForUser,
  generateWatchlistNotificationsForUser,
} from '#features/notifications/index.js';

import { parseProfileUpdate } from './profile.validation.js';
import { updateProfile } from './profile.service.js';

export async function update(req, res) {
  const fields = parseProfileUpdate(req.body);

  // When nothing passes validation (empty body or all fields filtered out),
  // return the current user rather than a pointless no-op write.
  if (Object.keys(fields).length === 0) {
    return res.json({ user: req.user });
  }

  const user = await updateProfile(req.user.id, fields);

  // If user enabled notifications, proactively stage match notifications for them
  if (user.notificationConsent && user.profile?.matchNotification?.enabled) {
    generateMatchNotificationsForUser(user).catch((err) => {
      console.warn('[profile.controller] generateMatchNotificationsForUser error:', err.message);
    });
  }

  // If user has watched items, proactively stage in-app watchlist notifications
  // (e.g. when updating deadline notice threshold or watchlist preferences)
  if (Array.isArray(user.watchlist) && user.watchlist.length > 0) {
    generateWatchlistNotificationsForUser(user).catch((err) => {
      console.warn('[profile.controller] generateWatchlistNotificationsForUser error:', err.message);
    });
  }

  res.json({ user: toPublicUser(user) });
}
