import path from 'node:path';

// Resolves server/data/documents relative to this file location (server/src/common/)
const DEFAULT_DOCUMENTS_DIR = path.resolve(import.meta.dirname, '../../data/documents');

/**
 * Resolves the documents directory path.
 * Honors the DOCUMENTS_DIR environment variable if provided,
 * otherwise resolves to server/data/documents consistently.
 */
export function getDocumentsDir() {
  return process.env.DOCUMENTS_DIR
    ? path.resolve(process.env.DOCUMENTS_DIR)
    : DEFAULT_DOCUMENTS_DIR;
}

/**
 * Where a stored file is on this machine, or null. Nothing outside the
 * documents folder is ever opened (ASVS V5.3.2): the preview and the rescan
 * both find files through this.
 *
 * The pipeline records absolute paths, and those differ between machines: a
 * laptop writes D:\…\server\data\documents\…, a container /app/data/documents/….
 * A recorded path is used as it is only when it already points inside this
 * machine's documents folder. Otherwise the part after its last segment named
 * like that folder is looked for under ours, so a database filled on a laptop
 * still works with the server in Docker.
 *
 * @param {string} storagePath - As the pipeline recorded it
 * @param {string} [documentsDir]
 * @returns {string | null}
 */
export function locateStoredFile(storagePath, documentsDir = getDocumentsDir()) {
  if (typeof storagePath !== 'string' || storagePath === '') return null;
  const root = path.resolve(documentsDir);
  const inside = (candidate) => candidate.startsWith(root + path.sep);

  const asRecorded = path.resolve(storagePath);
  if (inside(asRecorded)) return asRecorded;

  const segments = storagePath.split(/[\\/]+/);
  const at = segments.lastIndexOf(path.basename(root));
  if (at === -1) return null;
  const moved = path.resolve(root, ...segments.slice(at + 1));
  return inside(moved) ? moved : null;
}
