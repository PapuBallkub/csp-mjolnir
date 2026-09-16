/**
 * server/src/pipeline/lib/classifier.js
 *
 * Keyword-based IT-relevance classifier (FR04).
 * Performs keyword frequency analysis against Thai and English procurement terms.
 */

export const IT_KEYWORDS = [
  // Thai procurement terms
  'คอมพิวเตอร์',
  'เครื่องคอมพิวเตอร์',
  'ซอฟต์แวร์',
  'ระบบสารสนเทศ',
  'เทคโนโลยีสารสนเทศ',
  'พัฒนาระบบ',
  'เว็บไซต์',
  'แอปพลิเคชัน',
  'ฐานข้อมูล',
  'เครือข่าย',
  'คลาวด์',
  'เซิร์ฟเวอร์',
  'เครื่องแม่ข่าย',
  'ดิจิทัล',
  'ไซเบอร์',
  'โปรแกรม',
  'ระบบบริหาร',
  'โน้ตบุ๊ก',
  'อุปกรณ์สารสนเทศ',
  'ศูนย์ข้อมูล',
  'ระบบจัดเก็บข้อมูล',

  // English procurement terms commonly found in Thai TORs
  'software',
  'server',
  'cloud',
  'database',
  'network',
  'computer',
  'notebook',
  'laptop',
  'firewall',
  'switch',
  'router',
  'api',
  'web application',
  'mobile app',
  'erp',
  'crm',
  'data center',
  'vm',
  'vcpu',
  'sla',
  'sql',
  'backup',
  'cybersecurity',
  'cctv',
  'iot',
];

/**
 * Classifies whether a text string is IT-related based on procurement keywords.
 * - Short text (<200 chars, e.g. project title only): Requires >= 1 match.
 * - Long text (>=200 chars, e.g. document body): Requires >= 2 matches to prevent false positives.
 *
 * @param {string} text
 * @returns {{ isIT: boolean, matchedKeywords: string[], method: string }}
 */
export function classifyIT(text) {
  if (!text || typeof text !== 'string') {
    return {
      isIT: false,
      matchedKeywords: [],
      method: 'keyword',
    };
  }

  const lower = text.toLowerCase();
  const matched = [];

  for (const kw of IT_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) {
      matched.push(kw);
    }
  }

  // Deduplicate matches
  const uniqueMatches = [...new Set(matched)];

  // Adaptive threshold
  const isShortText = text.trim().length < 200;
  const threshold = isShortText ? 1 : 2;
  const isIT = uniqueMatches.length >= threshold;

  return {
    isIT,
    matchedKeywords: uniqueMatches,
    method: 'keyword',
  };
}
