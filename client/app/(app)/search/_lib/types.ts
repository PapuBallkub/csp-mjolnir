import type { TorInsightSummary, TorListParams, TorStatus } from "../../../_lib/api";

export type Mode = "filter" | "match";
export type Sort = NonNullable<TorListParams["sort"]>;

export const DEFAULT_PAGE_SIZE = 10;
export const PAGE_SIZE_OPTIONS = [5, 10, 20] as const;
/** Kept for backwards compatibility */
export const PAGE_SIZE = DEFAULT_PAGE_SIZE;
/** Matched mode ranks at most this many TORs that use one of the user's skills */
export const MATCH_LIMIT = 100;

export const BUDGET_BANDS: { id: string; label: string; min?: number; max?: number }[] = [
  { id: "any", label: "ทุกช่วง" },
  { id: "u1", label: "ต่ำกว่า 1 ล้าน", max: 1_000_000 },
  { id: "1-5", label: "1–5 ล้าน", min: 1_000_000, max: 5_000_000 },
  { id: "5-20", label: "5–20 ล้าน", min: 5_000_000, max: 20_000_000 },
  { id: "20+", label: "เกิน 20 ล้าน", min: 20_000_000 },
];

export const DEADLINE_BANDS: { id: string; label: string; days?: number }[] = [
  { id: "any", label: "ไม่จำกัด" },
  { id: "7", label: "ยื่นข้อเสนอภายใน 7 วัน", days: 7 },
  { id: "14", label: "ยื่นข้อเสนอภายใน 14 วัน", days: 14 },
  { id: "30", label: "ยื่นข้อเสนอภายใน 30 วัน", days: 30 },
];

export const SORTS: { id: Sort; label: string }[] = [
  { id: "newest", label: "ประกาศล่าสุด" },
  { id: "match-desc", label: "เหมาะสมกับคุณมากที่สุด" },
  { id: "match-asc", label: "เหมาะสมกับคุณน้อยที่สุด" },
  { id: "deadline", label: "ใกล้ครบกำหนดยื่นข้อเสนอ" },
  { id: "budget-desc", label: "ราคากลางสูงสุด" },
  { id: "budget-asc", label: "ราคากลางต่ำสุด" },
];

export const SCORE_FLOORS = [
  { id: 0, label: "ทุกคะแนน" },
  { id: 50, label: "50 ขึ้นไป" },
  { id: 70, label: "70 ขึ้นไป — เหมาะสม" },
  { id: 85, label: "85 ขึ้นไป — เหมาะสมมาก" },
] as const;

export const HIGH_RISK = 70;
export const isHighRisk = (tor: TorInsightSummary) => (tor.analytics.lockSpec?.riskScore ?? 0) >= HIGH_RISK;

export function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export type Page = {
  key: string;
  page: number;
  pageSize: number;
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
  minScore?: number;
  page?: number;
  pageSize?: number;
}

export interface MatchState {
  scoreFloor: number;
  hideClosed: boolean;
  hideHighRisk: boolean;
  page?: number;
  pageSize?: number;
}
