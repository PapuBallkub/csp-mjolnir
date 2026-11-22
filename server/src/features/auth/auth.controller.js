import { env, isProduction } from '#common/config/env.js';
import { HttpError } from '#common/errors/http-error.js';
import { constantTimeEqual } from '#common/utils/constant-time-equal.js';
import { User } from '#models/index.js';

import {
  alreadyRegisteredEmail,
  confirmEmail,
  confirmLink,
  googleLinkedEmail,
  passwordChangedEmail,
  resetEmail,
  resetLink,
  sendAfterResponse,
} from './auth-email.js';
import {
  changePassword,
  confirmRegistration,
  requestPasswordReset,
  requestRegistration,
  resetPassword,
  signInWithGoogle,
  signInWithPassword,
} from './auth.service.js';
import {
  assertGoogleConfigured,
  clearOAuthTransaction,
  createAuthorizationUrl,
  exchangeCodeForProfile,
  issueOAuthTransaction,
  readOAuthTransaction,
} from './google.js';
import {
  parseConfirmation,
  parseCredentials,
  parseForgot,
  parsePasswordChange,
  parseRegistration,
  parseReset,
} from './auth.validation.js';
import {
  clearSessionCookie,
  getSessionTokenFromRequest,
  readSessionToken,
  SESSION_COOKIE,
  setSessionCookie,
  signSessionToken,
} from './session.js';

// What registration answers, whatever the address: new, already registered,
// or waiting for its link. A different answer would tell anyone which
// addresses have accounts (0041, ASVS V6.3.8).
const REGISTRATION_SENT = 'ส่งอีเมลแล้ว ทำตามขั้นตอนในอีเมลเพื่อเริ่มใช้งาน';

/**
 * Registering no longer signs you in, and creates no account: it sends a link
 * to the address, and the account exists once the link is opened and the
 * password typed again (0041). So someone who types a stranger's address gets
 * nothing they can sign in to.
 *
 * @param {{ configured: boolean, send: Function }} mail - How email goes out (app.js)
 */
export function createRegisterHandler(mail) {
  return async function register(req, res) {
    const { email, password, name } = parseRegistration(req.body);

    // Production can't confirm an address without mail, so it doesn't pretend
    // to: Google sign-in still works. Development prints the link instead.
    if (!mail.configured && isProduction) {
      throw new HttpError(503, 'ตอนนี้ยังสมัครด้วยอีเมลไม่ได้ ลองเข้าสู่ระบบด้วย Google', undefined, 'SIGNUP_UNAVAILABLE');
    }

    const outcome = await requestRegistration({
      email,
      password,
      name,
      // FR08 consent. Absent means no, so a missing field never becomes a signup.
      notificationConsent: req.body?.notificationConsent === true,
    });

    res.status(202).json({ message: REGISTRATION_SENT });

    if (outcome.kind === 'confirm') {
      sendAfterResponse(mail, confirmEmail(outcome.email, outcome.token), { link: confirmLink(outcome.token) });
    } else {
      sendAfterResponse(mail, alreadyRegisteredEmail(outcome.email));
    }
  };
}

// The link's page posts the token and the password chosen at sign-up; a match
// creates the account and signs it in, so there is no second step
export async function verifyEmail(req, res) {
  const { token, password } = parseConfirmation(req.body);
  const user = await confirmRegistration({ token, password });

  setSessionCookie(res, signSessionToken(user));
  res.json({ user });
}

// What a reset request answers, whatever the address (0042, ASVS V6.3.8)
const RESET_SENT = 'ถ้ามีบัญชีที่ใช้อีเมลนี้ เราได้ส่งลิงก์ตั้งรหัสผ่านใหม่ไปแล้ว';

// Reset links need mail as confirm links do; without it, production says so
function assertMail(mail) {
  if (!mail.configured && isProduction) {
    throw new HttpError(503, 'ตอนนี้ยังส่งลิงก์ทางอีเมลไม่ได้ ลองเข้าสู่ระบบด้วย Google', undefined, 'MAIL_UNAVAILABLE');
  }
}

/**
 * Asks for a reset link (ASVS V6.4.3). The same 202 for every address; only an
 * address with an account gets mail (0042).
 */
export function createForgotHandler(mail) {
  return async function forgotPassword(req, res) {
    const { email } = parseForgot(req.body);
    assertMail(mail);
    const outcome = await requestPasswordReset({ email });
    res.status(202).json({ message: RESET_SENT });
    if (outcome.kind !== 'none') {
      sendAfterResponse(mail, resetEmail(outcome.email, outcome.token, { kind: outcome.kind }), { link: resetLink(outcome.token) });
    }
  };
}

/**
 * Sets a new password with a reset link. Every session ends, this browser's
 * cookie is cleared, and nothing signs in: the person signs in with the new
 * password (the user's decision, 2026-11-22; ASVS V6.3.6). The owner is told.
 */
