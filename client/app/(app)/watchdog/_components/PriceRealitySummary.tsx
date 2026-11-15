"use client";

import { AlertCircle, Coins, Info, TrendingDown, TrendingUp } from "lucide-react";
import { formatTHBCompact, type Lang } from "../../../_data/tors";
import { Label, Panel, SectionHeading, Well } from "../../../_components/ui";
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

      {/* Clarification Callout: Reference Price vs. Budget */}
      <Well className="mb-4 flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:gap-3">
        <div className="mt-0.5 shrink-0 rounded-full bg-surface-2 p-1 text-ink-2">
          <Info className="h-4 w-4" />
        </div>
        <div className="flex-1 text-[12px] leading-thai text-ink-2">
          <div className="flex flex-wrap items-center gap-1.5 font-semibold text-ink">
            <Coins className="h-3.5 w-3.5 text-ink-2" />
            <span>
              {lang === "th"
                ? "ข้อควรรู้: การเปรียบเทียบในหน้านี้ใช้ “ราคากลาง” ไม่ใช่ “งบประมาณ”"
                : "Important: This analysis evaluates “Reference Price”, not total budget"}
            </span>
          </div>
          <p className="mt-0.5">
            {lang === "th"
              ? "“ราคากลาง” (Reference Price) คือราคาประเมินที่คณะกรรมการกำหนดขึ้นเพื่อใช้เป็นเกณฑ์ตั้งต้นประกวดราคา ซึ่งอาจแตกต่างจาก “งบประมาณรวม” (Approved Budget) การวิเคราะห์นี้วัดว่าราคาประเมินของรัฐสอดคล้องกับราคาตลาดในอดีต (±15% ของค่ามัธยฐาน) หรือไม่"
              : "“Reference Price” (ราคากลาง) is the official baseline calculated by the government committee to evaluate bids, which differs from the total allocated budget. We compare this baseline against historical peer medians."}
          </p>
        </div>
      </Well>

      {/* 4 Summary Metric Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Peer Median */}
        <Panel className="p-3.5">
          <Label>
            {lang === "th" ? "ค่ามัธยฐานราคากลาง (Peer Median)" : "Historical peer median"}
          </Label>
          <p className="mt-1.5 font-mono tnum text-[24px] font-semibold leading-none text-ink">
            {metrics.overallMedian > 0 ? formatTHBCompact(metrics.overallMedian) : "—"}
          </p>
          <p className="mt-1.5 text-[11.5px] leading-thai text-ink-3">
            {metrics.torCount > 0
              ? lang === "th"
                ? `จาก ${metrics.torCount.toLocaleString()} โครงการในกลุ่มตัวกรองนี้`
                : `From ${metrics.torCount.toLocaleString()} peer projects`
              : "—"}
          </p>
          <p className="mt-1 text-[11px] leading-thai text-ink-3">
            {lang === "th"
              ? "หมุดอ้างอิงหลักที่ไม่ถูกบิดเบือนโดยโครงการที่ราคาสูงหรือต่ำผิดปกติ"
              : "Core benchmark immune to extreme price skew"}
          </p>
        </Panel>

        {/* Card 2: Peer Average */}
        <Panel className="p-3.5">
          <Label>
            {lang === "th" ? "ค่าเฉลี่ยราคากลาง (Peer Average)" : "Historical peer average"}
          </Label>
          <p className="mt-1.5 font-mono tnum text-[24px] font-semibold leading-none text-ink">
            {metrics.overallAverage > 0 ? formatTHBCompact(metrics.overallAverage) : "—"}
          </p>
          <div className="mt-1.5 flex items-center gap-1 font-mono text-[11.5px]">
            {metrics.overallMedian > 0 && metrics.overallAverage > 0 ? (
              <>
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
              </>
            ) : (
              <span className="text-ink-3">—</span>
            )}
          </div>
          <p className="mt-1 text-[11px] leading-thai text-ink-3">
            {lang === "th"
              ? isAvgHigher && avgDelta >= 15
                ? "ค่าเฉลี่ยสูงกว่ามัธยฐานอย่างมีนัยสำคัญ บ่งชี้ว่ามีโครงการราคาสูงดึงค่าเฉลี่ยขึ้น"
                : "สะท้อนมูลค่าเฉลี่ยทางคณิตศาสตร์ของโครงการทั้งหมดในกลุ่ม"
              : "Arithmetic mean across all matching projects"}
          </p>
        </Panel>

        {/* Card 3: Outlier Rate */}
        <Panel className="p-3.5">
          <Label>
            {lang === "th" ? "อัตราหลุดกรอบตลาดปกติ (Outlier Rate)" : "Market outlier rate"}
          </Label>
          <p className="mt-1.5 font-mono tnum text-[24px] font-semibold leading-none">
            <span className={metrics.outlierRatePct > 20 ? "text-risk" : "text-ink"}>
              {metrics.outlierRatePct}%
            </span>
            <span className="ml-1.5 font-sans text-[13px] font-normal text-ink-3">
              ({metrics.outlierCount}/{metrics.torCount})
            </span>
          </p>
          <p className="mt-1.5 text-[11.5px] leading-thai text-ink-3">
            {lang === "th"
              ? `ราคาสูงเกินกรอบ ${metrics.highOutlierCount} · ต่ำผิดปกติ ${metrics.lowOutlierCount}`
              : `High outliers ${metrics.highOutlierCount} · Low outliers ${metrics.lowOutlierCount}`}
          </p>
          <p className="mt-1 text-[11px] leading-thai text-ink-3">
            {lang === "th"
              ? "โครงการที่ราคากลางเบี่ยงเบนเกิน ±15% จากค่ามัธยฐาน"
              : "Projects deviating beyond ±15% from the median"}
          </p>
        </Panel>

        {/* Card 4: Price Span */}
        <Panel className="p-3.5">
          <Label>
            {lang === "th" ? "ช่วงราคากลางที่พบ (Price Span)" : "Reference price range"}
          </Label>
          <p className="mt-1.5 font-mono tnum text-[20px] font-semibold leading-none text-ink">
            {metrics.minPrice > 0
              ? `${formatTHBCompact(metrics.minPrice)} – ${formatTHBCompact(metrics.maxPrice)}`
              : "—"}
          </p>
          <p className="mt-2 text-[11.5px] leading-thai text-ink-3">
            {lang === "th"
              ? "ราคากลางต่ำสุด – สูงสุดในกลุ่มตัวกรองนี้"
              : "Minimum and maximum reference prices"}
          </p>
          <p className="mt-1 text-[11px] leading-thai text-ink-3">
            {lang === "th"
              ? "แสดงขอบเขตขนาดงบของโครงการที่นำมาวิเคราะห์ร่วมกัน"
              : "Shows the scope breadth of analyzed tenders"}
          </p>
        </Panel>
      </div>
    </section>
  );
}
