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

/**
 * Reads a baht amount from a feed value or TOR text, such as "1,850,000.00",
 * "๑,๘๕๐,๐๐๐" or 1850000. Returns null when there is no usable amount, never
 * 0: a missing price must read as "not specified", not as ฿0 (ADR 0014).
 *
 * @param {string | number | null | undefined} raw
 * @returns {number | null}
 */
export function parseThaiAmount(raw) {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  }

  if (typeof raw !== 'string') return null;

  const normalized = convertThaiDigitsToArabic(raw).trim();

  // Accept plain digits or correctly grouped thousands,
  // with optional satang and a "บาท" suffix.
  const match = normalized.match(
    /^(\d+|\d{1,3}(?:,\d{3})+)(\.\d{1,2})?(?:\s*บาท)?$/
  );

  if (!match) return null;

  const amount = Number(
    match[1].replace(/,/g, '') + (match[2] ?? '')
  );

  return Number.isFinite(amount) && amount > 0 ? amount : null;
}
