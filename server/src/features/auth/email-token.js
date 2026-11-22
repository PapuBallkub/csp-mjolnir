import crypto from 'node:crypto';

// 32 random bytes as base64url: 43 characters, 256 bits from the operating
// system's CSPRNG (ASVS V11.5.1). Long enough that guessing one is hopeless,
// so a token needs no rate limit of its own beyond the route's.
const TOKEN_BYTES = 32;

/** What a token looks like. Anything else is refused before any lookup. */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** How a token is stored: its SHA-256, never the token. */
export function hashToken(token) {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * A new token, and the hash to store for it. The token goes into one email
 * and nowhere else: not the database, not a log.
 *
 * @returns {{ token: string, tokenHash: string }}
 */
export function issueToken() {
  const token = crypto.randomBytes(TOKEN_BYTES).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}
