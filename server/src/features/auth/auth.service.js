import crypto from 'node:crypto';

import { HttpError, unauthorized } from '#common/errors/http-error.js';
import { EmailToken, User } from '#models/index.js';

import { hashToken, issueToken } from './email-token.js';
import { googleSignInError } from './google-id-token.js';
import { hashPassword, verifyPassword } from './password.js';
import { passwordProblem } from './password-policy.js';

const DUPLICATE_KEY = 11000;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// A reset link works once, for an hour, and only the latest one: a new request
// deletes the older ones (0042). Short, because unlike a confirm link it sets
// the password of an account that already exists.
const RESET_LINK_MS = HOUR;

// A confirm link works once, for a day: mail can be slow, and people don't read
// it at once. Five wrong passwords spend it.
const CONFIRM_LINK_MS = DAY;
const MAX_CONFIRM_ATTEMPTS = 5;

// The only shape of a user that leaves this feature, so there is one place to
// check that the hash never ships.
export function toPublicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    // Load-bearing: requireRole reads req.user.role, and req.user is whatever
    // this returned. Drop it here and every admin is silently forbidden.
    role: user.role,
    // ASVS V7.4.1: tokenVersion for session invalidation
    tokenVersion: user.tokenVersion ?? 0,
    notificationConsent: user.notificationConsent,
    // FR-12. The profile ships with every authed response, so the client
    // always has it and the match scorer (FR-13) can run on any page.
    profile: {
      skills: user.profile?.skills ?? [],
      budgetMin: user.profile?.budgetMin ?? 0,
      budgetMax: user.profile?.budgetMax ?? 0,
      certifications: user.profile?.certifications ?? [],
      entityType: user.profile?.entityType ?? 'juristic',
      preferredArchetypes: user.profile?.preferredArchetypes ?? [],
      maxPastPortfolioTHB: user.profile?.maxPastPortfolioTHB ?? 0,
      matchNotification: {
        enabled: user.profile?.matchNotification?.enabled ?? false,
        minScore: user.profile?.matchNotification?.minScore ?? 75,
        frequency: user.profile?.matchNotification?.frequency ?? 'daily',
        includeSubcontract: user.profile?.matchNotification?.includeSubcontract ?? true,
      },
      deadlineNoticeDays: user.profile?.deadlineNoticeDays ?? 3,
    },
    watchlist: (user.watchlist ?? []).map((w) => (typeof w === 'string' ? w : w.projectId)),
    createdAt: user.createdAt,
    ...passwordFlag(user),
  };
}

// Whether the account has a password, so the account page can offer "change"
// or "set one by email" (0042). Never the hash. The hash is select: false, so a
// copy of the user fetched without it can't tell: the field is then left out,
// not reported as false. Auth's own lookups fetch it.
function passwordFlag(user) {
  const selected = typeof user.isSelected === 'function' ? user.isSelected('passwordHash') : 'passwordHash' in user;
  return selected ? { hasPassword: Boolean(user.passwordHash) } : {};
}

/**
 * Whether the address on an account was ever confirmed: by the emailed link,
 * or by Google, which checked it when it created or linked the account.
 */
const isAddressVerified = (user) => Boolean(user?.emailVerifiedAt || user?.googleId);

/**
 * A registration, held until the address is confirmed (0041). No user is
 * created and nothing is signed in: the caller answers the same 202 whatever
 * happens here, and sends the email this returns after the response.
 *
 * - A new address, or an old account whose address was never confirmed: a
 *   pending registration, and a confirm link. Confirming an old account claims
 *   it: whoever controls the mailbox sets its password, and its role and
 *   profile stay.
 * - An address that already has a confirmed account: no link, only an email
 *   telling its owner someone tried.
 *
 * The password is hashed in every branch, so how long this takes doesn't say
 * which branch ran (ASVS V6.3.8).
 *
 * @returns {Promise<{ kind: 'confirm', email: string, token: string }
 *   | { kind: 'already-registered', email: string }>}
 */
export async function requestRegistration({ email, password, name, notificationConsent }) {
  const passwordHash = await hashPassword(password);

  const existing = await User.findOne({ email }, { emailVerifiedAt: 1, googleId: 1 }).lean();
  if (isAddressVerified(existing)) {
    return { kind: 'already-registered', email };
  }

  const { token, tokenHash } = issueToken();
  await EmailToken.create({
    purpose: 'verify-email',
    email,
    tokenHash,
    expiresAt: new Date(Date.now() + CONFIRM_LINK_MS),
    passwordHash,
    name,
    notificationConsent,
  });
  return { kind: 'confirm', email, token };
}

