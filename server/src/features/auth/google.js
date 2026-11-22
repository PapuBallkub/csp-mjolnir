import crypto from 'node:crypto';

import { env, isGoogleConfigured, isProduction } from '#common/config/env.js';
import { HttpError } from '#common/errors/http-error.js';

import { createGoogleKeyStore, googleSignInError, verifyGoogleIdToken } from './google-id-token.js';

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

// A hung connection to Google would otherwise hold the visitor's request open.
const TOKEN_FETCH_TIMEOUT_MS = 10 * 1000;

// RFC 6749 §5.2 allows only these characters in `error` and
// `error_description`: printable ASCII without `"` or `\`. That rules out a
// line break, so a value that fits can't forge a second log line, and it can
// sit inside quotes without escaping.
const OAUTH_ERROR_TEXT = /^[\x20\x21\x23-\x5B\x5D-\x7E]+$/;

// What Google said when it refused the code, for the log only:
// `invalid_grant "<description>"`, just the code, or ''. Google's
// text is outside input, so a value that doesn't fit the RFC's shape is
// dropped, not cleaned. Nothing else in the body is read.
function describeRefusal(body) {
  const code = body?.error;
  if (typeof code !== 'string' || code.length > 64 || !OAUTH_ERROR_TEXT.test(code)) {
    return '';
  }
  const text = body.error_description;
  const fits = typeof text === 'string' && text.length <= 200 && OAUTH_ERROR_TEXT.test(text);
  return fits ? `${code} "${text}"` : code;
}

// ASVS V3.3.1, V3.3.3: In production, enforce __Host- cookie prefix. In dev/test,
// fall back to un-prefixed name because browsers reject __Host- over plain HTTP localhost.
// The name predates the nonce and the PKCE verifier; the cookie now holds all three.
export const OAUTH_STATE_COOKIE = isProduction ? '__Host-mjolnir_oauth_state' : 'mjolnir_oauth_state';
export const LEGACY_OAUTH_STATE_COOKIE = 'mjolnir_oauth_state';

export function getOAuthStateFromRequest(req) {
  if (!req?.cookies) return null;
  // Strictly enforce the active OAUTH_STATE_COOKIE (__Host-mjolnir_oauth_state in production,
  // mjolnir_oauth_state in dev/test). No legacy fallback in production to prevent OAuth state fixation.
  return req.cookies[OAUTH_STATE_COOKIE] || null;
}

// Long enough to pick an account and type a password, short enough that an
// abandoned attempt cannot be resumed later.
const STATE_TTL_MS = 10 * 60 * 1000;

const stateCookieOptions = {
  httpOnly: true,
  secure: isProduction,
  // Lax, not None: the browser comes back from Google as a top-level GET
  // navigation, which Lax allows. It never rides a cross-site POST.
  sameSite: 'lax',
  path: '/',
};

// 32 random bytes as base64url: 43 characters, never a `.`.
const TRANSACTION_PART = /^[A-Za-z0-9_-]{43}$/;
const randomPart = () => crypto.randomBytes(32).toString('base64url');

// One process-wide cache of Google's signing keys.
const getGoogleKey = createGoogleKeyStore();

export function assertGoogleConfigured() {
  if (!isGoogleConfigured) {
    throw new HttpError(503, 'ระบบเข้าสู่ระบบด้วย Google ยังไม่ได้ตั้งค่าบนเซิร์ฟเวอร์นี้');
  }
}

// Three values, random per attempt, kept in one cookie so they expire and clear
// together:
// - `state` is echoed back by Google and compared on return. Without it, anyone
//   can hand a victim a callback URL of their choosing.
// - `nonce` comes back inside the signed ID token, tying the token to this
//   attempt, so a token from another sign-in is refused (ASVS V10.5.1).
// - `codeVerifier` (PKCE, RFC 7636) is hashed into the authorization URL and
//   sent in full only with the code exchange. A code stolen on its way back
//   from Google is useless without it (RFC 9700 §2.1.1).
export function issueOAuthTransaction(res) {
  const transaction = { state: randomPart(), nonce: randomPart(), codeVerifier: randomPart() };
  const value = [transaction.state, transaction.nonce, transaction.codeVerifier].join('.');

  // ASVS V3.3.5: Enforce that combined cookie name and value length do not exceed 4096 bytes
  if (OAUTH_STATE_COOKIE.length + value.length > 4096) {
    throw new Error('OAuth state cookie exceeds maximum 4096 bytes limit');
  }
  res.cookie(OAUTH_STATE_COOKIE, value, { ...stateCookieOptions, maxAge: STATE_TTL_MS });
  return transaction;
}

