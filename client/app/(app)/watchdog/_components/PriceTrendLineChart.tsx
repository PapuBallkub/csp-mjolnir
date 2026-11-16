"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import {
  formatTHB,
  formatTHBCompact,
  pick,
  type Lang,
} from "../../../_data/tors";
import { EmptyState, Well } from "../../../_components/ui";
import { NORMAL_BAND_PCT, type TimePoint } from "../_lib/types";
import { computeAverage, computeMedian } from "../_lib/watchdog-helpers";

/**
 * Interactive SVG Line + Shaded Normal Band Chart (Option A: Time-Series Trend).
 * Plots:
 *  - Shaded ±15% normal band around the historical median
 *  - Solid line: Historical Median (ค่ามัธยฐานราคากลาง)
 *  - Dashed line: Historical Average (ค่าเฉลี่ยราคากลาง)
 *  - Individual project dots colored by price verdict (normal / over / under)
 */
export function PriceTrendLineChart({
  series,
  lang,
  activeBucket,
  onSelectBucket,
  showOnlyExisting = false,
  onToggleShowOnlyExisting,
  filterMinPrice = 0,
  filterMaxPrice = 0,
}: {
  series: TimePoint[];
  lang: Lang;
  activeBucket?: string | null;
  onSelectBucket?: (key: string | null) => void;
  showOnlyExisting?: boolean;
  onToggleShowOnlyExisting?: (val: boolean) => void;
  filterMinPrice?: number;
  filterMaxPrice?: number;
}) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  // Lock the number of visible X-axis labels to a comfortable 6–8 ticks maximum.
  // Scales cleanly across months, quarters, half-years, and years for wide multi-year ranges.
  const labelStep = useMemo(() => {
    const len = series.length;
    if (len <= 8) return 1;
    if (len <= 16) return 2;
    if (len <= 28) return 3; // quarterly
    if (len <= 54) return 6; // semi-annually
    if (len <= 96) return 12; // annually
    return Math.max(12, Math.ceil(len / 8));
  }, [series.length]);

  // Set of indices that show their full month label
  const fullLabelIndices = useMemo(() => {
    const indices = new Set<number>();
    if (series.length > 0) {
      indices.add(0);
      indices.add(series.length - 1);
      for (let i = 0; i < series.length; i++) {
        if (i % labelStep === 0 && series.length - 1 - i >= labelStep) {
          indices.add(i);
        }
      }
    }
    return Array.from(indices).sort((a, b) => a - b);
  }, [series.length, labelStep]);

  // Compute the most frequent gap (normal cadence, e.g. 2 months).
  // Only display "..." when a gap is strictly LARGER than this normal frequency!
  const gapEllipses = useMemo<{ key: string; prevIdx: number; nextIdx: number }[]>(() => {
    if (fullLabelIndices.length < 2) return [];

    const gapCounts = new Map<number, number>();
    for (let i = 0; i < fullLabelIndices.length - 1; i++) {
      const diff = fullLabelIndices[i + 1] - fullLabelIndices[i];
      gapCounts.set(diff, (gapCounts.get(diff) ?? 0) + 1);
    }

    let normalGap = labelStep;
    let maxCount = 0;
    gapCounts.forEach((count, gap) => {
      if (count > maxCount) {
        maxCount = count;
        normalGap = gap;
      }
    });

    const results: { key: string; prevIdx: number; nextIdx: number }[] = [];
    for (let i = 0; i < fullLabelIndices.length - 1; i++) {
      const prev = fullLabelIndices[i];
      const next = fullLabelIndices[i + 1];
      const diff = next - prev;
      if (diff > normalGap) {
        results.push({ key: `gap-${prev}-${next}`, prevIdx: prev, nextIdx: next });
      }
    }
    return results;
  }, [fullLabelIndices, labelStep]);

  // Aggregate summary across all periods/projects matching the active filter.
  // Displayed in the readout bar when the user's cursor is not hovering over a specific time bucket.
  const allDataSummary = useMemo<TimePoint>(() => {
    const allProjects = series.flatMap((pt) => pt.projects);
    const torCount = allProjects.length;
    if (torCount === 0) {
      return {
        key: "all",
        label: lang === "th" ? "ทุกช่วงเวลา (ภาพรวม)" : "All periods (Overview)",
        torCount: 0,
        medianTHB: 0,
        averageTHB: 0,
        bandLowTHB: 0,
        bandHighTHB: 0,
        highRiskCount: 0,
        projects: [],
      };
    }
    const prices = allProjects.map((p) => p.referencePriceTHB);
    const med = computeMedian(prices);
    const avg = computeAverage(prices);
    return {
      key: "all",
      label: lang === "th" ? "ทุกช่วงเวลา (ภาพรวม)" : "All periods (Overview)",
      torCount,
      medianTHB: med,
      averageTHB: avg,
      bandLowTHB: Math.round(med * (1 - NORMAL_BAND_PCT / 100)),
      bandHighTHB: Math.round(med * (1 + NORMAL_BAND_PCT / 100)),
      highRiskCount: allProjects.filter((p) => p.lockSpecLevel === "high").length,
      projects: allProjects,
    };
  }, [series, lang]);

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
            ? "ลองปรับเปลี่ยนสถานะ หมวดหมู่งาน รูปแบบระบบ หรือล้างตัวกรองเพื่อดูภาพรวมทั้งหมด"
            : "Try broadening the category, system archetype, or resetting filters."
        }
      />
    );
  }

  // Compute Y-axis domain from filter inputs and project prices
  const filterMin = filterMinPrice ?? 0;
  const filterMax = filterMaxPrice ?? 0;

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

  const yMin = filterMin > 0 ? filterMin : 0;
  let yMax = filterMax > 0 ? filterMax : Math.ceil((maxLine * 1.1) / step) * step;
  if (yMax <= yMin) {
    yMax = yMin + 5_000_000;
  }
  const yDomain = Math.max(1_000_000, yMax - yMin);

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
    padTop + plotH - Math.min(1, Math.max(0, (val - yMin) / yDomain)) * plotH;

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

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(yMin + yDomain * t));

  // If hovering or filtered to a bucket, show that bucket; otherwise show the aggregate "All Data" summary.
  const inspectedKey = hoveredKey ?? activeBucket ?? null;
  const inspectedPoint = inspectedKey
    ? (series.find((pt) => pt.key === inspectedKey) ?? allDataSummary)
    : allDataSummary;

  return (
    <div className="flex flex-col gap-3">
      {/* Legend & Inspected Period Callout */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 border-b border-line pb-3">
        {/* Left Side: Lines & Normal Band */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12px] text-ink-2">
          <span className="inline-flex items-center gap-2">
            <span className="h-[2.5px] w-5 bg-ink" />
            <span>
              {lang === "th" ? "ค่ามัธยฐานราคากลาง (Median)" : "Reference price median"}
            </span>
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-0 w-5 border-t-2 border-dashed border-ink-3" />
            <span>
              {lang === "th" ? "ค่าเฉลี่ยราคากลาง (Average)" : "Reference price average"}
            </span>
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-3 w-5 rounded-[2px] border border-line-2 bg-surface-3" />
            <span>
              {lang === "th"
                ? `กรอบราคาปกติ (±${NORMAL_BAND_PCT}% จากค่ามัธยฐาน)`
                : `Normal corridor (±${NORMAL_BAND_PCT}% of median)`}
            </span>
          </span>
        </div>

        {/* Right Side: Lock-Spec Risk Dots Legend & Active Bucket Filter */}
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[11.5px] text-ink-2">
          {activeBucket && onSelectBucket ? (
            <button
              type="button"
              onClick={() => onSelectBucket(null)}
              className="inline-flex items-center gap-1.5 rounded-[2px] border border-line-2 bg-surface-2 px-2 py-0.5 font-medium text-ink hover:bg-surface-3 cursor-pointer mr-1"
            >
              <span>
                {lang === "th"
                  ? `กรองเฉพาะช่วง: ${series.find((s) => s.key === activeBucket)?.label}`
                  : `Filtered to: ${series.find((s) => s.key === activeBucket)?.label}`}
              </span>
              <X className="h-3 w-3 text-ink-3" />
            </button>
          ) : null}

          <span className="text-ink-3 font-medium">
            {lang === "th" ? "ระดับความเสี่ยงล็อกสเปก:" : "Lock-spec risk:"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-open" />
            <span>{lang === "th" ? "เปิดกว้าง (Low)" : "Low"}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amend" />
            <span>{lang === "th" ? "ปานกลาง (Medium)" : "Medium"}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-risk" />
            <span>{lang === "th" ? "เสี่ยงสูง (High)" : "High"}</span>
          </span>
        </div>
      </div>

      {/* SVG Line Chart */}
      <div className="relative overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full min-w-[640px] select-none"
          role="img"
          onMouseLeave={() => setHoveredKey(null)}
          aria-label={
            lang === "th"
              ? "กราฟเส้นแสดงแนวโน้มค่ามัธยฐานและค่าเฉลี่ยราคากลางตามช่วงเวลา"
              : "Line chart showing historical median and average reference price over time"
          }
        >
          {/* Horizontal grid lines & Y-axis labels with filter change indicators */}
          {yTicks.map((tick, tIdx) => {
            const y = yForPrice(tick);
            const isBottom = tIdx === 0;
            const isTop = tIdx === yTicks.length - 1;
            const hasMinIndicator = isBottom && filterMin > 0;
            const hasMaxIndicator = isTop && filterMax > 0;

            return (
              <g key={`${tick}-${tIdx}`}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={width - padRight}
                  y2={y}
                  stroke="var(--color-line)"
                  strokeDasharray={isBottom ? undefined : "3 3"}
                  strokeWidth="1"
                />
                <text
                  x={padLeft - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  className="font-mono text-[10px]"
                >
                  {hasMinIndicator ? (
                    <tspan fill="var(--color-open)" fontWeight="bold" dx="-3">
                      ↑{" "}
                    </tspan>
                  ) : null}
                  {hasMaxIndicator ? (
                    <tspan fill="var(--color-risk)" fontWeight="bold" dx="-3">
                      ↓{" "}
                    </tspan>
                  ) : null}
                  <tspan
                    className={
                      hasMinIndicator
                        ? "fill-open font-semibold"
                        : hasMaxIndicator
                          ? "fill-risk font-semibold"
                          : "fill-ink-3"
                    }
                  >
                    {tick === 0 ? "฿0" : formatTHBCompact(tick)}
                  </tspan>
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
                onClick={() => onSelectBucket?.(activeBucket === pt.key ? null : pt.key)}
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
                  const dotColor =
                    proj.lockSpecLevel === "high"
                      ? "var(--color-risk)"
                      : proj.lockSpecLevel === "medium"
                        ? "var(--color-amend)"
                        : "var(--color-open)";
                  const riskLabel =
                    proj.lockSpecLevel === "high"
                      ? lang === "th"
                        ? "เสี่ยงสูง (High Risk)"
                        : "High Risk"
                      : proj.lockSpecLevel === "medium"
                        ? lang === "th"
                          ? "ปานกลาง (Medium Risk)"
                          : "Medium Risk"
                        : lang === "th"
                          ? "เปิดกว้าง (Low Risk)"
                          : "Low Risk";
                  // Slight horizontal jitter when multiple projects share the same bucket
                  const spread = Math.min(24, plottedProjects.length * 4);
                  const offset =
                    plottedProjects.length > 1
                      ? (pIdx / (plottedProjects.length - 1) - 0.5) * spread
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
                        {`${pick(proj.title, lang)} — ${formatTHB(proj.referencePriceTHB)} · ${riskLabel}`}
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

                {/* Static X-axis label (only when not actively hovered/selected) */}
                {!isHovered && !isSelected && fullLabelIndices.includes(idx) ? (
                  <text
                    x={x}
                    y={height - 8}
                    textAnchor="middle"
                    className="font-mono text-[10.5px] fill-ink-3 select-none"
                  >
                    {pt.label}
                  </text>
                ) : null}

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

          {/* Ellipsis ("...") positioned at the EXACT geometric pixel midpoint between irregular gap labels */}
          {gapEllipses.map((gap) => {
            const activeKey = hoveredKey ?? activeBucket;
            const activeIdx = activeKey ? series.findIndex((pt) => pt.key === activeKey) : -1;
            // Hide ellipsis if hovered month falls inside this gap so there is zero overlap
            if (activeIdx > gap.prevIdx && activeIdx < gap.nextIdx) return null;

            const x1 = xForIndex(gap.prevIdx);
            const x2 = xForIndex(gap.nextIdx);
            const midX = (x1 + x2) / 2;

            return (
              <text
                key={gap.key}
                x={midX}
                y={height - 8}
                textAnchor="middle"
                className="font-mono text-[10.5px] fill-ink-3/70 select-none tracking-widest font-bold"
              >
                ...
              </text>
            );
          })}

          {/* Active / Hovered month label badge with solid background pill to prevent any text overlap */}
          {(() => {
            const activeKey = hoveredKey ?? activeBucket;
            if (!activeKey) return null;
            const activeIdx = series.findIndex((pt) => pt.key === activeKey);
            if (activeIdx === -1) return null;
            const pt = series[activeIdx];
            const x = xForIndex(activeIdx);
            return (
              <g pointerEvents="none">
                <rect
                  x={x - 24}
                  y={height - 21}
                  width={48}
                  height={17}
                  rx={3}
                  fill="var(--color-surface)"
                  stroke="var(--color-ink)"
                  strokeWidth="1.2"
                />
                <text
                  x={x}
                  y={height - 8}
                  textAnchor="middle"
                  className="font-mono text-[10.5px] font-bold fill-ink select-none"
                >
                  {pt.label}
                </text>
              </g>
            );
          })()}
        </svg>
      </div>

      {/* Inspected Period Readout Bar */}
      {inspectedPoint ? (
        <Well className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-3.5 py-2.5 text-[12px]">
          <div className="flex items-center gap-2">
            <span className="font-mono font-semibold text-ink">{inspectedPoint.label}</span>
            <span className="text-ink-3">·</span>
            <span className={inspectedPoint.torCount === 0 ? "text-ink-3 italic" : "text-ink-2"}>
              {lang === "th"
                ? `${inspectedPoint.torCount.toLocaleString()} โครงการที่ตรวจวิเคราะห์ในช่วงเวลานี้`
                : `${inspectedPoint.torCount.toLocaleString()} analyzed TORs in this period`}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono tnum">
            <span>
              <span className="font-sans text-ink-3">
                {lang === "th" ? "ค่ามัธยฐาน: " : "Median: "}
              </span>
              <strong className={inspectedPoint.medianTHB > 0 ? "text-ink" : "text-ink-3 font-normal"}>
                {formatTHB(inspectedPoint.medianTHB)}
              </strong>
            </span>
            <span>
              <span className="font-sans text-ink-3">
                {lang === "th" ? "ค่าเฉลี่ย: " : "Average: "}
              </span>
              <span className={inspectedPoint.averageTHB > 0 ? "text-ink-2" : "text-ink-3"}>
                {formatTHB(inspectedPoint.averageTHB)}
              </span>
            </span>
            <span>
              <span className="font-sans text-ink-3">
                {lang === "th" ? "กรอบปกติ (±15%): " : "Normal band (±15%): "}
              </span>
              <span className={inspectedPoint.medianTHB > 0 ? "text-ink-2" : "text-ink-3"}>
                {inspectedPoint.medianTHB > 0
                  ? `${formatTHBCompact(inspectedPoint.bandLowTHB)}–${formatTHBCompact(inspectedPoint.bandHighTHB)}`
                  : "—"}
              </span>
            </span>
          </div>
        </Well>
      ) : null}

      {/* Timeline Mode Toggle (Continuous vs Data-driven) */}
      <div className="flex items-center pt-2 border-t border-line text-[11.5px] text-ink-3">
        <label className="inline-flex items-center gap-2 cursor-pointer select-none text-ink-2 hover:text-ink">
          <input
            type="checkbox"
            checked={showOnlyExisting}
            onChange={(e) => onToggleShowOnlyExisting?.(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-line-2 text-ink focus:ring-0 cursor-pointer"
          />
          <span>
            {lang === "th"
              ? "แสดงเฉพาะช่วงเวลาที่มีข้อมูลโครงการ (ย่อแกนเวลาตามข้อมูลจริง)"
              : "Show only periods with projects (Data-driven timeline)"}
          </span>
        </label>
      </div>
    </div>
  );
}
