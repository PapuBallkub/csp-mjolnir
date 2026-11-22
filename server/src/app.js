import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';

import { env, isEmailConfigured, isProduction } from '#common/config/env.js';
import { errorHandler } from '#common/middleware/error-handler.js';
import { notFoundHandler } from '#common/middleware/not-found.js';
import { adminRateLimits, createAdminRoutes } from '#features/admin/index.js';
import { authRateLimits, createAuthRoutes } from '#features/auth/index.js';
import { healthRoutes } from '#features/health/index.js';
import { createNotificationRoutes, sendEmail } from '#features/notifications/index.js';
import { createProfileRoutes } from '#features/profile/index.js';
import { createTechnologyRoutes, technologyRateLimits } from '#features/technologies/index.js';
import { createTorRoutes, torRateLimits } from '#features/tors/index.js';
import { createWatchlistRoutes } from '#features/watchlist/index.js';

// Every limit outside auth, in one object: each feature sets its own numbers
// beside its routes, and this is where they meet.
export const apiRateLimits = { ...torRateLimits, ...technologyRateLimits, ...adminRateLimits };

// Builds the app without listening, so a test can drive it directly. The limits
// are injectable for the same reason: the suite drives the real routes, so it
// spends real budget, and production numbers should be chosen for production
// rather than sized around how many requests the tests happen to make.
// apiRateLimits is merged over the defaults, so a test names only the limit it
// is about.
//
// mail is how accounts send email (confirm links, 0041). Wired here rather
// than imported by auth, because notifications already imports auth's
// requireAuth, and a test passes its own so nothing is really sent.
export function createApp({
  rateLimits = authRateLimits,
  apiRateLimits: apiLimits = {},
  mail = { configured: isEmailConfigured, send: sendEmail },
} = {}) {
  const limits = { ...apiRateLimits, ...apiLimits };
  const app = express();

  // ASVS V13.4.6: Disable X-Powered-By header to avoid disclosing server framework.
  app.disable('x-powered-by');

  // ASVS V3.2, V3.4, V3.5, V12.2, V13.4, V14.3, V15.2: Core HTTP Security Headers
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'DENY');
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    res.set('Cross-Origin-Resource-Policy', 'same-site');
    res.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    res.set(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), browsing-topics=(), payment=(), usb=(), accelerometer=(), gyroscope=(), magnetometer=(), midi=(), screen-wake-lock=()'
    );
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

  app.use('/api/auth', createAuthRoutes(rateLimits, { mail }));

  // Guarded inside the feature rather than here: the router applies
  // requireAuth and requireRole('admin') to everything mounted under it, so a
  // route added later cannot be left open by forgetting a middleware. See 0011.
  app.use('/api/admin', createAdminRoutes(limits, { mail }));
  app.use('/api/tors', createTorRoutes(limits));
  app.use('/api/technologies', createTechnologyRoutes(limits));
  app.use('/api/profile', createProfileRoutes());
  app.use('/api/watchlist', createWatchlistRoutes());
  app.use('/api/notifications', createNotificationRoutes());

  // Both stay last, and in this order.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
