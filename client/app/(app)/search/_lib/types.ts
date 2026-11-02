import type { Bi } from "../../../_data/tors";
import type { TorInsightSummary, TorListParams, TorStatus } from "../../../_lib/api";

export type Mode = "filter" | "match";
export type Sort = NonNullable<TorListParams["sort"]>;

export const PAGE_SIZE = 20;
/** Matched mode ranks at most this many TORs that use one of the user's skills */
export const MATCH_LIMIT = 100;

export const BUDGET_BANDS: { id: string; label: Bi; min?: number; max?: number }[] = [
  { id: "any", label: { th: "ทุกช่วง", en: "Any" } },
  { id: "u1", label: { th: "ต่ำกว่า 1 ล้าน", en: "Under ฿1M" }, max: 1_000_000 },
  { id: "1-5", label: { th: "1–5 ล้าน", en: "฿1M–5M" }, min: 1_000_000, max: 5_000_000 },
  { id: "5-20", label: { th: "5–20 ล้าน", en: "฿5M–20M" }, min: 5_000_000, max: 20_000_000 },
  { id: "20+", label: { th: "เกิน 20 ล้าน", en: "Over ฿20M" }, min: 20_000_000 },
];

export const DEADLINE_BANDS: { id: string; label: Bi; days?: number }[] = [
  { id: "any", label: { th: "ไม่จำกัด", en: "Any" } },
  { id: "7", label: { th: "ยื่นข้อเสนอภายใน 7 วัน", en: "Bids due within 7 days" }, days: 7 },
  { id: "14", label: { th: "ยื่นข้อเสนอภายใน 14 วัน", en: "Bids due within 14 days" }, days: 14 },
  { id: "30", label: { th: "ยื่นข้อเสนอภายใน 30 วัน", en: "Bids due within 30 days" }, days: 30 },
];

export const SORTS: { id: Sort; label: Bi }[] = [
  { id: "newest", label: { th: "ประกาศล่าสุด", en: "Newest" } },
  { id: "match-desc", label: { th: "ตรงกับคุณมากที่สุด", en: "Highest match" } },
  { id: "match-asc", label: { th: "ตรงกับคุณน้อยที่สุด", en: "Lowest match" } },
  { id: "deadline", label: { th: "ใกล้ครบกำหนดยื่นข้อเสนอ", en: "Bids due soonest" } },
  { id: "budget-desc", label: { th: "ราคากลางสูงสุด", en: "Highest price" } },
  { id: "budget-asc", label: { th: "ราคากลางต่ำสุด", en: "Lowest price" } },
];

export const SCORE_FLOORS = [
  { id: 0, label: { th: "ทุกคะแนน", en: "Any score" } },
  { id: 50, label: { th: "50 ขึ้นไป", en: "50 and up" } },
  { id: 70, label: { th: "70 ขึ้นไป — ตรงจริง", en: "70+ — real fits" } },
  { id: 85, label: { th: "85 ขึ้นไป — ตรงมาก", en: "85+ — strong fits" } },
] as const;

export const HIGH_RISK = 70;
export const isHighRisk = (tor: TorInsightSummary) => (tor.analytics.lockSpec?.riskScore ?? 0) >= HIGH_RISK;

export function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export type Page = {
  key: string;
  page: number;
  tors: TorInsightSummary[];
  total: number;
  pages: number;
  /** When it arrived: the "now" the API used to decide what is Closed */
  at: Date;
};

export interface SearchParamReader {
  get: (name: string) => string | null;
  getAll: (name: string) => string[];
  has: (name: string) => boolean;
}

export interface FilterState {
  query: string;
  statuses: TorStatus[];
  amendedOnly: boolean;
  techFilter: string[];
  agencyFilter: string[];
  budgetBand: string;
  deadlineBand: string;
  hideHighRisk: boolean;
  sort: Sort;
}

export interface MatchState {
  scoreFloor: number;
  hideClosed: boolean;
  hideHighRisk: boolean;
}
