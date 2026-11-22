// The security events the routes write (ADR 0043, ASVS V16.3.1–V16.3.3),
// through the real app: sign-ins, sessions, denials, limits, admin writes and
// the password flows. Lines are captured, so nothing reaches stdout, and no
// test sends mail.

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { once } from 'node:events';
import { after, before, test } from 'node:test';

import { isGoogleConfigured } from '#common/config/env.js';
import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { emailHash } from '#common/logging/security-log.js';
import { adminRateLimits, createAdminRoutes } from '#features/admin/index.js';
import { isAdminAudit } from '#features/admin/audit.js';
import { EmailToken, User } from '#models/index.js';

import { createApp } from '../src/app.js';
import { createMailRecorder, createVerifiedUser, signInCookie, signedInAccount, tokenFrom } from './helpers/accounts.js';
import { captureSecurityLog } from './helpers/security-log.js';

const TEST_DB = 'mjolnir_test';
const PASSWORD = 'correct horse battery';
const NEW_PASSWORD = 'a fresh pair of shoes';

const runId = crypto.randomUUID().slice(0, 8);
const emailFor = (name) => `${name}-${runId}@example.test`;

const UNLIMITED = { windowMs: 60_000, limit: 10_000 };
const ONE = { windowMs: 60_000, limit: 1 };
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
const servers = [];

async function startApp({ rateLimits = NO_RATE_LIMITS, apiRateLimits = { adminCostly: UNLIMITED } } = {}) {
  const server = createApp({ rateLimits, apiRateLimits, mail }).listen(0);
  await once(server, 'listening');
  servers.push(server);
  return `http://localhost:${server.address().port}`;
}

let baseUrl;

before(async () => {
  await connectDatabase({ dbName: TEST_DB });
  baseUrl = await startApp();
});

after(async () => {
  await User.deleteMany({ email: new RegExp(`-${runId}@example\\.test$`) });
  await EmailToken.deleteMany({ email: new RegExp(`-${runId}@example\\.test$`) });
  for (const server of servers) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  await disconnectDatabase();
});

const send = (method, path, { body, cookie, base = baseUrl, raw } = {}) =>
  fetch(`${base}${path}`, {
    method,
    redirect: 'manual',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  });

const login = (email, password, base) => send('POST', '/api/auth/login', { body: { email, password }, base });

test('a password sign-in logs success, and each failure with its reason, while the answers stay alike', async (t) => {
  const user = await createVerifiedUser({ email: emailFor('login'), password: PASSWORD });
  const googleOnly = await User.create({
    email: emailFor('login-google'),
    googleId: `g-${runId}`,
    emailVerifiedAt: new Date(),
  });
  const unconfirmed = await createVerifiedUser({
    email: emailFor('login-unconfirmed'),
    password: PASSWORD,
    emailVerifiedAt: null,
  });
  const log = captureSecurityLog(t);

  const wrong = await login(user.email, 'not the password at all');
  const unknown = await login(emailFor('login-nobody'), PASSWORD);
  const noPassword = await login(googleOnly.email, PASSWORD);
  const bodies = await Promise.all([wrong, unknown, noPassword].map((response) => response.json()));
  for (const response of [wrong, unknown, noPassword]) assert.equal(response.status, 401);
  assert.deepEqual(bodies[1], bodies[0], 'the client still gets one answer');
  assert.deepEqual(bodies[2], bodies[0]);
  assert.ok(!JSON.stringify(bodies).includes('reason'), 'the reason is for the log only');

  assert.equal((await login(unconfirmed.email, PASSWORD)).status, 403);
  assert.equal((await login(user.email, PASSWORD)).status, 200);

  const failures = log.events('auth.login.failure');
  assert.deepEqual(
    failures.map(({ reason, userId, emailHash: hash }) => ({ reason, userId, hash })),
    [
      { reason: 'wrong_password', userId: user.id, hash: emailHash(user.email) },
      { reason: 'unknown_account', userId: undefined, hash: emailHash(emailFor('login-nobody')) },
      { reason: 'no_password', userId: googleOnly.id, hash: emailHash(googleOnly.email) },
      { reason: 'unverified', userId: unconfirmed.id, hash: emailHash(unconfirmed.email) },
    ],
  );
  const [success] = log.events('auth.login.success');
  assert.equal(success.userId, user.id);
  assert.equal(success.severity, 'INFO');
  assert.equal(success.path, '/api/auth/login');

  const raw = log.raw();
  assert.ok(!raw.includes(PASSWORD), 'no password');
  assert.ok(!raw.includes(`-${runId}@example.test`), 'no address');
});

