// One-shot backfill for accounts created before name and role existed.
//
//   node scripts/backfill-roles.js
//
// Reading those accounts already works without this: Mongoose applies schema
// defaults when it hydrates a document, so an old row comes back as
// role: 'user', name: '' with nothing written. Queries are what do not work —
// find({ role: 'user' }) does not match a document with no role key at all.
//
// So this is not a correctness fix for the API, it is preparation for the first
// feature that filters users by role. It is kept in the repository after being
// run once, as the record that it was.
//
// Left as a script rather than a boot-time migration on purpose: a migration
// that runs on every start is one nobody can reason about, and this one is
// idempotent but still only needs to happen once.

import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { User } from '#models/index.js';

await connectDatabase();

try {
  const { modifiedCount } = await User.updateMany(
    { $or: [{ role: { $exists: false } }, { name: { $exists: false } }] },
    { $set: { role: 'user', name: '' } },
  );

  console.log(`Backfilled ${modifiedCount} account(s).`);
} finally {
  await disconnectDatabase();
}
