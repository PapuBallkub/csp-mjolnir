// Confirming an address before an account exists (0041), through the real
// routes. Registering creates no user and signs no one in: it holds the
// registration and emails a link, and the link plus the password chosen at
// sign-up create the account. Mail goes to a recorder, so nothing is sent.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import bcrypt from 'bcryptjs';

import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { EmailToken, User } from '#models/index.js';

import { createApp } from '../src/app.js';
import { hashToken } from '../src/features/auth/email-token.js';
import { createMailRecorder, createVerifiedUser, tokenFrom } from './helpers/accounts.js';

const TEST_DB = 'mjolnir_test';
const PASSWORD = 'correct horse battery';
const NAME = 'Somchai Test';

const runId = crypto.randomUUID().slice(0, 8);
const emailFor = (name) => `${name}-${runId}@example.test`;

const UNLIMITED = { windowMs: 60_000, limit: 10_000 };
const NO_RATE_LIMITS = {
  loginByIp: UNLIMITED,
  loginByEmail: UNLIMITED,
  registerByIp: UNLIMITED,
  registerByEmail: UNLIMITED,
  verifyByIp: UNLIMITED,
};

const mail = createMailRecorder();
let server;
let baseUrl;

before(async () => {
  await connectDatabase({ dbName: TEST_DB });
  server = createApp({ rateLimits: NO_RATE_LIMITS, mail }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://localhost:${server.address().port}`;
});

after(async () => {
  await User.deleteMany({ email: new RegExp(`-${runId}@example\\.test$`) });
  await EmailToken.deleteMany({ email: new RegExp(`-${runId}@example\\.test$`) });
  await new Promise((resolve) => server.close(resolve));
  await disconnectDatabase();
});

const send = (method, urlPath, body) =>
  fetch(`${baseUrl}${urlPath}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const register = (email, password = PASSWORD) => send('POST', '/api/auth/register', { email, password, name: NAME });
const confirm = (token, password = PASSWORD) => send('POST', '/api/auth/verify-email', { token, password });

/** Registers, and returns the token from the email it sent. */
async function linkFor(email, password = PASSWORD) {
  const before = mail.to(email).length;
  assert.equal((await register(email, password)).status, 202);
  return tokenFrom(await mail.waitFor(email, { count: before + 1 }));
}

const sessionCookie = (response) =>
  response.headers.getSetCookie().find((cookie) => cookie.startsWith('mjolnir_session='));

/* ------------------------------ registering ------------------------------ */

test('registering answers the same for a new, a taken, a waiting and an old unconfirmed address', async () => {
  const fresh = emailFor('reg-new');
  const taken = emailFor('reg-taken');
  const waiting = emailFor('reg-waiting');
  const old = emailFor('reg-old');
  await createVerifiedUser({ email: taken, password: PASSWORD });
  await register(waiting);
  // An account from before confirmation existed: no emailVerifiedAt, no Google
  await User.create({ email: old, passwordHash: 'from-before', name: 'Old' });

  const answers = [];
  for (const email of [fresh, taken, waiting, old]) {
    const response = await register(email);
    answers.push({ status: response.status, body: await response.json(), cookie: sessionCookie(response) });
  }

  for (const answer of answers) {
    assert.deepEqual(answer, answers[0], 'one answer, or the response says who is registered');
  }
  assert.equal(answers[0].status, 202);
  assert.equal(answers[0].cookie, undefined, 'registering signs no one in');
  assert.equal(await User.exists({ email: fresh }), null, 'no account until the link is opened');
});

test('a new address gets a link; an address with an account gets a notice instead', async () => {
  const fresh = emailFor('mail-new');
  const taken = emailFor('mail-taken');
  await createVerifiedUser({ email: taken, password: PASSWORD });

  await register(fresh);
  await register(taken);

  const link = await mail.waitFor(fresh);
  assert.equal(link.subject, 'ยืนยันอีเมลเพื่อเปิดใช้งานบัญชีของคุณกับระบบ GIPDP');
  assert.ok(tokenFrom(link), 'a confirm link');
  assert.match(link.text, /\/auth\/verify#token=/, 'after #, so no server log sees the token');

  const notice = await mail.waitFor(taken);
  assert.equal(notice.subject, 'มีคนพยายามสมัครด้วยอีเมลของคุณ');
  assert.equal(tokenFrom(notice), null, 'nothing that opens the account');
});

test('only the token’s hash is stored, and the password only as a hash', async () => {
  const email = emailFor('stored');
  const token = await linkFor(email);

  const held = await EmailToken.findOne({ email }).select('+passwordHash').lean();
  assert.equal(held.tokenHash, hashToken(token));
  assert.ok(!JSON.stringify(held).includes(token), 'the token is in the email and nowhere else');
  assert.match(held.passwordHash, /^\$2b\$12\$/);
  assert.equal(held.purpose, 'verify-email');
  assert.ok(held.expiresAt > new Date(Date.now() + 23 * 3600_000), 'about a day');
});

test('a registration that fails validation is still a 400, and holds nothing', async () => {
  const email = emailFor('reg-invalid');
  const response = await send('POST', '/api/auth/register', { email, password: 'short', name: NAME });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error.details.password, /อย่างน้อย 8/);
  assert.equal(await EmailToken.countDocuments({ email }), 0);
});

/* ------------------------------ confirming ------------------------------ */

test('the link with the right password creates a confirmed account and signs it in', async () => {
  const email = emailFor('confirm-ok');
  const token = await linkFor(email);

  const response = await confirm(token);
  assert.equal(response.status, 200);
  assert.ok(sessionCookie(response), 'signed in');
  assert.equal((await response.json()).user.email, email);

  const user = await User.findOne({ email }).select('+passwordHash');
  assert.ok(user.emailVerifiedAt);
  assert.match(user.passwordHash, /^\$2b\$12\$/);
  assert.equal(await EmailToken.countDocuments({ email }), 0, 'spent');

  const login = await send('POST', '/api/auth/login', { email, password: PASSWORD });
  assert.equal(login.status, 200);
});

test('the link alone signs no one in: the password must match, and five misses spend it', async () => {
  const email = emailFor('confirm-wrong');
  const token = await linkFor(email);

  for (let miss = 1; miss <= 4; miss += 1) {
    const wrong = await confirm(token, `${PASSWORD}!`);
    assert.equal(wrong.status, 401, `miss ${miss}`);
    assert.equal((await wrong.json()).error.code, 'WRONG_PASSWORD');
  }
  const fifth = await confirm(token, `${PASSWORD}!`);
  assert.equal(fifth.status, 400);
  assert.equal((await fifth.json()).error.code, 'TOO_MANY_TRIES');

  const late = await confirm(token);
  assert.equal(late.status, 400, 'the right password is too late');
  assert.equal(await User.exists({ email }), null);
});

test('an expired, used, malformed or unknown link is the same 400', async () => {
  const used = await linkFor(emailFor('confirm-used'));
  assert.equal((await confirm(used)).status, 200);

  const expiredEmail = emailFor('confirm-expired');
  const expired = await linkFor(expiredEmail);
  // Mongo's TTL sweep runs about once a minute; the code must not wait for it
  await EmailToken.updateOne({ email: expiredEmail }, { $set: { expiresAt: new Date(Date.now() - 1000) } });

  for (const token of [used, expired, 'not-a-token', 'A'.repeat(43), ['an', 'array']]) {
    const response = await confirm(token);
    assert.equal(response.status, 400, JSON.stringify(token));
    assert.equal((await response.json()).error.code, 'LINK_INVALID');
  }
});

test('every other link for an address is spent once one is confirmed', async () => {
  const email = emailFor('confirm-twice');
  const first = await linkFor(email);
  const second = await linkFor(email);

  assert.equal((await confirm(first)).status, 200);

  // Confirming deleted it already; one made before the account must not open it either
  const response = await confirm(second);
  assert.equal(response.status, 400);
  assert.equal(await User.countDocuments({ email }), 1);
});

test('a link held when Google confirmed the address first answers 409', async () => {
  const email = emailFor('confirm-after-google');
  const token = await linkFor(email);
  // Google signs in and creates the account; pending rows for it go then too
  // (tested in auth-google). One left behind must still not make a second account.
  await createVerifiedUser({ email, password: 'set-by-someone-else' });

  const response = await confirm(token);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, 'ALREADY_VERIFIED');
  assert.equal(await User.countDocuments({ email }), 1);
  assert.equal(await EmailToken.countDocuments({ email }), 0);
});

test('confirming claims an old unconfirmed account: its role and profile stay', async () => {
  const email = emailFor('claim-old');
  await User.create({
    email,
    passwordHash: 'useless-since-the-pepper',
    name: 'Old Name',
    role: 'admin',
    profile: { skills: ['React'] },
  });

  const token = await linkFor(email);
  const response = await confirm(token);
  assert.equal(response.status, 200);

  const claimed = await User.findOne({ email });
  assert.equal(claimed.role, 'admin', 'no npm run role needed again');
  assert.deepEqual([...claimed.profile.skills], ['React']);
  assert.equal(claimed.name, NAME, 'the name just confirmed');
  assert.ok(claimed.emailVerifiedAt);
  assert.equal(await User.countDocuments({ email }), 1);
});

/* ------------------------------- signing in ------------------------------ */

test('a password sign-in to a Google-only account is the same 401, not a 500', async () => {
  const email = emailFor('google-only');
  await User.create({ email, googleId: `g-${runId}-only`, emailVerifiedAt: new Date() });

  const google = await send('POST', '/api/auth/login', { email, password: PASSWORD });
  const missing = await send('POST', '/api/auth/login', { email: emailFor('nobody'), password: PASSWORD });

  assert.equal(google.status, 401);
  assert.equal(missing.status, 401);
  assert.equal((await google.json()).error.message, (await missing.json()).error.message);
});

test('every failed sign-in costs one bcrypt compare, whether the account exists or not', async (t) => {
  const email = emailFor('timing');
  await createVerifiedUser({ email, password: PASSWORD });
  await User.create({ email: emailFor('timing-google'), googleId: `g-${runId}-timing`, emailVerifiedAt: new Date() });

  const compare = t.mock.method(bcrypt, 'compare');
  for (const body of [
    { email, password: `${PASSWORD}!` },
    { email: emailFor('timing-nobody'), password: PASSWORD },
    { email: emailFor('timing-google'), password: PASSWORD },
  ]) {
    compare.mock.resetCalls();
    assert.equal((await send('POST', '/api/auth/login', body)).status, 401);
    assert.equal(compare.mock.callCount(), 1, body.email);
  }
});

test('the right password on an account whose address was never confirmed gets 403', async () => {
  const email = emailFor('unconfirmed-login');
  // Registered between the pepper and confirmation: a real hash, no emailVerifiedAt
  await createVerifiedUser({ email, password: PASSWORD });
  await User.updateOne({ email }, { $unset: { emailVerifiedAt: '' } });

  const right = await send('POST', '/api/auth/login', { email, password: PASSWORD });
  assert.equal(right.status, 403);
  assert.equal((await right.json()).error.code, 'EMAIL_NOT_VERIFIED');
  assert.equal(sessionCookie(right), undefined);

  // Only someone who knows the password learns it: a wrong one is the usual 401
  const wrong = await send('POST', '/api/auth/login', { email, password: `${PASSWORD}!` });
  assert.equal(wrong.status, 401);
});

/* --------------------------------- email --------------------------------- */

test('without SMTP, development prints the link instead of sending it', async (t) => {
  const info = t.mock.method(console, 'info', () => {});
  const local = createApp({ rateLimits: NO_RATE_LIMITS, mail: { configured: false, send: () => assert.fail('sent') } })
    .listen(0);
  await new Promise((resolve) => local.once('listening', resolve));
  try {
    const email = emailFor('dev-no-smtp');
    const response = await fetch(`http://localhost:${local.address().port}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD, name: NAME }),
    });
    assert.equal(response.status, 202);

    for (let i = 0; i < 100 && info.mock.callCount() === 0; i += 1) await new Promise((r) => setTimeout(r, 10));
    const line = info.mock.calls.map((call) => call.arguments.join(' ')).find((text) => text.includes('Development only'));
    assert.ok(line, 'the link is logged');
    assert.match(line, /\/auth\/verify#token=[A-Za-z0-9_-]{43}/);
    assert.ok(!line.includes(email), 'the address is masked');
  } finally {
    await new Promise((resolve) => local.close(resolve));
  }
});