test('a session: no cookie is silent; a forged, a revoked and an orphaned one are logged', async (t) => {
  const { user, cookie } = await signedInAccount(baseUrl, { email: emailFor('session'), password: PASSWORD });
  const gone = await signedInAccount(baseUrl, { email: emailFor('session-gone'), password: PASSWORD });
  const log = captureSecurityLog(t);

  assert.equal((await send('GET', '/api/auth/me')).status, 401);
  assert.equal(log.events('auth.session.rejected').length, 0, 'a signed-out visitor writes nothing');

  assert.equal((await send('GET', '/api/auth/me', { cookie: 'mjolnir_session=not-a-real-token' })).status, 401);

  await User.updateOne({ _id: user._id }, { $inc: { tokenVersion: 1 } });
  assert.equal((await send('GET', '/api/auth/me', { cookie })).status, 401);

  await User.deleteOne({ _id: gone.user._id });
  assert.equal((await send('GET', '/api/auth/me', { cookie: gone.cookie })).status, 401);

  assert.deepEqual(
    log.events('auth.session.rejected').map(({ reason, userId }) => ({ reason, userId })),
    [
      { reason: 'invalid', userId: undefined },
      { reason: 'revoked', userId: user.id },
      { reason: 'account_gone', userId: gone.user.id },
    ],
  );
  assert.ok(!log.raw().includes(cookie.split('=')[1]), 'never the token');
});

test('a signed-in user asking for an admin route is logged as denied', async (t) => {
  const { user, cookie } = await signedInAccount(baseUrl, { email: emailFor('denied'), password: PASSWORD });
  const log = captureSecurityLog(t);

  assert.equal((await send('GET', '/api/admin/operations', { cookie })).status, 403);

  const [denied] = log.events('authz.denied');
  assert.deepEqual(
    { userId: denied.userId, role: denied.role, required: denied.required, path: denied.path },
    { userId: user.id, role: 'user', required: 'admin', path: '/api/admin/operations' },
  );
});

test('a tripped limit says which one: by address, by email (as a hash) and by account', async (t) => {
  const byIp = await startApp({ rateLimits: { ...NO_RATE_LIMITS, loginByIp: ONE } });
  const byEmail = await startApp({ rateLimits: { ...NO_RATE_LIMITS, loginByEmail: ONE } });
  const byAccount = await startApp({ rateLimits: { ...NO_RATE_LIMITS, passwordChangeByUser: ONE } });
  const target = emailFor('limited');
  const { user, cookie } = await signedInAccount(byAccount, { email: emailFor('limited-change'), password: PASSWORD });
  const log = captureSecurityLog(t);

  await login(target, 'wrong password one', byIp);
  assert.equal((await login(target, 'wrong password two', byIp)).status, 429);

  await login(target, 'wrong password one', byEmail);
  assert.equal((await login(target, 'wrong password two', byEmail)).status, 429);

  const change = { currentPassword: 'not it, not it', newPassword: NEW_PASSWORD };
  await send('POST', '/api/auth/password', { body: change, cookie, base: byAccount });
  assert.equal((await send('POST', '/api/auth/password', { body: change, cookie, base: byAccount })).status, 429);

  assert.deepEqual(
    log.events('ratelimit.exceeded').map(({ limiter, userId, emailHash: hash }) => ({ limiter, userId, hash })),
    [
      { limiter: 'loginByIp', userId: undefined, hash: undefined },
      { limiter: 'loginByEmail', userId: undefined, hash: emailHash(target) },
      { limiter: 'passwordChangeByUser', userId: user.id, hash: undefined },
    ],
  );
  assert.ok(!log.raw().includes(target));
});

