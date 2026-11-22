"use client";

import type { RiskLevel } from "../../../_data/tors";
import {
  LOCK_SPEC_TRIGGERS_META,
  type LockSpecTriggerId,
} from "../../../_data/watchdog";
import { Panel, SectionHeading } from "../../../_components/ui";
import { RiskMeter, TONE } from "../../../_components/verdict";

export type LockSpecOverviewProps = {
  extractedCount: number;
  lowCount: number;
  medCount: number;
  highCount: number;
  triggerCounts: Record<LockSpecTriggerId, number>;
};

export function LockSpecOverview({
  extractedCount,
  lowCount,
  medCount,
  highCount,
  triggerCounts,
}: LockSpecOverviewProps) {
  const highPct = extractedCount > 0 ? Math.round((highCount / extractedCount) * 100) : 0;
  const medPct = extractedCount > 0 ? Math.round((medCount / extractedCount) * 100) : 0;
  const lowPct = extractedCount > 0 ? Math.round((lowCount / extractedCount) * 100) : 0;

  return (
    <section className="mb-8">
      <SectionHeading
        sub="สรุปสัดส่วนความเสี่ยงล็อกสเปกและประเภทข้อกำหนดที่พบตามเกณฑ์หนังสือเวียนกรมบัญชีกลาง ด่วนที่สุด ที่ กค (กวจ) 0405.2/ว 214"
      >
        ภาพรวมความเสี่ยงล็อกสเปกและเงื่อนไขจำกัดการแข่งขัน
      </SectionHeading>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left Card (5 cols): Risk Tier Breakdown (Read-Only) */}
        <Panel className="flex flex-col justify-between p-4 lg:col-span-5">
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-[14px] font-semibold text-ink">
                สัดส่วนระดับความเสี่ยงในกลุ่มนี้
              </h3>
              <span className="font-mono text-[11px] text-ink-3">
                {extractedCount}{" "}
                โครงการที่วิเคราะห์
              </span>
            </div>

            {/* Stacked Proportional Bar */}
            {extractedCount > 0 ? (
              <div className="mt-3 flex h-3.5 w-full overflow-hidden rounded-[2px] border border-line bg-surface-2">
                {highCount > 0 ? (
                  <div
                    style={{ width: `${(highCount / extractedCount) * 100}%` }}
                    className="bg-risk transition-all"
                    title={`High Risk: ${highCount} (${highPct}%)`}
                  />
                ) : null}
                {medCount > 0 ? (
                  <div
                    style={{ width: `${(medCount / extractedCount) * 100}%` }}
                    className="bg-amend transition-all"
                    title={`Medium Risk: ${medCount} (${medPct}%)`}
                  />
                ) : null}
                {lowCount > 0 ? (
                  <div
                    style={{ width: `${(lowCount / extractedCount) * 100}%` }}
                    className="bg-open transition-all"
                    title={`Low Risk: ${lowCount} (${lowPct}%)`}
                  />
                ) : null}
              </div>
            ) : null}

            {/* Tier Rows (Read-Only Gauge) */}
            <div className="mt-4 flex flex-col divide-y divide-line border-t border-line">
              {(
                [
                  {
                    level: "high" as RiskLevel,
                    label: "ความเสี่ยงสูง (คะแนน ≥ 70)",
                    desc: "พบข้อกำหนดจำกัดการแข่งขันตั้งแต่ 2 หมวดขึ้นไป",
                    count: highCount,
                    pct: highPct,
                  },
                  {
                    level: "medium" as RiskLevel,
                    label: "ความเสี่ยงปานกลาง (คะแนน 35–69)",
                    desc: "พบข้อกำหนดที่แคบกว่าเกณฑ์มาตรฐาน 1 หมวด",
                    count: medCount,
                    pct: medPct,
                  },
                  {
                    level: "low" as RiskLevel,
                    label: "ความเสี่ยงต่ำ / เปิดกว้าง (คะแนน < 35)",
                    desc: "ไม่พบเงื่อนไขล็อกสเปกตามเกณฑ์ ว 214",
                    count: lowCount,
                    pct: lowPct,
                  },
                ] as const
              ).map((row) => (
                <div
                  key={row.level}
                  className="flex w-full items-center justify-between gap-3 px-2 py-2.5 text-left"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <RiskMeter level={row.level} />
                      <span className="text-[13px] font-medium text-ink">
                        {row.label}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11.5px] leading-thai text-ink-3">
                      {row.desc}
                    </p>
                  </div>
                  <div className="shrink-0 text-right font-mono tnum">
                    <span className="text-[14px] font-semibold text-ink">
                      {row.count}
                    </span>
                    <span className="ml-1.5 text-[11.5px] text-ink-3">({row.pct}%)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="mt-3 border-t border-line pt-2.5 text-[11px] leading-thai text-ink-3">
            เกณฑ์จำแนกอิงตามหนังสือเวียน ว 214 เพื่อเปิดเผยระดับการแข่งขันที่เป็นธรรม
          </p>
        </Panel>

        {/* Right Card (7 cols): The 3 Circular ว 214 Trigger Categories (Read-Only) */}
        <Panel className="flex flex-col justify-between p-4 lg:col-span-7">
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-[14px] font-semibold text-ink">
                จำแนกตามเกณฑ์หนังสือเวียน ว 214 (3 หมวดหลัก)
              </h3>
            </div>

            <div className="mt-3 flex flex-col gap-2.5">
              {LOCK_SPEC_TRIGGERS_META.map((trig) => {
                const count = triggerCounts[trig.id] ?? 0;
                const pct = extractedCount > 0 ? Math.round((count / extractedCount) * 100) : 0;
                const barWidth = extractedCount > 0 ? (count / extractedCount) * 100 : 0;

                return (
                  <div
                    key={trig.id}
                    className="flex flex-col gap-1.5 rounded-[3px] border border-line bg-surface-2 p-3 text-left"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-2">
                        <span
                          className={`mt-0.5 shrink-0 rounded-[2px] border px-1.5 py-0.5 font-mono text-[10.5px] font-medium ${TONE.risk.bg} ${TONE.risk.border} ${TONE.risk.text}`}
                        >
                          {trig.code}
                        </span>
                        <span className="text-[13px] font-semibold leading-snug text-ink sm:text-[13.5px]">
                          {trig.id === "Vendor Lock-in" ? (
                            <>
                              เรียกหนังสือแต่งตั้งตัวแทนจำหน่าย (MAF)
                              <br />
                              <span>ในงานจ้างพัฒนาระบบ</span>
                            </>
                          ) : (
                            trig.title
                          )}
                        </span>
                      </div>
                      <span className="shrink-0 whitespace-nowrap pt-0.5 font-mono tnum text-[13px] font-semibold text-ink">
                        {count}{" "}
                        <span className="font-sans text-[11.5px] font-normal text-ink-3">
                          โครงการ
                        </span>
                        <span className="ml-1 text-[11.5px] font-normal text-ink-3">
                          ({pct}%)
                        </span>
                      </span>
                    </div>

                    <p className="text-[12px] leading-thai text-ink-2">
                      {trig.description}
                    </p>

                    {/* Frequency bar: exact same width across all 3 cards */}
                    <div className="mt-1 flex items-center justify-between gap-3">
                      <div className="h-1.5 w-[160px] shrink-0 overflow-hidden rounded-full bg-line sm:w-[220px]">
                        <div
                          className="h-full bg-risk transition-all"
                          style={{ width: `${Math.min(100, Math.max(count > 0 ? 3 : 0, barWidth))}%` }}
                        />
                      </div>
                      <span className="truncate text-right font-mono text-[10.5px] text-ink-3 sm:whitespace-normal">
                        {trig.legalRef}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Panel>
      </div>
    </section>
  );
}
