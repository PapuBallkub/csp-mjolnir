import { Router } from 'express';
import { getTorsHandler, getTorDetailHandler, getTorFacetsHandler } from './tor.controller.js';

export const torRoutes = Router();

// Public endpoints — discovering TORs and reading detail is open to anyone (FR-10, AGENTS.md §3)
torRoutes.get('/', getTorsHandler);
// Before /:projectId, which would otherwise take "facets" as a project ID
torRoutes.get('/facets', getTorFacetsHandler);
torRoutes.get('/:projectId', getTorDetailHandler);
