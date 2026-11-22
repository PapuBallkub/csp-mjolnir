import crypto from 'node:crypto';

import bcrypt from 'bcryptjs';

import { env } from '#common/config/env.js';

// Cost per guess, for us as well as an attacker. An old hash carries its own
// cost inside the string, so this can be raised without breaking existing users.
const WORK_FACTOR = 12;

// bcrypt reads only the first 72 bytes, which is 24 Thai characters. So the
// password goes through HMAC-SHA384 first, and bcrypt gets the result:
// - an HMAC keyed with PASSWORD_PEPPER, not a plain hash, so hashes leaked from
//   another site can't be tested against ours without the pepper;
// - SHA-384, because its 48 bytes are 64 characters of base64, inside the 72.
//   SHA-512's would be 88, and bcrypt would cut them again;
// - base64, not raw bytes, because some bcrypt versions stop at a zero byte.
// See docs/decisions/0039.
export function prehash(password, pepper = env.passwordPepper) {
  return crypto.createHmac('sha384', pepper).update(password, 'utf8').digest('base64');
}

export function hashPassword(password) {
  return bcrypt.hash(prehash(password), WORK_FACTOR);
}

export function verifyPassword(password, hash) {
  return bcrypt.compare(prehash(password), hash);
}
