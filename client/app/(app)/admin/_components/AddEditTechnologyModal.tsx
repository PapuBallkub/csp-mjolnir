"use client";

import React from "react";
import { Hourglass } from "lucide-react";
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
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-2xl animate-in zoom-in-95 duration-150">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-[16px] font-bold text-ink">
              {editingTech
                ? "แก้ไขเทคโนโลยี / มาตรฐาน"
                : "เพิ่มเทคโนโลยี / มาตรฐานใหม่"}
            </h3>
            <p className="mt-1 text-[12px] text-ink-3">
              ข้อมูลคำศัพท์นี้จะถูกนำไปใช้จับคู่ (Match) และวิเคราะห์ Lock-spec โดยอัตโนมัติ
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
              ชื่อเทคโนโลยี / ทักษะ / มาตรฐาน{" "}
              <span className="text-risk">*</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              value={form.name}
              onChange={(e) => onChangeForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="เช่น PostgreSQL, Flutter, ISO 29110"
              className={`${input} text-[13px]`}
              maxLength={100}
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-ink-2 mb-1">
              หมวดหมู่ (Category)
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
              คำพ้อง / รูปแบบการเขียนอื่น ๆ (Aliases)
            </label>
            <input
              type="text"
              value={form.aliases}
              onChange={(e) => onChangeForm((prev) => ({ ...prev, aliases: e.target.value }))}
              placeholder="คั่นด้วยเครื่องหมายจุลภาค เช่น Postgres, PgSQL"
              className={`${input} text-[13px] font-mono`}
            />
            <p className="mt-1 text-[10px] text-ink-3 leading-relaxed">
              คำเหล่านี้จะถูกตีความเป็นสิ่งเดียวกันกับชื่อหลักอัตโนมัติ
            </p>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-ink-2 mb-1">
              สถานะ (Status)
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "confirmed", label: "✓ ยืนยันแล้ว", icon: null },
                { id: "new", label: "รอตรวจทาน", icon: Hourglass },
                { id: "rejected", label: "✕ ปฏิเสธ", icon: null },
              ].map((st) => {
                const Icon = st.icon;
                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() =>
                      onChangeForm((prev) => ({
                        ...prev,
                        status: st.id as "confirmed" | "new" | "rejected",
                      }))
                    }
                    className={`inline-flex items-center justify-center gap-1 cursor-pointer rounded-full border py-1.5 px-2.5 text-[11px] font-medium transition-colors ${
                      form.status === st.id
                        ? "border-ink bg-ink text-surface"
                        : "border-line bg-surface text-ink-2 hover:border-ink"
                    }`}
                  >
                    {Icon ? <Icon className="h-3 w-3 shrink-0" aria-hidden="true" /> : null}
                    <span>{st.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-risk-line bg-risk-bg p-3 text-[12px] text-risk">
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
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={!form.name.trim() || isLoading}
              className={`${btn.primary} h-9 px-4`}
            >
              {isLoading ? (
                <>
                  <span className="animate-spin inline-block">↻</span>{" "}
                  กำลังบันทึก...
                </>
              ) : editingTech ? (
                "บันทึกการแก้ไข"
              ) : (
                "+ เพิ่มรายการ"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
