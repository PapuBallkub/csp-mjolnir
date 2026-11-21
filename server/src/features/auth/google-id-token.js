// Checks a Google ID token before anything in it is believed, and keeps the
// public keys Google signs with. OpenID Connect Core §3.1.3.7 lists the checks;
// ASVS V6.8.2 asks for the signature, V10.5.1 for the nonce and V10.5.4 for the
// audience.
//
// Nothing here reads the environment or the network on its own: the client ID,
// the nonce, the key lookup and the clock are all passed in, so tests can sign
// their own tokens with keys they generate.

import crypto from 'node:crypto';

import jwt from 'jsonwebtoken';

import { HttpError } from '#common/errors/http-error.js';
import { constantTimeEqual } from '#common/utils/constant-time-equal.js';

// Google uses both spellings (OIDC Core §3.1.3.7, point 2).
export const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

// Fixed, like the authorize and token URLs in google.js: no discovery document,
// so nothing fetched at runtime can point us at another key set.
export const GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

// Google signs ID tokens with RS256 only (its discovery document says so).
// Pinning it rules out `none` and the HS256 trick, where a token is "signed"
// with the public key used as an HMAC secret.
const ALGORITHM = 'RS256';

// Our clock and Google's may disagree a little; a minute is plenty.
const CLOCK_TOLERANCE_SECONDS = 60;

const KEYS_DEFAULT_MAX_AGE_MS = 60 * 60 * 1000;
const KEYS_MAX_AGE_CEILING_MS = 24 * 60 * 60 * 1000;
// At most one key fetch a minute. A burst of tokens with made-up `kid`s must not
// become a burst of requests to Google.
const KEYS_MIN_REFETCH_MS = 60 * 1000;
const KEYS_FETCH_TIMEOUT_MS = 10 * 1000;

// Thai like every HttpError message, though the callback turns any failure into
// a redirect, so in practice only the server log sees it, next to the reason.
const REJECTED_MESSAGE = 'ยืนยันตัวตนกับ Google ไม่สำเร็จ';

/**
 * An HttpError that also carries a short English `reason` for the log. The
 * reason never includes the token or anything read from it.
 */
export function googleSignInError(status, reason, message = REJECTED_MESSAGE) {
  const error = new HttpError(status, message);
  error.reason = reason;
  return error;
}

const rejected = (reason) => googleSignInError(400, reason);

// jsonwebtoken's errors, reduced to a word that's safe to log. Its messages are
// safe too, but "jwt audience invalid. expected: <client id>" says more than a
// log needs.
function reasonFor(error) {
  if (error?.name === 'TokenExpiredError') return 'expired';
  if (error?.name === 'NotBeforeError') return 'not-yet-valid';

  const message = String(error?.message ?? '');
  if (message.startsWith('jwt audience invalid')) return 'audience';
  if (message.startsWith('jwt issuer invalid')) return 'issuer';
  if (message === 'invalid signature' || message === 'jwt signature is required') return 'signature';
  if (message === 'invalid algorithm') return 'algorithm';
  if (message === 'jwt malformed' || message === 'invalid token') return 'malformed';
  return 'invalid';
}

/**
 * Verifies a Google ID token and returns its claims.
 *
 * @param {string} idToken
 * @param {object} options
 * @param {string} options.clientId our OAuth client ID; the token must be for it
 * @param {string} options.nonce the nonce we sent with this sign-in
 * @param {(kid: string) => Promise<crypto.KeyObject | null>} options.getKey
 * @param {number} [options.now] milliseconds since the epoch
 * @returns {Promise<object>} the verified claims
 * @throws {HttpError} 400 with a `reason`, or whatever `getKey` throws
 */
export async function verifyGoogleIdToken(idToken, { clientId, nonce, getKey, now = Date.now() }) {
  // Fail closed on our own side first. jsonwebtoken skips the audience check
  // when `audience` is empty, so an unset client ID would accept any app's token.
  if (typeof clientId !== 'string' || !clientId) {
    throw rejected('no-client-id');
  }
  if (typeof nonce !== 'string' || !nonce) {
    throw rejected('nonce');
  }
  if (typeof idToken !== 'string' || !idToken) {
    throw rejected('missing');
  }

  // Decoded only to read the header. Nothing in it is trusted until the
  // signature checks out against a key we fetched from Google ourselves.
  const decoded = jwt.decode(idToken, { complete: true });
  if (!decoded || typeof decoded.header !== 'object') {
    throw rejected('malformed');
  }

  const { alg, kid } = decoded.header;
  if (alg !== ALGORITHM) {
    throw rejected('algorithm');
  }
  if (typeof kid !== 'string' || !kid) {
    throw rejected('unknown-key');
  }

  const key = await getKey(kid);
  if (!key) {
    throw rejected('unknown-key');
  }

  let claims;
  try {
    claims = jwt.verify(idToken, key, {
      algorithms: [ALGORITHM],
      issuer: GOOGLE_ISSUERS,
      audience: clientId,
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
      clockTimestamp: Math.floor(now / 1000),
    });
  } catch (error) {
    throw rejected(reasonFor(error));
  }

  // jsonwebtoken checks `exp` only when it is there. A Google token always has
  // one, so a token without it isn't Google's.
  if (typeof claims.exp !== 'number') {
    throw rejected('expired');
  }

  // With several audiences, `azp` names the one the token was issued to; when
  // present at all it must be us (OIDC Core §3.1.3.7, points 4 and 5).
  // jsonwebtoken passes an `aud` array if any entry matches, so this is ours.
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (audiences.length > 1 && claims.azp === undefined) {
    throw rejected('azp');
  }
  if (claims.azp !== undefined && claims.azp !== clientId) {
    throw rejected('azp');
  }

  // Ties the token to the sign-in this browser started. A token replayed from
  // another sign-in carries another nonce (V10.5.1).
  if (!constantTimeEqual(claims.nonce, nonce)) {
    throw rejected('nonce');
  }

  if (typeof claims.sub !== 'string' || !claims.sub) {
    throw rejected('claims');
  }
  if (typeof claims.email !== 'string' || !claims.email) {
    throw rejected('claims');
  }

  return claims;
}