// `{ state, nonce, codeVerifier }`, or null for a missing cookie or any other
// shape, including the one-part cookie from before the nonce existed.
export function readOAuthTransaction(req) {
  const value = getOAuthStateFromRequest(req);
  if (typeof value !== 'string') {
    return null;
  }

  const parts = value.split('.');
  if (parts.length !== 3 || !parts.every((part) => TRANSACTION_PART.test(part))) {
    return null;
  }

  const [state, nonce, codeVerifier] = parts;
  return { state, nonce, codeVerifier };
}

export function clearOAuthTransaction(res) {
  res.clearCookie(OAUTH_STATE_COOKIE, stateCookieOptions);
  if (OAUTH_STATE_COOKIE !== LEGACY_OAUTH_STATE_COOKIE) {
    res.clearCookie(LEGACY_OAUTH_STATE_COOKIE, stateCookieOptions);
  }
}

// S256, never `plain`: the challenge in the URL must not reveal the verifier.
export function codeChallengeFor(codeVerifier) {
  return crypto.createHash('sha256').update(codeVerifier).digest('base64url');
}

export function createAuthorizationUrl({ state, nonce, codeVerifier }) {
  const params = new URLSearchParams({
    client_id: env.google.clientId,
    // Must match a URI registered in the Google console byte for byte.
    redirect_uri: env.google.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    nonce,
    code_challenge: codeChallengeFor(codeVerifier),
    code_challenge_method: 'S256',
    // Always show the chooser, so a shared machine does not silently sign in as
    // whoever used it last.
    prompt: 'select_account',
  });

  return `${AUTHORIZE_URL}?${params}`;
}

// Trades the one-time code for tokens, verifies the ID token, and returns what
// we need from the profile. Every failure is an HttpError with a `reason`, so
// the callback can always land the visitor on a page.
export async function exchangeCodeForProfile(
  code,
  { nonce, codeVerifier, getKey = getGoogleKey, now = Date.now() },
) {
  let response;
  try {
    response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.google.clientId,
        client_secret: env.google.clientSecret,
        redirect_uri: env.google.redirectUri,
        grant_type: 'authorization_code',
        code_verifier: codeVerifier,
      }),
      signal: AbortSignal.timeout(TOKEN_FETCH_TIMEOUT_MS),
    });
  } catch {
    throw googleSignInError(502, 'token-endpoint-unreachable', 'ติดต่อ Google ไม่ได้ ลองใหม่อีกครั้ง');
  }

  if (!response.ok) {
    // A wrong verifier, a used or expired code, a redirect URI or client
    // secret that doesn't match: all a 400 here, told apart only by Google's
    // `error`, which the callback adds to its log line.
    const error = googleSignInError(400, 'token-endpoint', 'การเข้าสู่ระบบด้วย Google ถูกปฏิเสธ');
    error.refusal = describeRefusal(await response.json().catch(() => null));
    throw error;
  }

  let body;
  try {
    body = await response.json();
  } catch {
    throw googleSignInError(502, 'token-endpoint', 'การเข้าสู่ระบบด้วย Google ถูกปฏิเสธ');
  }

  // Verified even though it came straight from Google over TLS: the signature,
  // issuer, audience, expiry and nonce all have to check out (ASVS V6.8.2).
  const claims = await verifyGoogleIdToken(body?.id_token, {
    clientId: env.google.clientId,
    nonce,
    getKey,
    now,
  });

  return {
    googleId: claims.sub,
    email: claims.email.toLowerCase(),
    emailVerified: claims.email_verified === true,
    // Already in scope: the authorization URL asks for `profile`. Sliced to the
    // schema's ceiling rather than validated, because a name Google gave us is
    // not something a person can fix at this point in the flow.
    name: typeof claims.name === 'string' ? claims.name.trim().slice(0, 80) : '',
  };
}
