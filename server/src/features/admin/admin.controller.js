import {
  addManualProcurementRecord,
  checkSourcesHealth,
  createAdminTechnology,
  deleteAdminTechnology,
  dismissPipelineFailure,
  getAdminTechnologies,
  getOperations,
  getPipelineRecordDiagnostics,
  getPipelineTasks,
  getTorReviewItem,
  getTorVersions,
  listReviewQueue,
  reExtractTor,
  retryAllPipelineFailures,
  retryPipelineStep,
  rollbackTorVersion,
  skipPipelineStep,
  suggestProjects,
  triggerIngestion,
  updateAdminTechnology,
  updateTorReview,
} from './admin.service.js';
import { badRequest, HttpError } from '#common/errors/http-error.js';

// A search box's value: absent is '', and a repeated ?search= (which Express
// hands over as an array) is a 400 rather than a crash in .trim()
function searchParam(query, name) {
  const value = query?.[name];
  if (value === undefined) return '';
  if (typeof value !== 'string') throw badRequest(`ระบุ ${name} ได้ครั้งเดียว`);
  return value;
}

export async function readOperations(req, res, next) {
  try {
    const data = await getOperations();
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function handleListReviewQueue(req, res, next) {
  try {
    const q = searchParam(req.query, 'q');
    const tab = searchParam(req.query, 'tab') || 'ready';
    const sort = searchParam(req.query, 'sort') || 'newest';
    const page = searchParam(req.query, 'page') || '1';
    const limit = searchParam(req.query, 'limit') || '25';
    const result = await listReviewQueue({ tab, sort, q, page, limit });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function handleGetReviewItem(req, res, next) {
  try {
    const { projectId } = req.params;
    const result = await getTorReviewItem(projectId);
    res.json(result);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({
        error: { message: err.message },
      });
    }
    next(err);
  }
}

export async function handleUpdateReview(req, res, next) {
  try {
    const { projectId } = req.params;
    const { action, fields, reclassifyReason } = req.body || {};

    if (!action) {
      return res.status(400).json({
        error: {
          message: 'action is required (approve, reclassify, or confirm_classification)',
        },
      });
    }

    const result = await updateTorReview(
      projectId,
      { action, fields, reclassifyReason },
      req.user,
    );

    res.json(result);
  } catch (err) {
    next(err);
  }
}

// A service error carrying a status (400, 404, 409) answers with it: the error
// handler reads a status from an HttpError only
const asHttp = (err) =>
  err instanceof HttpError || !Number.isInteger(err?.status) ? err : new HttpError(err.status, err.message);

/** A TOR's kept summary versions, newest first (NFR-07, ADR 0031). */
export async function handleListVersions(req, res, next) {
  try {
    res.json(await getTorVersions(req.params.projectId));
  } catch (err) {
    next(asHttp(err));
  }
}

/** Brings an older version back: `{ version }` (NFR-07, ADR 0031). */
export async function handleRollback(req, res, next) {
  try {
    res.json(await rollbackTorVersion(req.params.projectId, req.body?.version, req.user));
  } catch (err) {
    next(asHttp(err));
  }
}

export async function handleReExtract(req, res, next) {
  try {
    const { projectId } = req.params;
    const result = await reExtractTor(projectId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function handleTriggerIngest(req, res, next) {
  try {
    const { source, limit } = req.body || {};
    const result = await triggerIngestion({ source, limit });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function handleCheckSourcesHealth(req, res, next) {
  try {
    const { source = 'all' } = req.body || {};
    const result = await checkSourcesHealth({ source });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function handleRetryPipelineStep(req, res, next) {
  try {
    const { projectId, step, runNow = false, maxPages } = req.body || {};
    if (!projectId || !step) {
      return res.status(400).json({
        error: { message: 'projectId and step (download, ocr, extract) are required' },
      });
    }

    const validSteps = ['download', 'ocr', 'extract'];
    if (!validSteps.includes(step)) {
      return res.status(400).json({
        error: { message: `step must be one of: ${validSteps.join(', ')}` },
      });
    }

    const result = await retryPipelineStep(projectId, step, {
      runNow: Boolean(runNow),
      maxPages: maxPages ? Number(maxPages) : null,
    });
    res.json(result);
  } catch (err) {
    if (err.name === 'RunLockHeldError' || err.code === 'RUN_LOCK_HELD') {
      return res.status(409).json({
        error: {
          message:
            'Pipeline is currently executing another job. Step failure was cleared and re-queued for the next cycle.',
        },
      });
    }
    next(err);
  }
}

export async function handleRetryAllPipelineFailures(req, res, next) {
  try {
    const { step = 'all', transientOnly = true } = req.body || {};
    const validSteps = ['download', 'ocr', 'extract', 'all'];
    if (step && !validSteps.includes(step)) {
      return res.status(400).json({
        error: { message: `step must be one of: ${validSteps.join(', ')}` },
      });
    }

    const result = await retryAllPipelineFailures({ step, transientOnly: Boolean(transientOnly) });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function handleDismissPipelineFailure(req, res, next) {
  try {
    const { projectId, step, reason } = req.body || {};
    if (!projectId || !step) {
      return res.status(400).json({
        error: { message: 'projectId and step (download, ocr, extract) are required' },
      });
    }

    const validSteps = ['download', 'ocr', 'extract'];
    if (!validSteps.includes(step)) {
      return res.status(400).json({
        error: { message: `step must be one of: ${validSteps.join(', ')}` },
      });
    }

    const result = await dismissPipelineFailure(projectId, step, reason);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function handleGetPipelineRecord(req, res, next) {
  try {
    const { projectId } = req.params;
    const result = await getPipelineRecordDiagnostics(projectId);
    res.json(result);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({
        error: { message: err.message },
      });
    }
    next(err);
  }
}

export async function handleAddManualRecord(req, res, next) {
  try {
    const { projectId } = req.body || {};
    const result = await addManualProcurementRecord({ projectId });
    res.json(result);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({
        error: { message: err.message },
      });
    }
    if (err.name === 'RunLockHeldError' || err.code === 'RUN_LOCK_HELD') {
      return res.status(409).json({
        error: {
          message:
            'Pipeline is currently executing another job. Please try again shortly.',
        },
      });
    }
    next(err);
  }
}

export async function handleSuggestProjects(req, res, next) {
  try {
    const q = searchParam(req.query, 'q');
    const results = await suggestProjects(q);
    res.json(results);
  } catch (err) {
    next(err);
  }
}

export async function handleGetAdminTechnologies(req, res, next) {
  try {
    const { status, page, limit } = req.query;
    const search = searchParam(req.query, 'search');
    const result = await getAdminTechnologies({ status, search, page, limit });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function handleCreateAdminTechnology(req, res, next) {
  try {
    const { name, category, aliases, status } = req.body || {};
    const result = await createAdminTechnology({ name, category, aliases, status });
    res.status(201).json(result);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: { message: err.message } });
    }
    next(err);
  }
}

export async function handleUpdateAdminTechnology(req, res, next) {
  try {
    const { id } = req.params;
    const { name, category, aliases, status } = req.body || {};
    const result = await updateAdminTechnology(id, { name, category, aliases, status });
    res.json(result);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: { message: err.message } });
    }
    next(err);
  }
}

export async function handleDeleteAdminTechnology(req, res, next) {
  try {
    const { id } = req.params;
    const result = await deleteAdminTechnology(id);
    res.json(result);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: { message: err.message } });
    }
    next(err);
  }
}

export async function handleGetPipelineTasks(req, res, next) {
  try {
    const { phase = 'all', page = 1, limit = 25 } = req.query || {};
    const search = searchParam(req.query, 'search');
    const result = await getPipelineTasks({ phase, search, page, limit });
    res.json(result);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: { message: err.message } });
    }
    next(err);
  }
}

export async function handleSkipPipelineStep(req, res, next) {
  try {
    const { projectId, step } = req.body || {};
    const result = await skipPipelineStep(projectId, step);
    res.json(result);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: { message: err.message } });
    }
    next(err);
  }
}



