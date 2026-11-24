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
  handleListReviewQueue,
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
import { auditAdminAction } from './audit.js';
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

  // One budget across the five POSTs that trigger costly external, queue or mail
  // work (ADR 0007, ASVS V2.4.1, V8): a fetch and a health check call e-GP, a
  // retry-all puts every failed TOR back in the night's queue, a re-extraction
  // sends a summary back to review, which takes it off the public site, and a
  // password reset sends a user an email. Works alongside SameSite=Lax session
  // cookies as defense-in-depth.
  const costly = limitByUser({ ...limits.adminCostly, name: 'adminCostly' });

  // Every route that changes something goes through here, so none can be
  // added without its audit line (ADR 0043). The fields named are the only
  // ones from the body the line keeps: never extracted text or free text.
  // The audit runs before the limiter, so a refused attempt is a line too.
  const write = (method, path, picks, ...handlers) =>
    adminRoutes[method](path, auditAdminAction(picks), ...handlers);

  // No rate limit: an admin refreshing a dashboard is the intended use, and a
  // limiter here would eventually hide a pipeline failure behind a 429.
  adminRoutes.get('/operations', readOperations);

  // Paginated, filterable, searchable review queue (FR-23, NFR-17)
  adminRoutes.get('/review-queue', handleListReviewQueue);

  // Get single review item for dedicated review workspace (FR-23)
  adminRoutes.get('/review/:projectId', handleGetReviewItem);

  // Review actions: manually edit extracted fields, approve, or reclassify (FR-23)
  write('patch', '/review/:projectId', ['action'], handleUpdateReview);

  // Queue a document for re-extraction
  write('post', '/review/:projectId/re-extract', [], costly, handleReExtract);

  // The summaries a change replaced, and bringing one back (NFR-07, ADR 0031)
  adminRoutes.get('/review/:projectId/versions', handleListVersions);
  write('post', '/review/:projectId/rollback', ['version'], handleRollback);

  // Trigger on-demand ingestion poll across procurement feeds
  write('post', '/ingest', ['source', 'limit'], costly, handleTriggerIngest);

  // Health check: test connectivity & latency for procurement sources (FR-22)
  write('post', '/health-check', ['source'], costly, handleCheckSourcesHealth);

  // Send a user a link to set a new password (ADR 0042, ASVS V6.4.6). The admin
  // names the address and nothing else, and never sees the link. auth owns the
  // handler; it sends email, so it shares the costly budget.
  write('post', '/users/password-reset', ['email'], costly, createAdminPasswordResetHandler(mail));

  // Re-trigger / retry a failed pipeline step (FR-24)
  write('post', '/pipeline/retry', ['projectId', 'step', 'runNow'], handleRetryPipelineStep);

  // Bulk retry all transient pipeline failures (FR-24)
  write('post', '/pipeline/retry-all', ['step', 'transientOnly'], costly, handleRetryAllPipelineFailures);

  // Advance past a stuck pipeline step (FR-24)
  write('post', '/pipeline/skip', ['projectId', 'step'], handleSkipPipelineStep);

  // Query pipeline tasks with phase filtering and search (FR-24)
  adminRoutes.get('/pipeline/tasks', handleGetPipelineTasks);

  // Dismiss a permanent pipeline failure (FR-24)
  write('post', '/pipeline/dismiss', ['projectId', 'step'], handleDismissPipelineFailure);

  // Record-level lifecycle diagnostics (FR-24)
  adminRoutes.get('/pipeline/record/:projectId', handleGetPipelineRecord);

  // Manually add procurement record from e-GP reference (FR-24)
  write('post', '/pipeline/add', ['projectId'], handleAddManualRecord);

  // Live project suggestion / autocomplete for Project Inspector (FR-24)
  adminRoutes.get('/projects/suggest', handleSuggestProjects);

  // Technology and standard vocabulary administration (directory, review, add, edit, delete)
  adminRoutes.get('/technologies', handleGetAdminTechnologies);
  write('post', '/technologies', ['name'], handleCreateAdminTechnology);
  write('patch', '/technologies/:id', ['name', 'status'], handleUpdateAdminTechnology);
  write('delete', '/technologies/:id', [], handleDeleteAdminTechnology);

  return adminRoutes;
}
