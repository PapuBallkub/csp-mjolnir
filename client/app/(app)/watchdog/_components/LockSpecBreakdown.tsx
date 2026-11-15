"use client";

import { pick, type Lang, type RiskLevel } from "../../../_data/tors";
import {
  LOCK_SPEC_TRIGGERS_META,
  type LockSpecTriggerId,
} from "../../../_data/watchdog";
import { Panel, SectionHeading } from "../../../_components/ui";
import { RiskMeter, TONE } from "../../../_components/verdict";

export type LockSpecBreakdownProps = {
  lang: Lang;
  extractedCount: number;
  lowCount: number;
  medCount: number;
  highCount: number;
  triggerCounts: Record<LockSpecTriggerId, number>;
  selectedRiskTier: RiskLevel | null;
  onSelectRiskTier: (level: RiskLevel | null) => void;
  selectedTrigger: LockSpecTriggerId | null;
  onSelectTrigger: (trig: LockSpecTriggerId | null) => void;
};

export function LockSpecBreakdown({
  lang,
  extractedCount,
  lowCount,
  medCount,
  highCount,
  triggerCounts,
  selectedRiskTier,
  onSelectRiskTier,
  selectedTrigger,
  onSelectTrigger,
}: LockSpecBreakdownProps) {
  return (
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
                {extractedCount}{" "}
                {lang === "th" ? "โครงการที่วิเคราะห์" : "analyzed TORs"}
              </span>
            </div>

            {/* Stacked Proportional Bar */}
            {extractedCount > 0 ? (
              <div className="mt-3 flex h-3.5 w-full overflow-hidden rounded-[2px] border border-line bg-surface-2">
                {highCount > 0 ? (
                  <div
                    style={{ width: `${(highCount / extractedCount) * 100}%` }}
                    className="bg-risk transition-all"
                    title={`High Risk: ${highCount}`}
                  />
                ) : null}
                {medCount > 0 ? (
                  <div
                    style={{ width: `${(medCount / extractedCount) * 100}%` }}
                    className="bg-amend transition-all"
                    title={`Medium Risk: ${medCount}`}
                  />
                ) : null}
                {lowCount > 0 ? (
                  <div
                    style={{ width: `${(lowCount / extractedCount) * 100}%` }}
                    className="bg-open transition-all"
                    title={`Low Risk: ${lowCount}`}
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
                    count: highCount,
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
                    count: medCount,
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
                    count: lowCount,
                  },
                ] as const
              ).map((row) => {
                const pct =
                  extractedCount > 0
                    ? Math.round((row.count / extractedCount) * 100)
                    : 0;
                const active = selectedRiskTier === row.level;
                return (
                  <button
                    key={row.level}
                    type="button"
                    onClick={() => onSelectRiskTier(active ? null : row.level)}
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
                const count = triggerCounts[trig.id] ?? 0;
                const maxTrig = Math.max(1, ...Object.values(triggerCounts));
                const barPct = Math.round((count / maxTrig) * 100);
                const active = selectedTrigger === trig.id;

                return (
                  <button
                    key={trig.id}
                    type="button"
                    onClick={() => onSelectTrigger(active ? null : trig.id)}
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
  );
}
