"use client";

import { useState } from "react";
import type { PipelineFailureItem } from "../../../_lib/api";
import { btn, Panel, SectionHeading } from "../../../_components/ui";

export function PipelineFailuresSection({
  failures,
  lang,
  onInspect,
  onRetry,
  onRetryAllTransient,
  onDismiss,
  retryingStep,
  retryingAll,
  dismissingStep,
  actionMsg,
}: {
  failures?: PipelineFailureItem[];
  lang: "th" | "en";
  onInspect: (projectId: string) => void;
  onRetry: (projectId: string, step: string, runNow?: boolean) => Promise<void>;
  onRetryAllTransient?: () => Promise<void>;
  onDismiss: (projectId: string, step: string) => Promise<void>;
  retryingStep: string | null;
  retryingAll?: boolean;
  dismissingStep: string | null;
  actionMsg: { text: string; type: "success" | "error" } | null;
}) {
  const failureCount = failures?.length ?? 0;

  return (
    <section className="mb-8">
      <SectionHeading
        right={
          failureCount > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-[2px] border border-risk-line bg-risk-bg px-2 py-0.5 text-[11px] text-risk font-semibold">
                {failureCount} {lang === "th" ? "รายการที่ติดขัด" : "stuck task(s)"}
              </span>
              {onRetryAllTransient ? (
                <button
                  type="button"
                  onClick={onRetryAllTransient}
                  disabled={retryingAll}
                  className={`${btn.primary} text-[11px] py-1 px-2.5 cursor-pointer`}
                  title={lang === "th" ? "เคลียร์และส่งรายการชั่วคราวทั้งหมดกลับเข้าคิว" : "Bulk retry all transient failures"}
                >
                  {retryingAll ? (
                    <span className="animate-spin inline-block mr-1">↻</span>
                  ) : (
                    <span className="inline-block mr-1">↻</span>
                  )}
                  {lang === "th" ? "เริ่มใหม่ทั้งหมด (Transient)" : "Retry All Transient"}
                </button>
              ) : null}
            </div>
          ) : null
        }
        sub={
          lang === "th"
            ? "รายการงานที่ติดขัดหรือล้มเหลวระหว่างดาวน์โหลด, OCR หรือสกัดข้อมูลด้วย AI พร้อมคำสั่งสั่งรันใหม่"
            : "Tasks that stopped or failed during download, OCR, or extraction with diagnostic error codes and retry triggers."
        }
      >
        {lang === "th" ? "งานที่ติดขัดในระบบ (Stuck & Failed Tasks)" : "Stuck & failed pipeline tasks"}
      </SectionHeading>

      {actionMsg && (
        <div
          className={`mb-3 rounded-[3px] border px-3 py-2 text-[12px] ${
            actionMsg.type === "success"
              ? "border-open-line bg-open-bg text-open"
              : "border-risk-line bg-risk-bg text-risk"
          }`}
        >
          {actionMsg.text}
        </div>
      )}

      {failureCount === 0 ? (
        <Panel className="p-4 flex items-center justify-between border-dashed">
          <div className="flex items-center gap-2.5">
            <span className="text-open text-[16px] font-bold">✓</span>
            <span className="text-[13px] leading-thai text-ink-2 font-medium">
              {lang === "th"
                ? "ระบบทำงานราบรื่น — ไม่มีงานที่ติดค้างในขั้นตอน Download, OCR หรือ Extraction"
                : "All pipeline stages are healthy — no stuck or failed tasks."}
            </span>
          </div>
          <span className="text-[11px] text-ink-3">0 failures</span>
        </Panel>
      ) : (
        <Panel className="overflow-x-auto shadow-xs">
          <table className="w-full min-w-[880px] border-collapse text-left">
            <thead>
              <tr className="border-b border-line bg-surface-2">
                {[
                  { text: lang === "th" ? "รหัส / โครงการ" : "Project", right: false },
                  { text: lang === "th" ? "ขั้นตอน" : "Step", right: false },
                  { text: lang === "th" ? "ลักษณะปัญหา" : "Nature", right: false },
                  { text: lang === "th" ? "พยายาม" : "Attempts", right: true },
                  { text: lang === "th" ? "ข้อความแจ้งเตือนข้อผิดพลาด" : "Diagnostic message", right: false },
                  { text: lang === "th" ? "เวลาที่พบ" : "Last failed", right: true },
                  { text: lang === "th" ? "การจัดการ" : "Action", right: true },
                ].map((col) => (
                  <th
                    key={col.text}
                    className={`px-3 py-2.5 text-[11px] font-medium text-ink-3 ${
                      col.right ? "text-right" : ""
                    }`}
                  >
                    {col.text}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {failures!.map((failure) => (
                <PipelineFailureRow
                  key={`${failure.projectId}-${failure.step}`}
                  failure={failure}
                  lang={lang}
                  onInspect={onInspect}
                  onRetry={onRetry}
                  onDismiss={onDismiss}
                  isRetrying={retryingStep === `${failure.projectId}-${failure.step}`}
                  isDismissing={dismissingStep === `${failure.projectId}-${failure.step}`}
                />
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </section>
  );
}

export function PipelineFailureRow({
  failure,
  lang,
  onInspect,
  onRetry,
  onDismiss,
  isRetrying,
  isDismissing,
}: {
  failure: PipelineFailureItem;
  lang: "th" | "en";
  onInspect: (projectId: string) => void;
  onRetry: (projectId: string, step: string, runNow?: boolean) => Promise<void>;
  onDismiss: (projectId: string, step: string) => Promise<void>;
  isRetrying: boolean;
  isDismissing: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(failure.lastError);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <tr className="border-b border-line align-top last:border-b-0 hover:bg-surface-2/40 transition-colors">
      <td className="px-3 py-2.5 max-w-[280px]">
        <button
          type="button"
          onClick={() => onInspect(failure.projectId)}
          className="font-mono text-[12px] font-bold text-ink hover:text-open hover:underline cursor-pointer text-left block"
          title={lang === "th" ? "คลิกเพื่อตรวจสอบสถานะรายโครงการ" : "Click to inspect record"}
        >
          {failure.projectId} 🔍
        </button>
        <p className="text-[12px] leading-thai text-ink font-medium line-clamp-1 mt-0.5">
          {failure.projectTitle}
        </p>
        <p className="text-[11px] text-ink-3 line-clamp-1">{failure.agency}</p>
      </td>
      <td className="px-3 py-2.5">
        <span className="rounded-[2px] border border-line bg-surface-2 px-1.5 py-[2px] text-[10px] uppercase font-semibold text-ink">
          {failure.step}
        </span>
      </td>
      <td className="px-3 py-2.5">
        {failure.lastTransient ? (
          <span className="inline-flex rounded-[2px] border border-amend-line bg-amend-bg px-1.5 py-[2px] text-[10px] font-medium text-amend">
            {lang === "th" ? "⚠️ ขัดข้องชั่วคราว" : "⚠️ Transient"}
          </span>
        ) : (
          <span className="inline-flex rounded-[2px] border border-risk-line bg-risk-bg px-1.5 py-[2px] text-[10px] font-medium text-risk">
            {lang === "th" ? "❌ ผิดพลาดถาวร" : "❌ Defect"}
          </span>
        )}
      </td>
      <td className="px-3 py-2.5 text-right font-mono tnum text-[12px] text-ink">
        <span className={failure.attempts >= 3 ? "text-risk font-bold" : ""}>
          {failure.attempts} / 3
        </span>
      </td>
      <td className="px-3 py-2.5 max-w-[320px]">
        <p className="text-[11px] leading-relaxed text-risk line-clamp-2">
          {failure.lastError}
        </p>
        <div className="mt-1 flex items-center gap-2">
          {failure.lastError && failure.lastError.length > 70 && (
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-[11px] text-ink-3 underline hover:text-ink cursor-pointer"
            >
              {isExpanded
                ? lang === "th" ? "ย่อ" : "Collapse"
                : lang === "th" ? "ดูเต็ม..." : "Expand..."}
            </button>
          )}
          <button
            type="button"
            onClick={handleCopy}
            className="text-[10px] text-ink-3 hover:text-ink cursor-pointer"
          >
            {isCopied
              ? (lang === "th" ? "✓ คัดลอกแล้ว" : "✓ Copied")
              : (lang === "th" ? "📋 คัดลอก" : "📋 Copy")}
          </button>
        </div>
        {isExpanded && (
          <pre className="mt-2 p-2 rounded-[2px] border border-line bg-surface font-mono text-[10px] text-ink-2 whitespace-pre-wrap max-h-48 overflow-y-auto">
            {failure.lastError}
          </pre>
        )}
      </td>
      <td className="px-3 py-2.5 text-right font-mono tnum text-[11px] text-ink-3 whitespace-nowrap">
        {failure.lastFailedAt}
      </td>
      <td className="px-3 py-2.5 text-right whitespace-nowrap">
        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => onRetry(failure.projectId, failure.step, false)}
            disabled={isRetrying || isDismissing}
            className={`${btn.secondary} text-[11px] py-1 px-2.5`}
            aria-label={`Re-queue ${failure.step} for ${failure.projectId}`}
            title={lang === "th" ? "เคลียร์ข้อผิดพลาดและเข้าคิวรอรอบเวลา" : "Clear error and re-queue for next scheduled run"}
          >
            {isRetrying ? (
              <span className="animate-spin inline-block mr-1">↻</span>
            ) : (
              "↻ "
            )}
            {lang === "th" ? "เข้าคิวใหม่" : "Re-queue"}
          </button>
          <button
            type="button"
            onClick={() => onRetry(failure.projectId, failure.step, true)}
            disabled={isRetrying || isDismissing}
            className={`${btn.primary} text-[11px] py-1 px-2.5`}
            aria-label={`Run now ${failure.step} for ${failure.projectId}`}
            title={lang === "th" ? "สั่งรันขั้นตอนทันทีไม่ต้องรอรอบเวลา" : "Execute step immediately on-demand"}
          >
            {lang === "th" ? "รันทันที" : "Run Now"}
          </button>
          <button
            type="button"
            onClick={() => onDismiss(failure.projectId, failure.step)}
            disabled={isRetrying || isDismissing}
            className={`${btn.ghost} text-[11px] py-1 px-2 text-ink-3 hover:text-risk`}
            aria-label={`Dismiss failure for ${failure.projectId}`}
            title={lang === "th" ? "ยกเว้นข้อผิดพลาดนี้อย่างถาวร" : "Dismiss failure permanently"}
          >
            {isDismissing ? (
              <span className="animate-spin inline-block mr-1">↻</span>
            ) : null}
            {lang === "th" ? "ละเว้น" : "Dismiss"}
          </button>
        </div>
      </td>
    </tr>
  );
}
