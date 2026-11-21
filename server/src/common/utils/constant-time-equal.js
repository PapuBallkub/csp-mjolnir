import crypto from 'node:crypto';

/**
 * Compares two strings without leaking, through timing, how many leading
 * characters match. For values an attacker guesses at, such as an OAuth
 * `state` or `nonce`. Anything that isn't a non-empty string is unequal, so a
 * missing value can never match another missing value.
 *
 * The length check returns early, which reveals only the length. That is fixed
 * and public for every value this compares.
 *
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
export function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) {
    return false;
  }

  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
