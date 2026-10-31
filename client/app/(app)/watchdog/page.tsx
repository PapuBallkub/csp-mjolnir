"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  formatDate,
  formatTHB,
  formatTHBCompact,
  pick,
  type Lang,
  type RiskLevel,
  type Status,
} from "../../_data/tors";
import {
  ARCHETYPE_OPTIONS,
  calcPriceDeltaPct,
  CATEGORY_OPTIONS,
  COMPLEXITY_OPTIONS,
  getArchetypeLabel,
  getCategoryLabel,
  getComplexityLabel,
  LOCK_SPEC_TRIGGERS_META,
  TIMELINE_MONTHS,
  WATCHDOG_PROJECTS,
  type ComplexityTier,
  type LockSpecTriggerId,
  type ProjectCategory,
  type SystemArchetype,
  type WatchdogProjectRecord,
} from "../../_data/watchdog";
import { listTors, type TorInsightSummary } from "../../_lib/api";
import { useLang } from "../../_components/prefs";
import {
  btn,
  Chip,
  EmptyState,
  input,
  Label,
  Panel,
  SectionHeading,
  Well,
} from "../../_components/ui";
import {
  LockSpecBadge,
  PriceDeltaBadge,
  RiskMeter,
  StatusBadge,
  TONE,
} from "../../_components/verdict";

/** Deviations inside ±15% of the historical median count as market normal (ADR 0024). */
const NORMAL_BAND_PCT = 15;

type TimeGrain = "monthly" | "quarterly";
type TableTab = "flagged" | "price" | "lockspec" | "all";
type PriceBandId = "all" | "u5" | "5-10" | "10-20" | "20+";

