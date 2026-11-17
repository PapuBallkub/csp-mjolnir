"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import { formatTHBCompact, type Lang } from "../../../_data/tors";
import { Label, Panel, SectionHeading } from "../../../_components/ui";
import { type PriceRealityMetrics } from "../_lib/types";

export type PriceRealitySummaryProps = {
  lang: Lang;
  metrics: PriceRealityMetrics;
};

export function PriceRealitySummary({ lang, metrics }: PriceRealitySummaryProps) {
  const isAvgHigher = metrics.overallAverage >= metrics.overallMedian;
  const avgDelta = metrics.overallMedian > 0
    ? Math.round(((metrics.overallAverage - metrics.overallMedian) / metrics.overallMedian) * 100)
    : 0;

  return (
    <section className="mb-8">
      <SectionHeading
        sub={
          lang === "th"
            ? "วิเคราะห์ความสมเหตุสมผลของราคากลางเทียบกับฐานข้อมูลโครงการประเภทเดียวกันในอดีต"
            : "Statistical analysis of reference prices against historical peer medians and distributions."
        }
      >
        {lang === "th"
          ? "สรุปผลวิเคราะห์ราคากลาง (Reference Price Reality Check)"
          : "Reference Price Reality Check Summary"}
      </SectionHeading>

      {/* 5 Summary Metric Cards in 2 Rows */}
      <div className="flex flex-col gap-3.5">
        {/* Row 1: 3 Core Baseline Metric Cards */}
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
          {/* Card 1: Total Analyzed Projects */}
          <Panel className="p-3.5 flex flex-col">
            <div className="min-h-[20px]">
              <Label>
                {lang === "th" ? "จำนวนโครงการที่ตรวจวิเคราะห์ (Sample Size)" : "Analyzed tenders (Sample Size)"}
              </Label>
            </div>
            <div className="mt-1.5 h-8 flex items-baseline">
              <span className="font-mono tnum text-[24px] font-semibold leading-none text-ink">
                {metrics.torCount.toLocaleString()}
              </span>
              <span className="ml-1.5 font-sans text-[13px] font-normal text-ink-3">
                {lang === "th" ? "โครงการ" : "tenders"}
              </span>
            </div>
            <div className="mt-2 h-5" />
            <div className="mt-3.5 pt-3 border-t border-line/60 flex-1">
              <p className="text-[11.5px] leading-thai text-ink-3">
                {lang === "th"
                  ? "จำนวนประกาศจัดซื้อจัดจ้างทั้งหมดที่ตรงตามเงื่อนไขตัวกรอง ช่วยสะท้อนขนาดกลุ่มตัวอย่างเพื่อยืนยันความน่าเชื่อถือของสถิติราคาในตลาด"
                  : "Total procurement notices matching the active filter criteria, reflecting the sample size to verify market price statistical reliability."}
              </p>
            </div>
          </Panel>

          {/* Card 2: Median */}
          <Panel className="p-3.5 flex flex-col">
            <div className="min-h-[20px]">
              <Label>
                {lang === "th" ? "ค่ามัธยฐานราคากลาง (Median)" : "Historical median"}
              </Label>
            </div>
            <div className="mt-1.5 h-8 flex items-baseline">
              <span className="font-mono tnum text-[24px] font-semibold leading-none text-ink">
                {metrics.torCount > 0 ? formatTHBCompact(metrics.overallMedian) : "—"}
              </span>
            </div>
            <div className="mt-2 h-5" />
            <div className="mt-3.5 pt-3 border-t border-line/60 flex-1">
              <p className="text-[11.5px] leading-thai text-ink-3">
                {lang === "th"
                  ? "ราคากึ่งกลางของกลุ่มโครงการที่ไม่ถูกทำให้ผิดเพี้ยนจากโครงการที่ราคาสูงผิดปกติ ช่วยให้เห็นว่าโครงการขนาดทั่วไปควรมีราคากลางประมาณเท่าใด"
                  : "The midpoint price of this project group unskewed by extreme high-budget projects, showing what a typical project should roughly cost."}
              </p>
            </div>
          </Panel>

          {/* Card 3: Average */}
          <Panel className="p-3.5 flex flex-col">
            <div className="min-h-[20px]">
              <Label>
                {lang === "th" ? "ค่าเฉลี่ยราคากลาง (Average)" : "Historical average"}
              </Label>
            </div>
            <div className="mt-1.5 h-8 flex items-baseline">
              <span className="font-mono tnum text-[24px] font-semibold leading-none text-ink">
                {metrics.torCount > 0 ? formatTHBCompact(metrics.overallAverage) : "—"}
              </span>
            </div>
            <div className="mt-2 h-5 flex items-center">
              {metrics.torCount >= 5 && metrics.overallMedian > 0 && metrics.overallAverage > 0 ? (
                <div className="flex items-center gap-1 font-mono text-[11.5px] leading-none">
                  {isAvgHigher ? (
                    <TrendingUp className="h-3.5 w-3.5 text-amend" />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5 text-open" />
                  )}
                  <span className={isAvgHigher ? "text-amend font-medium" : "text-open font-medium"}>
                    {isAvgHigher ? "+" : ""}{avgDelta}%
                  </span>
                  <span className="font-sans text-ink-3">
                    {lang === "th" ? "เทียบกับค่ามัธยฐาน" : "vs median"}
                  </span>
                </div>
              ) : (
                <span className="text-ink-3 text-[11.5px] leading-none">—</span>
              )}
            </div>
            <div className="mt-3.5 pt-3 border-t border-line/60 flex-1">
              <p className="text-[11.5px] leading-thai text-ink-3">
                {lang === "th"
                  ? isAvgHigher && avgDelta >= 15
                    ? "มูลค่าราคากลางเฉลี่ยทางคณิตศาสตร์ที่สูงกว่ามัธยฐานอย่างมีนัยสำคัญ ช่วยชี้ว่ามีโครงการขนาดใหญ่พิเศษดึงค่าเฉลี่ยของทั้งกลุ่มตลาดขึ้น"
                    : "มูลค่าราคากลางเฉลี่ยทางคณิตศาสตร์ของทุกโครงการ ช่วยสะท้อนภาพรวมงบประมาณและยืนยันว่าการกระจายตัวของราคามีความสม่ำเสมอ"
                  : "Arithmetic mean across all projects, showing overall budget magnitude and whether mega-projects skew the market average."}
              </p>
            </div>
          </Panel>
        </div>

        {/* Row 2: 2 Market Distribution & Price Deviation Cards */}
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          {/* Card 4: Price Deviation */}
          <Panel className="p-3.5 flex flex-col">
            <div className="min-h-[20px]">
              <Label>
                {lang === "th" ? "อัตราราคาเบี่ยงเบน (Price Deviation)" : "Market Price Deviation"}
              </Label>
            </div>
            {metrics.torCount >= 5 ? (
              <>
                <div className="mt-1.5 h-8 flex items-baseline">
                  <span
                    className={`font-mono tnum text-[24px] font-semibold leading-none ${
                      metrics.outlierRatePct > 20 ? "text-risk" : "text-ink"
                    }`}
                  >
                    {metrics.outlierRatePct}%
                  </span>
                </div>
                <div className="mt-2 h-5 flex items-center">
                  <span className="text-[11.5px] leading-none text-ink-2 font-medium">
                    {lang === "th"
                      ? `ราคาสูงเกินกรอบ ${metrics.highOutlierCount} · ต่ำผิดปกติ ${metrics.lowOutlierCount}`
                      : `High outliers ${metrics.highOutlierCount} · Low outliers ${metrics.lowOutlierCount}`}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="mt-1.5 h-8 flex items-baseline">
                  <span className="font-mono tnum text-[24px] font-semibold leading-none text-ink-3">
                    —
                  </span>
                </div>
                <div className="mt-2 h-5 flex items-center">
                  <span className="inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-ink-3">
                    <span>ℹ</span>
                    <span>
                      {lang === "th"
                        ? "ข้อมูลไม่เพียงพอ (<5 โครงการ)"
                        : "Insufficient data (<5 projects)"}
                    </span>
                  </span>
                </div>
              </>
            )}
            <div className="mt-3.5 pt-3 border-t border-line/60 flex-1">
              <p className="text-[11.5px] leading-thai text-ink-3">
                {lang === "th"
                  ? metrics.torCount >= 5
                    ? "สัดส่วนโครงการที่ราคากลางเบี่ยงเบนเกิน ±15% จากมัธยฐาน ช่วยตรวจจับโครงการที่ตั้งราคาสูงหรือต่ำผิดปกติ เพื่อเฝ้าระวังความเสี่ยงด้านงบประมาณ"
                    : "ต้องมีขนาดกลุ่มตัวอย่างอย่างน้อย 5 โครงการเพื่อคำนวณสัดส่วนความเบี่ยงเบนทางสถิติที่น่าเชื่อถือ"
                  : metrics.torCount >= 5
                    ? "Share of projects with reference prices deviating beyond ±15% of median, helping detect abnormal price points to monitor budgetary risk."
                    : "Requires at least 5 projects in the active sample to calculate reliable statistical price deviation."}
              </p>
            </div>
          </Panel>

          {/* Card 5: Price Span */}
          <Panel className="p-3.5 flex flex-col">
            <div className="min-h-[20px]">
              <Label>
                {lang === "th" ? "ช่วงราคากลางที่พบ (Price Span)" : "Reference price range"}
              </Label>
            </div>
            <div className="mt-1.5 h-8 flex items-baseline">
              <span className="font-mono tnum text-[24px] font-semibold leading-none text-ink">
                {metrics.torCount > 0
                  ? metrics.minPrice === metrics.maxPrice
                    ? formatTHBCompact(metrics.minPrice)
                    : `${formatTHBCompact(metrics.minPrice)} – ${formatTHBCompact(metrics.maxPrice)}`
                  : "—"}
              </span>
            </div>
            <div className="mt-2 h-5 flex items-center">
              <span className="text-[11.5px] leading-none text-ink-2 font-medium">
                {lang === "th"
                  ? metrics.minPrice === metrics.maxPrice && metrics.torCount > 0
                    ? "ราคากลางโครงการในกลุ่มตัวกรองนี้"
                    : "ราคากลางต่ำสุด – สูงสุดในกลุ่มตัวกรองนี้"
                  : metrics.minPrice === metrics.maxPrice && metrics.torCount > 0
                    ? "Reference price in this group"
                    : "Minimum and maximum reference prices"}
              </span>
            </div>
            <div className="mt-3.5 pt-3 border-t border-line/60 flex-1">
              <p className="text-[11.5px] leading-thai text-ink-3">
                {lang === "th"
                  ? "ขอบเขตขนาดราคากลางต่ำสุดถึงสูงสุดของโครงการในกลุ่มนี้ ช่วยให้เห็นสเกลขนาดงบประมาณจัดซื้อจัดจ้างจริงที่พบในตลาด"
                  : "Minimum to maximum reference price boundaries in this group, showing the actual scale of procurement budgets found in the market."}
              </p>
            </div>
          </Panel>
        </div>
      </div>
    </section>
  );
}
