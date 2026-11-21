import { Router } from 'express';
import { limitByUser } from '#common/middleware/rate-limit.js';
import { requireAuth } from '#features/auth/index.js';
import { getTechnologiesHandler, requestTechnologyHandler } from './technology.controller.js';
import { technologyRateLimits } from './rate-limit.js';

// Built per app, so a test can drive the real limiter with its own numbers
export function createTechnologyRoutes(limits = technologyRateLimits) {
  const technologyRoutes = Router();

  // Public vocabulary endpoint — open to anyone (ADR 0014, technology-schema.md)
  technologyRoutes.get('/', getTechnologiesHandler);

  // Authenticated request to suggest a new technology/standard for admin review.
  // The limiter counts per account, so it has to come after requireAuth.
  technologyRoutes.post('/request', requireAuth, limitByUser(limits.technologyRequest), requestTechnologyHandler);

  return technologyRoutes;
}