const PRICE_BAND_OPTIONS: {
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

type TimePoint = {
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

const THAI_MONTHS_SHORT = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

const EN_MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function formatMonthBucket(monthKey: string): {
  key: string;
  labelTh: string;
  labelEn: string;
  quarter: string;
} {
  const [yStr, mStr] = monthKey.split("-");
  const year = Number(yStr);
  const monthIdx = Math.max(0, Math.min(11, Number(mStr) - 1));
  const beShort = String(year + 543).slice(-2);
  const enShort = String(year).slice(-2);

  // Thai Fiscal Year starts in October (month index 9 -> Q1 of next FY)
  const fyYearShort = String((monthIdx >= 9 ? year + 1 : year) + 543).slice(-2);
  const fyQuarter =
    monthIdx >= 9
      ? 1
      : monthIdx <= 2
        ? 2
        : monthIdx <= 5
          ? 3
          : 4;

  return {
    key: monthKey,
    labelTh: `${THAI_MONTHS_SHORT[monthIdx]} ${beShort}`,
    labelEn: `${EN_MONTHS_SHORT[monthIdx]} ${enShort}`,
    quarter: `Q${fyQuarter}/${fyYearShort}`,
  };
}

function normalizeCategory(raw: string | null | undefined): ProjectCategory {
  const valid: ProjectCategory[] = [
    "software-development",
    "systems-integration",
    "data-and-ai",
    "network-and-security",
    "maintenance-and-support",
    "software-licenses",
    "other-it",
  ];
  if (raw && valid.includes(raw as ProjectCategory)) {
    return raw as ProjectCategory;
  }
  return "software-development";
}

function inferArchetypeFromCategory(cat: ProjectCategory): SystemArchetype {
  switch (cat) {
    case "network-and-security":
      return "cybersecurity";
    case "data-and-ai":
      return "data-analytics";
    case "maintenance-and-support":
    case "software-licenses":
      return "infra-networking";
    case "systems-integration":
      return "enterprise-erp";
    case "software-development":
      return "web-portal";
    default:
      return "other";
  }
}

function normalizeArchetype(
  raw: string | null | undefined,
  cat: ProjectCategory,
): SystemArchetype {
  const valid: SystemArchetype[] = [
    "web-portal",
    "mobile-app",
    "enterprise-erp",
    "edoc-workflow",
    "data-analytics",
    "gis-mapping",
    "cybersecurity",
    "iot-telemetry",
    "infra-networking",
    "other",
  ];
  if (raw && valid.includes(raw as SystemArchetype)) {
    return raw as SystemArchetype;
  }
  return inferArchetypeFromCategory(cat);
}

function normalizeComplexity(
  raw: string | null | undefined,
  priceTHB: number,
): ComplexityTier {
  if (raw === "basic" || raw === "standard" || raw === "enterprise") {
    return raw;
  }
  if (priceTHB >= 15_000_000) return "enterprise";
  if (priceTHB >= 2_500_000) return "standard";
  return "basic";
}

function normalizeTriggerCategory(raw: string | undefined): LockSpecTriggerId {
  if (raw === "Specification Tailoring" || raw === "Hardware Lock-in") {
    return "Specification Tailoring";
  }
  if (raw === "Qualification Barrier") {
    return "Qualification Barrier";
  }
  return "Vendor Lock-in";
}

function inferTriggerFromTechAndVerdict(tor: TorInsightSummary): LockSpecTriggerId {
  const techs = tor.technicalRequirements?.requiredTechnologies ?? [];
  const hasLockedOsOrDb = techs.some((t) => {
    const n = t.name.toLowerCase();
    return (
      (n.includes("windows server") ||
        n.includes("red hat") ||
        n.includes("rhel") ||
        n.includes("oracle")) &&
      Boolean(t.version)
    );
  });
  if (hasLockedOsOrDb) return "Specification Tailoring";
  return "Vendor Lock-in";
}

/**
 * Converts a live API `TorInsightSummary` record into a `WatchdogProjectRecord`.
 */
function mapApiTorToWatchdog(tor: TorInsightSummary): WatchdogProjectRecord | null {
  const refPrice = tor.facts.referencePriceTHB ?? tor.facts.budgetTHB ?? 0;
  if (refPrice <= 0) return null;

  const rawDate = tor.facts.postedDate || tor.createdAt || "2026-10-01";
  const parsedDate = new Date(rawDate);
  const isoDate = !Number.isNaN(parsedDate.getTime())
    ? parsedDate.toISOString().slice(0, 10)
    : "2026-10-01";
  const month = isoDate.slice(0, 7);

  const category = normalizeCategory(tor.identification.category);
  const archetype = normalizeArchetype(tor.overview?.systemArchetype, category);
  const complexity = normalizeComplexity(tor.overview?.complexityTier, refPrice);

  const peerMedian =
    tor.analytics.priceAnalysis?.historicalMedianTHB &&
    tor.analytics.priceAnalysis.historicalMedianTHB > 0
      ? Math.round(tor.analytics.priceAnalysis.historicalMedianTHB)
      : refPrice;

  const peerAverage =
    tor.analytics.priceAnalysis?.historicalAverageTHB &&
    tor.analytics.priceAnalysis.historicalAverageTHB > 0
      ? Math.round(tor.analytics.priceAnalysis.historicalAverageTHB)
      : peerMedian;

  const lockSpecScore = tor.analytics.lockSpec?.riskScore ?? 0;
  const lockSpecLevel: RiskLevel =
    lockSpecScore >= 70 ? "high" : lockSpecScore >= 35 ? "medium" : "low";

  const apiFindings = tor.analytics.lockSpec?.findings ?? [];
  let triggers: WatchdogProjectRecord["triggers"] = [];

  if (apiFindings.length > 0) {
    const seen = new Set<LockSpecTriggerId>();
    for (const f of apiFindings) {
      const cat = normalizeTriggerCategory(f.category);
      if (seen.has(cat)) continue;
      seen.add(cat);
      triggers.push({
        category: cat,
        summary: { th: f.title, en: f.title },
        clauseExcerpt: f.sourceExcerpt || f.requirementText || "",
      });
    }
  } else if (lockSpecScore > 0) {
    // Fallback when `/api/tors` summary projection omits `findings` array
    const primaryCat = inferTriggerFromTechAndVerdict(tor);
    triggers.push({
      category: primaryCat,
      summary: {
        th: tor.analytics.lockSpec?.verdictText || "พบเงื่อนไขที่อาจจำกัดการแข่งขัน",
        en: tor.analytics.lockSpec?.verdictText || "Potential competition barrier",
      },
      clauseExcerpt: "",
    });
    if (lockSpecScore >= 70) {
      const secondCat: LockSpecTriggerId =
        primaryCat === "Specification Tailoring"
          ? "Vendor Lock-in"
          : "Specification Tailoring";
      triggers.push({
        category: secondCat,
        summary: {
          th: "พบเงื่อนไขจำกัดการแข่งขันเพิ่มเติมตามเกณฑ์ ว 214",
          en: "Additional Circular ว 214 barrier detected",
        },
        clauseExcerpt: "",
      });
    }
  }

  return {
    id: tor.projectId,
    egpRef: tor.projectId,
    title: {
      th: tor.identification.titleTh,
      en: tor.identification.titleEn || tor.identification.titleTh,
    },
    agency: {
      th: tor.identification.agency,
      en: tor.identification.agency,
    },
    category,
    archetype,
    complexity,
    month,
    postedAt: isoDate,
    status: tor.identification.status as Status,
    referencePriceTHB: Math.round(refPrice),
    peerMedianTHB: peerMedian,
    peerAverageTHB: peerAverage,
    agreedPriceTHB:
      tor.facts.agreedPriceTHB && tor.facts.agreedPriceTHB > 0
        ? Math.round(tor.facts.agreedPriceTHB)
        : undefined,
    lockSpecScore,
    lockSpecLevel,
    triggers,
  };
}

function computeMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function computeAverage(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((s, v) => s + v, 0) / values.length);
}

/**
 * Interactive SVG Line + Shaded Normal Band Chart (Option A: Time-Series Trend).
 * Plots:
 *  - Shaded ±15% normal band around the historical median
 *  - Solid line: Historical Median (ค่ามัธยฐานราคากลาง)
 *  - Dashed line: Historical Average (ค่าเฉลี่ยราคากลาง)
 *  - Individual project dots colored by price verdict (normal / over / under)
 */
function PriceTrendLineChart({
  series,
  lang,
  activeBucket,
  onSelectBucket,
}: {
  series: TimePoint[];
  lang: Lang;
  activeBucket: string | null;
  onSelectBucket: (key: string | null) => void;
}) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const nonEmpty = series.filter((pt) => pt.torCount > 0);
  if (nonEmpty.length === 0) {
    return (
      <EmptyState
        headline={
          lang === "th"
            ? "ไม่มีข้อมูลแนวโน้มราคาสำหรับตัวกรองชุดนี้"
            : "No price trend data for this filter combination"
        }
        body={
          lang === "th"
            ? "ลองเปลี่ยนหมวดหมู่งาน รูปแบบระบบ หรือล้างตัวกรองเพื่อดูภาพรวมทั้งหมด"
            : "Try broadening the category, system archetype, or resetting filters."
        }
      />
    );
  }

  // Compute Y-axis domain from all medians, averages, bands including realistic scale
  // Use P95 ceiling if extreme outliers exist so a single ฿210M project doesn't flatten ฿1M–฿15M trends
  const bandAndLinePrices: number[] = [];
  const allProjectPrices: number[] = [];
  for (const pt of series) {
    if (pt.medianTHB > 0) {
      bandAndLinePrices.push(pt.bandLowTHB, pt.bandHighTHB, pt.averageTHB);
    }
    for (const p of pt.projects) {
      allProjectPrices.push(p.referencePriceTHB);
    }
  }
  const sortedProj = [...allProjectPrices].sort((a, b) => a - b);
  const p92 =
    sortedProj.length > 8
      ? sortedProj[Math.floor(sortedProj.length * 0.92)]
      : Math.max(...sortedProj, 5_000_000);
  const maxLine = Math.max(...bandAndLinePrices, p92, 5_000_000);
  const step = maxLine > 40_000_000 ? 10_000_000 : 5_000_000;
  const yMax = Math.ceil((maxLine * 1.1) / step) * step;

  // SVG coordinate system
  const width = 920;
  const height = 276;
  const padLeft = 64;
  const padRight = 24;
  const padTop = 22;
  const padBottom = 30;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const xForIndex = (i: number) =>
    series.length <= 1
      ? padLeft + plotW / 2
      : padLeft + (i / (series.length - 1)) * plotW;

  const yForPrice = (val: number) =>
    padTop + plotH - Math.min(1, Math.max(0, val / yMax)) * plotH;

  // Collect valid points with data for polyline/polygon paths
  const validPoints = series
    .map((pt, idx) => ({ pt, idx, x: xForIndex(idx) }))
    .filter((item) => item.pt.medianTHB > 0);

  const medianPolyline = validPoints
    .map((item) => `${item.x.toFixed(1)},${yForPrice(item.pt.medianTHB).toFixed(1)}`)
    .join(" ");

  const averagePolyline = validPoints
    .map((item) => `${item.x.toFixed(1)},${yForPrice(item.pt.averageTHB).toFixed(1)}`)
    .join(" ");

  const bandPolygon =
    validPoints.length >= 2
      ? [
          ...validPoints.map(
            (item) => `${item.x.toFixed(1)},${yForPrice(item.pt.bandHighTHB).toFixed(1)}`,
          ),
          ...[...validPoints]
            .reverse()
            .map(
              (item) => `${item.x.toFixed(1)},${yForPrice(item.pt.bandLowTHB).toFixed(1)}`,
            ),
        ].join(" ")
      : "";

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(yMax * t));

  const inspectedKey = hoveredKey ?? activeBucket ?? validPoints.at(-1)?.pt.key ?? null;
  const inspectedPoint = series.find((pt) => pt.key === inspectedKey) ?? validPoints.at(-1)?.pt;

  return (
    <div className="flex flex-col gap-3">
      {/* Legend & Inspected Period Callout */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12px] text-ink-2">
          <span className="inline-flex items-center gap-2">
            <span className="h-[2.5px] w-5 bg-ink" />
            <span>
              {lang === "th" ? "ค่ามัธยฐานย้อนหลัง (Median)" : "Historical median"}
            </span>
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-0 w-5 border-t-2 border-dashed border-ink-3" />
            <span>
              {lang === "th" ? "ค่าเฉลี่ยย้อนหลัง (Average)" : "Historical average"}
            </span>
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-3 w-5 rounded-[2px] border border-line-2 bg-surface-3" />
            <span>
              {lang === "th"
                ? `กรอบราคาปกติ (±${NORMAL_BAND_PCT}% จากค่ากลาง)`
                : `Normal band (±${NORMAL_BAND_PCT}% of median)`}
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amend" />
            <span className="h-2.5 w-2.5 rounded-full bg-risk" />
            <span>
              {lang === "th" ? "ราคากลาง TOR รายโครงการ" : "Individual TOR price"}
            </span>
          </span>
        </div>

        {activeBucket ? (
          <button
            type="button"
            onClick={() => onSelectBucket(null)}
            className="inline-flex items-center gap-1.5 rounded-[2px] border border-line-2 bg-surface-2 px-2 py-1 text-[11.5px] font-medium text-ink hover:bg-surface-3 cursor-pointer"
          >
            <span>
              {lang === "th"
                ? `กำลังกรองเฉพาะช่วง: ${series.find((s) => s.key === activeBucket)?.label}`
                : `Filtered to: ${series.find((s) => s.key === activeBucket)?.label}`}
            </span>
            <span className="text-ink-3">✕</span>
          </button>
        ) : (
          <span className="text-[11.5px] text-ink-3">
            {lang === "th"
              ? "คลิกที่จุดบนกราฟเพื่อกรองตารางด้านล่างตามช่วงเวลา"
              : "Click any point on the chart to filter the project list below"}
          </span>
        )}
      </div>

      {/* SVG Line Chart */}
      <div className="relative overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full min-w-[640px] select-none"
          role="img"
          aria-label={
            lang === "th"
              ? "กราฟเส้นแสดงแนวโน้มค่ามัธยฐานและค่าเฉลี่ยราคากลางตามช่วงเวลา"
              : "Line chart showing historical median and average reference price over time"
          }
        >
          {/* Horizontal grid lines & Y-axis labels */}
          {yTicks.map((tick) => {
            const y = yForPrice(tick);
            return (
              <g key={tick}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={width - padRight}
                  y2={y}
                  stroke="var(--color-line)"
                  strokeDasharray={tick === 0 ? undefined : "3 3"}
                  strokeWidth="1"
                />
                <text
                  x={padLeft - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  className="fill-ink-3 font-mono text-[10px]"
                >
                  {tick === 0 ? "฿0" : formatTHBCompact(tick)}
                </text>
              </g>
            );
          })}

          {/* Shaded ±15% normal band around the median */}
          {bandPolygon ? (
            <polygon
              points={bandPolygon}
              fill="var(--color-surface-3)"
              opacity="0.85"
            />
          ) : null}

          {/* Band upper/lower subtle boundary lines */}
          {validPoints.length >= 2 ? (
            <>
              <polyline
                fill="none"
                stroke="var(--color-line-2)"
                strokeWidth="1"
                points={validPoints
                  .map(
                    (item) =>
                      `${item.x.toFixed(1)},${yForPrice(item.pt.bandHighTHB).toFixed(1)}`,
                  )
                  .join(" ")}
              />
              <polyline
                fill="none"
                stroke="var(--color-line-2)"
                strokeWidth="1"
                points={validPoints
                  .map(
                    (item) =>
                      `${item.x.toFixed(1)},${yForPrice(item.pt.bandLowTHB).toFixed(1)}`,
                  )
                  .join(" ")}
              />
            </>
          ) : null}

          {/* Historical Average Line (Dashed) */}
          {validPoints.length >= 2 ? (
            <polyline
              fill="none"
              stroke="var(--color-ink-3)"
              strokeWidth="1.75"
              strokeDasharray="4 4"
              points={averagePolyline}
            />
          ) : null}

          {/* Historical Median Line (Solid Primary) */}
          {validPoints.length >= 2 ? (
            <polyline
              fill="none"
              stroke="var(--color-ink)"
              strokeWidth="2.25"
              points={medianPolyline}
            />
          ) : null}

          {/* Per-bucket vertical guides, points, and project dots */}
          {series.map((pt, idx) => {
            const x = xForIndex(idx);
            const isSelected = activeBucket === pt.key;
            const isHovered = hoveredKey === pt.key;
            const hasData = pt.medianTHB > 0;

            // Cap plotted dots per bucket to 16 so a dense month stays clean
            const plottedProjects = pt.projects.slice(0, 16);

            return (
              <g
                key={pt.key}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredKey(pt.key)}
                onMouseLeave={() => setHoveredKey(null)}
                onClick={() => onSelectBucket(activeBucket === pt.key ? null : pt.key)}
              >
                {/* Active or hovered vertical highlight column */}
                {isSelected || isHovered ? (
                  <line
                    x1={x}
                    y1={padTop}
                    x2={x}
                    y2={padTop + plotH}
                    stroke={isSelected ? "var(--color-ink)" : "var(--color-line-2)"}
                    strokeWidth={isSelected ? "1.5" : "1"}
                  />
                ) : null}

                {/* Individual TOR price dots in this time bucket */}
                {plottedProjects.map((proj, pIdx) => {
                  const delta = calcPriceDeltaPct(proj);
                  const dotColor =
                    delta > NORMAL_BAND_PCT
                      ? "var(--color-amend)"
                      : delta < -NORMAL_BAND_PCT
                        ? "var(--color-risk)"
                        : "var(--color-open)";
                  // Slight horizontal jitter when multiple projects share the same bucket
                  const spread = Math.min(24, plottedProjects.length * 4);
                  const offset =
                    plottedProjects.length > 1
                      ? ((pIdx / (plottedProjects.length - 1)) - 0.5) * spread
                      : 0;
                  return (
                    <circle
                      key={proj.id}
                      cx={x + offset}
                      cy={yForPrice(proj.referencePriceTHB)}
                      r={isHovered || isSelected ? 4.5 : 3.5}
                      fill={dotColor}
                      stroke="var(--color-surface)"
                      strokeWidth="1.2"
                    >
                      <title>
                        {`${pick(proj.title, lang)} — ${formatTHB(proj.referencePriceTHB)} (${delta >= 0 ? "+" : ""}${delta}%)`}
                      </title>
                    </circle>
                  );
                })}

                {/* Average node */}
                {hasData ? (
                  <circle
                    cx={x}
                    cy={yForPrice(pt.averageTHB)}
                    r={2.5}
                    fill="var(--color-surface)"
                    stroke="var(--color-ink-3)"
                    strokeWidth="1.5"
                  />
                ) : null}

                {/* Median node */}
                {hasData ? (
                  <circle
                    cx={x}
                    cy={yForPrice(pt.medianTHB)}
                    r={isSelected || isHovered ? 5 : 3.5}
                    fill="var(--color-ink)"
                    stroke="var(--color-surface)"
                    strokeWidth="1.5"
                  />
                ) : null}

                {/* X-axis label */}
                <text
                  x={x}
                  y={height - 8}
                  textAnchor="middle"
                  className={`font-mono text-[10.5px] ${
                    isSelected
                      ? "fill-ink font-semibold"
                      : isHovered
                        ? "fill-ink"
                        : "fill-ink-3"
                  }`}
                >
                  {pt.label}
                </text>

                {/* Invisible wider hit target for easy hover/click */}
                <rect
                  x={x - plotW / Math.max(2, series.length * 2)}
                  y={padTop}
                  width={plotW / Math.max(1, series.length)}
                  height={plotH + padBottom}
                  fill="transparent"
                />
              </g>
            );
          })}
        </svg>
      </div>

      {/* Inspected Period Readout Bar */}
      {inspectedPoint && inspectedPoint.medianTHB > 0 ? (
        <Well className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-3.5 py-2.5 text-[12px]">
          <div className="flex items-center gap-2">
            <span className="font-mono font-semibold text-ink">{inspectedPoint.label}</span>
            <span className="text-ink-3">·</span>
            <span className="text-ink-2">
              {lang === "th"
                ? `${inspectedPoint.torCount} โครงการที่ตรวจวิเคราะห์ในช่วงเวลานี้`
                : `${inspectedPoint.torCount} analyzed TORs in this period`}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono tnum">
            <span>
              <span className="font-sans text-ink-3">
                {lang === "th" ? "ค่ามัธยฐาน: " : "Median: "}
              </span>
              <strong className="text-ink">{formatTHB(inspectedPoint.medianTHB)}</strong>
            </span>
            <span>
              <span className="font-sans text-ink-3">
                {lang === "th" ? "ค่าเฉลี่ย: " : "Average: "}
              </span>
              <span className="text-ink-2">{formatTHB(inspectedPoint.averageTHB)}</span>
            </span>
            <span>
              <span className="font-sans text-ink-3">
                {lang === "th" ? "กรอบปกติ (±15%): " : "Normal band (±15%): "}
              </span>
              <span className="text-ink-2">
                {formatTHBCompact(inspectedPoint.bandLowTHB)}–
                {formatTHBCompact(inspectedPoint.bandHighTHB)}
              </span>
            </span>
          </div>
        </Well>
      ) : null}
    </div>
  );
}

