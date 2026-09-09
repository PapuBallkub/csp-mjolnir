import jwt from 'jsonwebtoken';

import { env, isProduction } from '#common/config/env.js';

export const SESSION_COOKIE = 'mjolnir_session';

const SESSION_TTL_DAYS = 7;
const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

// A cookie is cleared by matching the attributes it was set with, not by name
// alone. Sharing one object is what stops a logout from leaving the browser
// holding a live session because `path` drifted between the two call sites.
const cookieOptions = {
  // The browser will not hand this to JavaScript, so a script injected into the
  // client cannot read the session out and post it somewhere. This is the whole
  // reason the token lives in a cookie rather than in localStorage.
  httpOnly: true,
  secure: isProduction,
  // In development the client (:3000) and the API (:8000) differ only by port,
  // which is same-site, so Lax sends the cookie. A deployment that splits them
  // across domains — Vercel and a separate API host — is cross-site, where
  // nothing but None will be sent at all.
  sameSite: isProduction ? 'none' : 'lax',
  path: '/',
};

export function signSessionToken(user) {
  // The payload carries nothing but the subject. Anyone can read a JWT's claims
  // without the secret — the signature stops them being forged, not seen — so
  // the id is the one thing worth putting in, and everything else is read from
  // the database at request time where it is also current.
  return jwt.sign({}, env.jwtSecret, {
    subject: user.id,
    expiresIn: `${SESSION_TTL_DAYS}d`,
  });
}

// Returns the user id the token vouches for, or null if it is missing, expired,
// tampered with, or signed by a different secret. The caller gets one answer to
// check instead of a try/catch around every use.
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
