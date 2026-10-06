import {
  getOperations,
  reExtractTor,
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
