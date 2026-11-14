import { Router } from 'express';
import { requireAuth } from '#features/auth/index.js';
import {
  getDetail,
  getFeed,
  markAllRead,
  markSingleRead,
  unsubscribe,
} from './notification.controller.js';

export function createNotificationRoutes() {
  const routes = Router();

  // Public: One-click email unsubscribe via HMAC token (no login barrier)
  routes.get('/unsubscribe', unsubscribe);
  routes.post('/unsubscribe', unsubscribe);

  // Authenticated user feed operations
  routes.get('/', requireAuth, getFeed);
  routes.patch('/read-all', requireAuth, markAllRead);
  routes.get('/:id', requireAuth, getDetail);
  routes.patch('/:id/read', requireAuth, markSingleRead);

  return routes;
}
