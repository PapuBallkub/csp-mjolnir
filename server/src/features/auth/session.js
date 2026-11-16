import jwt from 'jsonwebtoken';

import { env, isProduction } from '#common/config/env.js';

export const SESSION_COOKIE = 'mjolnir_session';

// Sessions are JWTs that expire within 24 hours (SRS NFR-11, ASVS V7.1.1, V7.3.2)
const SESSION_TTL_HOURS = 24;
const SESSION_TTL_MS = SESSION_TTL_HOURS * 60 * 60 * 1000;

// Shared, because a cookie is cleared by matching the attributes it was set
// with. If these two drift apart, logout stops working.
const cookieOptions = {
  // Unreadable from JavaScript, so an XSS in the client cannot steal a session.
  httpOnly: true,
  secure: isProduction,
  // Dev is same-site (:3000 and :8000), so Lax is sent. A deploy that splits the
  // client and API across domains is cross-site, where only None is sent at all.
  sameSite: isProduction ? 'none' : 'lax',
  path: '/',
};

// JWT claims are readable without the secret, so the payload contains the
// user id and tokenVersion (ASVS V7.4.1). Anything else is read per request.
export function signSessionToken(user) {
  return jwt.sign({ v: user.tokenVersion ?? 0 }, env.jwtSecret, {
    subject: user.id,
    expiresIn: `${SESSION_TTL_HOURS}h`,
  });
}

// The session payload ({ userId, tokenVersion }), or null if missing, expired, or not ours.
export function readSessionToken(token) {
  if (!token) {
    return null;
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret);
    if (!payload.sub) {
      return null;
    }
    return {
      userId: payload.sub,
      tokenVersion: payload.v ?? 0,
    };
  } catch {
    return null;
  }
}

export function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_TTL_MS });
}

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, cookieOptions);
}
