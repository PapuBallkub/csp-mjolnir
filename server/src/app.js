import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';

import { env } from '#common/config/env.js';
import { errorHandler } from '#common/middleware/error-handler.js';
import { notFoundHandler } from '#common/middleware/not-found.js';
import { authRateLimits, createAuthRoutes } from '#features/auth/index.js';
import { healthRoutes } from '#features/health/index.js';

// Builds the app without listening, so a test can drive it directly. rateLimits
// is injectable for the same reason: the suite drives the real routes, so it
// spends real budget, and production numbers should be chosen for production
// rather than sized around how many requests the tests happen to make.
export function createApp({ rateLimits = authRateLimits } = {}) {
  const app = express();

  // Without this every request behind a proxy reports the proxy's address, so
  // the whole internet would share one rate limit bucket. A count, never
  // `true` — see the note in config/env.js.
  app.set('trust proxy', env.trustProxyHops);

  // credentials is what sends the session cookie cross-origin at all, and it
  // needs a named origin: with '*' the browser rejects every response.
  app.use(cors({ origin: env.corsOrigin, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  // One mount per feature. Each feature owns everything below its prefix.
  app.get('/', (req, res) => {
    res.json({ message: 'Mjolnir API Server is running', status: 'ok', health: '/health' });
  });

  // Unlimited on purpose: an uptime monitor polling this is the point of it,
  // and a limiter here would eventually report an outage that is not one.
  app.use('/health', healthRoutes);
  app.use('/auth', createAuthRoutes(rateLimits));

  // Both stay last, and in this order.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
