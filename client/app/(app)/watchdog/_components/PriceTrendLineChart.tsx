"use client";

import { useState } from "react";
import { X } from "lucide-react";
import {
  formatTHB,
  formatTHBCompact,
  pick,
  type Lang,
} from "../../../_data/tors";
import { calcPriceDeltaPct } from "../../../_data/watchdog";
import { EmptyState, Well } from "../../../_components/ui";
import { NORMAL_BAND_PCT, type TimePoint } from "../_lib/types";

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
}: {
  series: TimePoint[];
  lang: Lang;
  activeBucket?: string | null;
  onSelectBucket?: (key: string | null) => void;
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
            ? "ลองปรับเปลี่ยนสถานะ หมวดหมู่งาน รูปแบบระบบ หรือล้างตัวกรองเพื่อดูภาพรวมทั้งหมด"
            : "Try broadening the category, system archetype, or resetting filters."
        }
      />
    );
  }

  // Compute Y-axis domain from all medians, averages, bands including realistic scale
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

        {activeBucket && onSelectBucket ? (
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
            <X className="h-3 w-3 text-ink-3" />
          </button>
        ) : (
          <span className="text-[11.5px] text-ink-3">
            {lang === "th"
              ? "ชี้เมาส์เหนือจุดบนกราฟเพื่อดูรายละเอียดราคาและโครงการ"
              : "Hover over points on the chart to inspect details"}
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
