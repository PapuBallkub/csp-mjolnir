import { Router } from 'express';
import { limitByIp } from '#common/middleware/rate-limit.js';
import { getTorsHandler, getTorDetailHandler, getTorFacetsHandler, getTorPreviewHandler } from './tor.controller.js';
import { torRateLimits } from './rate-limit.js';

// Built per app, so a test can drive the real limiter with its own numbers
export function createTorRoutes(limits = torRateLimits) {
  const torRoutes = Router();

  // Public endpoints — discovering TORs and reading detail is open to anyone (FR-10, AGENTS.md §3)
  torRoutes.get('/', getTorsHandler);
  // Before /:projectId, which would otherwise take "facets" as a project ID
  torRoutes.get('/facets', getTorFacetsHandler);

  // One limiter on both paths: /pdf is an alias, and two instances would
  // each keep their own count, doubling the budget
  const previewLimit = limitByIp(limits.preview);
  torRoutes.get('/:projectId/preview', previewLimit, getTorPreviewHandler);
  torRoutes.get('/:projectId/pdf', previewLimit, getTorPreviewHandler);

  torRoutes.get('/:projectId', getTorDetailHandler);

  return torRoutes;
}