const linkProblem = (status, message, code) => new HttpError(status, message, undefined, code);
const invalidLink = () =>
  linkProblem(400, 'ลิงก์นี้หมดอายุหรือถูกใช้ไปแล้ว สมัครอีกครั้งเพื่อรับลิงก์ใหม่', 'LINK_INVALID');

/**
 * Confirms a registration with its link's token and the password chosen at
 * sign-up, then creates the account (or claims an old unconfirmed one) with a
 * confirmed address. Asking for the password is what stops a stranger who
 * registered your address: if you click their link, it still needs their
 * password, so your Google sign-in can't later land in their account (0041).
 *
 * @returns {Promise<object>} The new user, as toPublicUser shapes it
 */
export async function confirmRegistration({ token, password }) {
  const pending = await EmailToken.findOne({ purpose: 'verify-email', tokenHash: hashToken(token) }).select(
    '+passwordHash',
  );
  if (!pending || pending.expiresAt <= new Date()) throw invalidLink();

  if (!(await verifyPassword(password, pending.passwordHash))) {
    const counted = await EmailToken.findOneAndUpdate(
      { _id: pending._id },
      { $inc: { attempts: 1 } },
      { returnDocument: 'after' },
    );
    if (!counted || counted.attempts >= MAX_CONFIRM_ATTEMPTS) {
      await EmailToken.deleteOne({ _id: pending._id });
      throw linkProblem(400, 'กรอกรหัสผ่านผิดหลายครั้งเกินไป ลิงก์นี้ใช้ไม่ได้แล้ว สมัครอีกครั้งเพื่อรับลิงก์ใหม่', 'TOO_MANY_TRIES');
    }
    throw linkProblem(401, 'รหัสผ่านไม่ตรงกับที่ตั้งไว้ตอนสมัคร', 'WRONG_PASSWORD');
  }

  // Spent before anything is created, in one write, so two confirmations of
  // the same link can't both get through
  if (!(await EmailToken.findOneAndDelete({ _id: pending._id }))) throw invalidLink();

  const { email, passwordHash, name, notificationConsent } = pending;
  const confirmedAt = new Date();
  // An account from before 0041 whose address nobody ever confirmed: claimed.
  // Its role and profile stay; the password, name and consent are the ones
  // just confirmed.
  let user = await User.findOneAndUpdate(
    { email, emailVerifiedAt: { $exists: false }, googleId: { $exists: false } },
    { $set: { passwordHash, name, notificationConsent, emailVerifiedAt: confirmedAt } },
    { returnDocument: 'after' },
  ).select('+passwordHash');
  if (!user) {
    try {
      user = await User.create({ email, passwordHash, name, notificationConsent, emailVerifiedAt: confirmedAt });
    } catch (error) {
      if (error.code !== DUPLICATE_KEY) throw error;
      // Confirmed in the meantime: another link, or Google
      await dropPendingRegistrations(email);
      throw linkProblem(409, 'อีเมลนี้ยืนยันแล้ว เข้าสู่ระบบได้เลย', 'ALREADY_VERIFIED');
    }
  }

  // Every other link for this address goes too: it has an account now
  await dropPendingRegistrations(email);
  return toPublicUser(user);
}

// Compared against when there is no hash to compare against, so a missing
// account, an account with no password and a wrong password all cost one
// bcrypt compare and get the same 401 (ASVS V6.3.8). Made once, at import, so
// the first unknown address doesn't pay for a hash as well.
const dummyHash = hashPassword(crypto.randomUUID());

