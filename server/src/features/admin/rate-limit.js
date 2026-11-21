const HOUR = 60 * 60 * 1000;

// Per admin, one budget across re-extract, ingest, health-check and retry-all
// (ASVS V2.4.1; admin.routes.js says why those four). Ten an hour is more than
// a person clicks while working through failures, and far less than a script
// would send. Starting numbers, to confirm once admins use the dashboard.
export const adminRateLimits = {
  adminCostly: { windowMs: HOUR, limit: 10 },
};
