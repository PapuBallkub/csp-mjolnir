// Changing and resetting a password, and an admin sending a reset link
// (ADR 0042), through the real routes. Mail goes to a recorder: nothing is sent.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import bcrypt from 'bcryptjs';

import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { EmailToken, User } from '#models/index.js';

import { createApp } from '../src/app.js';
import { createMailRecorder, createVerifiedUser, signInCookie, tokenFrom } from './helpers/accounts.js';

const TEST_DB = 'mjolnir_test';
const PASSWORD = 'correct horse battery';
const NEW_PASSWORD = 'a fresh pair of shoes';

const runId = crypto.randomUUID().slice(0, 8);
const emailFor = (name) => `${name}-${runId}@example.test`;

const UNLIMITED = { windowMs: 60_000, limit: 10_000 };
const NO_RATE_LIMITS = {
  loginByIp: UNLIMITED,
  loginByEmail: UNLIMITED,
  registerByIp: UNLIMITED,
  registerByEmail: UNLIMITED,
  verifyByIp: UNLIMITED,
  forgotByIp: UNLIMITED,
  forgotByEmail: UNLIMITED,
  resetByIp: UNLIMITED,
  passwordChangeByUser: UNLIMITED,
};

const mail = createMailRecorder();
let server;
let baseUrl;

