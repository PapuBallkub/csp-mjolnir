import type { WatchdogProjectRecord } from "../../../_data/watchdog";

/** Deviations inside ±15% of the historical median count as market normal (ADR 0024). */
export const NORMAL_BAND_PCT = 15;

export type TimeGrain = "monthly" | "quarterly";
export type TableTab = "flagged" | "price" | "lockspec" | "all";
export type PriceBandId = "all" | "u5" | "5-10" | "10-20" | "20+";

export const PRICE_BAND_OPTIONS: {
  id: PriceBandId;
  label: { th: string; en: string };
  min?: number;
  max?: number;
}[] = [
  { id: "all", label: { th: "ทุกระดับราคากลาง", en: "All price ranges" } },
  { id: "u5", label: { th: "ต่ำกว่า 5 ล้านบาท", en: "Under ฿5M" }, max: 5_000_000 },
  {
    id: "5-10",
    label: { th: "5 – 10 ล้านบาท", en: "฿5M – ฿10M" },
    min: 5_000_000,
    max: 10_000_000,
  },
  {
    id: "10-20",
    label: { th: "10 – 20 ล้านบาท", en: "฿10M – ฿20M" },
    min: 10_000_000,
    max: 20_000_000,
  },
  { id: "20+", label: { th: "เกิน 20 ล้านบาทขึ้นไป", en: "Over ฿20M" }, min: 20_000_000 },
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
