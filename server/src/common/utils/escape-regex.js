/**
 * Escapes characters with special meaning in regular expressions.
 * Prevents ReDoS and syntax errors when embedding dynamic inputs into RegExp (ASVS V15.3.7).
 *
 * @param {string} text
 * @returns {string}
 */
export function escapeRegex(text) {
  if (typeof text !== 'string') {
    return '';
  }
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
