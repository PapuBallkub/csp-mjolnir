// The public surface of this feature. Other features import from here and never
// reach into the files beside it.
//
// requireAuth is the export the rest of the server will actually use: watchlists
// (FR11) and match profiles (FR07) both hang off a known user.
export { authRoutes } from './auth.routes.js';
export { requireAuth } from './auth.middleware.js';
export { toPublicUser } from './auth.service.js';
