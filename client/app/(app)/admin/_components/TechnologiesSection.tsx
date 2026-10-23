"use client";

import type { AdminTechnology } from "../../../_lib/api";
import { btn, input, Panel } from "../../../_components/ui";

export function TechnologiesSection({
  technologies,
  isLoading,
  pendingCount,
  totalCount,
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
  lang,
}: {
  technologies: AdminTechnology[];
  isLoading: boolean;
  pendingCount: number;
  totalCount: number;
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
  lang: "th" | "en";
}) {
  const CATEGORIES = [
    { id: "all", label: { th: "ทุกหมวดหมู่", en: "All Categories" } },
    { id: "Framework", label: { th: "Framework & Library", en: "Framework & Library" } },
    { id: "Database", label: { th: "Database (ฐานข้อมูล)", en: "Database" } },
    { id: "Language", label: { th: "Programming Language", en: "Programming Language" } },
    { id: "Operating System", label: { th: "Operating System (ระบบปฏิบัติการ)", en: "Operating System" } },
    { id: "Virtualization / Container", label: { th: "Virtualization & Container", en: "Virtualization & Container" } },
    { id: "Cloud / Infrastructure", label: { th: "Cloud & Infrastructure", en: "Cloud & Infrastructure" } },
    { id: "Standard / ISO", label: { th: "Standard & Certifications (ISO/CMMI)", en: "Standard & ISO" } },
    { id: "Security / Network", label: { th: "Security & Network", en: "Security & Network" } },
    { id: "Other", label: { th: "อื่น ๆ", en: "Other" } },
  ];

  const pendingItems = technologies.filter((t) => t.status === "new");

  const filteredTech = technologies.filter((t) => {
    if (categoryFilter !== "all") {
      const catLower = (t.category || "").toLowerCase();
      const targetLower = categoryFilter.toLowerCase();
      if (!catLower.includes(targetLower)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header & Primary Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[18px] font-bold text-ink">
              {lang === "th"
                ? "คลังเทคโนโลยีและมาตรฐาน (Tech & Standards Vocabulary)"
                : "Technology & Standards Vocabulary"}
            </h2>
            {pendingCount > 0 && (
              <span className="rounded-[2px] border border-amend-line bg-amend-bg px-2 py-0.5 text-[11px] font-semibold text-amend">
                {lang === "th" ? `รออนุมัติ ${pendingCount} รายการ` : `${pendingCount} pending`}
              </span>
            )}
          </div>
          <p className="mt-1 text-[13px] text-ink-2">
            {lang === "th"
              ? "จัดการคำศัพท์ที่ใช้ในการสกัดข้อมูล TOR ตรวจจับ Lock-spec และจับคู่ความสามารถของผู้ใช้ (Matching)"
              : "Shared vocabulary for TOR extraction, lock-spec analysis, and contractor profile matching."}
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenAdd}
          className={`${btn.primary} h-9 px-3.5 text-[12px] flex items-center gap-1.5 shrink-0`}
        >
          <span className="text-[14px] font-bold leading-none">+</span>
          <span>{lang === "th" ? "เพิ่มเทคโนโลยี / มาตรฐาน" : "Add Tech / Standard"}</span>
        </button>
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
        <Panel className="border-amend-line bg-amend-bg/10 overflow-hidden">
          <div className="border-b border-amend-line/40 bg-amend-bg/30 px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[14px]">⏳</span>
              <h3 className="text-[13px] font-bold text-ink">
                {lang === "th" ? "คำขอใหม่รอการอนุมัติจากผู้ใช้" : "Pending Requests from Users"}
              </h3>
              <span className="rounded-full bg-amend text-surface text-[10px] font-bold px-2 py-0.2">
                {pendingItems.length}
              </span>
            </div>
            <span className="text-[11px] text-ink-3">
              {lang === "th" ? "ตรวจทานและอนุมัติเข้าสู่ระบบ" : "Review and approve into vocabulary"}
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
                      {lang === "th" ? "รออนุมัติ" : "Pending"}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 text-[11px] text-ink-3">
                    <span>
                      {lang === "th" ? "ที่มา: " : "Origin: "}
                      <strong className="font-normal text-ink-2">
                        {tech.firstSeenIn?.startsWith("user-request")
                          ? lang === "th"
                            ? "ผู้ใช้ขอเพิ่มจากหน้าโปรไฟล์"
                            : "User request from profile"
                          : tech.firstSeenIn || "User request"}
                      </strong>
                    </span>
                    {tech.createdAt && (
                      <span>
                        {new Date(tech.createdAt).toLocaleDateString(
                          lang === "th" ? "th-TH" : "en-US",
                          { dateStyle: "medium" },
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
                    ✓ {lang === "th" ? "อนุมัติ" : "Approve"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenEdit(tech)}
                    className="cursor-pointer rounded-[3px] border border-line bg-surface px-2.5 py-1 text-[11px] font-medium text-ink hover:border-ink transition-colors"
                  >
                    ✏️ {lang === "th" ? "แก้ไขก่อนอนุมัติ" : "Edit & Approve"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onReject(tech.id, tech.name)}
                    className="cursor-pointer rounded-[3px] border border-risk-line bg-risk-bg px-2.5 py-1 text-[11px] font-medium text-risk hover:bg-risk hover:text-white transition-colors"
                  >
                    ✕ {lang === "th" ? "ปฏิเสธ" : "Reject"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Section 2: All Technologies Directory */}
      <Panel className="overflow-hidden">
        {/* Filter Toolbar */}
        <div className="border-b border-line bg-surface-2 p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative min-w-[200px] sm:min-w-[240px]">
              <input
                type="text"
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={lang === "th" ? "ค้นหาชื่อ หรือคำพ้อง..." : "Search name or alias..."}
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
              className={`${input} h-8 text-[12px] cursor-pointer w-auto`}
            >
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label[lang]}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter Pills */}
          <div className="flex items-center gap-1.5 self-start md:self-auto">
            {[
              { id: "all", label: { th: "ทั้งหมด", en: "All" } },
              { id: "confirmed", label: { th: "ยืนยันแล้ว", en: "Confirmed" } },
              { id: "new", label: { th: "รออนุมัติ", en: "Pending" } },
              { id: "rejected", label: { th: "ปฏิเสธ", en: "Rejected" } },
            ].map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => onStatusFilterChange(st.id)}
                className={`cursor-pointer rounded-[3px] border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  statusFilter === st.id
                    ? "border-ink bg-ink text-surface"
                    : "border-line bg-surface text-ink-2 hover:border-ink hover:text-ink"
                }`}
              >
                {st.label[lang]}
              </button>
            ))}
          </div>
        </div>

        {/* Vocabulary Table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[650px] border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-[10px] uppercase font-semibold text-ink-3 tracking-wider">
                <th className="px-3.5 py-2.5">{lang === "th" ? "ชื่อที่แสดง (Name)" : "Name"}</th>
                <th className="px-3 py-2.5">{lang === "th" ? "หมวดหมู่" : "Category"}</th>
                <th className="px-3 py-2.5">
                  {lang === "th" ? "คำพ้อง / คำที่เขียนคล้ายกัน (Aliases)" : "Aliases"}
                </th>
                <th className="px-3 py-2.5">{lang === "th" ? "สถานะ" : "Status"}</th>
                <th className="px-3 py-2.5 text-right">{lang === "th" ? "การจัดการ" : "Actions"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-ink-3">
                    <span className="animate-spin inline-block text-[14px] mr-2">↻</span>
                    {lang === "th" ? "กำลังโหลดข้อมูลคำศัพท์..." : "Loading vocabulary..."}
                  </td>
                </tr>
              ) : filteredTech.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-ink-3">
                    {lang === "th"
                      ? "ไม่พบเทคโนโลยีหรือมาตรฐานที่ตรงกับเงื่อนไข"
                      : "No matching technologies found."}
                  </td>
                </tr>
              ) : (
                filteredTech.map((tech) => (
                  <tr key={tech.id} className="hover:bg-surface-2 transition-colors">
                    <td className="px-3.5 py-2.5">
                      <div className="font-semibold text-ink">{tech.name}</div>
                      <div className="font-mono text-[10px] text-ink-3">{tech.key}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      {tech.category ? (
                        <span className="inline-block rounded-[2px] border border-line bg-surface px-1.5 py-0.5 text-[11px] text-ink-2">
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
                    <td className="px-3 py-2.5">
                      {tech.status === "confirmed" ? (
                        <span className="inline-flex items-center gap-1 rounded-[2px] border border-open-line bg-open-bg px-1.5 py-0.5 text-[10px] font-medium text-open">
                          ✓ {lang === "th" ? "ยืนยันแล้ว" : "Confirmed"}
                        </span>
                      ) : tech.status === "rejected" ? (
                        <span className="inline-flex items-center gap-1 rounded-[2px] border border-risk-line bg-risk-bg px-1.5 py-0.5 text-[10px] font-medium text-risk">
                          ✕ {lang === "th" ? "ปฏิเสธ" : "Rejected"}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-[2px] border border-amend-line bg-amend-bg px-1.5 py-0.5 text-[10px] font-medium text-amend">
                          ⏳ {lang === "th" ? "รออนุมัติ" : "Pending"}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => onOpenEdit(tech)}
                          className="cursor-pointer rounded-[2px] border border-line bg-surface px-2 py-1 text-[11px] font-medium text-ink hover:border-ink transition-colors"
                          title={lang === "th" ? "แก้ไขข้อมูล" : "Edit details"}
                        >
                          {lang === "th" ? "แก้ไข" : "Edit"}
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(tech.id, tech.name)}
                          className="cursor-pointer rounded-[2px] border border-line bg-surface px-2 py-1 text-[11px] font-medium text-risk hover:border-risk hover:bg-risk-bg transition-colors"
                          title={lang === "th" ? "ลบรายการนี้" : "Delete entry"}
                        >
                          {lang === "th" ? "ลบ" : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer info */}
        <div className="border-t border-line bg-surface-2 px-3.5 py-2 text-[11px] text-ink-3 flex justify-between items-center">
          <span>
            {lang === "th"
              ? `แสดงผล ${filteredTech.length} รายการ (จากทั้งหมด ${totalCount})`
              : `Showing ${filteredTech.length} of ${totalCount}`}
          </span>
          <span className="font-mono text-[10px]">ADR 0014 Vocabulary</span>
        </div>
      </Panel>
    </div>
  );
}

