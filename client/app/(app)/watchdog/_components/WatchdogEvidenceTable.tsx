"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  formatDate,
  formatTHB,
  formatTHBCompact,
} from "../../../_data/tors";
import {
  calcPriceDeltaPct,
  getArchetypeLabel,
  type LockSpecTriggerId,
  type WatchdogProjectRecord,
} from "../../../_data/watchdog";
import { btn, EmptyState, Panel, SectionHeading } from "../../../_components/ui";
import {
  LockSpecBadge,
  PriceDeltaBadge,
  StatusBadge,
} from "../../../_components/verdict";
import { Pagination } from "../../search/_components/Pagination";
import { TABLE_SORT_OPTIONS, type TableSort } from "../_lib/types";

const TRIGGER_NAMES_TH: Record<LockSpecTriggerId, string> = {
  "Specification Tailoring": "กำหนดสเปกเจาะจง",
  "Qualification Barrier": "กีดกันคุณสมบัติ/ผลงาน",
  "Vendor Lock-in": "ผูกขาดผู้ขาย/ลิขสิทธิ์",
};

export type WatchdogEvidenceTableProps = {
  tableProjects: WatchdogProjectRecord[];
  onResetFilters: () => void;
  dataSource: "loading" | "api" | "empty" | "error";
  totalProjectsCount?: number;
};

