/**
 * server/src/pipeline/index.js
 *
 * Public surface of the pipeline module (per ADR 0003 Rule 2).
 */

export { fetchFromProcess3 } from './sources/process3.js';
export { fetchFromDataGo } from './sources/datago.js';
export { extractText, cleanOcrText } from './lib/ocr.js';
export { classifyIT, IT_KEYWORDS } from './lib/classifier.js';
export {
  convertThaiDigitsToArabic,
  downloadTorPdf,
  resolveAndDownloadEgpTorDocument,
  parseTorDocument,
} from './lib/tor-downloader.js';
