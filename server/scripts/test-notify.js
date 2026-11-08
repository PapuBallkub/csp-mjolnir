/**
 * server/scripts/test-notify.js
 *
 * One-shot end-to-end test runner:
 * 1. Finds or creates your test user account.
 * 2. Ensures notificationConsent is true and has matching tech skills.
 * 3. Evaluates matches against active TORs in MongoDB.
 * 4. Creates the in-app notification snapshot.
 * 5. Sends the real email digest directly to your inbox via Gmail SMTP!
 *
 * Usage:
 *   node scripts/test-notify.js your_email@gmail.com
 */

import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { env, isEmailConfigured } from '#common/config/env.js';
import { User, TorInsight } from '#models/index.js';
import {
  generateMatchNotifications,
  dispatchPendingMatchEmails,
} from '#features/notifications/index.js';

const targetEmail = process.argv[2] || env.email.user;

if (!targetEmail) {
  console.error('Please specify your recipient email:');
  console.error('  node scripts/test-notify.js your_email@gmail.com');
  process.exit(1);
}

console.log(`\n======================================================`);
console.log(`  GIPDP End-to-End Notification & Email Test Runner   `);
console.log(`======================================================\n`);

console.log(`Checking SMTP configuration...`);
if (!isEmailConfigured) {
  console.error(`❌ SMTP credentials missing in server/.env!`);
  console.error(`Please set SMTP_USER and SMTP_PASS in server/.env`);
  process.exit(1);
}
console.log(`✓ SMTP Host: ${env.email.host}:${env.email.port}`);
console.log(`✓ SMTP Sender: ${env.email.from}`);

await connectDatabase();

try {
  // 1. Find or prepare target user
  console.log(`\nStep 1: Preparing user account for ${targetEmail}...`);
  let user = await User.findOne({ email: targetEmail.trim().toLowerCase() });

  if (!user) {
    console.log(`Creating temporary test user for ${targetEmail}...`);
    user = await User.create({
      email: targetEmail.trim().toLowerCase(),
      name: 'ทดสอบ แจ้งเตือน',
      notificationConsent: true,
      profile: {
        skills: ['Next.js', 'React', 'Node.js', 'PostgreSQL', 'Docker', 'TypeScript', 'Tailwind CSS', 'Python'],
        budgetMin: 500_000,
        budgetMax: 20_000_000,
        matchNotification: {
          enabled: true,
          minScore: 50,
          frequency: 'instant',
        },
      },
    });
  } else {
    // Update existing user with consent & skills for test
    user.notificationConsent = true;
    if (!user.profile?.skills || user.profile.skills.length === 0) {
      user.profile = user.profile || {};
      user.profile.skills = ['Next.js', 'React', 'Node.js', 'PostgreSQL', 'Docker', 'TypeScript'];
    }
    user.profile.matchNotification = user.profile.matchNotification || {};
    user.profile.matchNotification.enabled = true;
    user.profile.matchNotification.minScore = 50;
    await user.save();
  }
  console.log(`✓ User ready: ${user.email} (notificationConsent: true)`);
  console.log(`  Skills: ${user.profile.skills.join(', ')}`);

  // 2. Check available TORs in DB
  const torCount = await TorInsight.countDocuments();
  console.log(`\nStep 2: Checking TOR database... (Found ${torCount} TOR insights)`);

  // 3. Phase 1: Generate Staged Notification
  console.log(`\nStep 3: Running Phase 1 (generateMatchNotifications)...`);
  const stageResult = await generateMatchNotifications({ minScore: 50 });
  console.log(`✓ Staged notifications created:`, stageResult);

  // 4. Phase 2: Dispatch Email via Gmail SMTP
  console.log(`\nStep 4: Running Phase 2 (dispatchPendingMatchEmails)...`);
  const emailResult = await dispatchPendingMatchEmails();
  console.log(`✓ Email dispatch results:`, emailResult);

  if (emailResult.emailsSent > 0) {
    console.log(`\n🎉 SUCCESS! Notification email has been sent to ${targetEmail}! Check your inbox!`);
  } else {
    console.log(`\n⚠️ No emails sent. (Matched items count was 0, or user had no matches)`);
  }
} catch (error) {
  console.error('\n❌ Test failed with error:', error);
} finally {
  await disconnectDatabase();
  console.log('\n======================================================\n');
}
