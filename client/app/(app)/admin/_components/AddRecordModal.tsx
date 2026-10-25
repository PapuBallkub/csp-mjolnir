"use client";

import React from "react";
import { btn, input, Label } from "../../../_components/ui";

export function AddRecordModal({
  isOpen,
  projectId,
  onChangeProjectId,
  onSubmit,
  isLoading,
  error,
  lang,
  onClose,
}: {
  isOpen: boolean;
  projectId: string;
  onChangeProjectId: (val: string) => void;
  onSubmit: (e: React.FormEvent) => Promise<void>;
  isLoading: boolean;
  error: string | null;
  lang: "th" | "en";
  onClose: () => void;
}) {
  if (!isOpen) return null;

  const isValid = /^\d{11}$/.test(projectId.trim());

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-[4px] border border-line bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line pb-3">
          <h2 className="text-[16px] font-semibold text-ink">
            {lang === "th"
              ? "เพิ่มโครงการจัดซื้อจัดจ้าง e-GP"
              : "Add e-GP Procurement Notice"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[3px] border border-line-2 bg-surface px-2 py-0.5 text-[12px] text-ink-2 hover:bg-surface-2 hover:text-ink cursor-pointer"
          >
            ✕
          </button>
        </div>

        <form onSubmit={onSubmit} className="mt-4 space-y-4">
          <p className="text-[12px] leading-thai text-ink-2">
            {lang === "th"
              ? "ระบุรหัสโครงการ e-GP 11 หลักเพื่อดึงประกาศและเอกสารราคากลางเข้าสู่ระบบ ระบบจะดาวน์โหลดและส่งเข้าสู่ขั้นตอนประมวลผลทันที"
              : "Enter an 11-digit e-GP project ID to download the announcement and price packages and queue it into the processing pipeline."}
          </p>

          <div>
            <Label>
              {lang === "th"
                ? "รหัสโครงการ e-GP (11 หลัก)"
                : "e-GP Project ID (11 digits)"}
            </Label>
            <input
              type="text"
              required
              autoFocus
              maxLength={11}
              value={projectId}
              onChange={(e) => onChangeProjectId(e.target.value.replace(/\D/g, ""))}
              placeholder="e.g. 69099683466"
              className={`${input} mt-1 font-mono tracking-wider`}
            />
            <div className="mt-1 flex items-center justify-between text-[11px]">
              <span className={isValid ? "text-open font-semibold" : "text-ink-3"}>
                {isValid
                  ? lang === "th"
                    ? "✓ รูปแบบถูกต้อง (11 หลัก)"
                    : "✓ Valid 11-digit ID"
                  : lang === "th"
                  ? `ต้องระบุ 11 หลัก (ปัจจุบัน ${projectId.length}/11)`
                  : `${projectId.length}/11 digits`}
              </span>
            </div>
          </div>

          {error ? (
            <div className="rounded-[3px] border border-risk-line bg-risk-bg p-2.5 text-[12px] text-risk">
              {error}
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2 border-t border-line pt-3">
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
              disabled={!isValid || isLoading}
              className={`${btn.primary} h-9 px-4`}
            >
              {isLoading ? (
                <>
                  <span className="animate-spin inline-block">↻</span>{" "}
                  {lang === "th" ? "กำลังดึงข้อมูล..." : "Fetching..."}
                </>
              ) : lang === "th" ? (
                "+ ดึงข้อมูลโครงการ"
              ) : (
                "+ Fetch & Ingest"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
