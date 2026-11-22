// Loaded before every test file (`npm test`, through --import): the app under
// test writes a security log line for each sign-in, denial and admin action
// (ADR 0043), and a suite that signs in hundreds of times would bury its own
// report under them. A test about the log captures it (security-log.js beside
// this), which replaces this sink for that test and puts it back after.

import { setSecurityLogSink } from '#common/logging/security-log.js';

setSecurityLogSink(() => {});