export default function WatchdogPage() {
  const { lang } = useLang();

  // Live API Data State (falls back to WATCHDOG_PROJECTS if API is unreachable)
  const [liveProjects, setLiveProjects] = useState<WatchdogProjectRecord[] | null>(null);
  const [dataSource, setDataSource] = useState<"loading" | "api" | "fixture">("loading");

  useEffect(() => {
    let cancelled = false;

    async function fetchAllRealTors() {
      const first = await listTors({ limit: 100, page: 1, sort: "newest" });
      if (cancelled) return;

      if (!first.ok || first.data.tors.length === 0) {
        setDataSource("fixture");
        return;
      }

      const allSummaries: TorInsightSummary[] = [...first.data.tors];
      const totalPages = Math.min(first.data.pages, 5); // up to 500 TORs

      if (totalPages > 1) {
        const pagePromises = [];
        for (let p = 2; p <= totalPages; p++) {
          pagePromises.push(listTors({ limit: 100, page: p, sort: "newest" }));
        }
        const rest = await Promise.all(pagePromises);
        if (cancelled) return;
        for (const res of rest) {
          if (res.ok) {
            allSummaries.push(...res.data.tors);
          }
        }
      }

      const mapped = allSummaries
        .map(mapApiTorToWatchdog)
        .filter((item): item is WatchdogProjectRecord => item !== null);

      if (mapped.length > 0) {
        setLiveProjects(mapped);
        setDataSource("api");
      } else {
        setDataSource("fixture");
      }
    }

    fetchAllRealTors();
    return () => {
      cancelled = true;
    };
  }, []);

  const allProjects = liveProjects ?? WATCHDOG_PROJECTS;

  // Dynamic timeline months derived from the active dataset
  const availableMonths = useMemo(() => {
    if (!liveProjects) return TIMELINE_MONTHS;
    const uniqueKeys = Array.from(new Set(liveProjects.map((p) => p.month))).sort();
    if (uniqueKeys.length === 0) return TIMELINE_MONTHS;
    return uniqueKeys.map(formatMonthBucket);
  }, [liveProjects]);

  const defaultStartMonth = availableMonths[0]?.key ?? TIMELINE_MONTHS[0].key;
  const defaultEndMonth =
    availableMonths[availableMonths.length - 1]?.key ??
    TIMELINE_MONTHS[TIMELINE_MONTHS.length - 1].key;

  // Global Filter State
  const [category, setCategory] = useState<ProjectCategory | "all">("all");
  const [archetype, setArchetype] = useState<SystemArchetype | "all">("all");
  const [complexity, setComplexity] = useState<ComplexityTier | "all">("all");
  const [agencyFilter, setAgencyFilter] = useState<string>("all");
  const [priceBand, setPriceBand] = useState<PriceBandId>("all");
  const [startMonth, setStartMonth] = useState<string>("");
  const [endMonth, setEndMonth] = useState<string>("");
  const [timeGrain, setTimeGrain] = useState<TimeGrain>("monthly");

  const effectiveStartMonth =
    startMonth && availableMonths.some((m) => m.key === startMonth)
      ? startMonth
      : defaultStartMonth;
  const effectiveEndMonth =
    endMonth && availableMonths.some((m) => m.key === endMonth)
      ? endMonth
      : defaultEndMonth;

  // Interactive drill-down filters from charts/cards
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);
  const [selectedTrigger, setSelectedTrigger] = useState<LockSpecTriggerId | null>(null);
  const [selectedRiskTier, setSelectedRiskTier] = useState<RiskLevel | null>(null);

  // Bottom Table State
  const [tableTab, setTableTab] = useState<TableTab>("flagged");
  const [rowLimit, setRowLimit] = useState<number>(10);

  // Unique agencies for dropdown
  const agencies = useMemo(() => {
    const map = new Map<string, { th: string; en: string; count: number }>();
    for (const p of allProjects) {
      const key = p.agency.th;
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(key, { th: p.agency.th, en: p.agency.en, count: 1 });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [allProjects]);

  // 1. Filter projects by top global filter bar
  const filteredByTopBar = useMemo(() => {
    const band = PRICE_BAND_OPTIONS.find((b) => b.id === priceBand);
    return allProjects.filter((p) => {
      if (category !== "all" && p.category !== category) return false;
      if (archetype !== "all" && p.archetype !== archetype) return false;
      if (complexity !== "all" && p.complexity !== complexity) return false;
      if (agencyFilter !== "all" && p.agency.th !== agencyFilter) return false;
      if (band?.min !== undefined && p.referencePriceTHB < band.min) return false;
      if (band?.max !== undefined && p.referencePriceTHB > band.max) return false;
      if (p.month < effectiveStartMonth || p.month > effectiveEndMonth) return false;
      return true;
    });
  }, [
    allProjects,
    category,
    archetype,
    complexity,
    agencyFilter,
    priceBand,
    effectiveStartMonth,
    effectiveEndMonth,
  ]);

  // 2. Build time-series points (Monthly or Quarterly) from `filteredByTopBar`
  const timeSeries = useMemo<TimePoint[]>(() => {
    const activeMonths = availableMonths.filter(
      (m) => m.key >= effectiveStartMonth && m.key <= effectiveEndMonth,
    );

    if (timeGrain === "monthly") {
      return activeMonths.map((m) => {
        const inMonth = filteredByTopBar.filter((p) => p.month === m.key);
        const medians = inMonth.map((p) => p.peerMedianTHB);
        const averages = inMonth.map((p) => p.peerAverageTHB);
        const med = computeMedian(medians);
        const avg = computeAverage(averages);

        return {
          key: m.key,
          label: lang === "th" ? m.labelTh : m.labelEn,
          torCount: inMonth.length,
          medianTHB: med,
          averageTHB: avg,
          bandLowTHB: Math.round(med * (1 - NORMAL_BAND_PCT / 100)),
          bandHighTHB: Math.round(med * (1 + NORMAL_BAND_PCT / 100)),
          highRiskCount: inMonth.filter((p) => p.lockSpecLevel === "high").length,
          projects: inMonth,
        };
      });
    }

    // Quarterly aggregation across quarters within the active month window
    const quarters = Array.from(new Set(activeMonths.map((m) => m.quarter)));
    return quarters.map((q) => {
      const monthKeys = activeMonths.filter((m) => m.quarter === q).map((m) => m.key);
      const inQuarter = filteredByTopBar.filter((p) => monthKeys.includes(p.month));
      const medians = inQuarter.map((p) => p.peerMedianTHB);
      const averages = inQuarter.map((p) => p.peerAverageTHB);
      const med = computeMedian(medians);
      const avg = computeAverage(averages);

      return {
        key: q,
        label: q,
        torCount: inQuarter.length,
        medianTHB: med,
        averageTHB: avg,
        bandLowTHB: Math.round(med * (1 - NORMAL_BAND_PCT / 100)),
        bandHighTHB: Math.round(med * (1 + NORMAL_BAND_PCT / 100)),
        highRiskCount: inQuarter.filter((p) => p.lockSpecLevel === "high").length,
        projects: inQuarter,
      };
    });
  }, [
    availableMonths,
    filteredByTopBar,
    timeGrain,
    lang,
    effectiveStartMonth,
    effectiveEndMonth,
  ]);

  // 3. Summary KPI metrics for the current slice (Approach 1: one unified denominator)
  const kpis = useMemo(() => {
    const extractedCount = filteredByTopBar.length;
    const activeCount = filteredByTopBar.filter(
      (p) => p.status === "Open" || p.status === "Draft",
    ).length;
    const completedCount = extractedCount - activeCount;

    const overallMedian = computeMedian(filteredByTopBar.map((p) => p.peerMedianTHB));
    const overallAverage = computeAverage(filteredByTopBar.map((p) => p.peerAverageTHB));

    const lowCount = filteredByTopBar.filter((p) => p.lockSpecLevel === "low").length;
    const medCount = filteredByTopBar.filter((p) => p.lockSpecLevel === "medium").length;
    const highCount = filteredByTopBar.filter((p) => p.lockSpecLevel === "high").length;

    const flaggedRiskCount = medCount + highCount;
    const riskRatePct =
      extractedCount > 0 ? Math.round((flaggedRiskCount / extractedCount) * 100) : 0;

    const triggerCounts: Record<LockSpecTriggerId, number> = {
      "Specification Tailoring": 0,
      "Qualification Barrier": 0,
      "Vendor Lock-in": 0,
    };
    for (const p of filteredByTopBar) {
      for (const t of p.triggers) {
        triggerCounts[t.category] += 1;
      }
    }

    return {
      extractedCount,
      activeCount,
      completedCount,
      overallMedian,
      overallAverage,
      lowCount,
      medCount,
      highCount,
      flaggedRiskCount,
      riskRatePct,
      triggerCounts,
    };
  }, [filteredByTopBar]);

  // 4. Filter projects for the bottom table (applying chart bucket, trigger click, risk tier, and tab)
  const tableProjects = useMemo(() => {
    let list = [...filteredByTopBar];

    // If a time bucket on the chart is clicked
    if (selectedBucket) {
      if (timeGrain === "monthly") {
        list = list.filter((p) => p.month === selectedBucket);
      } else {
        const monthKeys = availableMonths
          .filter((m) => m.quarter === selectedBucket)
          .map((m) => m.key);
        list = list.filter((p) => monthKeys.includes(p.month));
      }
    }

    // If a Risk Tier bar/pill is clicked
    if (selectedRiskTier) {
      list = list.filter((p) => p.lockSpecLevel === selectedRiskTier);
    }

    // If a Circular ว 214 trigger card is clicked
    if (selectedTrigger) {
      list = list.filter((p) => p.triggers.some((t) => t.category === selectedTrigger));
    }

    // Tab filtering & sorting
    if (tableTab === "flagged") {
      list = list
        .filter(
          (p) =>
            Math.abs(calcPriceDeltaPct(p)) > NORMAL_BAND_PCT || p.lockSpecScore >= 35,
        )
        .sort((a, b) => {
          const scoreDiff = b.lockSpecScore - a.lockSpecScore;
          if (scoreDiff !== 0) return scoreDiff;
          return Math.abs(calcPriceDeltaPct(b)) - Math.abs(calcPriceDeltaPct(a));
        });
    } else if (tableTab === "price") {
      list = list.sort(
        (a, b) => Math.abs(calcPriceDeltaPct(b)) - Math.abs(calcPriceDeltaPct(a)),
      );
    } else if (tableTab === "lockspec") {
      list = list
        .filter((p) => p.lockSpecScore > 0)
        .sort((a, b) => b.lockSpecScore - a.lockSpecScore);
    } else {
      list = list.sort((a, b) => b.postedAt.localeCompare(a.postedAt));
    }

    return list;
  }, [
    availableMonths,
    filteredByTopBar,
    selectedBucket,
    selectedRiskTier,
    selectedTrigger,
    tableTab,
    timeGrain,
  ]);

  const visibleRows = rowLimit === 0 ? tableProjects : tableProjects.slice(0, rowLimit);

  const hasActiveFilters =
    category !== "all" ||
    archetype !== "all" ||
    complexity !== "all" ||
    agencyFilter !== "all" ||
    priceBand !== "all" ||
    effectiveStartMonth !== defaultStartMonth ||
    effectiveEndMonth !== defaultEndMonth ||
    selectedBucket !== null ||
    selectedTrigger !== null ||
    selectedRiskTier !== null;

  function resetAllFilters() {
    setCategory("all");
    setArchetype("all");
    setComplexity("all");
    setAgencyFilter("all");
    setPriceBand("all");
    setStartMonth(defaultStartMonth);
    setEndMonth(defaultEndMonth);
    setSelectedBucket(null);
    setSelectedTrigger(null);
    setSelectedRiskTier(null);
  }

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-6">
      {/* Page Header */}
      <header className="mb-5">
        <h1 className="text-[26px] leading-tight font-semibold tracking-tight text-ink">
          {lang === "th"
            ? "แนวโน้มราคากลางและสัญญาณล็อกสเปก"
            : "Reference price trends & lock-spec signals"}
        </h1>
        <p className="mt-1.5 max-w-2xl text-[14px] leading-thai text-ink-2">
          {lang === "th"
            ? "เปรียบเทียบแนวโน้มราคากลางตามประเภทงาน และตรวจดูข้อกำหนดที่อาจจำกัดการแข่งขัน"
            : "Compare reference price trends by project type and inspect requirements that may restrict competition."}
        </p>
      </header>

      {/* 1. Global Filter Bar (Drives the entire page) */}
      <Panel className="mb-6 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {/* Category Filter */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wd-category">
              {lang === "th" ? "หมวดหมู่งาน IT (Category)" : "IT project category"}
            </Label>
            <select
              id="wd-category"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value as ProjectCategory | "all");
                setSelectedBucket(null);
              }}
              className={input}
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {pick(opt.label, lang)}
                </option>
              ))}
            </select>
          </div>

          {/* System Archetype Filter */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wd-archetype">
              {lang === "th" ? "รูปแบบสถาปัตยกรรมระบบ (Archetype)" : "System archetype"}
            </Label>
            <select
              id="wd-archetype"
              value={archetype}
              onChange={(e) => {
                setArchetype(e.target.value as SystemArchetype | "all");
                setSelectedBucket(null);
              }}
              className={input}
            >
              {ARCHETYPE_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {pick(opt.label, lang)}
                </option>
              ))}
            </select>
          </div>

          {/* Complexity Tier Filter */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wd-complexity">
              {lang === "th" ? "ขนาดและความซับซ้อน (Complexity)" : "Complexity tier"}
            </Label>
            <select
              id="wd-complexity"
              value={complexity}
              onChange={(e) => {
                setComplexity(e.target.value as ComplexityTier | "all");
                setSelectedBucket(null);
              }}
              className={input}
            >
              {COMPLEXITY_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {pick(opt.label, lang)}
                </option>
              ))}
            </select>
          </div>

          {/* Agency Filter */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wd-agency">
              {lang === "th" ? "หน่วยงานผู้จัดซื้อ (Agency)" : "Procuring agency"}
            </Label>
            <select
              id="wd-agency"
              value={agencyFilter}
              onChange={(e) => {
                setAgencyFilter(e.target.value);
                setSelectedBucket(null);
              }}
              className={input}
            >
              <option value="all">
                {lang === "th"
                  ? `ทุกหน่วยงาน (${agencies.length} หน่วยงาน)`
                  : `All agencies (${agencies.length})`}
              </option>
              {agencies.map((ag) => (
                <option key={ag.th} value={ag.th}>
                  {lang === "th" ? ag.th : ag.en} ({ag.count})
                </option>
              ))}
            </select>
          </div>

          {/* Price Range Filter */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wd-price-band">
              {lang === "th" ? "ช่วงราคากลาง (Price range)" : "Reference price range"}
            </Label>
            <select
              id="wd-price-band"
              value={priceBand}
              onChange={(e) => {
                setPriceBand(e.target.value as PriceBandId);
                setSelectedBucket(null);
              }}
              className={input}
            >
              {PRICE_BAND_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {pick(opt.label, lang)}
                </option>
              ))}
            </select>
          </div>

          {/* Time Period Range Filter */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wd-start-month">
              {lang === "th" ? "ช่วงเวลาประกาศ (Time period)" : "Time period"}
            </Label>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
              <select
                id="wd-start-month"
                aria-label={lang === "th" ? "ตั้งแต่เดือน" : "Start month"}
                value={effectiveStartMonth}
                onChange={(e) => {
                  const next = e.target.value;
                  setStartMonth(next);
                  if (next > effectiveEndMonth) setEndMonth(next);
                  setSelectedBucket(null);
                }}
                className={input}
              >
                {availableMonths.map((m) => (
                  <option key={m.key} value={m.key}>
                    {lang === "th" ? m.labelTh : m.labelEn}
                  </option>
                ))}
              </select>
              <span className="text-[12px] text-ink-3">–</span>
              <select
                id="wd-end-month"
                aria-label={lang === "th" ? "ถึงเดือน" : "End month"}
                value={effectiveEndMonth}
                onChange={(e) => {
                  const next = e.target.value;
                  setEndMonth(next);
                  if (next < effectiveStartMonth) setStartMonth(next);
                  setSelectedBucket(null);
                }}
                className={input}
              >
                {availableMonths.map((m) => (
                  <option key={m.key} value={m.key}>
                    {lang === "th" ? m.labelTh : m.labelEn}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Active Filter Pills & Reset */}
        {hasActiveFilters ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
            <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
              <span className="text-ink-3">
                {lang === "th" ? "ตัวกรองที่เลือก:" : "Active filters:"}
              </span>
              {category !== "all" ? (
                <Chip>{getCategoryLabel(category, lang)}</Chip>
              ) : null}
              {archetype !== "all" ? (
                <Chip>{getArchetypeLabel(archetype, lang)}</Chip>
              ) : null}
              {complexity !== "all" ? (
                <Chip>{getComplexityLabel(complexity, lang)}</Chip>
              ) : null}
              {agencyFilter !== "all" ? <Chip>{agencyFilter}</Chip> : null}
              {priceBand !== "all" ? (
                <Chip>
                  {pick(
                    PRICE_BAND_OPTIONS.find((b) => b.id === priceBand)!.label,
                    lang,
                  )}
                </Chip>
              ) : null}
              {effectiveStartMonth !== defaultStartMonth ||
              effectiveEndMonth !== defaultEndMonth ? (
                <Chip>
                  {(() => {
                    const s = availableMonths.find((m) => m.key === effectiveStartMonth);
                    const e = availableMonths.find((m) => m.key === effectiveEndMonth);
                    const sLbl = s ? (lang === "th" ? s.labelTh : s.labelEn) : effectiveStartMonth;
                    const eLbl = e ? (lang === "th" ? e.labelTh : e.labelEn) : effectiveEndMonth;
                    return `${sLbl} – ${eLbl}`;
                  })()}
                </Chip>
              ) : null}
              {selectedBucket ? (
                <Chip>
                  {lang === "th" ? `ช่วงเวลา: ${selectedBucket}` : `Period: ${selectedBucket}`}
                </Chip>
              ) : null}
              {selectedRiskTier ? (
                <Chip>
                  {lang === "th"
                    ? `ระดับความเสี่ยง: ${selectedRiskTier.toUpperCase()}`
                    : `Risk tier: ${selectedRiskTier.toUpperCase()}`}
                </Chip>
              ) : null}
              {selectedTrigger ? <Chip>{selectedTrigger}</Chip> : null}
            </div>
            <button
              type="button"
              onClick={resetAllFilters}
              className="text-[12px] font-medium text-ink-2 underline hover:text-ink cursor-pointer"
            >
              {lang === "th" ? "ล้างตัวกรองทั้งหมด" : "Reset all filters"}
            </button>
          </div>
        ) : null}
      </Panel>

      {/* 2. Main Big-Picture Visualization: Time-Series Line Graph (FR-19) */}
      <section className="mb-5">
        <SectionHeading
          sub={
            lang === "th"
              ? "เปรียบเทียบแนวโน้มค่ามัธยฐาน (เส้นทึบ) และค่าเฉลี่ย (เส้นประ) ของราคากลางตามช่วงเวลา พร้อมจุดแสดงโครงการจริงในกลุ่มที่เลือก"
              : "Historical median (solid) and average (dashed) reference price trend over time, with individual TORs plotted against the ±15% normal band."
          }
          right={
            <div className="inline-flex rounded-[3px] border border-line bg-surface-2 p-0.5">
              <button
                type="button"
                onClick={() => {
                  setTimeGrain("monthly");
                  setSelectedBucket(null);
                }}
                className={`rounded-[2px] px-2.5 py-1 text-[12px] font-medium transition-colors cursor-pointer ${
                  timeGrain === "monthly"
                    ? "bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                    : "text-ink-3 hover:text-ink"
                }`}
              >
                {lang === "th" ? "รายเดือน" : "Monthly"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setTimeGrain("quarterly");
                  setSelectedBucket(null);
                }}
                className={`rounded-[2px] px-2.5 py-1 text-[12px] font-medium transition-colors cursor-pointer ${
                  timeGrain === "quarterly"
                    ? "bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                    : "text-ink-3 hover:text-ink"
                }`}
              >
                {lang === "th" ? "รายไตรมาส" : "Quarterly"}
              </button>
            </div>
          }
        >
          {lang === "th"
            ? "แนวโน้มราคากลางและกรอบราคาตลาดย้อนหลัง"
            : "Historical price trend & market band"}
        </SectionHeading>

        <Panel className="p-4">
          <PriceTrendLineChart
            series={timeSeries}
            lang={lang}
            activeBucket={selectedBucket}
            onSelectBucket={setSelectedBucket}
          />
        </Panel>
      </section>

      {/* 3. KPI Summary Strip Under the Graph (4 metrics for the active filter slice) */}
      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Panel className="p-3.5">
          <Label>
            {lang === "th"
              ? "จำนวนโครงการที่วิเคราะห์ในกลุ่มนี้"
              : "Analyzed TORs in this slice"}
          </Label>
          <p className="mt-1.5 font-mono tnum text-[24px] font-semibold leading-none text-ink">
            {kpis.extractedCount.toLocaleString("en-US")}
            <span className="ml-1.5 font-sans text-[13px] font-normal text-ink-3">
              {lang === "th" ? "โครงการ" : "TORs"}
            </span>
          </p>
        </Panel>

        <Panel className="p-3.5">
          <Label>
            {lang === "th" ? "ค่ามัธยฐานราคากลาง (Median)" : "Historical median price"}
          </Label>
          <p className="mt-1.5 font-mono tnum text-[24px] font-semibold leading-none text-ink">
            {kpis.overallMedian > 0 ? formatTHBCompact(kpis.overallMedian) : "—"}
          </p>
        </Panel>

        <Panel className="p-3.5">
          <Label>
            {lang === "th" ? "ค่าเฉลี่ยราคากลาง (Average)" : "Historical average price"}
          </Label>
          <p className="mt-1.5 font-mono tnum text-[24px] font-semibold leading-none text-ink">
            {kpis.overallAverage > 0 ? formatTHBCompact(kpis.overallAverage) : "—"}
          </p>
          <p className="mt-1.5 text-[11.5px] leading-thai text-ink-3">
            {kpis.overallAverage > 0 && kpis.overallMedian > 0
              ? lang === "th"
                ? `${
                    kpis.overallAverage >= kpis.overallMedian ? "สูงกว่า" : "ต่ำกว่า"
                  }ค่ามัธยฐาน ${
                    kpis.overallAverage >= kpis.overallMedian ? "+" : ""
                  }${Math.round(
                    ((kpis.overallAverage - kpis.overallMedian) / kpis.overallMedian) * 100,
                  )}%`
                : `${
                    kpis.overallAverage >= kpis.overallMedian ? "+" : ""
                  }${Math.round(
                    ((kpis.overallAverage - kpis.overallMedian) / kpis.overallMedian) * 100,
                  )}% vs median`
              : "—"}
          </p>
        </Panel>

        <Panel className="p-3.5">
          <Label>
            {lang === "th"
              ? "อัตราพบสัญญาณล็อกสเปก"
              : "Lock-spec risk rate"}
          </Label>
          <p className="mt-1.5 font-mono tnum text-[24px] font-semibold leading-none">
            <span
              className={
                kpis.highCount > 0 ? "text-risk" : kpis.medCount > 0 ? "text-amend" : "text-open"
              }
            >
              {kpis.riskRatePct}%
            </span>
            <span className="ml-1.5 font-sans text-[13px] font-normal text-ink-3">
              {lang === "th" ? "โครงการ" : "of TORs"}
            </span>
          </p>
          <p className="mt-1.5 text-[11.5px] leading-thai text-ink-3">
            {lang === "th"
              ? `ความเสี่ยงสูง ${kpis.highCount} · ปานกลาง ${kpis.medCount} · เปิดกว้าง ${kpis.lowCount}`
              : `High ${kpis.highCount} · Medium ${kpis.medCount} · Open ${kpis.lowCount}`}
          </p>
        </Panel>
      </div>

      {/* 4. Macro Lock-Spec Risk Breakdown & Circular ว 214 Triggers (FR-20, FR-21) */}
      <section className="mb-8">
        <SectionHeading
          sub={
            lang === "th"
              ? "สรุปสัดส่วนความเสี่ยงล็อกสเปกและประเภทข้อกำหนดที่พบตามเกณฑ์หนังสือเวียนกรมบัญชีกลาง ด่วนที่สุด ที่ กค (กวจ) 0405.2/ว 214"
              : "Distribution of lock-spec risk levels and statutory trigger categories under Comptroller General Circular ว 214."
          }
        >
          {lang === "th"
            ? "ภาพรวมความเสี่ยงล็อกสเปกและเงื่อนไขจำกัดการแข่งขัน"
            : "Lock-spec risk distribution & statutory triggers"}
        </SectionHeading>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* Left Card (5 cols): Risk Tier Breakdown */}
          <Panel className="flex flex-col justify-between p-4 lg:col-span-5">
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-[14px] font-semibold text-ink">
                  {lang === "th"
                    ? "สัดส่วนระดับความเสี่ยงในกลุ่มนี้"
                    : "Risk tier breakdown in this slice"}
                </h3>
                <span className="font-mono text-[11px] text-ink-3">
                  {kpis.extractedCount}{" "}
                  {lang === "th" ? "โครงการที่วิเคราะห์" : "analyzed TORs"}
                </span>
              </div>

              {/* Stacked Proportional Bar */}
              {kpis.extractedCount > 0 ? (
                <div className="mt-3 flex h-3.5 w-full overflow-hidden rounded-[2px] border border-line bg-surface-2">
                  {kpis.highCount > 0 ? (
                    <div
                      style={{ width: `${(kpis.highCount / kpis.extractedCount) * 100}%` }}
                      className="bg-risk transition-all"
                      title={`High Risk: ${kpis.highCount}`}
                    />
                  ) : null}
                  {kpis.medCount > 0 ? (
                    <div
                      style={{ width: `${(kpis.medCount / kpis.extractedCount) * 100}%` }}
                      className="bg-amend transition-all"
                      title={`Medium Risk: ${kpis.medCount}`}
                    />
                  ) : null}
                  {kpis.lowCount > 0 ? (
                    <div
                      style={{ width: `${(kpis.lowCount / kpis.extractedCount) * 100}%` }}
                      className="bg-open transition-all"
                      title={`Low Risk: ${kpis.lowCount}`}
                    />
                  ) : null}
                </div>
              ) : null}

              {/* Interactive Tier Rows */}
              <div className="mt-4 flex flex-col divide-y divide-line border-t border-line">
                {(
                  [
                    {
                      level: "high" as RiskLevel,
                      label: {
                        th: "ความเสี่ยงสูง (คะแนน ≥ 70)",
                        en: "High risk (score ≥ 70)",
                      },
                      desc: {
                        th: "พบข้อกำหนดจำกัดการแข่งขันตั้งแต่ 2 หมวดขึ้นไป",
                        en: "Triggers 2 or more Circular ว 214 barriers",
                      },
                      count: kpis.highCount,
                    },
                    {
                      level: "medium" as RiskLevel,
                      label: {
                        th: "ความเสี่ยงปานกลาง (คะแนน 35–69)",
                        en: "Medium risk (score 35–69)",
                      },
                      desc: {
                        th: "พบข้อกำหนดที่แคบกว่าเกณฑ์มาตรฐาน 1 หมวด",
                        en: "Triggers 1 Circular ว 214 barrier",
                      },
                      count: kpis.medCount,
                    },
                    {
                      level: "low" as RiskLevel,
                      label: {
                        th: "ความเสี่ยงต่ำ / เปิดกว้าง (คะแนน < 35)",
                        en: "Low risk / open competition (< 35)",
                      },
                      desc: {
                        th: "ไม่พบเงื่อนไขล็อกสเปกตามเกณฑ์ ว 214",
                        en: "No statutory lock-spec barriers detected",
                      },
                      count: kpis.lowCount,
                    },
                  ] as const
                ).map((row) => {
                  const pct =
                    kpis.extractedCount > 0
                      ? Math.round((row.count / kpis.extractedCount) * 100)
                      : 0;
                  const active = selectedRiskTier === row.level;
                  return (
                    <button
                      key={row.level}
                      type="button"
                      onClick={() => {
                        setSelectedRiskTier(active ? null : row.level);
                        if (!active) setTableTab("all");
                      }}
                      className={`flex w-full items-center justify-between gap-3 px-2 py-2.5 text-left transition-colors cursor-pointer ${
                        active ? "bg-surface-3" : "hover:bg-surface-2"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <RiskMeter level={row.level} />
                          <span className="text-[13px] font-medium text-ink">
                            {pick(row.label, lang)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11.5px] leading-thai text-ink-3">
                          {pick(row.desc, lang)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right font-mono tnum">
                        <span className="text-[14px] font-semibold text-ink">
                          {row.count}
                        </span>
                        <span className="ml-1.5 text-[11.5px] text-ink-3">({pct}%)</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <p className="mt-3 border-t border-line pt-2.5 text-[11px] leading-thai text-ink-3">
              {lang === "th"
                ? "คลิกที่แถวระดับความเสี่ยงเพื่อกรองตารางโครงการด้านล่าง"
                : "Click any risk tier row to filter the project list below."}
            </p>
          </Panel>

          {/* Right Card (7 cols): The 3 Circular ว 214 Trigger Categories */}
          <Panel className="flex flex-col justify-between p-4 lg:col-span-7">
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-[14px] font-semibold text-ink">
                  {lang === "th"
                    ? "จำแนกตามเกณฑ์หนังสือเวียน ว 214 (3 หมวดหลัก)"
                    : "Breakdown by Circular ว 214 statutory criteria"}
                </h3>
                <span className="text-[11.5px] text-ink-3">
                  {lang === "th" ? "คลิกเพื่อดูโครงการที่เข้าเกณฑ์" : "Click to filter projects"}
                </span>
              </div>

              <div className="mt-3 flex flex-col gap-2.5">
                {LOCK_SPEC_TRIGGERS_META.map((trig) => {
                  const count = kpis.triggerCounts[trig.id] ?? 0;
                  const maxTrig = Math.max(
                    1,
                    ...Object.values(kpis.triggerCounts),
                  );
                  const barPct = Math.round((count / maxTrig) * 100);
                  const active = selectedTrigger === trig.id;

                  return (
                    <button
                      key={trig.id}
                      type="button"
                      onClick={() => {
                        setSelectedTrigger(active ? null : trig.id);
                        if (!active) setTableTab("lockspec");
                      }}
                      className={`flex flex-col gap-1.5 rounded-[3px] border p-3 text-left transition-colors cursor-pointer ${
                        active
                          ? "border-ink bg-surface-3"
                          : "border-line bg-surface-2 hover:border-line-2"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-[2px] border px-1.5 py-0.5 font-mono text-[10.5px] font-medium ${TONE.risk.bg} ${TONE.risk.border} ${TONE.risk.text}`}
                          >
                            {trig.code}
                          </span>
                          <span className="text-[13.5px] font-semibold text-ink">
                            {pick(trig.title, lang)}
                          </span>
                        </div>
                        <span className="font-mono tnum text-[13px] font-semibold text-ink">
                          {count}{" "}
                          <span className="font-sans text-[11.5px] font-normal text-ink-3">
                            {lang === "th" ? "โครงการ" : "TORs"}
                          </span>
                        </span>
                      </div>

                      <p className="text-[12px] leading-thai text-ink-2">
                        {pick(trig.description, lang)}
                      </p>

                      {/* Frequency bar */}
                      <div className="mt-1 flex items-center gap-3">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                          <div
                            className="h-full bg-risk transition-all"
                            style={{ width: `${count > 0 ? Math.max(8, barPct) : 0}%` }}
                          />
                        </div>
                        <span className="font-mono text-[10.5px] text-ink-3">
                          {pick(trig.legalRef, lang)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </Panel>
        </div>
      </section>

      {/* 5. Bottom Section: Flagged & Notable Projects Table */}
      <section>
        <SectionHeading
          sub={
            lang === "th"
              ? "แสดงเฉพาะโครงการสำคัญในกลุ่มตัวกรองที่เลือก เพื่อตรวจสอบราคากลางเทียบค่ามัธยฐานและหลักฐานข้อกำหนดที่สุ่มเสี่ยง"
              : "Inspect notable projects in the active filter slice, comparing reference prices against peer medians and reviewing extracted lock-spec clauses."
          }
          right={
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor="wd-row-limit">
                {lang === "th" ? "จำนวนแถวที่แสดง:" : "Show rows:"}
              </Label>
              <select
                id="wd-row-limit"
                value={rowLimit}
                onChange={(e) => setRowLimit(Number(e.target.value))}
                className="h-8 rounded-[3px] border border-line-2 bg-surface px-2 font-mono text-[12px] text-ink"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={15}>15</option>
                <option value={0}>
                  {lang === "th"
                    ? `ทั้งหมด (${tableProjects.length})`
                    : `All (${tableProjects.length})`}
                </option>
              </select>
            </div>
          }
        >
          {lang === "th"
            ? "โครงการที่ควรจับตาในกลุ่มนี้"
            : "Notable & flagged projects in this slice"}
        </SectionHeading>

        {/* View Mode Tabs */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                {
                  id: "flagged" as TableTab,
                  label: {
                    th: "พบสัญญาณผิดปกติ (ราคา หรือ ล็อกสเปก)",
                    en: "Flagged (Price outlier or Lock-spec)",
                  },
                },
                {
                  id: "price" as TableTab,
                  label: {
                    th: "เรียงตามส่วนต่างราคากลาง (±%)",
                    en: "By price deviation (±%)",
                  },
                },
                {
                  id: "lockspec" as TableTab,
                  label: {
                    th: "เฉพาะที่พบความเสี่ยงล็อกสเปก (ว 214)",
                    en: "Lock-spec findings only (ว 214)",
                  },
                },
                {
                  id: "all" as TableTab,
                  label: {
                    th: "ทุกโครงการในกลุ่มนี้",
                    en: "All projects in slice",
                  },
                },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTableTab(tab.id)}
                className={`rounded-[3px] border px-3 py-1.5 text-[12.5px] font-medium transition-colors cursor-pointer ${
                  tableTab === tab.id
                    ? "border-ink bg-ink text-surface"
                    : "border-line bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink"
                }`}
              >
                {pick(tab.label, lang)}
              </button>
            ))}
          </div>

          <span className="font-mono text-[11.5px] text-ink-3">
            {lang === "th"
              ? `แสดง ${visibleRows.length} จาก ${tableProjects.length} โครงการ`
              : `Showing ${visibleRows.length} of ${tableProjects.length} projects`}
          </span>
        </div>

        {visibleRows.length === 0 ? (
          <EmptyState
            headline={
              lang === "th"
                ? "ไม่พบโครงการที่ตรงกับเงื่อนไขย่อยที่เลือก"
                : "No projects match this specific filter view"
            }
            body={
              lang === "th"
                ? "ลองสลับแท็บเป็น “ทุกโครงการในกลุ่มนี้” หรือล้างตัวกรองย่อยด้านบน"
                : "Try switching to the “All projects in slice” tab or clearing active sub-filters."
            }
            action={
              <button type="button" onClick={resetAllFilters} className={btn.secondary}>
                {lang === "th" ? "ล้างตัวกรองทั้งหมด" : "Reset filters"}
              </button>
            }
          />
        ) : (
          <Panel className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line bg-surface-2">
                  <th className="px-3.5 py-2.5 text-[11.5px] font-medium text-ink-3">
                    {lang === "th" ? "โครงการ / หน่วยงาน" : "Project & agency"}
                  </th>
                  <th className="px-3 py-2.5 text-[11.5px] font-medium text-ink-3">
                    {lang === "th" ? "ประเภท / ขนาด" : "Archetype & tier"}
                  </th>
                  <th className="px-3 py-2.5 text-right text-[11.5px] font-medium text-ink-3">
                    {lang === "th"
                      ? "ราคากลาง vs ค่ามัธยฐานกลุ่ม"
                      : "Reference vs peer median"}
                  </th>
                  <th className="px-3 py-2.5 text-[11.5px] font-medium text-ink-3">
                    {lang === "th" ? "ส่วนต่างราคา" : "Price check"}
                  </th>
                  <th className="px-3.5 py-2.5 text-[11.5px] font-medium text-ink-3">
                    {lang === "th"
                      ? "ความเสี่ยงล็อกสเปกและข้อกำหนดที่พบ"
                      : "Lock-spec verdict & findings"}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visibleRows.map((proj) => {
                  const delta = calcPriceDeltaPct(proj);
                  return (
                    <tr
                      key={proj.id}
                      className="align-top transition-colors hover:bg-surface-2/60"
                    >
                      {/* Col 1: Project Title, ID, Agency, Status */}
                      <td className="max-w-[330px] px-3.5 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusBadge status={proj.status} lang={lang} />
                          <span className="font-mono tnum text-[11px] text-ink-3">
                            {proj.id}
                          </span>
                          <span className="text-[11px] text-ink-3">
                            · {formatDate(proj.postedAt, lang)}
                          </span>
                        </div>
                        <Link
                          href={`/tor/${proj.id}`}
                          className="mt-1.5 block text-[13.5px] leading-thai font-medium text-ink hover:underline"
                        >
                          {pick(proj.title, lang)}
                        </Link>
                        <p className="mt-0.5 text-[12px] leading-thai text-ink-2">
                          {pick(proj.agency, lang)}
                        </p>
                      </td>

                      {/* Col 2: Archetype & Complexity */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="flex flex-col items-start gap-1">
                          <Chip>{getArchetypeLabel(proj.archetype, lang)}</Chip>
                          <span className="text-[11.5px] text-ink-3">
                            {getComplexityLabel(proj.complexity, lang)}
                          </span>
                        </div>
                      </td>

                      {/* Col 3: Reference Price vs Peer Median */}
                      <td className="px-3 py-3 text-right font-mono tnum whitespace-nowrap">
                        <div className="text-[13.5px] font-semibold text-ink">
                          {formatTHB(proj.referencePriceTHB)}
                        </div>
                        <div className="mt-0.5 text-[11.5px] text-ink-3">
                          {lang === "th" ? "ค่ากลาง " : "Median "}
                          {formatTHBCompact(proj.peerMedianTHB)}
                        </div>
                        {proj.agreedPriceTHB ? (
                          <div className="mt-0.5 text-[11px] text-ink-2">
                            {lang === "th" ? "ชนะที่ " : "Won at "}
                            {formatTHBCompact(proj.agreedPriceTHB)}
                          </div>
                        ) : null}
                      </td>

                      {/* Col 4: Price Delta Badge */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        <PriceDeltaBadge delta={delta} lang={lang} />
                      </td>

                      {/* Col 5: Lock-Spec Risk Badge & Compact Trigger Category Tags */}
                      <td className="max-w-[340px] px-3.5 py-3">
                        <div className="flex flex-col items-start gap-1.5">
                          <LockSpecBadge
                            level={proj.lockSpecLevel}
                            score={proj.lockSpecScore}
                            lang={lang}
                            outOf100
                          />
                          {proj.triggers.length > 0 ? (
                            <div className="mt-0.5 flex flex-wrap gap-1.5">
                              {proj.triggers.map((t) => (
                                <span
                                  key={t.category}
                                  title={pick(t.summary, lang)}
                                  className="font-mono text-[11px] font-medium text-risk"
                                >
                                  [{t.category}]
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[11.5px] text-ink-3">
                              {lang === "th"
                                ? "ไม่พบข้อกำหนดที่เข้าข่าย ว 214"
                                : "No Circular ว 214 barriers found"}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Panel>
        )}

        {/* Footer note explaining methodology & non-accusatory principle (AGENTS.md §7) */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4 text-[11.5px] leading-thai text-ink-3">
          <p>
            {lang === "th"
              ? "หมายเหตุ: ค่ามัธยฐานและค่าเฉลี่ยคำนวณจากโครงการประเภทและระดับความซับซ้อนเดียวกันในฐานข้อมูล data.go.th และ e-GP สัญญาณความเสี่ยงเป็นข้อมูลประกอบการพิจารณาเบื้องต้น ไม่ใช่การตัดสินความผิดทางกฎหมาย"
              : "Note: Medians and averages are computed across comparable scope and complexity tiers from data.go.th and e-GP. Risk flags highlight clauses for review and do not allege legal wrongdoing."}
          </p>
          <span className="font-mono text-[11px] text-ink-3">
            {dataSource === "api"
              ? lang === "th"
                ? `เชื่อมต่อฐานข้อมูลจริง (${allProjects.length} โครงการ)`
                : `Connected to live API (${allProjects.length} TORs)`
              : dataSource === "loading"
                ? lang === "th"
                  ? "กำลังโหลดข้อมูลจริง..."
                  : "Loading live data..."
                : lang === "th"
                  ? "ข้อมูลจำลอง (เซิร์ฟเวอร์ไม่ได้เปิด)"
                  : "Fixture fallback (API offline)"}
          </span>
        </div>
      </section>
    </div>
  );
}
