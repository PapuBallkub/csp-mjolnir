import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import {
  COMMON_PASSWORD_COUNT,
  CONTEXT_WORDS,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  passwordProblem,
} from '../src/features/auth/password-policy.js';

// The rules every new password meets (ADR 0042): length, not a common or
// breached password, and not a word about us or the person, give or take
// digits and symbols at either end.

const ME = { email: 'somchai.w@example.co.th', name: 'Somchai Wongsawat' };

test('the list holds at least the 3,000 ASVS V6.2.4 asks for, all within the policy', () => {
  assert.ok(COMMON_PASSWORD_COUNT >= 3000, `only ${COMMON_PASSWORD_COUNT}`);
  const file = fs.readFileSync(path.join(import.meta.dirname, '../src/features/auth/data/common-passwords.txt'), 'utf8');
  const lines = file.split('\n').filter(Boolean);
  assert.equal(lines.length, COMMON_PASSWORD_COUNT, 'one password per line, each once');
  for (const line of lines) {
    const length = [...line].length;
    assert.ok(length >= MIN_PASSWORD_LENGTH && length <= MAX_PASSWORD_LENGTH, line);
    assert.equal(line, line.toLowerCase(), 'stored lowercased');
  }
});

test('a common or breached password is refused, whatever its case', () => {
  for (const password of ['12345678', 'password', 'PassWord', 'qwertyuiop', '1q2w3e4r5t']) {
    assert.match(passwordProblem(password, ME) ?? '', /ใช้กันทั่วไป/, password);
  }
});

test('a word about us or the person, with digits or symbols around it, is refused', () => {
  for (const password of ['gipdp2026!', 'GIPDP12345', '!!mjolnir!!', 'egp20262026', '2026kasetsart', 'somchai.w123', 'Wongsawat99', '1234somchai']) {
    assert.match(passwordProblem(password, ME) ?? '', /เดาได้ง่าย/, password);
  }
  assert.match(passwordProblem('สมชาย12345', { email: 'a@example.com', name: 'สมชาย ใจดี' }) ?? '', /เดาได้ง่าย/, 'a Thai name word too');
});

test('the match is exact: containing a word is fine (the decision of 2026-11-22)', () => {
  for (const password of ['mygipdpaccount', 'historybuff', 'somchaiwongsawatt', 'kasetsartalumni2026']) {
    assert.equal(passwordProblem(password, ME), null, password);
  }
});

test('length still counts characters, and a long Thai passphrase passes', () => {
  assert.match(passwordProblem('short', ME), /อย่างน้อย 8/);
  assert.match(passwordProblem('ก'.repeat(129), ME), /ไม่เกิน 128/);
  assert.equal(passwordProblem('ก'.repeat(128), ME), null);
  assert.equal(passwordProblem('🔒'.repeat(128), ME), null, 'an emoji counts once');
  assert.equal(passwordProblem('ขอบเขตงานพัฒนาระบบบริหารจัดการข้อมูลภาครัฐ2569', ME), null);
});

test('the context words are the documented list', () => {
  // ADR 0042 lists these; change both together
  assert.deepEqual(CONTEXT_WORDS, ['gipdp', 'mjolnir', 'mjölnir', 'egp', 'e-gp', 'gprocurement', 'procurement', 'kasetsart', 'ku', 'จัดซื้อจัดจ้าง']);
  assert.throws(() => CONTEXT_WORDS.push('x'), 'frozen');
});