// How long Google says the key set is good for, kept between a minute and a day.
function maxAgeMs(cacheControl) {
  const match = /max-age=(\d+)/i.exec(cacheControl ?? '');
  if (!match) {
    return KEYS_DEFAULT_MAX_AGE_MS;
  }
  return Math.min(Math.max(Number(match[1]) * 1000, KEYS_MIN_REFETCH_MS), KEYS_MAX_AGE_CEILING_MS);
}

// Only keys fit to check an RS256 signature. A key we can't import is skipped,
// not fatal: one odd entry shouldn't stop sign-in with the others.
function importKeys(body) {
  const keys = new Map();

  for (const jwk of Array.isArray(body?.keys) ? body.keys : []) {
    if (jwk?.kty !== 'RSA' || jwk.use !== 'sig' || jwk.alg !== ALGORITHM) continue;
    if (typeof jwk.kid !== 'string' || !jwk.kid) continue;

    try {
      keys.set(jwk.kid, crypto.createPublicKey({ key: jwk, format: 'jwk' }));
    } catch {
      // Not a usable RSA key.
    }
  }

  return keys;
}

const keysUnavailable = () =>
  googleSignInError(502, 'keys-unavailable', 'ติดต่อ Google เพื่อยืนยันตัวตนไม่ได้ ลองใหม่อีกครั้ง');

/**
 * Google's public signing keys, fetched on first use and cached for as long as
 * Google's `Cache-Control: max-age` says.
 *
 * - A `kid` we don't have (Google rotated its keys) refetches once, at most once
 *   a minute across all callers, then gives null.
 * - A failed fetch throws a 502 with reason `keys-unavailable`, and blocks
 *   another try for a minute.
 * - Callers that arrive while a fetch is running wait for that one fetch.
 *
 * @param {object} [options]
 * @param {typeof fetch} [options.fetch] read at call time, so tests can mock it
 * @param {() => number} [options.now]
 * @returns {(kid: string) => Promise<crypto.KeyObject | null>}
 */
export function createGoogleKeyStore({
  fetch: fetchKeys = (...args) => globalThis.fetch(...args),
  now = () => Date.now(),
} = {}) {
  let keys = new Map();
  let expiresAt = 0;
  let lastFetchAt = -Infinity;
  let pending = null;

  async function load() {
    lastFetchAt = now();

    let response;
    try {
      response = await fetchKeys(GOOGLE_CERTS_URL, {
        signal: AbortSignal.timeout(KEYS_FETCH_TIMEOUT_MS),
      });
    } catch {
      throw keysUnavailable();
    }
    if (response.status !== 200) {
      throw keysUnavailable();
    }

    let body;
    try {
      body = await response.json();
    } catch {
      throw keysUnavailable();
    }

    const fresh = importKeys(body);
    if (fresh.size === 0) {
      throw keysUnavailable();
    }

    keys = fresh;
    expiresAt = now() + maxAgeMs(response.headers.get('cache-control'));
  }

  function refresh() {
    pending ??= load().finally(() => {
      pending = null;
    });
    return pending;
  }

  return async function getKey(kid) {
    const current = now() < expiresAt;
    if (current && keys.has(kid)) {
      return keys.get(kid);
    }

    // A fetch already running counts as this caller's fetch.
    const mayFetch = pending !== null || now() - lastFetchAt >= KEYS_MIN_REFETCH_MS;
    if (!current) {
      // Nothing usable cached. Within a minute of the last fetch, that fetch
      // failed: say so again rather than ask Google again.
      if (!mayFetch) {
        throw keysUnavailable();
      }
      await refresh();
    } else if (mayFetch) {
      // Cached, but not this key: Google may have rotated.
      await refresh();
    }

    return keys.get(kid) ?? null;
  };
}
