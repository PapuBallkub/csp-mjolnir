import { forbidden, unauthorized } from '#common/errors/http-error.js';
import { securityEvent } from '#common/logging/security-log.js';

import { findUserById } from './auth.service.js';
import { readSessionToken, getSessionTokenFromRequest, clearSessionCookie } from './session.js';

// Guards a route and hands the handler `req.user`.
//
// It lives here rather than in common/middleware/ because it has to know how a
// session is signed, and the third rule in 0003 is that common/ never imports
// from features/. Other features reach it through #features/auth/index.js.
export async function requireAuth(req, res, next) {
  // ASVS V14.3.2, V14.2.2: Prevent intermediate caches and browsers from caching sensitive authenticated data
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');

  const token = getSessionTokenFromRequest(req);
  const session = readSessionToken(token);

  if (!session?.userId) {
    // Logged only when a cookie came and failed (ASVS V16.3.1). No cookie at
    // all is every signed-out visitor: the client asks /me on every page load.
    if (token) securityEvent(req, 'auth.session.rejected', { reason: 'invalid' });
    throw unauthorized('กรุณาเข้าสู่ระบบเพื่อดำเนินการต่อ');
  }

  const user = await findUserById(session.userId);

  // ASVS V7.4.1: If account is deleted or tokenVersion does not match (session was revoked on logout),
  // reject immediately and clear the cookie.
  if (!user || (user.tokenVersion ?? 0) !== session.tokenVersion) {
    securityEvent(req, 'auth.session.rejected', {
      reason: user ? 'revoked' : 'account_gone',
      userId: session.userId,
    });
    clearSessionCookie(res);
    throw unauthorized('กรุณาเข้าสู่ระบบเพื่อดำเนินการต่อ');
  }

  req.user = user;
  next();
}

// Narrows a route to particular roles. Mount it AFTER requireAuth:
//
//   router.get('/sources', requireAuth, requireRole('admin'), readSources);
//
// Mounted before, req.user is undefined and this throws 401 on every request,
// including an admin's.
//
// It reads req.user.role, which is whatever toPublicUser returned, so the two
// have to stay in step. There is no production caller yet: the admin routes
// arrive with FR14/FR15, and the expensive half of this change is the field on
// the model, not the ten lines here. See 0011.
export function requireRole(...roles) {
  return function requireRoleMiddleware(req, res, next) {
    if (!req.user) {
      throw unauthorized('กรุณาเข้าสู่ระบบเพื่อดำเนินการต่อ');
    }

    if (!roles.includes(req.user.role)) {
      // ASVS V16.3.2: a signed-in account asking for what its role doesn't allow
      securityEvent(req, 'authz.denied', {
        userId: req.user.id,
        role: req.user.role,
        required: roles.join(','),
      });
      throw forbidden('พื้นที่นี้สำหรับผู้ดูแลระบบเท่านั้น');
    }

    next();
  };
}