export async function signInWithPassword({ email, password }) {
  // select: false on the schema, so the hash has to be asked for by name.
  const user = await User.findOne({ email }).select('+passwordHash');

  const matches = await verifyPassword(password, user?.passwordHash ?? (await dummyHash));

  // One message for a missing account, an account that signs in only with
  // Google, and a wrong password. Separate ones tell anyone who asks which
  // addresses are registered. See 0004.
  if (!user?.passwordHash || !matches) {
    throw unauthorized('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
  }

  // Only someone who knows the password gets this far, so saying the address
  // isn't confirmed tells a stranger nothing
  if (!isAddressVerified(user)) {
    throw new HttpError(
      403,
      'ยืนยันอีเมลก่อนเข้าสู่ระบบ: สมัครอีกครั้งด้วยอีเมลนี้เพื่อรับลิงก์ยืนยันใหม่',
      undefined,
      'EMAIL_NOT_VERIFIED',
    );
  }

  return toPublicUser(user);
}

/**
 * Returning user, linked account, or new account, in that order. Does no
 * network of its own: the caller turns a code into a profile first, which is
 * what makes this testable without Google.
 *
 * `linked` is true when a Google account was just linked to an account that
 * already existed, which the caller tells the owner about by email.
 *
 * @returns {Promise<{ user: object, linked: boolean }>}
 */
export async function signInWithGoogle({ googleId, email, emailVerified, name }, { retried = false } = {}) {
  const returning = await User.findOne({ googleId }).select('+passwordHash');
  if (returning) {
    // Google confirmed the address when it created or linked this account
    if (!returning.emailVerifiedAt) {
      returning.emailVerifiedAt = new Date();
      await User.updateOne(
        { _id: returning._id, emailVerifiedAt: { $exists: false } },
        { $set: { emailVerifiedAt: returning.emailVerifiedAt } },
      );
    }
    return { user: toPublicUser(returning), linked: false };
  }

  // Linking by address is only safe once Google vouches for the address.
  // Without this, an account claiming an address it does not own could take
  // over the password account already using it.
  if (!emailVerified) {
    throw new HttpError(403, 'บัญชี Google ของคุณยังไม่ได้ยืนยันที่อยู่อีเมล');
  }

  const existing = await User.findOne({ email }, { googleId: 1, emailVerifiedAt: 1 }).lean();

  // Already linked to another Google account with the same address: never
  // replaced, or whoever holds the second one would take the account (V6.8.1)
  if (existing?.googleId) {
    throw googleSignInError(409, 'google-account-mismatch', 'อีเมลนี้เชื่อมกับบัญชี Google อื่นอยู่แล้ว');
  }

  // Each write below names the state it expects, so two callbacks arriving
  // together can't both act: the loser finds nothing to update, and tries once
  // more from the top.
  let user = null;
  if (existing?.emailVerifiedAt) {
    // A confirmed account: its owner made both, so the password stays
    user = await User.findOneAndUpdate(
      { _id: existing._id, googleId: { $exists: false } },
      { $set: { googleId } },
      { returnDocument: 'after' },
    ).select('+passwordHash');
  } else if (existing) {
    // An account from before 0041 whose address nobody confirmed. Google's
    // verified address beats an unconfirmed password, so the password goes:
    // this is what ends a pre-hijack made before confirmation existed.
    user = await User.findOneAndUpdate(
      { _id: existing._id, googleId: { $exists: false }, emailVerifiedAt: { $exists: false } },
      { $set: { googleId, emailVerifiedAt: new Date() }, $unset: { passwordHash: '' } },
      { returnDocument: 'after' },
    ).select('+passwordHash');
  } else {
    try {
      // $setOnInsert-like: Google names an account only when it creates one.
      // On a link, the address's owner may have typed their own name at signup,
      // and overwriting it with their Google profile's is not ours to do.
      user = await User.create({ email, googleId, name, emailVerifiedAt: new Date() });
      await dropPendingRegistrations(email);
      return { user: toPublicUser(user), linked: false };
    } catch (error) {
      if (error.code !== DUPLICATE_KEY) throw error;
    }
  }

  if (user) {
    await dropPendingRegistrations(email);
    return { user: toPublicUser(user), linked: true };
  }
  if (retried) throw new HttpError(409, 'บัญชีนี้กำลังถูกแก้ไข ลองเข้าสู่ระบบอีกครั้ง');
  return signInWithGoogle({ googleId, email, emailVerified, name }, { retried: true });
}

// Registrations still waiting for this address can never be confirmed once it
// has a confirmed account, so they go now rather than at the end of their day
const dropPendingRegistrations = (email) => EmailToken.deleteMany({ purpose: 'verify-email', email });

/**
 * A reset link for an address (0042), or nothing: the caller answers the same
 * 202 either way, and sends what this returns after the response (ASVS V6.3.8).
 *
 * - An account, with or without a password: a new reset token, which replaces
 *   any older one. An account with no password (Google only) gets "set a
 *   password" instead of "reset".
 * - No account (or only a registration waiting for its link): nothing is sent.
 *   The same kind of write still happens, so the two take the same time.
 *
 * With byAdmin, an unknown address is a 404: admins may know which accounts
 * exist, and the message says an admin sent it. The admin never sees the token.
 *
 * @returns {Promise<{ kind: 'reset' | 'set', email: string, token: string } | { kind: 'none' }>}
 */
export async function requestPasswordReset({ email, byAdmin = false }) {
  const user = await User.findOne({ email }).select('+passwordHash').lean();
  await EmailToken.deleteMany({ purpose: 'reset-password', email });

  if (!user) {
    if (byAdmin) throw new HttpError(404, 'ไม่มีบัญชีที่ใช้อีเมลนี้');
    // As much work as the branch below, so the answer's timing says nothing
    const padding = await EmailToken.create({
      purpose: 'reset-password',
      email,
      tokenHash: issueToken().tokenHash,
      expiresAt: new Date(Date.now() + RESET_LINK_MS),
    });
    await EmailToken.deleteOne({ _id: padding._id });
    return { kind: 'none' };
  }

  const { token, tokenHash } = issueToken();
  await EmailToken.create({
    purpose: 'reset-password',
    email,
    tokenHash,
    expiresAt: new Date(Date.now() + RESET_LINK_MS),
  });
  return { kind: user.passwordHash ? 'reset' : 'set', email, token };
}

/**
 * Sets a new password with a reset link's token. Every session ends
 * (tokenVersion), and nothing signs in: the person signs in with the new
 * password, so the emailed link alone is never a session (ASVS V6.3.6; the
 * user's decision, 2026-11-22). The link also proves the mailbox, so an address
 * never confirmed becomes confirmed.
 *
 * @returns {Promise<{ email: string }>} Whom to tell that the password changed
 */
export async function resetPassword({ token, password }) {
  const held = await EmailToken.findOne({ purpose: 'reset-password', tokenHash: hashToken(token) });
  if (!held || held.expiresAt <= new Date()) throw resetLinkInvalid();

  const user = await User.findOne({ email: held.email }, { email: 1, name: 1 }).lean();
  if (!user) {
    await EmailToken.deleteOne({ _id: held._id });
    throw resetLinkInvalid();
  }

  // Checked before the link is spent, so a refused password can be replaced
  const problem = passwordProblem(password, { email: user.email, name: user.name });
  if (problem) throw new HttpError(400, 'กรุณาตรวจสอบข้อมูลที่กรอก', { password: problem });

  // Spent in one write, so two uses of the same link can't both set a password
  if (!(await EmailToken.findOneAndDelete({ _id: held._id }))) throw resetLinkInvalid();

  const passwordHash = await hashPassword(password);
  await User.updateOne(
    { _id: user._id },
    { $set: { passwordHash }, $inc: { tokenVersion: 1 }, $min: { emailVerifiedAt: new Date() } },
  );
  await EmailToken.deleteMany({ purpose: 'reset-password', email: user.email });
  return { email: user.email };
}

const resetLinkInvalid = () => linkProblem(400, 'ลิงก์นี้หมดอายุหรือถูกใช้ไปแล้ว ขอลิงก์ตั้งรหัสผ่านใหม่อีกครั้ง', 'LINK_INVALID');

/**
 * Changes the signed-in user's password: the current one, then the new one,
 * which has to pass the policy with the account's own email and name (ASVS
 * V6.2.2, V6.2.3). Every session ends (tokenVersion); the caller signs this
 * browser in again with the user this returns.
 *
 * @returns {Promise<object>} The user, as toPublicUser shapes it, with the new tokenVersion
 */
export async function changePassword({ userId, currentPassword, newPassword }) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw unauthorized();
  if (!user.passwordHash) {
    throw new HttpError(
      400,
      'บัญชีนี้ยังไม่มีรหัสผ่าน ตั้งรหัสผ่านด้วยลิงก์ทางอีเมล',
      undefined,
      'NO_PASSWORD',
    );
  }
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new HttpError(401, 'รหัสผ่านปัจจุบันไม่ถูกต้อง', { currentPassword: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' }, 'WRONG_PASSWORD');
  }

  const problem = passwordProblem(newPassword, { email: user.email, name: user.name });
  if (problem) throw new HttpError(400, 'กรุณาตรวจสอบข้อมูลที่กรอก', { newPassword: problem });

  const updated = await User.findOneAndUpdate(
    { _id: user._id },
    { $set: { passwordHash: await hashPassword(newPassword) }, $inc: { tokenVersion: 1 } },
    { returnDocument: 'after' },
  ).select('+passwordHash');
  return toPublicUser(updated);
}

// Backs requireAuth. Reading the user per request is what makes a deleted
// account stop working before its token expires. The hash is fetched only to
// say whether the account has one (passwordFlag); it never leaves this file.
export async function findUserById(userId) {
  const user = await User.findById(userId).select('+passwordHash');
  return user ? toPublicUser(user) : null;
}
