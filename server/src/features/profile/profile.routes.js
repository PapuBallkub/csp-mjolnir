import { Router } from 'express';

import { requireAuth } from '#features/auth/index.js';

import { update } from './profile.controller.js';

export function createProfileRoutes() {
  const routes = Router();

  // PATCH, not PUT: the caller sends only the fields that changed.
  // requireAuth guarantees req.user is populated.
  routes.patch('/', requireAuth, update);

  return routes;
}
