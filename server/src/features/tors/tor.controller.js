import fs from 'node:fs';
import { pipeline } from 'node:stream';
import { badRequest } from '#common/errors/http-error.js';
import { listTors, getTorByProjectId, torFacets, findStoredDocument } from './tor.service.js';

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
          message: `ไม่พบข้อมูลโครงการ TOR '${projectId}'`,
        },
      });
    }

    res.json(tor);
  } catch (err) {
    next(err);
  }
}

const PREVIEW_ROLES = ['tor', 'bidding', 'announcement'];

/**
 * The preview's query, checked before it reaches the service (ASVS V2.2.1).
 * Anything else is a 400: an unknown role used to fall back to the TOR, and a
 * repeated parameter arrives as an array. Parameters not named here are
 * ignored, so a cache-buster can't break a preview.
 *
 * `part` also takes a role name, an older form: on its own it picks that role.
 */
function parsePreviewQuery(query) {
  const single = (name) => {
    const value = query[name];
    if (value === undefined) return undefined;
    if (typeof value !== 'string') throw badRequest(`ระบุ ${name} ได้ครั้งเดียว`);
    return value.trim().toLowerCase();
  };

  const roleParam = single('role');
  if (roleParam !== undefined && !PREVIEW_ROLES.includes(roleParam)) {
    throw badRequest('role ต้องเป็น tor, bidding หรือ announcement');
  }
  let role = roleParam ?? null;

  const partParam = single('part');
  let part = 0;
  if (partParam !== undefined) {
    if (/^\d{1,2}$/.test(partParam)) {
      part = Number(partParam);
    } else if (PREVIEW_ROLES.includes(partParam)) {
      if (!role) {
        role = partParam;
        part = PREVIEW_ROLES.indexOf(partParam);
      }
    } else {
      throw badRequest('part ต้องเป็นเลข 0–99 หรือชื่อเอกสาร');
    }
  }

  const versionParam = single('version');
  if (versionParam !== undefined && !/^[1-9]\d{0,3}$/.test(versionParam)) {
    throw badRequest('version ต้องเป็นเลขตั้งแต่ 1 ขึ้นไป');
  }

  // e-GP package ids are 32 hex digits, as every stored one is
  const zipParam = single('zipId');
  if (zipParam !== undefined && !/^[0-9a-f]{32}$/.test(zipParam)) {
    throw badRequest('zipId ไม่ถูกต้อง');
  }

  return {
    role,
    part,
    version: versionParam === undefined ? null : Number(versionParam),
    zipId: zipParam ?? null,
  };
}

// RFC 6266: a plain ASCII name for old clients, and the real one, Thai
// included, in filename* (RFC 8187). Neither can carry a quote or a newline.
function contentDisposition(fileName) {
  const ascii = fileName.replace(/[^\x20-\x7e]|["\\%]/g, '_');
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `inline; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

// What a visitor gets when there is no file to show (ADR 0038). The
// codes are what the preview window picks its message by.
const MISSING = {
  'no-tor': { code: 'TOR_NOT_FOUND', message: (id) => `ไม่มีโครงการ '${id}' ในระบบ` },
  'not-stored': { code: 'DOCUMENT_NOT_STORED', message: (id) => `ยังไม่มีสำเนาเอกสารของโครงการ '${id}' ในระบบ` },
  'no-public-document': {
    code: 'NO_PUBLIC_DOCUMENT_FOR_METHOD',
    message: (id) => `ไม่มีเอกสาร PDF สำหรับโครงการ '${id}'`,
  },
};

export async function getTorPreviewHandler(req, res, next) {
  try {
    const { projectId } = req.params;
    const query = parsePreviewQuery(req.query);

    const found = await findStoredDocument(projectId, query);
    if (!found.file) {
      const missing = MISSING[found.reason];
      return res.status(404).json({
        error: {
          message: missing.message(projectId),
          code: missing.code,
          procurementMethod: found.procurementMethod ?? null,
          title: found.title ?? null,
        },
      });
    }

    const { file } = found;
    const totalSize = file.size;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', contentDisposition(file.fileName));
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=3600');

    // Opened here rather than in the service, so a Range request opens only
    // the range it reads. pipeline closes the file if the visitor goes away.
    const send = (options) =>
      pipeline(fs.createReadStream(file.path, options), res, (err) => {
        if (err && !res.headersSent) next(err);
      });

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
        return send({ start, end });
      }
    }

    res.setHeader('Content-Length', totalSize);
    send();
  } catch (err) {
    next(err);
  }
}

