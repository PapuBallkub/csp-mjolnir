import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';

import { env } from '#common/config/env.js';
import { errorHandler } from '#common/middleware/error-handler.js';
import { notFoundHandler } from '#common/middleware/not-found.js';
import { authRoutes } from '#features/auth/index.js';
import { healthRoutes } from '#features/health/index.js';

// Builds the app without listening, so a test can drive it directly.
export function createApp() {
  const app = express();

  // `credentials` is what lets the browser send the session cookie on a
  // cross-origin request at all, and it only works against a named origin —
  // pair it with `origin: '*'` and the browser refuses every response.
  app.use(cors({ origin: env.corsOrigin, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  // One mount per feature. Each feature owns everything below its prefix.
  app.use('/health', healthRoutes);
  app.use('/auth', authRoutes);

  // Both stay last, and in this order.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
