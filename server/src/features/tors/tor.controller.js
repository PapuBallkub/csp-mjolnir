import { listTors, getTorByProjectId, torFacets, getTorPdfStream } from './tor.service.js';

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

export async function getTorPreviewHandler(req, res, next) {
  try {
    const { projectId } = req.params;
    const part = Number(req.query.part || 0);

    const pdfInfo = await getTorPdfStream(projectId, { part });
    if (!pdfInfo) {
      return res.status(404).json({
        error: {
          message: `PDF document for project '${projectId}' is not available`,
        },
      });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(pdfInfo.fileName)}"`);
    if (pdfInfo.contentLength) {
      res.setHeader('Content-Length', pdfInfo.contentLength);
    }
    res.setHeader('Cache-Control', 'public, max-age=3600');

    pdfInfo.stream.pipe(res);
  } catch (err) {
    next(err);
  }
}

