import cors from 'cors';
import express from 'express';

import { env } from '#common/config/env.js';
import { errorHandler } from '#common/middleware/error-handler.js';
import { notFoundHandler } from '#common/middleware/not-found.js';
import { healthRoutes } from '#features/health/index.js';

// Builds the app without listening, so a test can drive it directly.
export function createApp() {
  const app = express();

  app.use(cors({ origin: env.corsOrigin }));
  app.use(express.json());

  // One mount per feature. Each feature owns everything below its prefix.
  app.get('/', (req, res) => {
    res.json({ message: 'Mjolnir API Server is running', status: 'ok', health: '/health' });
  });

  app.use('/health', healthRoutes);

  // Both stay last, and in this order.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
