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
