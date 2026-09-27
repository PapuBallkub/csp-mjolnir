// Grants or revokes the admin role. The only way anyone becomes an admin.
//
//   npm run role -- someone@example.com admin
//   npm run role -- someone@example.com user
//
// Deliberately a command and not a route: a platform admin is an internal
// maintainer, not a thing anyone signs up to be, so the grant is an act someone
// performs against the database rather than a flow the product offers. See 0011
// for the alternatives that were rejected, chiefly an ADMIN_EMAILS env var
// (two sources of truth, and the one requireRole reads is the other one).

import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { User } from '#models/index.js';

const ROLES = ['user', 'admin'];

const [email, role] = process.argv.slice(2);

if (!email || !ROLES.includes(role)) {
  console.error('Usage: npm run role -- <email> <user|admin>');
  process.exit(1);
}

await connectDatabase();

try {
  // Normalized the way the schema stores it, or a capitalized address silently
  // matches nothing and this reports "no account" for one that exists.
  const user = await User.findOneAndUpdate(
    { email: email.trim().toLowerCase() },
    { $set: { role } },
    { new: true },
  );

  if (!user) {
    console.error(`No account for ${email}.`);
    process.exitCode = 1;
  } else {
    console.log(`${user.email} is now ${user.role}.`);
  }
} finally {
  await disconnectDatabase();
}