export function createResetHandler(mail) {
  return async function resetPasswordHandler(req, res) {
    const { token, password } = parseReset(req.body);
    const { email } = await resetPassword({ token, password });
    clearSessionCookie(res);
    res.json({ message: 'ตั้งรหัสผ่านใหม่แล้ว เข้าสู่ระบบด้วยรหัสผ่านใหม่ได้เลย' });
    sendAfterResponse(mail, passwordChangedEmail(email));
  };
}

/**
 * Changes the signed-in user's password (ASVS V6.2.2, V6.2.3). Every other
 * session ends; this browser gets a new cookie, so it stays signed in. The
 * owner is told (V6.3.7).
 */
export function createPasswordChangeHandler(mail) {
  return async function changePasswordHandler(req, res) {
    const { currentPassword, newPassword } = parsePasswordChange(req.body);
    const user = await changePassword({ userId: req.user.id, currentPassword, newPassword });
    setSessionCookie(res, signSessionToken(user));
    res.json({ user });
    sendAfterResponse(mail, passwordChangedEmail(user.email));
  };
}

/**
 * An admin sends a user a reset link (ASVS V6.4.6). The admin names the
 * address and nothing else: no password can be set or chosen here, and the
 * response carries no link. Mounted by the admin router, behind its guard.
 */
export function createAdminPasswordResetHandler(mail) {
  return async function adminPasswordReset(req, res) {
    const { email } = parseForgot(req.body);
    assertMail(mail);
    const outcome = await requestPasswordReset({ email, byAdmin: true });
    res.status(202).json({ message: 'ส่งลิงก์ตั้งรหัสผ่านไปที่อีเมลของผู้ใช้แล้ว' });
    sendAfterResponse(
      mail,
      resetEmail(outcome.email, outcome.token, { kind: outcome.kind, byAdmin: true }),
      { link: resetLink(outcome.token) },
    );
  };
}

export async function login(req, res) {
  const { email, password } = parseCredentials(req.body);
  const user = await signInWithPassword({ email, password });

  setSessionCookie(res, signSessionToken(user));
  res.json({ user });
}

// Succeeds whether or not anyone was signed in. A logout that can fail leaves
// someone signed in on a shared machine.
export async function logout(req, res) {
  // ASVS V7.4.1, V14.3.1: Command browser to clear storage, cache, and cookies
  res.set('Clear-Site-Data', '"cache", "cookies", "storage"');

  const token = getSessionTokenFromRequest(req);
  const session = readSessionToken(token);
  if (session?.userId) {
    // ASVS V7.4.1: Invalidate active tokens by bumping tokenVersion
    await User.updateOne({ _id: session.userId }, { $inc: { tokenVersion: 1 } }).catch(() => {});
  }

  clearSessionCookie(res);
  res.status(204).end();
}

export function readCurrentUser(req, res) {
  res.json({ user: req.user });
}

export function startGoogleSignIn(req, res) {
  assertGoogleConfigured();
  res.redirect(createAuthorizationUrl(issueOAuthTransaction(res)));
}

// The browser is mid-navigation here, so a failure has to land the person on a
// page rather than on a JSON error body.
export function createGoogleCallbackHandler(mail) {
  return (req, res) => completeGoogleSignIn(req, res, mail);
}

async function completeGoogleSignIn(req, res, mail) {
  assertGoogleConfigured();

  const { code, state } = req.query;
  const transaction = readOAuthTransaction(req);
  // Cleared whatever happens next: each attempt's values work once.
  clearOAuthTransaction(res);

  // A repeated parameter arrives as an array, so both must be strings.
  if (
    typeof code !== 'string' ||
    !code ||
    !transaction ||
    !constantTimeEqual(state, transaction.state)
  ) {
    return res.redirect(`${env.corsOrigin}/?auth=failed`);
  }

  try {
    const profile = await exchangeCodeForProfile(code, {
      nonce: transaction.nonce,
      codeVerifier: transaction.codeVerifier,
    });
    const { user, linked } = await signInWithGoogle(profile);
    setSessionCookie(res, signSessionToken(user));
    res.redirect(env.corsOrigin);
    // The account existed before this Google account joined it: tell its owner
    if (linked) sendAfterResponse(mail, googleLinkedEmail(user.email));
  } catch (error) {
    // Every expected failure (Google unreachable, a rejected code, a token that
    // fails a check, an unverified address) is an HttpError. Anything else is a
    // bug, and should surface as one.
    if (!(error instanceof HttpError)) {
      throw error;
    }

    // The reason belongs in the log, not in the URL bar, followed by what Google
    // said when it refused the code. Never the token, never the address.
    const why = [error.reason, error.refusal].filter(Boolean).join(': ');
    const reason = why ? ` (${why})` : '';
    console.warn(`Google sign-in failed: ${error.message}${reason}`);
    res.redirect(`${env.corsOrigin}/?auth=failed`);
  }
}
