import { listTors, getTorByProjectId, torFacets } from './tor.service.js';

export async function getTorsHandler(req, res, next) {
  try {
    const result = await listTors(req.query);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getTorFacetsHandler(req, res, next) {
  try {
    res.json(await torFacets());
  } catch (err) {
    next(err);
  }
}

export async function getTorDetailHandler(req, res, next) {
  try {
    const { projectId } = req.params;
    const tor = await getTorByProjectId(projectId);

    if (!tor) {
      return res.status(404).json({
        error: {
          message: `TOR project '${projectId}' not found`,
        },
      });
    }

    res.json(tor);
  } catch (err) {
    next(err);
  }
}