test('a body over the 50 kb limit is logged as too large', async (t) => {
  const log = captureSecurityLog(t);
  const response = await send('POST', '/api/auth/login', {
    raw: JSON.stringify({ email: emailFor('big'), password: 'x'.repeat(60_000) }),
  });

  assert.equal(response.status, 413);
  const [line] = log.events('request.too_large');
  assert.equal(line.status, 413);
  assert.equal(line.path, '/api/auth/login');
});

test('admin writes are audited with who, which route, on what and how it went, failures included', async (t) => {
  const { user: admin, cookie } = await signedInAccount(baseUrl, {
    email: emailFor('admin'),
    password: PASSWORD,
    role: 'admin',
  });
  const log = captureSecurityLog(t);
  const projectId = `audit-${runId}`;
  const stranger = emailFor('reset-nobody');

  assert.equal((await send('PATCH', `/api/admin/review/${projectId}`, { body: { fields: { secret: 'x' } }, cookie })).status, 400);
  assert.equal((await send('POST', '/api/admin/users/password-reset', { body: { email: stranger }, cookie })).status, 404);
  const rollback = await send('POST', `/api/admin/review/${projectId}/rollback`, { body: { version: 99 }, cookie });
  assert.ok(rollback.status >= 400, 'there is nothing to roll back');

  const lines = await log.waitFor('admin.action', { count: 3 });
  assert.deepEqual(
    lines.map(({ action, target, status, userId, severity, detail, emailHash: hash }) => ({
      action,
      target,
      status,
      userId,
      severity,
      detail,
      hash,
    })),
    [
      {
        action: 'PATCH /api/admin/review/:projectId',
        target: projectId,
        status: 400,
        userId: admin.id,
        severity: 'WARNING',
        detail: undefined,
        hash: undefined,
      },
      {
        action: 'POST /api/admin/users/password-reset',
        target: undefined,
        status: 404,
        userId: admin.id,
        severity: 'WARNING',
        detail: undefined,
        hash: emailHash(stranger),
      },
      {
        action: 'POST /api/admin/review/:projectId/rollback',
        target: projectId,
        status: rollback.status,
        userId: admin.id,
        severity: 'WARNING',
        detail: { version: 99 },
        hash: undefined,
      },
    ],
  );
  const raw = log.raw();
  assert.ok(!raw.includes(stranger), 'the address only as its hash');
  assert.ok(!raw.includes('secret'), 'a field the route did not name stays out');
});

test('every admin route that changes something starts with the audit, so none can be added without it', () => {
  const router = createAdminRoutes(adminRateLimits, { mail });
  const writes = router.stack
    .filter((layer) => layer.route)
    .flatMap((layer) =>
      Object.keys(layer.route.methods)
        .filter((method) => method !== 'get' && method !== 'head')
        .map((method) => ({ name: `${method.toUpperCase()} ${layer.route.path}`, first: layer.route.stack[0].handle })),
    );

  assert.ok(writes.length >= 14, `found ${writes.length} write routes`);
  for (const { name, first } of writes) assert.ok(isAdminAudit(first), `${name} is audited`);
});

