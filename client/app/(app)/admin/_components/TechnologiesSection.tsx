"use client";

import type { AdminTechnologiesCounts, AdminTechnology } from "../../../_lib/api";
import { btn, input, Panel, SectionHeading } from "../../../_components/ui";

function TechnologiesTableSkeleton() {
  return (
    <>
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
        <tr key={i} className="animate-pulse">
          <td className="px-3.5 py-3">
            <div className="h-4 w-32 rounded-[2px] bg-surface-3 mb-1" />
            <div className="h-2.5 w-20 rounded-[2px] bg-surface-2" />
          </td>
          <td className="px-3 py-3">
            <div className="h-5 w-24 rounded-[2px] bg-surface-3" />
          </td>
          <td className="px-3 py-3">
            <div className="h-4 w-36 rounded-[2px] bg-surface-2" />
          </td>
          <td className="px-3 py-3">
            <div className="h-5 w-20 rounded-[2px] bg-surface-3" />
          </td>
          <td className="px-3 py-3 text-right">
            <div className="h-6 w-16 rounded-[2px] bg-surface-3 ml-auto" />
          </td>
        </tr>
      ))}
    </>
  );
}

export function TechnologiesSection({
  technologies,
  userRequestItems,
  isLoading,
  pendingCount,
  counts,
  totalCount,
  page,
  totalPages,
  onPageChange,
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  categoryFilter,
  onCategoryFilterChange,
  actionMsg,
  onApprove,
  onReject,
  onDelete,
  onOpenAdd,
  onOpenEdit,
}: {
  technologies: AdminTechnology[];
  userRequestItems: AdminTechnology[];
  isLoading: boolean;
  pendingCount: number;
  counts: AdminTechnologiesCounts;
  totalCount: number;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  search: string;
  onSearchChange: (val: string) => void;
  statusFilter: string;
  onStatusFilterChange: (val: string) => void;
  categoryFilter: string;
  onCategoryFilterChange: (val: string) => void;
  actionMsg: { text: string; type: "success" | "error" } | null;
  onApprove: (id: string, name: string) => void;
  onReject: (id: string, name: string) => void;
  onDelete: (id: string, name: string) => void;
  onOpenAdd: () => void;
  onOpenEdit: (tech: AdminTechnology) => void;
}) {
  const CATEGORIES = [
    { id: "all", label: "ทุกหมวดหมู่" },
    { id: "Framework", label: "Framework & Library" },
    { id: "Database", label: "Database (ฐานข้อมูล)" },
    { id: "Language", label: "Programming Language" },
    { id: "Operating System", label: "Operating System (ระบบปฏิบัติการ)" },
    { id: "Virtualization / Container", label: "Virtualization & Container" },
    { id: "Cloud / Infrastructure", label: "Cloud & Infrastructure" },
    { id: "Standard / ISO", label: "Standard & Certifications (ISO/CMMI)" },
    { id: "Security / Network", label: "Security & Network" },
    { id: "Other", label: "อื่น ๆ" },
  ];

  const pendingItems = userRequestItems;

  const filteredTech = technologies.filter((t) => {
    if (categoryFilter !== "all") {
      const catLower = (t.category || "").toLowerCase();
      const targetLower = categoryFilter.toLowerCase();
      if (!catLower.includes(targetLower)) return false;
    }
    return true;
  });

  return (
    <div className="w-full space-y-6">
      {/* Header & Primary Actions */}
      <SectionHeading
        right={
          <button
            type="button"
            onClick={onOpenAdd}
            className={`${btn.primary} text-[11px] py-1 px-3 flex items-center gap-1.5 shrink-0 cursor-pointer`}
          >
            <span className="text-[14px] font-bold leading-none">+</span>
            <span>เพิ่มเทคโนโลยี / มาตรฐาน</span>
          </button>
        }
        sub="จัดการคำศัพท์ที่ใช้ในการสกัดข้อมูล TOR ตรวจจับ Lock-spec และจับคู่ความสามารถของผู้ใช้ (Matching)"
      >
        <div className="flex items-center gap-2">
          <span>คลังเทคโนโลยีและมาตรฐาน</span>
          {pendingCount > 0 && (
            <span className="rounded-[2px] border border-amend-line bg-amend-bg px-2 py-0.5 text-[11px] font-semibold text-amend">
              {`รอตรวจยืนยัน ${pendingCount.toLocaleString()} รายการ`}
            </span>
          )}
        </div>
      </SectionHeading>

      {/* KPI Stats Strip (DB-wide counts) */}
      <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4">
        <Panel className="px-3 py-2.5">
          <p className="font-mono tnum text-[24px] leading-none font-medium text-ink">
            {counts.all.toLocaleString()}
          </p>
          <p className="mt-1.5 text-[11px] leading-thai text-ink-3">
            คำศัพท์ทั้งหมดในระบบ
          </p>
        </Panel>
        <Panel className="px-3 py-2.5">
          <p className="font-mono tnum text-[24px] leading-none font-medium text-open">
            {counts.confirmed.toLocaleString()}
          </p>
          <p className="mt-1.5 text-[11px] leading-thai text-ink-3">
            ยืนยันแล้ว (ใช้งานในระบบ)
          </p>
        </Panel>
        <Panel className="px-3 py-2.5">
          <p className={`font-mono tnum text-[24px] leading-none font-medium ${counts.aiNew > 0 ? "text-amend" : "text-ink"}`}>
            {counts.aiNew.toLocaleString()}
          </p>
          <p className="mt-1.5 text-[11px] leading-thai text-ink-3">
            คำศัพท์ใหม่จาก AI (รอตรวจ)
          </p>
        </Panel>
        <Panel className="px-3 py-2.5">
          <p className={`font-mono tnum text-[24px] leading-none font-medium ${counts.userRequests > 0 ? "text-amend" : "text-ink"}`}>
            {counts.userRequests.toLocaleString()}
          </p>
          <p className="mt-1.5 text-[11px] leading-thai text-ink-3">
            คำขอใหม่จากผู้ใช้
          </p>
        </Panel>
      </div>

      {/* Action Notification Banner */}
      {actionMsg && (
        <div
          className={`rounded-[3px] border p-3 text-[12px] animate-in fade-in flex items-center justify-between ${
            actionMsg.type === "success"
              ? "border-open-line bg-open-bg text-open"
              : "border-risk-line bg-risk-bg text-risk"
          }`}
        >
          <span>{actionMsg.text}</span>
        </div>
      )}

      {/* Section 1: Pending User Requests (Review Queue) */}
      {pendingItems.length > 0 && (
        <Panel className="w-full border-amend-line bg-amend-bg/10 overflow-hidden">
          <div className="border-b border-amend-line/40 bg-amend-bg/30 px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[14px]">⏳</span>
              <h3 className="text-[13px] font-bold text-ink">
                คำขอใหม่รอการอนุมัติจากผู้ใช้
              </h3>
              <span className="rounded-full bg-amend text-surface text-[10px] font-bold px-2 py-0.2">
                {pendingItems.length}
              </span>
            </div>
            <span className="text-[11px] text-ink-3">
              ตรวจทานและอนุมัติเข้าสู่ระบบ
            </span>
          </div>

          <div className="divide-y divide-line/60">
            {pendingItems.map((tech) => (
              <div
                key={tech.id}
                className="p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:bg-surface-2 transition-colors"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-bold text-ink">{tech.name}</span>
                    {tech.category && (
                      <span className="rounded-[2px] border border-line bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-ink-2">
                        {tech.category}
                      </span>
                    )}
                    <span className="rounded-[2px] border border-amend-line bg-amend-bg px-1.5 py-0.5 text-[10px] font-medium text-amend">
                      รออนุมัติ
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 text-[11px] text-ink-3">
                    <span>
                      ที่มา: 
                      <strong className="font-normal text-ink-2">
                        {tech.firstSeenIn?.startsWith("user-request")
                          ? "ผู้ใช้ขอเพิ่มจากหน้าโปรไฟล์"
                          : tech.firstSeenIn || "User request"}
                      </strong>
                    </span>
                    {tech.createdAt && (
                      <span>
                        {new Date(tech.createdAt).toLocaleDateString(
                          "th-TH",
                          { timeZone: "Asia/Bangkok", dateStyle: "medium" },
                        )}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                  <button
                    type="button"
                    onClick={() => onApprove(tech.id, tech.name)}
                    className="cursor-pointer rounded-[3px] border border-open-line bg-open-bg px-2.5 py-1 text-[11px] font-medium text-open hover:bg-open hover:text-white transition-colors"
                  >
                    ✓ อนุมัติ
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenEdit(tech)}
                    className="cursor-pointer rounded-[3px] border border-line bg-surface px-2.5 py-1 text-[11px] font-medium text-ink hover:border-ink transition-colors"
                  >
                    ✏️ แก้ไขก่อนอนุมัติ
                  </button>
                  <button
                    type="button"
                    onClick={() => onReject(tech.id, tech.name)}
                    className="cursor-pointer rounded-[3px] border border-risk-line bg-risk-bg px-2.5 py-1 text-[11px] font-medium text-risk hover:bg-risk hover:text-white transition-colors"
                  >
                    ✕ ปฏิเสธ
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Section 2: All Technologies Directory */}
      <section className="w-full">
        {/* Row 1: Status Filter Tabs (single-line full-width bar, matching Review Queue) */}
        <div className="mb-3 flex flex-wrap gap-1.5 border-b border-line pb-3">
          {[
            { id: "all", label: `ทั้งหมด (${counts.all.toLocaleString()})` },
            { id: "confirmed", label: `ยืนยันแล้ว (${counts.confirmed.toLocaleString()})` },
            { id: "ai-new", label: `AI เจอใหม่ (${counts.aiNew.toLocaleString()})` },
            { id: "user-request", label: `คำขอผู้ใช้ (${counts.userRequests.toLocaleString()})` },
            { id: "rejected", label: `ปฏิเสธ (${counts.rejected.toLocaleString()})` },
          ].map((st) => (
            <button
              key={st.id}
              type="button"
              onClick={() => onStatusFilterChange(st.id)}
              className={`cursor-pointer rounded-[3px] px-2.5 py-1 text-[12px] font-medium whitespace-nowrap transition-colors ${
                statusFilter === st.id
                  ? "bg-ink text-surface"
                  : "border border-line bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink"
              }`}
            >
              {st.label}
            </button>
          ))}
        </div>

        {/* Row 2: Search Input, Category Select & Result Summary */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-1 flex-wrap items-center gap-2 min-w-0">
            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <input
                type="text"
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="ค้นหาชื่อ หรือคำพ้อง..."
                className={`${input} h-8 text-[12px] pr-7 w-full`}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => onSearchChange("")}
                  className="absolute right-2 top-2 text-ink-3 hover:text-ink text-[12px] cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Category Select */}
            <select
              value={categoryFilter}
              onChange={(e) => onCategoryFilterChange(e.target.value)}
              className={`${input} h-8 text-[12px] cursor-pointer w-full sm:w-52`}
            >
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <span className="font-mono text-[11.5px] text-ink-3 whitespace-nowrap">
            {totalCount > 0
              ? `หน้า ${page}/${totalPages} · ${totalCount.toLocaleString()} รายการ`
              : "0 รายการ"}
          </span>
        </div>

        {/* Vocabulary Table */}
        <Panel className="w-full shadow-xs overflow-hidden">
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-[10px] uppercase font-semibold text-ink-3 tracking-wider">
                <th className="px-3.5 py-2.5 whitespace-nowrap">ชื่อที่แสดง (Name)</th>
                <th className="px-3 py-2.5 whitespace-nowrap">หมวดหมู่</th>
                <th className="px-3 py-2.5 whitespace-nowrap">คำพ้อง (Aliases)</th>
                <th className="px-3 py-2.5 whitespace-nowrap">สถานะ</th>
                <th className="px-3 py-2.5 text-right whitespace-nowrap">การจัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {isLoading ? (
                <TechnologiesTableSkeleton />
              ) : filteredTech.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-ink-3">
                    ไม่พบเทคโนโลยีหรือมาตรฐานที่ตรงกับเงื่อนไข
                  </td>
                </tr>
              ) : (
                filteredTech.map((tech) => (
                  <tr key={tech.id} className="hover:bg-surface-2 transition-colors">
                    <td className="px-3.5 py-2.5">
                      <div className="font-semibold text-ink">{tech.name}</div>
                      <div className="font-mono text-[10px] text-ink-3">{tech.key}</div>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {tech.category ? (
                        <span className="inline-block whitespace-nowrap rounded-[2px] border border-line bg-surface px-1.5 py-0.5 text-[11px] text-ink-2">
                          {tech.category}
                        </span>
                      ) : (
                        <span className="text-ink-3 text-[11px]">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 max-w-[280px]">
                      {tech.aliases && tech.aliases.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {tech.aliases.map((alias) => (
                            <span
                              key={alias}
                              className="inline-block rounded-[2px] bg-surface-2 border border-line/60 px-1.5 py-0.2 font-mono text-[10px] text-ink-2"
                            >
                              {alias}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-ink-3 text-[11px]">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {tech.status === "confirmed" ? (
                        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-[2px] border border-open-line bg-open-bg px-1.5 py-0.5 text-[10px] font-medium text-open">
                          ✓ ยืนยันแล้ว
                        </span>
                      ) : tech.status === "rejected" ? (
                        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-[2px] border border-risk-line bg-risk-bg px-1.5 py-0.5 text-[10px] font-medium text-risk">
                          ✕ ปฏิเสธ
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-[2px] border border-amend-line bg-amend-bg px-1.5 py-0.5 text-[10px] font-medium text-amend">
                          {tech.firstSeenIn?.startsWith("user-request") ? "⏳ คำขอผู้ใช้" : "⏳ AI เจอใหม่"}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {tech.status === "new" ? (
                          <button
                            type="button"
                            onClick={() => onApprove(tech.id, tech.name)}
                            className="cursor-pointer rounded-[2px] border border-open-line bg-open-bg px-2 py-1 text-[11px] font-medium text-open hover:bg-open hover:text-white transition-colors"
                            title="ยืนยันเข้าคลังทางการ"
                          >
                            ✓ อนุมัติ
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => onOpenEdit(tech)}
                          className="cursor-pointer rounded-[2px] border border-line bg-surface px-2 py-1 text-[11px] font-medium text-ink hover:border-ink transition-colors"
                          title="แก้ไขข้อมูล"
                        >
                          แก้ไข
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(tech.id, tech.name)}
                          className="cursor-pointer rounded-[2px] border border-line bg-surface px-2 py-1 text-[11px] font-medium text-risk hover:border-risk hover:bg-risk-bg transition-colors"
                          title="ลบรายการนี้"
                        >
                          ลบ
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer info & Pagination */}
        <div className="border-t border-line bg-surface-2 px-3.5 py-2.5 text-[11px] text-ink-3 flex flex-wrap justify-between items-center gap-2">
          <span>
            {`แสดงผล ${filteredTech.length} รายการ (หน้า ${page}/${totalPages} · ตรงเงื่อนไข ${totalCount.toLocaleString()} รายการ)`}
          </span>
          {totalPages > 1 ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={page <= 1 || isLoading}
                onClick={() => onPageChange(Math.max(1, page - 1))}
                className={`${btn.secondary} h-7 px-2.5 text-[11px] disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                ← ก่อนหน้า
              </button>
              <button
                type="button"
                disabled={page >= totalPages || isLoading}
                onClick={() => onPageChange(Math.min(totalPages, page + 1))}
                className={`${btn.secondary} h-7 px-2.5 text-[11px] disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                ถัดไป →
              </button>
            </div>
          ) : (
            <span className="font-mono text-[10px]">ADR 0014 Vocabulary</span>
          )}
        </div>
      </Panel>
      </section>
    </div>
  );
}

