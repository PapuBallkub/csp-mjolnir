/**
 * server/scripts/notify.js
 *
 * Runs notification batch operations from the command line, cron, or Cloud Scheduler.
 *
 * Usage:
 *   npm run notify         # Stage in-app notifications from active TORs (Phase 1)
 *   npm run notify:send    # Dispatch staged emails to users with PDPA consent (Phase 2 at 08:00 AM)
 *   npm run notify:all     # Run both staging and email dispatch in one step
 */

import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import {
  dispatchPendingMatchEmails,
  generateMatchNotifications,
  runMatchNotificationCycle,
} from '#features/notifications/index.js';

const mode = process.argv[2] ?? '--stage';

await connectDatabase();

try {
  console.log(`\n=== GIPDP Notification Job (${mode}) ===`);

  if (mode === '--send') {
    console.log('Dispatching pending match digest emails to consented users...');
    const result = await dispatchPendingMatchEmails();
    console.log('Dispatch summary:', result);
  } else if (mode === '--all') {
    console.log('Running full notification cycle (staging + email dispatch)...');
    const result = await runMatchNotificationCycle();
    console.log('Cycle summary:', result);
  } else {
    // Default: --stage
    console.log('Evaluating candidate TORs and generating in-app notifications...');
    const result = await generateMatchNotifications();
    console.log('Staging summary:', result);
  }

  console.log('=== Notification Job Finished ===\n');
} catch (error) {
  console.error('\nNotification job failed:', error);
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
