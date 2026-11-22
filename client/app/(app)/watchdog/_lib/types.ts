import type { WatchdogProjectRecord } from "../../../_data/watchdog";

/** Deviations inside ±15% of the historical median count as market normal (ADR 0024). */
export const NORMAL_BAND_PCT = 15;

export type TimeGrain = "monthly" | "quarterly";
export type TableTab = "flagged" | "price" | "lockspec" | "all";
export type TableSort =
  | "lockspec-desc"
  | "lockspec-asc"
  | "price-delta-desc"
  | "price-delta-asc"
  | "price-desc"
  | "price-asc"
  | "newest";

export const TABLE_SORT_OPTIONS: { id: TableSort; label: string }[] = [
  {
    id: "lockspec-desc",
    label: "ความเสี่ยงล็อกสเปกสูงสุด",
  },
  {
    id: "lockspec-asc",
    label: "ความเสี่ยงล็อกสเปกต่ำสุด",
  },
  {
    id: "price-delta-desc",
    label: "ส่วนต่างราคาเบี่ยงเบนมากที่สุด",
  },
  {
    id: "price-delta-asc",
    label: "ส่วนต่างราคาใกล้เคียงปกติที่สุด",
  },
  {
    id: "price-desc",
    label: "ราคากลางสูงสุด",
  },
  {
    id: "price-asc",
    label: "ราคากลางต่ำสุด",
  },
  {
    id: "newest",
    label: "ประกาศล่าสุด",
  },
];
export type PriceBandId = "all" | "u5" | "5-10" | "10-20" | "20+";

export const PRICE_BAND_OPTIONS: {
  id: PriceBandId;
  label: string;
  min?: number;
  max?: number;
}[] = [
  { id: "all", label: "ทุกระดับราคากลาง" },
  { id: "u5", label: "ต่ำกว่า 5 ล้านบาท", max: 5_000_000 },
  {
    id: "5-10",
    label: "5 – 10 ล้านบาท",
    min: 5_000_000,
    max: 10_000_000,
  },
  {
    id: "10-20",
    label: "10 – 20 ล้านบาท",
    min: 10_000_000,
    max: 20_000_000,
  },
  { id: "20+", label: "เกิน 20 ล้านบาทขึ้นไป", min: 20_000_000 },
];

export const PRICE_PRESETS: {
  id: string;
  label: string;
  min: number;
  max: number; // 0 = unconstrained
}[] = [
  { id: "all", label: "ทุกช่วงราคา", min: 0, max: 0 },
  { id: "u5", label: "ต่ำกว่า 5M", min: 0, max: 5_000_000 },
  { id: "5-10", label: "5M – 10M", min: 5_000_000, max: 10_000_000 },
  { id: "10-20", label: "10M – 20M", min: 10_000_000, max: 20_000_000 },
  { id: "20+", label: "เกิน 20M+", min: 20_000_000, max: 0 },
];

export type TimePoint = {
  key: string;
  label: string;
  torCount: number;
  medianTHB: number;
  averageTHB: number;
  bandLowTHB: number;
  bandHighTHB: number;
  highRiskCount: number;
  projects: WatchdogProjectRecord[];
};

export type PriceRealityMetrics = {
  torCount: number;
  overallMedian: number;
  overallAverage: number;
  avgDeltaPct: number;
  outlierCount: number;
  outlierRatePct: number;
  highOutlierCount: number;
  lowOutlierCount: number;
  minPrice: number;
  maxPrice: number;
};
