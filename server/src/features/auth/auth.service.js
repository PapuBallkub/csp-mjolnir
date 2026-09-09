import { HttpError, unauthorized } from '#common/errors/http-error.js';
import { User } from '#models/index.js';

import { hashPassword, verifyPassword } from './password.js';

const DUPLICATE_KEY = 11000;

// The only shape of a user that leaves this feature. Everything the API returns
// is built here, so there is one place to check that the hash never ships.
export function toPublicUser(user) {
  return {
    id: user.id,
    email: user.email,
    notificationConsent: user.notificationConsent,
    createdAt: user.createdAt,
  };
}

export async function registerWithPassword({ email, password, notificationConsent }) {
  const passwordHash = await hashPassword(password);

  try {
    const user = await User.create({ email, passwordHash, notificationConsent });
    return toPublicUser(user);
  } catch (error) {
    // Checked by letting the unique index refuse the write rather than by
    // looking first. Two people submitting the same address at the same moment
    // both pass a look-first check and one of them creates a duplicate; the
    // index is the only thing that actually holds.
    if (error.code === DUPLICATE_KEY) {
      throw new HttpError(409, 'That email already has an account.', {
        email: 'That email already has an account.',
      });
    }
    throw error;
  }
}

export async function signInWithPassword({ email, password }) {
  // The hash is select: false on the schema, so it has to be asked for by name.
  const user = await User.findOne({ email }).select('+passwordHash');

  // One message for both a missing account and a wrong password: a sign-in form
  // that distinguishes them tells anyone who asks which addresses are
  // registered. Sign-up cannot hide the same fact — see
  // docs/decisions/0004-sessions-as-signed-cookies.md.
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw unauthorized('Invalid email or password.');
  }

  return toPublicUser(user);
}

// Backs requireAuth. A token stays cryptographically valid until it expires, so
// this is what makes a deleted account stop working immediately, and what keeps
// the caller reading consent as it is now rather than as it was at sign-in.
export async function findUserById(userId) {
  const user = await User.findById(userId);
  return user ? toPublicUser(user) : null;
}
