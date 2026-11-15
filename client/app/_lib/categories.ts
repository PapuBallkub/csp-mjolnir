/**
 * The kinds of IT project a TOR can be, as stored in
 * TorInsight.identification.categories: the main kind first (ADR 0034).
 * The keys mirror server/src/models/project-categories.js.
 */

import type { Lang } from "../_data/tors";

export const MAX_CATEGORIES = 3;

export const PROJECT_CATEGORIES = [
  { key: "software-development", th: "พัฒนาซอฟต์แวร์", en: "Software development" },
  { key: "systems-integration", th: "วางระบบ", en: "Systems integration" },
  { key: "software-licenses", th: "สิทธิ์ใช้งานซอฟต์แวร์", en: "Software licenses" },
  { key: "maintenance-and-support", th: "บำรุงรักษาและดูแลระบบ", en: "Maintenance & support" },
  { key: "network-and-security", th: "เครือข่ายและความปลอดภัย", en: "Network & security" },
  { key: "data-and-ai", th: "ข้อมูลและ AI", en: "Data & AI" },
  { key: "other-it", th: "งานไอทีอื่น ๆ", en: "Other IT" },
];

/** A category's name in the reader's language; the key itself if it isn't one we know. */
export function categoryLabel(key: string, lang: Lang): string {
  const category = PROJECT_CATEGORIES.find((item) => item.key === key);
  return category ? category[lang] : key;
}

/**
 * Ticks or unticks a category. The order of ticking is the order saved, so the
 * first ticked is the main one; a tick past the limit changes nothing.
 */
export function toggleCategory(selected: string[], key: string): string[] {
  if (selected.includes(key)) return selected.filter((item) => item !== key);
  return selected.length < MAX_CATEGORIES ? [...selected, key] : selected;
}
