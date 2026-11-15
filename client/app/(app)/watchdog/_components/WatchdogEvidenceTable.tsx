"use client";

import Link from "next/link";
import { AlertTriangle, ExternalLink, FileSearch } from "lucide-react";
import {
  formatDate,
  formatTHB,
  formatTHBCompact,
  pick,
  type Lang,
} from "../../../_data/tors";
import {
  calcPriceDeltaPct,
  getArchetypeLabel,
  getComplexityLabel,
  type WatchdogProjectRecord,
} from "../../../_data/watchdog";
import { btn, Chip, EmptyState, Label, Panel, SectionHeading } from "../../../_components/ui";
import {
  LockSpecBadge,
  PriceDeltaBadge,
  StatusBadge,
} from "../../../_components/verdict";
import { type TableTab } from "../_lib/types";

export type WatchdogEvidenceTableProps = {
  lang: Lang;
  tableProjects: WatchdogProjectRecord[];
  tableTab: TableTab;
  onTabChange: (tab: TableTab) => void;
  rowLimit: number;
  onRowLimitChange: (limit: number) => void;
  onResetFilters: () => void;
  dataSource: "loading" | "api" | "empty" | "error";
  totalProjectsCount: number;
};

export function WatchdogEvidenceTable({
  lang,
  tableProjects,
  tableTab,
  onTabChange,
  rowLimit,
  onRowLimitChange,
  onResetFilters,
  dataSource,
  totalProjectsCount,
}: WatchdogEvidenceTableProps) {
  const visibleRows = rowLimit === 0 ? tableProjects : tableProjects.slice(0, rowLimit);

  return (
    <section>
      <SectionHeading
        sub={
          lang === "th"
            ? "หลักฐานและรายละเอียดโครงการที่ตรวจพบ เพื่อตรวจสอบราคากลางเทียบค่ามัธยฐานและข้อกำหนดจริงจากเอกสาร TOR"
            : "Audit trail and evidence table: compare reference prices against historical peer medians and examine extracted TOR clauses."
        }
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Label htmlFor="wd-row-limit">
              {lang === "th" ? "จำนวนแถวที่แสดง:" : "Show rows:"}
            </Label>
            <select
              id="wd-row-limit"
              value={rowLimit}
              onChange={(e) => onRowLimitChange(Number(e.target.value))}
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
          ? "กระดานหลักฐานโครงการ (Evidence & Audit Trail)"
          : "Evidence Board & Audit Trail"}
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
              onClick={() => onTabChange(tab.id)}
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
              ? "ลองสลับแท็บเป็น “ทุกโครงการในกลุ่มนี้” หรือปรับเปลี่ยนตัวกรองหลักด้านบน"
              : "Try switching to the “All projects in slice” tab or adjusting top-level filters."
          }
          action={
            <button type="button" onClick={onResetFilters} className={btn.secondary}>
              {lang === "th" ? "ล้างตัวกรองทั้งหมด" : "Reset filters"}
            </button>
          }
        />
      ) : (
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[840px] border-collapse text-left">
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
                    ? "ราคากลาง vs มัธยฐานตลาด"
                    : "Reference price vs peer median"}
                </th>
                <th className="px-3 py-2.5 text-[11.5px] font-medium text-ink-3">
                  {lang === "th" ? "ส่วนต่างราคากลาง" : "Price check"}
                </th>
                <th className="px-3.5 py-2.5 text-[11.5px] font-medium text-ink-3">
                  {lang === "th"
                    ? "ผลการตรวจล็อกสเปกและหลักฐานข้อกำหนด"
                    : "Lock-spec verdict & evidence"}
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
                    <td className="max-w-[320px] px-3.5 py-3">
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

                    {/* Col 3: Reference Price (ราคากลาง) vs Peer Median */}
                    <td className="px-3 py-3 text-right font-mono tnum whitespace-nowrap">
                      <div className="text-[13.5px] font-semibold text-ink">
                        {formatTHB(proj.referencePriceTHB)}
                      </div>
                      <div className="mt-0.5 text-[11px] text-ink-3">
                        <span className="font-sans text-[10.5px] font-medium text-ink-3">
                          {lang === "th" ? "ราคากลาง · กลางตลาด " : "Ref. price · Median "}
                        </span>
                        {formatTHBCompact(proj.peerMedianTHB)}
                      </div>
                      {proj.agreedPriceTHB ? (
                        <div className="mt-0.5 text-[11px] text-ink-2">
                          {lang === "th" ? "สัญญาชนะที่ " : "Won at "}
                          {formatTHBCompact(proj.agreedPriceTHB)}
                        </div>
                      ) : null}
                    </td>

                    {/* Col 4: Price Delta Badge */}
                    <td className="px-3 py-3 whitespace-nowrap">
                      <PriceDeltaBadge delta={delta} lang={lang} />
                    </td>

                    {/* Col 5: Lock-Spec Risk Badge & Verbatim Trigger Findings */}
                    <td className="max-w-[350px] px-3.5 py-3">
                      <div className="flex flex-col items-start gap-1.5">
                        <LockSpecBadge
                          level={proj.lockSpecLevel}
                          score={proj.lockSpecScore}
                          lang={lang}
                          outOf100
                        />
                        {proj.triggers.length > 0 ? (
                          <div className="mt-1 flex flex-col gap-1 w-full">
                            {proj.triggers.map((t) => (
                              <div
                                key={t.category}
                                className="rounded-[2px] border border-line bg-surface-2 p-1.5 text-[11.5px]"
                              >
                                <span className="font-mono text-[10.5px] font-semibold text-risk">
                                  [{t.category}]
                                </span>{" "}
                                <span className="text-ink-2 leading-tight">
                                  {pick(t.summary, lang)}
                                </span>
                                {t.clauseExcerpt ? (
                                  <p className="mt-1 font-mono text-[10px] text-ink-3 italic line-clamp-2">
                                    “{t.clauseExcerpt}”
                                  </p>
                                ) : null}
                              </div>
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
              ? `เชื่อมต่อฐานข้อมูลจริง (${totalProjectsCount} โครงการ)`
              : `Connected to live API (${totalProjectsCount} TORs)`
            : dataSource === "loading"
              ? lang === "th"
                ? "กำลังโหลดข้อมูลจริง..."
                : "Loading live data..."
              : lang === "th"
                ? "ไม่พบข้อมูลในระบบ"
                : "No data available"}
        </span>
      </div>
    </section>
  );
}
