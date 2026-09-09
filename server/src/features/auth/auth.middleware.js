import { unauthorized } from '#common/errors/http-error.js';

import { findUserById } from './auth.service.js';
import { readSessionToken, SESSION_COOKIE, clearSessionCookie } from './session.js';

// Guards a route and hands the handler `req.user`.
//
// It lives here rather than in common/middleware/ because it has to know how a
// session is signed, and the third rule in 0003 is that common/ never imports
// from features/. Other features reach it through #features/auth/index.js.
export async function requireAuth(req, res, next) {
  const userId = readSessionToken(req.cookies?.[SESSION_COOKIE]);

  if (!userId) {
    throw unauthorized('Sign in to continue.');
  }

  const user = await findUserById(userId);

  if (!user) {
    // Our token, unexpired, but the account behind it is gone. Drop the cookie
    // so the browser stops replaying it on every request.
    clearSessionCookie(res);
    throw unauthorized('Sign in to continue.');
  }

  req.user = user;
  next();
}
