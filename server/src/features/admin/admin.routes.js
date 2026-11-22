import { Router } from 'express';

import { limitByUser } from '#common/middleware/rate-limit.js';
import { createAdminPasswordResetHandler, requireAuth, requireRole } from '#features/auth/index.js';

import {
  handleAddManualRecord,
  handleCheckSourcesHealth,
  handleCreateAdminTechnology,
  handleDeleteAdminTechnology,
  handleDismissPipelineFailure,
  handleGetAdminTechnologies,
  handleGetPipelineRecord,
  handleGetPipelineTasks,
  handleGetReviewItem,
  handleListVersions,
  handleReExtract,
  handleRetryAllPipelineFailures,
  handleRetryPipelineStep,
  handleRollback,
  handleSkipPipelineStep,
  handleSuggestProjects,
  handleTriggerIngest,
  handleUpdateAdminTechnology,
  handleUpdateReview,
  readOperations,
} from './admin.controller.js';
import { adminRateLimits } from './rate-limit.js';

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
 *
 * Built per app, so a test can drive the real limiter with its own numbers, and
 * pass the mailer the password-reset action sends with.
 */
export function createAdminRoutes(limits = adminRateLimits, { mail } = {}) {
  if (!mail) throw new Error('createAdminRoutes needs a mailer: { configured, send }');
  const adminRoutes = Router();

  adminRoutes.use(requireAuth, requireRole('admin'));

  // One budget across the four POSTs a forged request could do most with
  // while the session cookie is still SameSite=None (ADR 0007): a fetch
  // and a health check call e-GP, a retry-all puts every failed TOR back in the
  // night's queue, and a re-extraction sends a summary back to review, which
  // takes it off the public site.
  const costly = limitByUser(limits.adminCostly);

  // No rate limit: an admin refreshing a dashboard is the intended use, and a
  // limiter here would eventually hide a pipeline failure behind a 429.
  adminRoutes.get('/operations', readOperations);

  // Get single review item for dedicated review workspace (FR-23)
  adminRoutes.get('/review/:projectId', handleGetReviewItem);

  // Review actions: manually edit extracted fields, approve, or reclassify (FR-23)
  adminRoutes.patch('/review/:projectId', handleUpdateReview);

  // Queue a document for re-extraction
  adminRoutes.post('/review/:projectId/re-extract', costly, handleReExtract);

  // The summaries a change replaced, and bringing one back (NFR-07, ADR 0031)
  adminRoutes.get('/review/:projectId/versions', handleListVersions);
  adminRoutes.post('/review/:projectId/rollback', handleRollback);

  // Trigger on-demand ingestion poll across procurement feeds
  adminRoutes.post('/ingest', costly, handleTriggerIngest);

  // Health check: test connectivity & latency for procurement sources (FR-22)
  adminRoutes.post('/health-check', costly, handleCheckSourcesHealth);

  // Send a user a link to set a new password (ADR 0042, ASVS V6.4.6). The admin
  // names the address and nothing else, and never sees the link. auth owns the
  // handler; it sends email, so it shares the costly budget.
  adminRoutes.post('/users/password-reset', costly, createAdminPasswordResetHandler(mail));

  // Re-trigger / retry a failed pipeline step (FR-24)
  adminRoutes.post('/pipeline/retry', handleRetryPipelineStep);

  // Bulk retry all transient pipeline failures (FR-24)
  adminRoutes.post('/pipeline/retry-all', costly, handleRetryAllPipelineFailures);

  // Advance past a stuck pipeline step (FR-24)
  adminRoutes.post('/pipeline/skip', handleSkipPipelineStep);

  // Query pipeline tasks with phase filtering and search (FR-24)
  adminRoutes.get('/pipeline/tasks', handleGetPipelineTasks);

  // Dismiss a permanent pipeline failure (FR-24)
  adminRoutes.post('/pipeline/dismiss', handleDismissPipelineFailure);

  // Record-level lifecycle diagnostics (FR-24)
  adminRoutes.get('/pipeline/record/:projectId', handleGetPipelineRecord);

  // Manually add procurement record from e-GP reference (FR-24)
  adminRoutes.post('/pipeline/add', handleAddManualRecord);

  // Live project suggestion / autocomplete for Project Inspector (FR-24)
  adminRoutes.get('/projects/suggest', handleSuggestProjects);

  // Technology and standard vocabulary administration (directory, review, add, edit, delete)
  adminRoutes.get('/technologies', handleGetAdminTechnologies);
  adminRoutes.post('/technologies', handleCreateAdminTechnology);
  adminRoutes.patch('/technologies/:id', handleUpdateAdminTechnology);
  adminRoutes.delete('/technologies/:id', handleDeleteAdminTechnology);

  return adminRoutes;
}