before(async () => {
  await connectDatabase({ dbName: TEST_DB });
  server = createApp({ rateLimits: NO_RATE_LIMITS, apiRateLimits: { adminCostly: UNLIMITED }, mail }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://localhost:${server.address().port}`;
});

after(async () => {
  await User.deleteMany({ email: new RegExp(`-${runId}@example\\.test$`) });
  await EmailToken.deleteMany({ email: new RegExp(`-${runId}@example\\.test$`) });
  await new Promise((resolve) => server.close(resolve));
  await disconnectDatabase();
});

const send = (method, path, { body, cookie } = {}) =>
  fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const forgot = (email) => send('POST', '/api/auth/forgot-password', { body: { email } });
const reset = (token, password) => send('POST', '/api/auth/reset-password', { body: { token, password } });
const login = (email, password) => send('POST', '/api/auth/login', { body: { email, password } });
const sessionCookie = (response) =>
  response.headers.getSetCookie().find((c) => c.startsWith('mjolnir_session=') && !/mjolnir_session=;/.test(c));

/** Asks for a reset link and returns its token. */
async function resetLinkFor(email) {
  const before = mail.to(email).length;
  assert.equal((await forgot(email)).status, 202);
  return tokenFrom(await mail.waitFor(email, { count: before + 1 }));
}

/* ------------------------------ forgot ------------------------------ */

test('forgot-password answers the same for an account, a Google-only one, a pending one and nobody', async () => {
  const known = emailFor('forgot-known');
  const google = emailFor('forgot-google');
  const pending = emailFor('forgot-pending');
  const nobody = emailFor('forgot-nobody');
  await createVerifiedUser({ email: known, password: PASSWORD });
  await User.create({ email: google, googleId: `g-${runId}-forgot`, emailVerifiedAt: new Date() });
  await send('POST', '/api/auth/register', { body: { email: pending, password: PASSWORD, name: 'ทดสอบ' } });

  const answers = [];
  for (const email of [known, google, pending, nobody]) {
    const response = await forgot(email);
    answers.push({ status: response.status, body: await response.json() });
  }
  for (const answer of answers) assert.deepEqual(answer, answers[0]);
  assert.equal(answers[0].status, 202);

  assert.match((await mail.waitFor(known)).subject, /ตั้งรหัสผ่านใหม่/);
  assert.match((await mail.waitFor(google)).subject, /^ตั้งรหัสผ่าน/, 'a first password for a Google-only account');
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(mail.to(nobody).length, 0, 'no mail to an address with no account');
  assert.equal(mail.to(pending).filter((m) => /รหัสผ่าน/.test(m.subject)).length, 0, 'nor to a registration not yet confirmed');
  assert.equal(await EmailToken.countDocuments({ purpose: 'reset-password', email: nobody }), 0, 'the padding write leaves nothing');
});

test('only the latest reset link works', async () => {
  const email = emailFor('latest');
  await createVerifiedUser({ email, password: PASSWORD });
  const first = await resetLinkFor(email);
  const second = await resetLinkFor(email);

  assert.equal((await reset(first, NEW_PASSWORD)).status, 400);
  assert.equal((await reset(second, NEW_PASSWORD)).status, 200);
});

/* ------------------------------ reset ------------------------------ */

test('a reset sets the password, ends every session, signs nothing in, and tells the owner', async () => {
  const email = emailFor('reset');
  await createVerifiedUser({ email, password: PASSWORD });
  const oldCookie = await signInCookie(baseUrl, email, PASSWORD);
  const token = await resetLinkFor(email);

  const response = await reset(token, NEW_PASSWORD);
  assert.equal(response.status, 200);
  assert.equal(sessionCookie(response), undefined, 'no session from the link alone (V6.3.6)');

  assert.equal((await send('GET', '/api/auth/me', { cookie: oldCookie })).status, 401, 'the old session is over');
  assert.equal((await login(email, PASSWORD)).status, 401, 'the old password is over');
  assert.equal((await login(email, NEW_PASSWORD)).status, 200);
  assert.equal((await reset(token, 'another fresh pair')).status, 400, 'the link is spent');

  const notice = await mail.waitFor(email, { count: 2 });
  assert.equal(notice.subject, 'รหัสผ่านของคุณถูกเปลี่ยนแล้ว');
  assert.equal(tokenFrom(notice), null);
});

test('an expired, used or malformed reset link is the same 400', async () => {
  const email = emailFor('reset-expired');
  await createVerifiedUser({ email, password: PASSWORD });
  const expired = await resetLinkFor(email);
  await EmailToken.updateOne({ purpose: 'reset-password', email }, { $set: { expiresAt: new Date(Date.now() - 1000) } });

  for (const token of [expired, 'not-a-token', 'B'.repeat(43)]) {
    const response = await reset(token, NEW_PASSWORD);
    assert.equal(response.status, 400, token);
    assert.equal((await response.json()).error.code, 'LINK_INVALID');
  }
});

test('a new password the policy refuses keeps the link, so another can be tried', async () => {
  const email = emailFor('reset-policy');
  await createVerifiedUser({ email, password: PASSWORD, name: 'Somchai Test' });
  const token = await resetLinkFor(email);

  for (const weak of ['password123', 'Somchai2026!']) {
    const refused = await reset(token, weak);
    assert.equal(refused.status, 400, weak);
    assert.ok((await refused.json()).error.details.password, weak);
  }
  assert.equal((await reset(token, NEW_PASSWORD)).status, 200, 'the link still works');
});

test('a Google-only account sets its first password by reset, and keeps Google', async () => {
  const email = emailFor('reset-google');
  await User.create({ email, googleId: `g-${runId}-reset`, emailVerifiedAt: new Date() });
  const token = await resetLinkFor(email);

  assert.equal((await reset(token, NEW_PASSWORD)).status, 200);
  assert.equal((await login(email, NEW_PASSWORD)).status, 200);
  assert.equal((await User.findOne({ email })).googleId, `g-${runId}-reset`);
});

test('a reset confirms an address that was never confirmed', async () => {
  const email = emailFor('reset-unconfirmed');
  await createVerifiedUser({ email, password: PASSWORD });
  await User.updateOne({ email }, { $unset: { emailVerifiedAt: '' } });

  assert.equal((await reset(await resetLinkFor(email), NEW_PASSWORD)).status, 200);
  assert.ok((await User.findOne({ email })).emailVerifiedAt, 'the link proved the mailbox');
  assert.equal((await login(email, NEW_PASSWORD)).status, 200);
});

/* ------------------------------ change ------------------------------ */

const change = (cookie, currentPassword, newPassword) =>
  send('POST', '/api/auth/password', { cookie, body: { currentPassword, newPassword } });

test('changing a password needs the current one, and keeps this browser signed in but no other', async () => {
  const email = emailFor('change');
  await createVerifiedUser({ email, password: PASSWORD });
  const here = await signInCookie(baseUrl, email, PASSWORD);
  const elsewhere = await signInCookie(baseUrl, email, PASSWORD);

  const wrong = await change(here, `${PASSWORD}!`, NEW_PASSWORD);
  assert.equal(wrong.status, 401);
  assert.equal((await wrong.json()).error.code, 'WRONG_PASSWORD');

  const done = await change(here, PASSWORD, NEW_PASSWORD);
  assert.equal(done.status, 200);
  const fresh = sessionCookie(done).split(';')[0];
  assert.equal((await done.json()).user.hasPassword, true);

  assert.equal((await send('GET', '/api/auth/me', { cookie: fresh })).status, 200, 'this browser stays in');
  assert.equal((await send('GET', '/api/auth/me', { cookie: elsewhere })).status, 401, 'every other session ends');
  assert.equal((await login(email, NEW_PASSWORD)).status, 200);

  const notice = await mail.waitFor(email);
  assert.equal(notice.subject, 'รหัสผ่านของคุณถูกเปลี่ยนแล้ว');
});

test('a change is refused for a weak new password, and for an account with no password', async () => {
  const email = emailFor('change-policy');
  await createVerifiedUser({ email, password: PASSWORD });
  const cookie = await signInCookie(baseUrl, email, PASSWORD);
  const weak = await change(cookie, PASSWORD, 'qwertyuiop');
  assert.equal(weak.status, 400);
  assert.ok((await weak.json()).error.details.newPassword);

  // A Google-only account has no current password to give: it sets one by email
  const google = await User.create({ email: emailFor('change-google'), googleId: `g-${runId}-change`, emailVerifiedAt: new Date() });
  const { signSessionToken } = await import('../src/features/auth/session.js');
  const googleCookie = `mjolnir_session=${signSessionToken({ id: google.id, tokenVersion: 0 })}`;
  const none = await change(googleCookie, 'anything at all', NEW_PASSWORD);
  assert.equal(none.status, 400);
  assert.equal((await none.json()).error.code, 'NO_PASSWORD');

  assert.equal((await change(undefined, PASSWORD, NEW_PASSWORD)).status, 401, 'signed in only');
});

test('/me says whether the account has a password, never the hash', async () => {
  const email = emailFor('has-password');
  await createVerifiedUser({ email, password: PASSWORD });
  const me = await (await send('GET', '/api/auth/me', { cookie: await signInCookie(baseUrl, email, PASSWORD) })).json();
  assert.equal(me.user.hasPassword, true);
  assert.equal(me.user.passwordHash, undefined);
});

/* ------------------------------ admin ------------------------------ */

const adminReset = (cookie, body) => send('POST', '/api/admin/users/password-reset', { cookie, body });

test('an admin sends a reset link, never sees it, and can set no password', async () => {
  const adminEmail = emailFor('admin');
  await createVerifiedUser({ email: adminEmail, password: PASSWORD, role: 'admin' });
  const adminCookie = await signInCookie(baseUrl, adminEmail, PASSWORD);
  const userEmail = emailFor('admin-target');
  const user = await createVerifiedUser({ email: userEmail, password: PASSWORD });
  const hashBefore = (await User.findById(user.id).select('+passwordHash')).passwordHash;

  const response = await adminReset(adminCookie, { email: userEmail, password: 'chosen-by-the-admin', newPassword: 'or this' });
  assert.equal(response.status, 202);
  const text = await response.text();
  assert.doesNotMatch(text, /token|#|verify|reset-password|\/auth\//i, 'no link in the answer');

  const sent = await mail.waitFor(userEmail);
  assert.match(sent.text, /ผู้ดูแลระบบ/);
  assert.ok(tokenFrom(sent), 'the link goes to the user only');
  const hashAfter = (await User.findById(user.id).select('+passwordHash')).passwordHash;
  assert.equal(hashAfter, hashBefore, 'nothing the admin sent became a password');
  assert.equal(await bcrypt.compare('chosen-by-the-admin', hashAfter), false);

  assert.equal((await adminReset(adminCookie, { email: emailFor('admin-nobody') })).status, 404, 'admins may know who exists');
});

test('a user who is not an admin cannot send anyone a reset', async () => {
  const email = emailFor('not-admin');
  await createVerifiedUser({ email, password: PASSWORD });
  const cookie = await signInCookie(baseUrl, email, PASSWORD);
  assert.equal((await adminReset(cookie, { email })).status, 403);
  assert.equal((await adminReset(undefined, { email })).status, 401);
});

/* --------------------------- registration ---------------------------- */

test('registration refuses a common password, or the person\'s own name, and holds nothing', async () => {
  for (const [label, password] of [['common', 'password123'], ['own-name', 'Somchai2026!']]) {
    const email = emailFor(`reg-${label}`);
    const response = await send('POST', '/api/auth/register', { body: { email, password, name: 'Somchai Test' } });
    assert.equal(response.status, 400, label);
    assert.ok((await response.json()).error.details.password, label);
    assert.equal(await EmailToken.countDocuments({ email }), 0, label);
  }
});
