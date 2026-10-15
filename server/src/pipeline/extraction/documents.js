/**
 * server/src/pipeline/extraction/documents.js
 *
 * The documents an extraction reads (ADR 0025): the TOR, and the bidding
 * document (เอกสารประกวดราคา) from the TOR's latest announcement package. The
 * bidding document is the legal text of who may bid and on what terms, and a
 * real text layer where the TOR is often a scan.
 */

/** The names the extraction input and the evidence use for each document. */
export const DOCUMENTS = { tor: 'tor', bidding: 'bidding' };

/**
 * The bidding document's text, from the latest announcement package that has
 * one; '' for a TOR without one (data.go.th, or downloaded before ADR 0020).
 */
export function biddingTextOf(tor) {
  const packages = (tor?.packages ?? []).filter((pkg) => (pkg.kind ?? 'announcement') === 'announcement');
  for (const pkg of [...packages].reverse()) {
    if (pkg.biddingText?.trim()) return pkg.biddingText;
  }
  return '';
}

/**
 * pdf-parse ends each page with "-- 3 of 13 --"; the TOR's OCR text starts
 * each with "=== Page 3 ===". The bidding document is given the TOR's form,
 * so the model cites pages the same way in both.
 */
export function withPageHeaders(text) {
  const pages = String(text ?? '')
    .split(/--\s*\d+\s*of\s*\d+\s*--/)
    .map((page) => page.trim());
  while (pages.length > 1 && !pages.at(-1)) pages.pop(); // after the last marker
  return pages.map((page, index) => `=== Page ${index + 1} ===\n${page}`).join('\n\n');
}

/** Every text a quoted list item may come from: the TOR and the bidding document. */
export function textsOf(tor) {
  return [tor?.ocr?.rawText ?? '', biddingTextOf(tor)].filter(Boolean).join('\n\n');
}

/**
 * Whether an insight is a full extraction, built from the TOR and the bidding
 * document. An excluded or awaiting one was built from the TOR alone.
 *
 * @param {object | null | undefined} metadata - The insight's metadata
 */
export function isExtraction(metadata) {
  return Boolean(metadata) && !metadata.excluded && !metadata.awaitingFullText;
}
