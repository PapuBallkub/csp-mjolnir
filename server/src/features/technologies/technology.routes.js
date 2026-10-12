import { Router } from 'express';
import { requireAuth } from '#features/auth/index.js';
import { getTechnologiesHandler, requestTechnologyHandler } from './technology.controller.js';

export const technologyRoutes = Router();

// Public vocabulary endpoint — open to anyone (ADR 0014, technology-schema.md)
technologyRoutes.get('/', getTechnologiesHandler);

// Authenticated request to suggest a new technology/standard for admin review
technologyRoutes.post('/request', requireAuth, requestTechnologyHandler);

