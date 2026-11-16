import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';

import { env, isProduction } from '#common/config/env.js';
import { errorHandler } from '#common/middleware/error-handler.js';
import { notFoundHandler } from '#common/middleware/not-found.js';
import { adminRoutes } from '#features/admin/index.js';
import { authRateLimits, createAuthRoutes } from '#features/auth/index.js';
import { healthRoutes } from '#features/health/index.js';
import { createNotificationRoutes } from '#features/notifications/index.js';
import { createProfileRoutes } from '#features/profile/index.js';
import { technologyRoutes } from '#features/technologies/index.js';
import { torRoutes } from '#features/tors/index.js';
import { createWatchlistRoutes } from '#features/watchlist/index.js';

// Builds the app without listening, so a test can drive it directly. rateLimits
// is injectable for the same reason: the suite drives the real routes, so it
// spends real budget, and production numbers should be chosen for production
// rather than sized around how many requests the tests happen to make.
export function createApp({ rateLimits = authRateLimits } = {}) {
  const app = express();

  // ASVS V13.4.6: Disable X-Powered-By header to avoid disclosing server framework.
  app.disable('x-powered-by');

  // ASVS V12.2.1, V13.4, V14.3, V15.2: Core HTTP Security Headers
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'SAMEORIGIN');
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (isProduction) {
      res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  // Without this every request behind a proxy reports the proxy's address, so
  // the whole internet would share one rate limit bucket. A count, never
  // `true` — see the note in config/env.js.
  app.set('trust proxy', env.trustProxyHops);

  // credentials is what sends the session cookie cross-origin at all, and it
  // needs a named origin: with '*' the browser rejects every response.
  app.use(cors({ origin: env.corsOrigin, credentials: true }));
  // ASVS V13.1.3, V15.2.2: Enforce request body size limit to prevent memory exhaustion DoS
  app.use(express.json({ limit: '50kb' }));
  app.use(cookieParser());

  // One mount per feature, all under /api. The prefix is what lets a reverse
  // proxy tell an API route from a client page route, so the two can share one
  // origin and the session cookie stops being cross-site. No version segment —
  // see 0009.
  app.get('/', (req, res) => {
    res.json({ message: 'Mjolnir API Server is running', status: 'ok', health: '/health' });
  });

  // Outside /api on purpose. This is infrastructure, not API: an uptime monitor
  // and the host's health check both probe it, and neither should have to move
  // when the API surface is reorganised. Unlimited for the same reason — a
  // limiter here would eventually report an outage that is not one.
  app.use('/health', healthRoutes);

  app.use('/api/auth', createAuthRoutes(rateLimits));

  // Guarded inside the feature rather than here: the router applies
  // requireAuth and requireRole('admin') to everything mounted under it, so a
  // route added later cannot be left open by forgetting a middleware. See 0011.
  app.use('/api/admin', adminRoutes);
  app.use('/api/tors', torRoutes);
  app.use('/api/technologies', technologyRoutes);
  app.use('/api/profile', createProfileRoutes());
  app.use('/api/watchlist', createWatchlistRoutes());
  app.use('/api/notifications', createNotificationRoutes());

  // Both stay last, and in this order.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
