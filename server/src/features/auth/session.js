import jwt from 'jsonwebtoken';

import { env, isProduction } from '#common/config/env.js';

// ASVS V3.3.1, V3.3.3: In production, enforce __Host- cookie prefix. In dev/test,
// fall back to un-prefixed name because browsers reject __Host- over plain HTTP localhost.
export const SESSION_COOKIE = isProduction ? '__Host-mjolnir_session' : 'mjolnir_session';
export const LEGACY_SESSION_COOKIE = 'mjolnir_session';

export function getSessionTokenFromRequest(req) {
  if (!req?.cookies) return null;
  // Strictly enforce the active SESSION_COOKIE (__Host-mjolnir_session in production,
  // mjolnir_session in dev/test). No legacy fallback in production to prevent cookie tossing attacks.
  return req.cookies[SESSION_COOKIE] || null;
}

// Sessions are JWTs that expire within 24 hours (SRS NFR-11, ASVS V7.1.1, V7.3.2)
const SESSION_TTL_HOURS = 24;
const SESSION_TTL_MS = SESSION_TTL_HOURS * 60 * 60 * 1000;

// OWASP ASVS Chapter 9 (Self-contained Tokens) Constants:
// V9.1.2: Enforce permitted algorithm allowlist (symmetric HS256 only, never 'none')
export const SESSION_TOKEN_ALGORITHM = 'HS256';
// V9.2.2: Enforce token type / intended purpose claim
export const SESSION_TOKEN_TYPE = 'session';
// V9.1.3, V9.2.3, V9.2.4: Enforce trusted issuer and audience bounds
export const SESSION_TOKEN_ISSUER = 'mjolnir-api';
export const SESSION_TOKEN_AUDIENCE = 'mjolnir-web';

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
// OWASP ASVS Chapter 9 compliance:
// - V9.1.2: Explicit algorithm allowlist (HS256)
// - V9.2.1: Expiration time span enforced
// - V9.2.2: Token type/purpose claim (typ: 'session')
// - V9.2.3, V9.2.4: Audience ('mjolnir-web') & Issuer ('mjolnir-api') restrictions
export function signSessionToken(user) {
  return jwt.sign(
    {
      v: user.tokenVersion ?? 0,
      typ: SESSION_TOKEN_TYPE,
    },
    env.jwtSecret,
    {
      algorithm: SESSION_TOKEN_ALGORITHM,
      subject: user.id,
      issuer: SESSION_TOKEN_ISSUER,
      audience: SESSION_TOKEN_AUDIENCE,
      expiresIn: `${SESSION_TTL_HOURS}h`,
    }
  );
}

// The session payload ({ userId, tokenVersion }), or null if missing, expired, or not ours.
// OWASP ASVS Chapter 9 validation:
// - V9.1.1: Cryptographic signature verified against secret
// - V9.1.2: Algorithm strictly restricted to allowlist ([HS256]), prevents 'none' or key confusion
// - V9.1.3: Pre-configured secret key used
// - V9.2.1: Expiration and not-before claims verified
// - V9.2.2: Token type/purpose verified against SESSION_TOKEN_TYPE
// - V9.2.3, V9.2.4: Audience and Issuer verified against expected bounds
export function readSessionToken(token) {
  if (!token) {
    return null;
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret, {
      algorithms: [SESSION_TOKEN_ALGORITHM],
      issuer: SESSION_TOKEN_ISSUER,
      audience: SESSION_TOKEN_AUDIENCE,
    });
    if (!payload.sub || payload.typ !== SESSION_TOKEN_TYPE) {
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
  // ASVS V3.3.5: Enforce that combined cookie name and value length do not exceed 4096 bytes
  const combinedLength = SESSION_COOKIE.length + (token?.length ?? 0);
  if (combinedLength > 4096) {
    throw new Error('Session cookie exceeds maximum 4096 bytes limit');
  }
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_TTL_MS });
}

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, cookieOptions);
  if (SESSION_COOKIE !== LEGACY_SESSION_COOKIE) {
    res.clearCookie(LEGACY_SESSION_COOKIE, cookieOptions);
  }
}
