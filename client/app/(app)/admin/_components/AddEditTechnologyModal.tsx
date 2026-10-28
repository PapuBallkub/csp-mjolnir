"use client";

import React from "react";
import type { AdminTechnology } from "../../../_lib/api";
import { btn, input } from "../../../_components/ui";

export function AddEditTechnologyModal({
  isOpen,
  editingTech,
  form,
  onChangeForm,
  onSubmit,
  isLoading,
  error,
  lang,
  onClose,
}: {
  isOpen: boolean;
  editingTech: AdminTechnology | null;
  form: {
    name: string;
    category: string;
    aliases: string;
    status: "confirmed" | "new" | "rejected";
  };
  onChangeForm: React.Dispatch<
    React.SetStateAction<{
      name: string;
      category: string;
      aliases: string;
      status: "confirmed" | "new" | "rejected";
    }>
  >;
  onSubmit: (e: React.FormEvent) => void;
  isLoading: boolean;
  error: string | null;
  lang: "th" | "en";
  onClose: () => void;
}) {
  if (!isOpen) return null;

  const CATEGORY_OPTIONS = [
    "Framework",
    "Database",
    "Language",
    "Operating System",
    "Virtualization / Container",
    "Cloud / Infrastructure",
    "Standard / ISO",
    "Security / Network",
    "Tool / Library",
    "GIS / Spatial",
    "Other",
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div className="w-full max-w-md rounded-[4px] border border-line bg-surface p-6 shadow-2xl animate-in zoom-in-95 duration-150">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-[16px] font-bold text-ink">
              {editingTech
                ? lang === "th"
                  ? "แก้ไขเทคโนโลยี / มาตรฐาน"
                  : "Edit Technology / Standard"
                : lang === "th"
                ? "เพิ่มเทคโนโลยี / มาตรฐานใหม่"
                : "Add New Technology / Standard"}
            </h3>
            <p className="mt-1 text-[12px] text-ink-3">
              {lang === "th"
                ? "ข้อมูลคำศัพท์นี้จะถูกนำไปใช้จับคู่ (Match) และวิเคราะห์ Lock-spec โดยอัตโนมัติ"
                : "Used by the system to match capabilities and detect lock-spec requirements."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-3 hover:text-ink text-[16px] cursor-pointer"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <form onSubmit={onSubmit} className="mt-4 space-y-3.5">
          <div>
            <label className="block text-[11px] font-medium text-ink-2 mb-1">
              {lang === "th" ? "ชื่อเทคโนโลยี / ทักษะ / มาตรฐาน" : "Name"}{" "}
              <span className="text-risk">*</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              value={form.name}
              onChange={(e) => onChangeForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder={
                lang === "th"
                  ? "เช่น PostgreSQL, Flutter, ISO 29110"
                  : "e.g. PostgreSQL, Flutter, ISO 29110"
              }
              className={`${input} text-[13px]`}
              maxLength={100}
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-ink-2 mb-1">
              {lang === "th" ? "หมวดหมู่ (Category)" : "Category"}
            </label>
            <select
              value={form.category}
              onChange={(e) => onChangeForm((prev) => ({ ...prev, category: e.target.value }))}
              className={`${input} text-[13px] cursor-pointer`}
            >
              {CATEGORY_OPTIONS.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-ink-2 mb-1">
              {lang === "th"
                ? "คำพ้อง / รูปแบบการเขียนอื่น ๆ (Aliases)"
                : "Aliases (comma-separated)"}
            </label>
            <input
              type="text"
              value={form.aliases}
              onChange={(e) => onChangeForm((prev) => ({ ...prev, aliases: e.target.value }))}
              placeholder={
                lang === "th"
                  ? "คั่นด้วยเครื่องหมายจุลภาค เช่น Postgres, PgSQL"
                  : "e.g. Postgres, PgSQL, Postgres 14"
              }
              className={`${input} text-[13px] font-mono`}
            />
            <p className="mt-1 text-[10px] text-ink-3 leading-relaxed">
              {lang === "th"
                ? "คำเหล่านี้จะถูกตีความเป็นสิ่งเดียวกันกับชื่อหลักอัตโนมัติ"
                : "These aliases will be canonicalized to the main name automatically."}
            </p>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-ink-2 mb-1">
              {lang === "th" ? "สถานะ (Status)" : "Status"}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "confirmed", label: { th: "✓ ยืนยันแล้ว", en: "Confirmed" } },
                { id: "new", label: { th: "⏳ รอตรวจทาน", en: "Pending" } },
                { id: "rejected", label: { th: "✕ ปฏิเสธ", en: "Rejected" } },
              ].map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() =>
                    onChangeForm((prev) => ({
                      ...prev,
                      status: st.id as "confirmed" | "new" | "rejected",
                    }))
                  }
                  className={`cursor-pointer rounded-[3px] border py-1.5 px-2 text-[11px] font-medium transition-colors ${
                    form.status === st.id
                      ? "border-ink bg-ink text-surface"
                      : "border-line bg-surface text-ink-2 hover:border-ink"
                  }`}
                >
                  {st.label[lang]}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded-[3px] border border-risk-line bg-risk-bg p-2.5 text-[12px] text-risk">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-line pt-3 mt-4">
            <button
              type="button"
              disabled={isLoading}
              onClick={onClose}
              className={`${btn.secondary} h-9 px-3.5`}
            >
              {lang === "th" ? "ยกเลิก" : "Cancel"}
            </button>
            <button
              type="submit"
              disabled={!form.name.trim() || isLoading}
              className={`${btn.primary} h-9 px-4`}
            >
              {isLoading ? (
                <>
                  <span className="animate-spin inline-block">↻</span>{" "}
                  {lang === "th" ? "กำลังบันทึก..." : "Saving..."}
                </>
              ) : editingTech ? (
                lang === "th" ? "บันทึกการแก้ไข" : "Save Changes"
              ) : (
                lang === "th" ? "+ เพิ่มรายการ" : "+ Add Entry"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


