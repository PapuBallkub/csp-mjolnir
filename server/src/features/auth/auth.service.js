import { HttpError, unauthorized } from '#common/errors/http-error.js';
import { User } from '#models/index.js';

import { hashPassword, verifyPassword } from './password.js';

const DUPLICATE_KEY = 11000;

// The only shape of a user that leaves this feature, so there is one place to
// check that the hash never ships.
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
    // Left to the unique index rather than a lookup first, which two
    // simultaneous signups would both pass before either one writes.
    if (error.code === DUPLICATE_KEY) {
      throw new HttpError(409, 'That email already has an account.', {
        email: 'That email already has an account.',
      });
    }
    throw error;
  }
}

export async function signInWithPassword({ email, password }) {
  // select: false on the schema, so the hash has to be asked for by name.
  const user = await User.findOne({ email }).select('+passwordHash');

  // One message for a missing account and a wrong password. Separate ones tell
  // anyone who asks which addresses are registered. See 0004.
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw unauthorized('Invalid email or password.');
  }

  return toPublicUser(user);
}

// Returning user, linked account, or new account, in that order. Does no
// network of its own: the caller turns a code into a profile first, which is
// what makes this testable without Google.
export async function signInWithGoogle({ googleId, email, emailVerified }) {
  const returning = await User.findOne({ googleId });
  if (returning) {
    return toPublicUser(returning);
  }

  // Linking by address is only safe once Google vouches for the address.
  // Without this, an account claiming an address it does not own could take
  // over the password account already using it.
  if (!emailVerified) {
    throw new HttpError(403, 'Your Google account has no verified email address.');
  }

  // Link-or-create in one atomic write, so two callbacks arriving together
  // cannot both insert. The filter seeds email on insert.
  const user = await User.findOneAndUpdate(
    { email },
    { $set: { googleId } },
    { new: true, upsert: true },
  );

  return toPublicUser(user);
}

// Backs requireAuth. Reading the user per request is what makes a deleted
// account stop working before its token expires.
export async function findUserById(userId) {
  const user = await User.findById(userId);
  return user ? toPublicUser(user) : null;
}
