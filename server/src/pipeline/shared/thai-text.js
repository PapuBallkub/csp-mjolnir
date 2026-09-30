/**
 * server/src/pipeline/shared/thai-text.js
 *
 * Thai text helpers used by both pipelines: ingestion reads Thai digits out of
 * feed IDs and PDFs, and extraction compares quotes against OCR text.
 */

/**
 * Converts Thai digits (๐-๙) to standard Arabic digits (0-9).
 * @param {string} str
 * @returns {string}
 */
export function convertThaiDigitsToArabic(str) {
  if (!str) return '';
  const thaiDigits = ['๐', '๑', '๒', '๓', '๔', '๕', '๖', '๗', '๘', '๙'];
  return str.replace(/[๐-๙]/g, (char) => {
    const idx = thaiDigits.indexOf(char);
    return idx !== -1 ? String(idx) : char;
  });
}
