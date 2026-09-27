import { forbidden, unauthorized } from '#common/errors/http-error.js';

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

// Narrows a route to particular roles. Mount it AFTER requireAuth:
//
//   router.get('/sources', requireAuth, requireRole('admin'), readSources);
//
// Mounted before, req.user is undefined and this throws 401 on every request,
// including an admin's — the same ordering trap limitByUser warns about in
// common/middleware/rate-limit.js.
//
// It reads req.user.role, which is whatever toPublicUser returned, so the two
// have to stay in step. There is no production caller yet: the admin routes
// arrive with FR14/FR15, and the expensive half of this change is the field on
// the model, not the ten lines here. See 0011.
export function requireRole(...roles) {
  return function requireRoleMiddleware(req, res, next) {
    if (!req.user) {
      throw unauthorized('Sign in to continue.');
    }

    if (!roles.includes(req.user.role)) {
      throw forbidden('This area is for administrators.');
    }

    next();
  };
}