// isProduction is read once at import, so production runs in a fresh process,
// in the temp folder (no .env), with no database: the 503 comes before any lookup
const here = path.dirname(fileURLToPath(import.meta.url));
const APP_MODULE = pathToFileURL(path.join(here, '../src/app.js')).href;
const CHILD = `
const { createApp } = await import(${JSON.stringify(APP_MODULE)});
const server = createApp().listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const res = await fetch('http://127.0.0.1:' + server.address().port + '/api/auth/register', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'someone@example.test', password: 'correct horse battery', name: 'Test' }),
});
console.log('RESULT ' + JSON.stringify({ status: res.status, body: await res.json() }));
process.exit(0);
`;

test('production without SMTP refuses password sign-up with a 503, before any lookup', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', CHILD], {
    cwd: os.tmpdir(),
    encoding: 'utf8',
    timeout: 30_000,
    env: {
      NODE_ENV: 'production',
      MONGO_URI: 'mongodb://127.0.0.1:1/never-connected',
      JWT_SECRET: 'test-not-a-secret-test-not-a-secret',
      PASSWORD_PEPPER: 'test-not-a-pepper-test-not-a-pepper',
      // Required in production since #358, like the two secrets
      CORS_ORIGIN: 'https://gipdp.example.com',
      ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
    },
  });
  const line = result.stdout.split('\n').find((l) => l.startsWith('RESULT '));
  assert.ok(line, `the app never answered (exit ${result.status}):\n${result.stderr}`);
  const { status, body } = JSON.parse(line.slice('RESULT '.length));
  assert.equal(status, 503);
  assert.equal(body.error.code, 'SIGNUP_UNAVAILABLE');
  assert.match(body.error.message, /Google/, 'says what still works');
});
