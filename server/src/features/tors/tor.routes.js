import { Router } from 'express';
import { getTorsHandler, getTorDetailHandler } from './tor.controller.js';

export const torRoutes = Router();

// Public endpoints — discovering TORs and reading detail is open to anyone (FR-10, AGENTS.md §3)
torRoutes.get('/', getTorsHandler);
torRoutes.get('/:projectId', getTorDetailHandler);
