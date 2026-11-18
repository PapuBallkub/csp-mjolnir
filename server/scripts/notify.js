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
  dispatchPendingWatchlistEmails,
  generateMatchNotifications,
  generateWatchlistNotifications,
  runMatchNotificationCycle,
  runWatchlistNotificationCycle,
} from '#features/notifications/index.js';

const mode = process.argv[2] ?? '--stage';

await connectDatabase();

try {
  console.log(`\n=== GIPDP Notification Job (${mode}) ===`);

  if (mode === '--send') {
    console.log('Dispatching pending match & watchlist digest emails to consented users...');
    const [matchResult, watchlistResult] = await Promise.all([
      dispatchPendingMatchEmails(),
      dispatchPendingWatchlistEmails(),
    ]);
    console.log('Match dispatch summary:', matchResult);
    console.log('Watchlist dispatch summary:', watchlistResult);
  } else if (mode === '--all') {
    console.log('Running full notification cycle (staging + email dispatch)...');
    const [matchResult, watchlistResult] = await Promise.all([
      runMatchNotificationCycle(),
      runWatchlistNotificationCycle(),
    ]);
    console.log('Match cycle summary:', matchResult);
    console.log('Watchlist cycle summary:', watchlistResult);
  } else {
    // Default: --stage
    console.log('Evaluating candidate TORs and generating in-app notifications...');
    const [matchResult, watchlistResult] = await Promise.all([
      generateMatchNotifications(),
      generateWatchlistNotifications(),
    ]);
    console.log('Match staging summary:', matchResult);
    console.log('Watchlist staging summary:', watchlistResult);
  }

  console.log('=== Notification Job Finished ===\n');
} catch (error) {
  console.error('\nNotification job failed:', error);
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
