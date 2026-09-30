/**
 * server/src/pipeline/index.js
 *
 * Public surface of both pipelines (per ADR 0003 Rule 2). Ingestion and
 * extraction never import each other; they meet in the database. See ADR 0013.
 */

export * from './ingestion/index.js';
export { convertThaiDigitsToArabic } from './shared/thai-text.js';
