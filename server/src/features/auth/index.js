// The public surface of this feature. Other features import from here and never
// reach into the files beside it. requireAuth is the export they will want:
// watchlists (FR11) and match profiles (FR07) both hang off a known user.
// authRateLimits is exported so app.js can name the defaults it passes back in.
export { createAuthRoutes } from './auth.routes.js';
export { requireAuth } from './auth.middleware.js';
export { toPublicUser } from './auth.service.js';
export { authRateLimits } from './rate-limit.js';
