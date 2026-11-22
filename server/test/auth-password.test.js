// The pre-hash on its own, with no database: what bcrypt is handed, and that
// the pepper decides it. The routes that use it are tested in auth.test.js.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import bcrypt from 'bcryptjs';

import { hashPassword, prehash, verifyPassword } from '../src/features/auth/password.js';

const PEPPER = 'test-pepper-test-pepper-test-pepper';
const OTHER_PEPPER = 'another-pepper-another-pepper-another';

test('prehash is HMAC-SHA384 in base64, checked against RFC 4231', () => {
  // RFC 4231 §4.3, test case 2: key "Jefe". Compared with the RFC's published
  // value, not with our own output, so swapping the hash or the encoding fails.
  const expected = Buffer.from(
    'af45d2e376484031617f78d2b58a6b1b9c7ef464f5a01b47e42ec3736322445e8e2240ca5e69e2c78b3239ecfab21649',
    'hex',
  ).toString('base64');
  assert.equal(prehash('what do ya want for nothing?', 'Jefe'), expected);
});

test('prehash always gives 64 base64 characters, inside bcrypt’s 72 bytes', () => {
  // Short, Thai, emoji, and far past 72 bytes: the output never changes shape,
  // and plain ASCII means no zero byte for bcrypt to stop at.
  for (const password of ['correct horse', 'กขคง'.repeat(32), '🔒'.repeat(128), 'a'.repeat(1000)]) {
    assert.match(prehash(password, PEPPER), /^[A-Za-z0-9+/]{64}$/);
  }
});

test('the pepper decides the pre-hash', () => {
  assert.equal(prehash('correct horse', PEPPER), prehash('correct horse', PEPPER));
  assert.notEqual(prehash('correct horse', PEPPER), prehash('correct horse', OTHER_PEPPER));
});

test('a hash made with another pepper does not verify', async () => {
  // As if the database were restored next to a different PASSWORD_PEPPER.
  // Cost 4 keeps the test fast; the cost is read from the hash itself.
  const foreign = await bcrypt.hash(prehash('correct horse', OTHER_PEPPER), 4);
  assert.equal(await verifyPassword('correct horse', foreign), false);

  const own = await hashPassword('correct horse');
  assert.equal(await verifyPassword('correct horse', own), true);
});
