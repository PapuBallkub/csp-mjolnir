import { Router } from 'express';

import { requireAuth, requireRole } from '#features/auth/index.js';

import {
  handleReExtract,
  handleUpdateReview,
  readOperations,
} from './admin.controller.js';

/**
 * Everything an administrator can see, and nothing anyone else can.
 *
 * The guard is the point of this feature existing at all. Before it, the
 * dashboard's data lived in the client bundle: scraper internals, document
 * ids, OCR confidence scores, all fetchable by anyone who knew the chunk URL.
 * Hiding the nav link did nothing about that, because nothing that ships to a
 * browser can be hidden from it. So the data moved here. See 0011 and 0012.
 *
 * requireAuth first, always. requireRole reads req.user, which requireAuth is
 * what sets — reverse them and every request 401s, an administrator's
 * included.
 */
export const adminRoutes = Router();

adminRoutes.use(requireAuth, requireRole('admin'));

// No rate limit: an admin refreshing a dashboard is the intended use, and a
// limiter here would eventually hide a pipeline failure behind a 429.
adminRoutes.get('/operations', readOperations);

// Review actions: manually edit extracted fields, approve, or reclassify (FR-23)
adminRoutes.patch('/review/:projectId', handleUpdateReview);

// Queue a document for re-extraction
adminRoutes.post('/review/:projectId/re-extract', handleReExtract);
