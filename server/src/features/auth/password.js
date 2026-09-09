import bcrypt from 'bcryptjs';

// Cost per guess, for us as well as an attacker. An old hash carries its own
// cost inside the string, so this can be raised without breaking existing users.
const WORK_FACTOR = 12;

// bcrypt silently ignores anything past 72 bytes. Validation rejects instead, so
// a long passphrase never becomes a shorter one without telling anyone.
export const MAX_PASSWORD_BYTES = 72;

export function hashPassword(password) {
  return bcrypt.hash(password, WORK_FACTOR);
}

export function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}
