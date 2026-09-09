import jwt from 'jsonwebtoken';

import { env, isProduction } from '#common/config/env.js';

export const SESSION_COOKIE = 'mjolnir_session';

const SESSION_TTL_DAYS = 7;
const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

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

// JWT claims are readable without the secret, so the payload is the id and
// nothing else. Anything that changes is read from the database per request.
export function signSessionToken(user) {
  return jwt.sign({}, env.jwtSecret, {
    subject: user.id,
    expiresIn: `${SESSION_TTL_DAYS}d`,
  });
}

// The user id, or null if the token is missing, expired, or not ours.
export function readSessionToken(token) {
  if (!token) {
    return null;
  }

  try {
    return jwt.verify(token, env.jwtSecret).sub;
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
