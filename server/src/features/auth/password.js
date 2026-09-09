import bcrypt from 'bcryptjs';

// Work factor. Every step up doubles the time an attacker needs per guess and
// the time our own login takes, so it is a budget, not a score: 12 keeps a
// bcryptjs hash in the low hundreds of milliseconds, which nobody notices on a
// form submit and which makes an offline dictionary run against a stolen dump
// expensive. Raising it later is safe — an old hash carries its own cost inside
// the string, so existing users keep verifying against theirs.
const WORK_FACTOR = 12;

// bcrypt only looks at the first 72 bytes and silently ignores the rest. Left
// unchecked that turns a long passphrase into a shorter one without telling
// anyone, so validation rejects anything longer rather than truncating it here.
export const MAX_PASSWORD_BYTES = 72;

export function hashPassword(password) {
  return bcrypt.hash(password, WORK_FACTOR);
}

export function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}
