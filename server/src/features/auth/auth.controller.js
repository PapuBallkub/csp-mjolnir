import { env } from '#common/config/env.js';
import { HttpError } from '#common/errors/http-error.js';
import { User } from '#models/index.js';

import { registerWithPassword, signInWithGoogle, signInWithPassword } from './auth.service.js';
import {
  assertGoogleConfigured,
  clearState,
  createAuthorizationUrl,
  exchangeCodeForProfile,
  issueState,
  OAUTH_STATE_COOKIE,
} from './google.js';
import { parseCredentials, parseRegistration } from './auth.validation.js';
import { clearSessionCookie, readSessionToken, SESSION_COOKIE, setSessionCookie, signSessionToken } from './session.js';

// Registering signs you in: the password was just chosen by whoever owns the
// account, so a second form asking for it again proves nothing.
export async function register(req, res) {
  const { email, password, name } = parseRegistration(req.body);

  const user = await registerWithPassword({
    email,
    password,
    name,
    // FR08 consent. Absent means no, so a missing field never becomes a signup.
    notificationConsent: req.body?.notificationConsent === true,
  });

  setSessionCookie(res, signSessionToken(user));
  res.status(201).json({ user });
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

  const token = req.cookies?.[SESSION_COOKIE];
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
  res.redirect(createAuthorizationUrl(issueState(res)));
}

// The browser is mid-navigation here, so a failure has to land the person on a
// page rather than on a JSON error body.
export async function completeGoogleSignIn(req, res) {
  assertGoogleConfigured();

  const { code, state } = req.query;
  const expected = req.cookies?.[OAUTH_STATE_COOKIE];
  clearState(res);

  if (!code || !state || !expected || state !== expected) {
    return res.redirect(`${env.corsOrigin}/?auth=failed`);
  }

  try {
    const user = await signInWithGoogle(await exchangeCodeForProfile(code));
    setSessionCookie(res, signSessionToken(user));
    res.redirect(env.corsOrigin);
  } catch (error) {
    if (!(error instanceof HttpError)) {
      throw error;
    }

    // The reason belongs in the log, not in the URL bar.
    console.warn(`Google sign-in failed: ${error.message}`);
    res.redirect(`${env.corsOrigin}/?auth=failed`);
  }
}
