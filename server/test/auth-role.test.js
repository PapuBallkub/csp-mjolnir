// requireRole, and the claim that accounts predating these fields need no
// migration to keep working.
//
// The middleware is exercised directly rather than over HTTP: it has no
// production caller until the admin routes arrive with FR14/FR15, and mounting
// a route that exists only for a test would put a fake admin surface in the
// real app. See 0011.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { User } from '#models/index.js';

import { requireRole } from '../src/features/auth/auth.middleware.js';
import { findUserById } from '../src/features/auth/auth.service.js';

const TEST_DB = 'mjolnir_test';

const runId = crypto.randomUUID().slice(0, 8);
const emailFor = (name) => `${name}-${runId}@example.test`;

before(async () => {
  await connectDatabase({ dbName: TEST_DB });
});

after(async () => {
  await User.deleteMany({ email: new RegExp(`-${runId}@example\.test$`) });
  await disconnectDatabase();
});

// next() is the only success signal, so every case below checks whether it ran.
function spyNext() {
  const calls = [];
  const next = (...args) => calls.push(args);
  return { next, calls };
}

test('requireRole lets a matching role through', () => {
  const { next, calls } = spyNext();

  requireRole('admin')({ user: { role: 'admin' } }, {}, next);

  assert.equal(calls.length, 1, 'next() runs exactly once');
  assert.deepEqual(calls[0], [], 'and with no error');
});

test('requireRole accepts any of several roles', () => {
  const { next, calls } = spyNext();

  requireRole('admin', 'user')({ user: { role: 'user' } }, {}, next);

  assert.equal(calls.length, 1);
});

test('requireRole forbids a role that does not match, and does not continue', () => {
  const { next, calls } = spyNext();

  assert.throws(
    () => requireRole('admin')({ user: { role: 'user' } }, {}, next),
    (error) => error.status === 403 && /administrator/i.test(error.message),
  );

  assert.equal(calls.length, 0, 'a refused request must never reach the handler');
});

// Mounted before requireAuth there is no req.user, and answering 403 there
// would tell an anonymous caller they are the wrong kind of person rather than
// that they are nobody. 401 is the honest answer, and it is also what the rest
// of the API says.
test('requireRole answers 401, not 403, when nothing has authenticated yet', () => {
  const { next, calls } = spyNext();

  assert.throws(
    () => requireRole('admin')({}, {}, next),
    (error) => error.status === 401,
  );

  assert.equal(calls.length, 0);
});

test('an account stored before these fields existed still reads as a plain user', async () => {
  const email = emailFor('legacy');

  // Straight through the driver, so Mongoose applies no defaults and the
  // document genuinely has no name and no role key — which is what every
  // account created before this change actually looks like on disk.
  await User.collection.insertOne({ email, passwordHash: 'not-a-real-hash' });

  const stored = await User.findOne({ email });
  const user = await findUserById(stored.id);

  assert.equal(user.role, 'user', 'defaults apply on read, so no migration is needed');
  assert.equal(user.name, '');

  // The half that defaults do not cover, and the reason backfill-roles.js
  // exists: a document with no role key is not matched by a query for one.
  assert.equal(await User.countDocuments({ _id: stored._id, role: 'user' }), 0);
});
