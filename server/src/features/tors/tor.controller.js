import fs from 'node:fs';
import { Readable } from 'node:stream';
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
    const part = req.query.part !== undefined ? req.query.part : 0;
    const role = req.query.role;
    const zipId = req.query.zipId;
    const version = req.query.version;

    const pdfInfo = await getTorPdfStream(projectId, { part, role, zipId, version });
    if (!pdfInfo) {
      return res.status(404).json({
        error: {
          message: `PDF document for project '${projectId}' is not available`,
        },
      });
    }

    const totalSize = pdfInfo.contentLength;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(pdfInfo.fileName)}"`);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=3600');

    const range = req.headers.range;
    if (range && totalSize) {
      const matches = range.match(/^bytes=(\d*)-(\d*)$/);
      if (matches) {
        let start = matches[1] ? parseInt(matches[1], 10) : 0;
        let end = matches[2] ? parseInt(matches[2], 10) : totalSize - 1;

        if (isNaN(start) && !isNaN(end)) {
          start = totalSize - end;
          end = totalSize - 1;
        }

        if (start >= totalSize || end >= totalSize || start > end) {
          res.setHeader('Content-Range', `bytes */${totalSize}`);
          return res.status(416).end();
        }

        const chunksize = end - start + 1;
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`);
        res.setHeader('Content-Length', chunksize);

        if (pdfInfo.storagePath && fs.existsSync(pdfInfo.storagePath)) {
          fs.createReadStream(pdfInfo.storagePath, { start, end }).pipe(res);
        } else if (pdfInfo.buffer) {
          Readable.from(pdfInfo.buffer.subarray(start, end + 1)).pipe(res);
        } else {
          pdfInfo.stream.pipe(res);
        }
        return;
      }
    }

    if (totalSize) {
      res.setHeader('Content-Length', totalSize);
    }

    pdfInfo.stream.pipe(res);
  } catch (err) {
    next(err);
  }
}

