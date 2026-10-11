import { Router } from 'express';
import { requireAuth } from '#features/auth/index.js';
import { list, remove, save } from './watchlist.controller.js';

export function createWatchlistRoutes() {
  const routes = Router();

  // All watchlist operations require an authenticated user.
  routes.get('/', requireAuth, list);
  routes.put('/:projectId', requireAuth, save);
  routes.delete('/:projectId', requireAuth, remove);

  return routes;
}
