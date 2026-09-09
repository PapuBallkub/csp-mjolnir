import { unauthorized } from '#common/errors/http-error.js';

import { findUserById } from './auth.service.js';
import { readSessionToken, SESSION_COOKIE, clearSessionCookie } from './session.js';

// Guards a route that needs a signed-in user, and hands the handler downstream
// `req.user` in the same public shape every auth response returns.
//
// This lives in the feature and not in common/middleware/ on purpose: it has to
// know how a session is signed and where the user is stored, and 0003's third
// rule is that common/ never imports from features/. Other features reach it
// through #features/auth/index.js.
export async function requireAuth(req, res, next) {
  const userId = readSessionToken(req.cookies?.[SESSION_COOKIE]);

  if (!userId) {
    throw unauthorized('Sign in to continue.');
  }

  const user = await findUserById(userId);

  if (!user) {
    // Signed by us and unexpired, but the account behind it is gone. Dropping
    // the cookie here stops the browser replaying a token that can never
    // succeed again on every subsequent request.
    clearSessionCookie(res);
    throw unauthorized('Sign in to continue.');
  }

  req.user = user;
  next();
}
