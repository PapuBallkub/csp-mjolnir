"use client";

import { formatTHBCompact, type Lang } from "../../../_data/tors";
import { Label, Panel } from "../../../_components/ui";

export type WatchdogKpiData = {
  extractedCount: number;
  activeCount: number;
  completedCount: number;
  overallMedian: number;
  overallAverage: number;
  lowCount: number;
  medCount: number;
  highCount: number;
  flaggedRiskCount: number;
  riskRatePct: number;
};

export function WatchdogKpiStrip({
  kpis,
  lang,
}: {
  kpis: WatchdogKpiData;
  lang: Lang;
}) {
  return (
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
  );
}
