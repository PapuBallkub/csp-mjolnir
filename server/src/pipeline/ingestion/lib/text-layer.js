/**
 * server/src/pipeline/ingestion/lib/text-layer.js
 *
 * Whether a PDF's text layer can be read as it is (ADR 0020). A scan has
 * none. Some TORs have one that is garbage: typed in an old non-Unicode Thai
 * font, their Thai letters come out as Latin ones ("{rt ruxruifl 'r:fr").
 * Either way the document has to be OCR'd.
 */

// pdf-parse marks each page ("-- 1 of 12 --"); those aren't the document's text
const PAGE_MARKERS = /--\s*\d+\s*of\s*\d+\s*--/gi;

/** Below this many characters, a text layer is a scan's stray marks. */
export const MIN_TEXT_CHARS = 50;

/**
 * Below this share of Thai letters, the text layer is garbage. On our files a
 * garbled layer had 0% and real Thai documents 94–100%. A TOR in English only
 * would be OCR'd needlessly, which costs time but loses nothing.
 */
export const MIN_THAI_SHARE = 0.2;

/** The share of Thai letters among all letters, 0 when there are none. */
export function thaiShare(text) {
  const thai = (text.match(/[ก-๎]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  return thai + latin === 0 ? 0 : thai / (thai + latin);
}

/**
 * 'text' when the layer can be read as it is, 'scan' when there's next to
 * none, 'garbled' when it's there but isn't Thai.
 *
 * @param {string} text - The PDF's text layer, as pdf-parse gives it
 * @returns {'text' | 'scan' | 'garbled'}
 */
export function textLayerOf(text) {
  const body = (text ?? '').replace(PAGE_MARKERS, '').trim();
  if (body.length < MIN_TEXT_CHARS) return 'scan';
  return thaiShare(body) < MIN_THAI_SHARE ? 'garbled' : 'text';
}