export function WatchdogEvidenceTable({
  tableProjects,
  onResetFilters,
  dataSource,
  totalProjectsCount,
}: WatchdogEvidenceTableProps) {
  const [sort, setSort] = useState<TableSort>("lockspec-desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Sort projects according to the selected TableSort mode
  const sortedProjects = useMemo(() => {
    const list = [...tableProjects];
    switch (sort) {
      case "lockspec-desc":
        return list.sort((a, b) => {
          const scoreA = a.lockSpecScore ?? -1;
          const scoreB = b.lockSpecScore ?? -1;
          const diff = scoreB - scoreA;
          if (diff !== 0) return diff;
          return Math.abs(calcPriceDeltaPct(b) ?? 0) - Math.abs(calcPriceDeltaPct(a) ?? 0);
        });
      case "lockspec-asc":
        return list.sort((a, b) => {
          const scoreA = a.lockSpecScore ?? Number.POSITIVE_INFINITY;
          const scoreB = b.lockSpecScore ?? Number.POSITIVE_INFINITY;
          const diff = scoreA - scoreB;
          if (diff !== 0) return diff;
          return Math.abs(calcPriceDeltaPct(a) ?? 0) - Math.abs(calcPriceDeltaPct(b) ?? 0);
        });
      case "price-delta-desc":
        return list.sort((a, b) => {
          const diff = Math.abs(calcPriceDeltaPct(b) ?? 0) - Math.abs(calcPriceDeltaPct(a) ?? 0);
          if (diff !== 0) return diff;
          return (b.lockSpecScore ?? -1) - (a.lockSpecScore ?? -1);
        });
      case "price-delta-asc":
        return list.sort((a, b) => {
          const diff = Math.abs(calcPriceDeltaPct(a) ?? 0) - Math.abs(calcPriceDeltaPct(b) ?? 0);
          if (diff !== 0) return diff;
          return (a.lockSpecScore ?? Number.POSITIVE_INFINITY) - (b.lockSpecScore ?? Number.POSITIVE_INFINITY);
        });
      case "price-desc":
        return list.sort((a, b) => b.referencePriceTHB - a.referencePriceTHB);
      case "price-asc":
        return list.sort((a, b) => a.referencePriceTHB - b.referencePriceTHB);
      case "newest":
      default:
        return list.sort((a, b) => b.postedAt.localeCompare(a.postedAt));
    }
  }, [tableProjects, sort]);

  // Reset to first page when underlying project count changes
  const prevCountRef = useRef(tableProjects.length);
  useEffect(() => {
    if (tableProjects.length !== prevCountRef.current) {
      prevCountRef.current = tableProjects.length;
      setPage(1);
    }
  }, [tableProjects.length]);

  const total = sortedProjects.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pages);
  const visibleRows = sortedProjects.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <section>
      <SectionHeading
        sub="หลักฐานและรายละเอียดโครงการที่ตรวจพบ เพื่อตรวจสอบราคากลางเทียบค่ามัธยฐานและข้อกำหนดจริงจากเอกสาร TOR"
      >
        กระดานหลักฐานโครงการ (Evidence & Audit Trail)
      </SectionHeading>

      {/* Table Controls Header: Result Count + Sort Dropdown */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-ink">
            {`พบ ${total.toLocaleString()} โครงการ`}
          </span>
          <span className="text-[11.5px] text-ink-3">
            (แสดงทุกโครงการตามตัวกรอง)
          </span>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="evidence-table-sort" className="text-[12.5px] font-medium text-ink-2 whitespace-nowrap">
            เรียงตาม:
          </label>
          <select
            id="evidence-table-sort"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as TableSort);
              setPage(1);
            }}
            className="h-8.5 rounded-[10px] border border-line-2 bg-surface px-2.5 pr-8 text-[12.5px] font-medium text-ink focus:border-ink focus:outline-none cursor-pointer"
          >
            {TABLE_SORT_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {visibleRows.length === 0 ? (
        <EmptyState
          headline="ไม่พบโครงการที่ตรงกับเงื่อนไขย่อยที่เลือก"
          body="ลองสลับแท็บเป็น “ทุกโครงการในกลุ่มนี้” หรือปรับเปลี่ยนตัวกรองหลักด้านบน"
          action={
            <button type="button" onClick={onResetFilters} className={btn.secondary}>
              ล้างตัวกรองทั้งหมด
            </button>
          }
        />
      ) : (
        <Panel className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-line bg-surface-2">
                <th className="px-3.5 py-2.5 text-[11.5px] font-medium text-ink-3">
                  โครงการ / หน่วยงาน
                </th>
                <th className="px-3 py-2.5 text-right text-[11.5px] font-medium text-ink-3 whitespace-nowrap">
                  ราคากลาง
                </th>
                <th className="px-3 py-2.5 text-[11.5px] font-medium text-ink-3 whitespace-nowrap">
                  ส่วนต่างราคากลาง
                </th>
                <th className="px-3.5 py-2.5 text-[11.5px] font-medium text-ink-3 whitespace-nowrap">
                  ผลตรวจล็อกสเปก (ว 214)
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
                    {/* Col 1: Project Title, ID, Agency, Status & Archetype */}
                    <td className="px-3.5 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={proj.status} />
                        <span className="font-mono tnum text-[11px] text-ink-3">
                          {proj.id}
                        </span>
                        <span className="text-[11px] text-ink-3">
                          · {formatDate(proj.postedAt)}
                        </span>
                        <span className="text-[11px] text-ink-3">
                          · {getArchetypeLabel(proj.archetype)}
                        </span>
                      </div>
                      <Link
                        href={`/tor/${proj.id}`}
                        className="mt-1.5 block text-[13.5px] leading-thai font-medium text-ink hover:underline"
                      >
                        {proj.title}
                      </Link>
                      <p className="mt-0.5 text-[12px] leading-thai text-ink-2">
                        {proj.agency}
                      </p>
                    </td>

                    {/* Col 2: Reference Price (ราคากลาง) */}
                    <td className="px-3 py-3 text-right font-mono tnum whitespace-nowrap">
                      <div className="text-[13.5px] font-semibold text-ink">
                        {formatTHB(proj.referencePriceTHB)}
                      </div>
                      {proj.agreedPriceTHB ? (
                        <div className="mt-0.5 text-[11px] text-ink-2">
                          <span className="font-sans text-[10.5px] text-ink-3">
                            สัญญาชนะที่ 
                          </span>
                          {formatTHBCompact(proj.agreedPriceTHB)}
                        </div>
                      ) : null}
                    </td>

                    {/* Col 3: Price Delta Badge & Peer Median */}
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="flex flex-col items-start gap-1">
                        <PriceDeltaBadge delta={delta} />
                        <div className="font-mono tnum text-[11px] text-ink-3">
                          <span className="font-sans text-[10.5px] text-ink-3">
                            มัธยฐานตลาด 
                          </span>
                          {proj.peerMedianTHB ? formatTHBCompact(proj.peerMedianTHB) : "—"}
                        </div>
                      </div>
                    </td>

                    {/* Col 4: Lock-Spec Risk Badge & Violated Rule Names */}
                    <td className="max-w-[300px] px-3.5 py-3">
                      <div className="flex flex-col items-start gap-1.5">
                        {proj.lockSpecLevel === "unanalyzed" || proj.lockSpecScore === null ? (
                          <>
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-line-2 bg-surface-2 px-2.5 py-0.5 text-[11.5px] font-medium text-ink-3 whitespace-nowrap">
                              <span>—</span>
                              <span>ยังไม่ได้วิเคราะห์</span>
                            </span>
                            <span className="text-[11.5px] text-ink-3">
                              รอผลตรวจวิเคราะห์ตามเกณฑ์ ว 214
                            </span>
                          </>
                        ) : (
                          <>
                            <LockSpecBadge
                              level={proj.lockSpecLevel}
                              score={proj.lockSpecScore}
                              outOf100={false}
                            />
                            {proj.triggers.length > 0 ? (
                              <div className="mt-0.5 flex flex-wrap items-center gap-1">
                                {proj.triggers.map((t) => (
                                  <span
                                    key={t.category}
                                    className="inline-flex items-center rounded-full border border-risk/30 bg-risk/5 px-2.5 py-0.5 font-mono text-[11px] font-medium text-risk"
                                  >
                                    {TRIGGER_NAMES_TH[t.category] ?? t.category}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-[11.5px] text-ink-3">
                                ไม่พบข้อกำหนดที่เข้าข่าย ว 214
                              </span>
                            )}
                          </>
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

      {/* Pagination Controls */}
      {total > 0 && (
        <Pagination
          page={safePage}
          pages={pages}
          total={total}
          pageSize={pageSize}
          pageSizeOptions={[10, 20, 50]}
          onPageChange={setPage}
          onPageSizeChange={(newSize) => {
            setPageSize(newSize);
            setPage(1);
          }}
        />
      )}

      {/* Footer note explaining methodology & non-accusatory principle (AGENTS.md §7) */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4 text-[11.5px] leading-thai text-ink-3">
        <p>
          หมายเหตุ: ค่ามัธยฐานและค่าเฉลี่ยคำนวณจากโครงการประเภทและระดับความซับซ้อนเดียวกันในฐานข้อมูล data.go.th และ e-GP สัญญาณความเสี่ยงเป็นข้อมูลประกอบการพิจารณาเบื้องต้น ไม่ใช่การตัดสินความผิดทางกฎหมาย
        </p>
        <span className="font-mono text-[11px] text-ink-3">
          {dataSource === "api"
            ? `เชื่อมต่อฐานข้อมูลจริง (${totalProjectsCount} โครงการ)`
            : dataSource === "loading"
              ? "กำลังโหลดข้อมูลจริง..."
              : "ไม่พบข้อมูลในระบบ"}
        </span>
      </div>
    </section>
  );
}
