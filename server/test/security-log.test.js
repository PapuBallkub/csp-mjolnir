// The security log's helper on its own (ADR 0043): what a line holds, and what
// it never can. The routes that write lines are in security-events.test.js.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import mongoose from 'mongoose';

import { env } from '#common/config/env.js';
import {
  emailHash,
  logServerError,
  requestContext,
  SECURITY_EVENTS,
  securityEvent,
  setSecurityLogSink,
} from '#common/logging/security-log.js';

import { captureSecurityLog } from './helpers/security-log.js';

// Enough of an Express request for the helper
const fakeRequest = ({ headers = {}, ...rest } = {}) => ({
  ip: '203.0.113.7',
  method: 'POST',
  baseUrl: '/api/auth',
  path: '/login',
  get: (name) => headers[name.toLowerCase()],
  ...rest,
});

test('one event is one line of JSON, in UTC, with its severity', (t) => {
  const log = captureSecurityLog(t);
  securityEvent(fakeRequest(), 'auth.login.failure', { reason: 'wrong_password' });

  const raw = log.raw();
  assert.ok(!raw.includes('\n'), 'a single line');
  const [line] = log.lines();
  assert.equal(line.stream, 'stdout');
  assert.equal(line.event, 'auth.login.failure');
  assert.equal(line.message, 'auth.login.failure');
  assert.equal(line.severity, 'WARNING');
  assert.match(line.time, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
  assert.equal(line.ip, '203.0.113.7');
  assert.equal(line.method, 'POST');
  assert.equal(line.path, '/api/auth/login');
  assert.equal(line.reason, 'wrong_password');
});

test('only allowlisted fields are written: a password or token passed by mistake is dropped', (t) => {
  const log = captureSecurityLog(t);
  securityEvent(fakeRequest(), 'auth.login.success', {
    userId: 'u1',
    password: 'hunter2-hunter2',
    token: 'abc.def.ghi',
    cookie: 'mjolnir_session=xyz',
    passwordHash: '$2b$12$abc',
  });

  const raw = log.raw();
  for (const secret of ['hunter2-hunter2', 'abc.def.ghi', 'mjolnir_session', '$2b$12$abc']) {
    assert.ok(!raw.includes(secret), `${secret} stays out`);
  }
  assert.equal(log.lines()[0].userId, 'u1');
});

test('an address is written only as its keyed hash, the same for the same address', (t) => {
  const log = captureSecurityLog(t);
  securityEvent(fakeRequest(), 'auth.login.failure', { email: 'Somchai@Example.test ' });
  securityEvent(fakeRequest(), 'auth.login.failure', { email: 'somchai@example.test' });
  securityEvent(fakeRequest(), 'auth.login.failure', { email: 'someone-else@example.test' });

  assert.ok(!log.raw().toLowerCase().includes('somchai'), 'no address, in any case');
  const [first, second, third] = log.lines().map((line) => line.emailHash);
  assert.match(first, /^[0-9a-f]{32}$/);
  assert.equal(first, second, 'case and spaces do not change it');
  assert.notEqual(first, third);
  assert.equal(first, emailHash('somchai@example.test'), 'what an investigator computes to search for');
  assert.equal(log.lines()[0].email, undefined);
});

test('a line break in a value stays inside the line, so no value can forge another', (t) => {
  const log = captureSecurityLog(t);
  securityEvent(fakeRequest(), 'auth.google.failure', {
    reason: 'token-endpoint\n{"event":"auth.login.success","userId":"admin"}\r\n',
  });

  assert.ok(!/[\r\n]/.test(log.raw()));
  assert.equal(log.lines().length, 1);
  assert.equal(log.events('auth.login.success').length, 0);
});

test('long values are cut, objects never pass, and an ObjectId is its hex', (t) => {
  const log = captureSecurityLog(t);
  const id = new mongoose.Types.ObjectId();
  securityEvent(fakeRequest(), 'admin.action', {
    userId: id,
    reason: 'x'.repeat(1000),
    target: { $ne: null },
    detail: { version: 3, nested: { deep: true }, list: ['a'], step: 'ocr' },
  });

  const [line] = log.lines();
  assert.equal(line.userId, id.toHexString());
  assert.ok(line.reason.length <= 301);
  assert.equal(line.target, undefined, 'an object is not a value');
  assert.deepEqual(line.detail, { version: 3, step: 'ocr' });
});

test('the path never carries the query, and the trace links to Cloud Run only with a project', (t) => {
  const traced = fakeRequest({
    method: 'GET',
    path: '/google/callback',
    headers: { 'x-cloud-trace-context': '105445aa7843bc8bf206b12000100000/1;o=1' },
  });

  const before = env.googleCloudProject;
  t.after(() => {
    env.googleCloudProject = before;
  });

  env.googleCloudProject = '';
  assert.equal(requestContext(traced)['logging.googleapis.com/trace'], undefined, 'no project, no trace');

  env.googleCloudProject = 'gipdp-test';
  const context = requestContext(traced);
  assert.equal(context.path, '/api/auth/google/callback');
  assert.equal(context['logging.googleapis.com/trace'], 'projects/gipdp-test/traces/105445aa7843bc8bf206b12000100000');

  const forged = requestContext(fakeRequest({ headers: { 'x-cloud-trace-context': 'not-a-trace/1' } }));
  assert.equal(forged['logging.googleapis.com/trace'], undefined, 'only a real trace id');
});

test('a sink that throws never reaches the caller', () => {
  const previous = setSecurityLogSink(() => {
    throw new Error('disk full');
  });
  try {
    assert.doesNotThrow(() => securityEvent(fakeRequest(), 'auth.login.success', { userId: 'u1' }));
    assert.doesNotThrow(() => logServerError(fakeRequest(), new Error('boom'), 500));
  } finally {
    setSecurityLogSink(previous);
  }
});

test('an unexpected error is one line on stderr, with its stack', (t) => {
  const log = captureSecurityLog(t);
  logServerError(fakeRequest({ user: { id: 'u9' } }), new TypeError('x is undefined'), 500);

  assert.ok(!log.raw().includes('\n'));
  const [line] = log.lines();
  assert.equal(line.stream, 'stderr');
  assert.equal(line.event, 'server.error');
  assert.equal(line.severity, 'ERROR');
  assert.equal(line.status, 500);
  assert.equal(line.userId, 'u9');
  assert.match(line.message, /^TypeError: x is undefined\n {4}at /, 'the stack, escaped into the line');
});

test('the documented events are a closed list, and an unknown one still logs', (t) => {
  assert.ok(Object.isFrozen(SECURITY_EVENTS));
  for (const severity of Object.values(SECURITY_EVENTS)) assert.match(severity, /^(INFO|WARNING)$/);

  const log = captureSecurityLog(t);
  securityEvent(fakeRequest(), 'auth.typo', {});
  assert.equal(log.lines()[0].severity, 'WARNING');
});
