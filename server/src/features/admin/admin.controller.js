import {
  dismissPipelineFailure,
  getOperations,
  reExtractTor,
  retryPipelineStep,
  triggerIngestion,
  updateTorReview,
} from './admin.service.js';

export async function readOperations(req, res, next) {
  try {
    const data = await getOperations();
    res.json(data);
  } catch (err) {
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

export async function handleRetryPipelineStep(req, res, next) {
  try {
    const { projectId, step } = req.body || {};
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

    const result = await retryPipelineStep(projectId, step);
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