test('the password flows log what happened: register, confirm, forgot, reset, change and logout', async (t) => {
  const { user, cookie } = await signedInAccount(baseUrl, { email: emailFor('flows'), password: PASSWORD });
  const log = captureSecurityLog(t);
  const newcomer = emailFor('flows-new');
  const wellFormed = crypto.randomBytes(32).toString('base64url');

  const registration = { email: newcomer, password: PASSWORD, name: 'สมชาย ใจดี' };
  assert.equal((await send('POST', '/api/auth/register', { body: registration })).status, 202);
  assert.equal((await send('POST', '/api/auth/verify-email', { body: { token: wellFormed, password: PASSWORD } })).status, 400);

  assert.equal((await send('POST', '/api/auth/forgot-password', { body: { email: user.email } })).status, 202);
  assert.equal((await send('POST', '/api/auth/forgot-password', { body: { email: emailFor('flows-nobody') } })).status, 202);
  assert.equal((await send('POST', '/api/auth/reset-password', { body: { token: wellFormed, password: NEW_PASSWORD } })).status, 400);
  const token = tokenFrom(await mail.waitFor(user.email));
  assert.equal((await send('POST', '/api/auth/reset-password', { body: { token, password: NEW_PASSWORD } })).status, 200);

  const fresh = await signInCookie(baseUrl, user.email, NEW_PASSWORD);
  const wrongCurrent = { currentPassword: 'definitely not it', newPassword: PASSWORD };
  assert.equal((await send('POST', '/api/auth/password', { body: wrongCurrent, cookie: fresh })).status, 401);
  const change = await send('POST', '/api/auth/password', {
    body: { currentPassword: NEW_PASSWORD, newPassword: 'another good password' },
    cookie: fresh,
  });
  assert.equal(change.status, 200);
  const changedCookie = change.headers.getSetCookie().find((c) => c.startsWith('mjolnir_session=')).split(';')[0];
  assert.equal((await send('POST', '/api/auth/logout', { cookie: changedCookie })).status, 204);

  const pick = (name, ...keys) =>
    log.events(name).map((line) => Object.fromEntries(keys.map((key) => [key, line[key]])));
  assert.deepEqual(pick('auth.register.requested', 'kind', 'emailHash'), [{ kind: 'confirm', emailHash: emailHash(newcomer) }]);
  assert.deepEqual(pick('auth.email.confirm_failed', 'reason'), [{ reason: 'link_invalid' }]);
  assert.deepEqual(pick('auth.password_reset.requested', 'kind', 'emailHash'), [
    { kind: 'reset', emailHash: emailHash(user.email) },
    { kind: 'none', emailHash: emailHash(emailFor('flows-nobody')) },
  ]);
  assert.deepEqual(pick('auth.password_reset.failed', 'reason'), [{ reason: 'link_invalid' }]);
  assert.deepEqual(pick('auth.password_reset.completed', 'userId'), [{ userId: user.id }]);
  assert.deepEqual(pick('auth.password.change_failed', 'reason', 'userId'), [{ reason: 'wrong_password', userId: user.id }]);
  assert.deepEqual(pick('auth.password.changed', 'userId'), [{ userId: user.id }]);
  assert.deepEqual(pick('auth.logout', 'userId'), [{ userId: user.id }]);
  assert.equal(log.events('auth.session.rejected').length, 0, 'the old cookie was never used');

  const raw = log.raw();
  for (const secret of [PASSWORD, NEW_PASSWORD, 'another good password', token, wellFormed, cookie.split('=')[1]]) {
    assert.ok(!raw.includes(secret), 'no password, token or cookie in any line');
  }
  assert.ok(!raw.includes(`-${runId}@example.test`), 'no address');
});

test('the Google callback logs a failure without its query, which carries the code', { skip: !isGoogleConfigured }, async (t) => {
  const log = captureSecurityLog(t);
  const response = await send('GET', '/api/auth/google/callback?code=SECRET-CODE-123&state=whatever');

  assert.equal(response.status, 302);
  const [line] = log.events('auth.google.failure');
  assert.equal(line.reason, 'no_attempt');
  assert.equal(line.path, '/api/auth/google/callback');
  assert.ok(!log.raw().includes('SECRET-CODE-123'));
});
