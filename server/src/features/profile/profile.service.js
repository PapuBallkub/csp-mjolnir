import { badRequest } from '#common/errors/http-error.js';
import { User } from '#models/index.js';

/**
 * Updates only the profile fields the caller sends. Uses $set on dot-notated
 * paths so that updating skills does not blank out budgetMin.
 *
 * Returns the raw Mongoose document so the controller can pass it through
 * toPublicUser.
 */
export async function updateProfile(userId, fields) {
  const setOps = {};
  for (const [key, value] of Object.entries(fields)) {
    setOps[`profile.${key}`] = value;
  }

  // Cross-field validation when only one of min/max is sent: we have to
  // compare against whatever is already stored.
  if (
    (fields.budgetMin !== undefined && fields.budgetMax === undefined) ||
    (fields.budgetMax !== undefined && fields.budgetMin === undefined)
  ) {
    const existing = await User.findById(userId).select('profile.budgetMin profile.budgetMax').lean();
    const effectiveMin = fields.budgetMin ?? existing?.profile?.budgetMin ?? 0;
    const effectiveMax = fields.budgetMax ?? existing?.profile?.budgetMax ?? 0;
    if (effectiveMax !== 0 && effectiveMin > effectiveMax) {
      throw badRequest('Check the details you entered.', {
        budgetMin: 'Minimum budget cannot be greater than maximum budget.',
      });
    }
  }

  const user = await User.findByIdAndUpdate(userId, { $set: setOps }, { returnDocument: 'after' });
  return user;
}
