import fs from 'node:fs';
import path from 'node:path';

// What every new password must pass: at registration, at reset and at change
// (ADR 0042). Never at sign-in: an old weak password still signs in, and is
// replaced only when its owner changes it.

export const MIN_PASSWORD_LENGTH = 8;
// Characters, not bytes, so a Thai password gets the same room as an English
// one. Nothing is cut off past bcrypt's 72 bytes, because the password is
// pre-hashed first (password.js). The ceiling only bounds the work one request
// can ask for.
export const MAX_PASSWORD_LENGTH = 128;

// The passwords that appear most in public breach compilations, already
// filtered to 8 to 128 characters and lowercased (ASVS V6.2.4, V6.2.12).
// Source and licence: data/common-passwords.LICENSE; rebuilt by
// scripts/build-common-passwords.js. Read once, here.
const COMMON = new Set(
  fs
    .readFileSync(path.join(import.meta.dirname, 'data', 'common-passwords.txt'), 'utf8')
    .split('\n')
    .filter(Boolean),
);

/** How many passwords the list holds; ASVS V6.2.4 asks for at least 3,000. */
export const COMMON_PASSWORD_COUNT = COMMON.size;

/**
 * Words about this platform that make a password easy to guess (ASVS V6.1.2,
 * documented in ADR 0042). A password made of one of these, give or take
 * digits and symbols at either end, is refused, as is one made of the user's
 * own email name or a word of their name.
 */
export const CONTEXT_WORDS = Object.freeze([
  'gipdp',
  'mjolnir',
  'mjölnir',
  'egp',
  'e-gp',
  'gprocurement',
  'procurement',
  'kasetsart',
  'ku',
  'จัดซื้อจัดจ้าง',
]);

// Digits, symbols and spaces at either end; letters and Thai marks stay
const AROUND = /^[^\p{L}\p{M}]+|[^\p{L}\p{M}]+$/gu;

/**
 * What's left of a password once digits and symbols are trimmed from both
 * ends, lowercased: "Gipdp2026!" is "gipdp". The match is exact (the user's
 * decision, 2026-11-22), so "mygipdpaccount" and "history" pass.
 */
const core = (text) => text.toLowerCase().replace(AROUND, '');

const LENGTH_SHORT = `รหัสผ่านต้องมีความยาวอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`;
const LENGTH_LONG = `รหัสผ่านต้องมีความยาวไม่เกิน ${MAX_PASSWORD_LENGTH} ตัวอักษร`;
const COMMON_MESSAGE = 'รหัสผ่านนี้ใช้กันทั่วไปหรือเคยหลุดจากเว็บอื่น เลือกรหัสที่เดายากกว่านี้';
const CONTEXT_MESSAGE = 'รหัสผ่านเดาได้ง่าย เพราะเป็นชื่อระบบ อีเมล หรือชื่อของคุณ ต่อด้วยตัวเลขหรือสัญลักษณ์';

/**
 * Why a new password isn't accepted, as the message to show under the field,
 * or null when it is.
 *
 * @param {string} password
 * @param {{ email?: string, name?: string }} [about] - The account's own words
 * @returns {string | null}
 */
export function passwordProblem(password, { email = '', name = '' } = {}) {
  if (password.length < MIN_PASSWORD_LENGTH) return LENGTH_SHORT;
  // Counted by code point, so an emoji is one character, not two
  if ([...password].length > MAX_PASSWORD_LENGTH) return LENGTH_LONG;

  if (COMMON.has(password.toLowerCase())) return COMMON_MESSAGE;

  const own = [
    ...CONTEXT_WORDS,
    String(email).split('@')[0],
    ...String(name).split(/\s+/),
  ]
    .map(core)
    .filter(Boolean);
  if (own.includes(core(password))) return CONTEXT_MESSAGE;

  return null;
}
