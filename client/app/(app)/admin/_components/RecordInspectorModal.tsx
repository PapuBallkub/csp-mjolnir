"use client";

import { useState } from "react";
import type { PipelineRecordDiagnostics } from "../../../_lib/api";
import { btn, Label, Panel } from "../../../_components/ui";
import { PdfPreviewModal } from "../../../_components/PdfPreviewModal";

export function RecordInspectorModal({
  projectId,
  record,
  isLoading,
  error,
  onClose,
  onRetryStep,
  onDismissFailure,
  onReExtract,
}: {
  projectId: string;
  record: PipelineRecordDiagnostics | null;
  isLoading: boolean;
  error: string | null;
  onClose: () => void;
  onRetryStep: (pid: string, step: string, maxPages?: number) => Promise<void>;
  onDismissFailure: (pid: string, step: string) => Promise<void>;
  onReExtract: (pid: string) => Promise<void>;
}) {
  const [tab, setTab] = useState<"progression" | "intelligence" | "document">("progression");
  const [retrying, setRetrying] = useState(false);
  const [reExtracting, setReExtracting] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [showPdfPreview, setShowPdfPreview] = useState(false);

  const handleCopyId = () => {
    navigator.clipboard.writeText(projectId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const formatMoney = (val: number | null | undefined) =>
    typeof val === "number" && val > 0
      ? `฿${val.toLocaleString()}`
      : "ไม่ได้ระบุ";

  const formatDate = (iso: string | null | undefined) =>
    iso ? iso.slice(0, 16).replace("T", " ") : "—";

  const ocrConf = record?.stages?.ocr?.confidence ?? record?.ocr?.confidence;
  const ocrPercent = ocrConf != null ? Math.round(ocrConf * 100) : null;
  const extPercent = record?.insight?.confidence;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-6 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="relative max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[4px] border border-line bg-surface p-5 sm:p-6 shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-line pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[15px] font-bold text-ink">
                  {projectId}
                </span>
                <button
                  type="button"
                  onClick={handleCopyId}
                  className="rounded-[2px] border border-line-2 bg-surface-2 px-1.5 py-0.5 text-[10px] text-ink-3 hover:text-ink cursor-pointer"
                  title="Copy Project ID"
                >
                  {copiedId ? "✓ Copied" : "📋 Copy"}
                </button>
                {record ? (
                  <>
                    <span className="rounded-[2px] border border-line bg-surface-2 px-1.5 py-0.5 text-[10px] uppercase font-medium text-ink-2">
                      {record.source}
                    </span>
                    <span
                      className={`rounded-[2px] border px-1.5 py-0.5 text-[10px] font-medium ${
                        record.status === "Open"
                          ? "border-open-line bg-open-bg text-open"
                          : "border-line bg-surface-2 text-ink"
                      }`}
                    >
                      {record.status}
                    </span>
                    <span className="rounded-[2px] border border-line-2 bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-ink">
                      Stage: {record.pipelineStatus}
                    </span>
                    {record.wavePriority ? (
                      <span className="rounded-[2px] border border-line-2 bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-ink">
                        {record.wavePriority}
                      </span>
                    ) : null}
                  </>
                ) : null}
              </div>
              <h2 className="mt-1.5 text-[16px] font-semibold leading-snug text-ink truncate">
                {record?.title || (isLoading ? "กำลังโหลดข้อมูล..." : projectId)}
              </h2>
              {record?.agency ? (
                <p className="mt-0.5 text-[12px] text-ink-3 truncate">{record.agency}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-[3px] border border-line-2 bg-surface px-2.5 py-1 text-[12px] text-ink-2 hover:bg-surface-2 hover:text-ink cursor-pointer"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {/* Navigation Tabs */}
          {record && (
            <div className="mt-4 flex items-center gap-2 border-b border-line -mb-4 pt-1">
              {[
                {
                  id: "progression",
                  label: "ลำดับขั้น & สถานะ (Progression)",
                },
                {
                  id: "intelligence",
                  label: "การสกัด AI & ความเสี่ยง (Intelligence)",
                },
                {
                  id: "document",
                  label: "เอกสารแนบ & รายละเอียด (Details)",
                },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id as typeof tab)}
                  className={`pb-2.5 px-2 text-[12px] font-medium transition-colors cursor-pointer border-b-2 -mb-[1px] ${
                    tab === t.id
                      ? "border-ink text-ink font-semibold"
                      : "border-transparent text-ink-3 hover:text-ink"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="py-4 min-h-[240px]">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-ink" />
              <p className="mt-3 text-[13px] text-ink-2">
                กำลังดึงข้อมูลการประมวลผลของโครงการ...
              </p>
            </div>
          ) : error ? (
            <div className="rounded-[3px] border border-risk-line bg-risk-bg p-4 text-center">
              <p className="font-semibold text-risk text-[14px]">
                ไม่พบข้อมูลโครงการ
              </p>
              <p className="mt-1 text-[12px] text-risk/80">{error}</p>
            </div>
          ) : record ? (
            <div className="space-y-4">
              {/* TAB 1: STAGE PROGRESSION */}
              {tab === "progression" && (
                <div className="space-y-4">
                  {/* Active Failure Callout */}
                  {record.activeFailure ? (
                    <div className="rounded-[3px] border border-risk-line bg-risk-bg/50 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[12px] font-bold text-risk uppercase">
                          ⚠️ พบข้อผิดพลาดในขั้นตอน:{" "}
                          {record.activeFailure.step}
                        </span>
                        <span className="font-mono tnum text-[11px] text-risk">
                          {`ครั้งที่ ${record.activeFailure.attempts} / 3`}
                        </span>
                      </div>
                      <p className="mt-2 text-[12px] leading-relaxed text-risk">
                        {record.activeFailure.lastError}
                      </p>
                      <p className="mt-1 text-[10px] text-risk/70">
                        ผิดพลาดล่าสุดเมื่อ:{" "}
                        <span className="font-mono tnum">{formatDate(record.activeFailure.lastFailedAt)}</span>
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={retrying}
                          onClick={async () => {
                            const stepToRetry = record.activeFailure?.step;
                            if (!stepToRetry) return;
                            setRetrying(true);
                            await onRetryStep(record.projectId, stepToRetry);
                            setRetrying(false);
                          }}
                          className={`${btn.primary} h-7 px-3 text-[11px]`}
                        >
                          {retrying
                            ? "..."
                            : `รีเซ็ตและสั่งรันขั้นตอน ${record.activeFailure.step} ใหม่`}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const stepToDismiss = record.activeFailure?.step;
                            if (stepToDismiss) {
                              onDismissFailure(record.projectId, stepToDismiss);
                            }
                          }}
                          className={`${btn.secondary} h-7 px-3 text-[11px] text-risk`}
                        >
                          ละเว้นข้อผิดพลาดนี้ (Dismiss)
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {/* Truncation Warning Callout (FR-24, NFR-17) */}
                  {record.stages?.ocr?.truncated ? (
                    <div className="rounded-[3px] border border-amend-line bg-amend-bg/40 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[12px] font-bold text-amend uppercase">
                          ⚠️ เอกสารถูกตัดทอนเนื่องจากเกินขีดจำกัดหน้า (Truncated)
                        </span>
                        <span className="font-mono tnum text-[11px] text-amend">
                          {record.stages.ocr.pagesRead ?? 150} / {record.stages.ocr.totalPages ?? record.document?.pages ?? "150+"} หน้า
                        </span>
                      </div>
                      <p className="mt-2 text-[12px] leading-relaxed text-ink-2">
                        {`ระบบหยุดอ่านที่หน้า ${record.stages.ocr.pagesRead ?? 150} ตามข้อจำกัดความปลอดภัยของ OCR (ปกติ 150 หน้า) ทำให้เนื้อหาบางส่วนอาจยังไม่ได้ถูกสกัดหรือตรวจสอบ`}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={retrying}
                          onClick={async () => {
                            setRetrying(true);
                            await onRetryStep(record.projectId, "ocr", 300);
                            setRetrying(false);
                          }}
                          className={`${btn.primary} h-7 px-3 text-[11px]`}
                        >
                          {retrying
                            ? "..."
                            : "อ่าน OCR ต่อด้วยขีดจำกัด 300 หน้า (Retry with 300 pages)"}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {/* 5-Stage Progression Chain */}
                  <div>
                    <Label>
                      ลำดับขั้นการประมวลผล (Stage Progression)
                    </Label>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-5">
                      {[
                        {
                          key: "fetched",
                          title: "1. ดึงประกาศ",
                          stage: record.stages.fetched,
                        },
                        {
                          key: "downloaded",
                          title: "2. ดาวน์โหลด",
                          stage: record.stages.downloaded,
                        },
                        {
                          key: "ocr",
                          title: "3. ทำ OCR",
                          stage: record.stages.ocr,
                        },
                        {
                          key: "extracted",
                          title: "4. สกัดข้อมูล",
                          stage: record.stages.extracted,
                        },
                        {
                          key: "reviewed",
                          title: "5. ตรวจทาน",
                          stage: record.stages.reviewed,
                        },
                      ].map(({ key, title, stage }) => (
                        <div
                          key={key}
                          className={`rounded-[3px] border p-2.5 text-center ${
                            stage.done
                              ? "border-open-line bg-open-bg/40 text-ink"
                              : stage.error
                              ? "border-risk-line bg-risk-bg/40 text-ink"
                              : "border-line bg-surface-2/40 text-ink-3"
                          }`}
                        >
                          <div className="flex items-center justify-center gap-1">
                            <span className="text-[12px] font-bold">
                              {stage.done ? "✓" : stage.error ? "✕" : "○"}
                            </span>
                            <span className="text-[11px] font-medium">{title}</span>
                          </div>
                          <p className="mt-1 text-[10px] text-ink-2 truncate">
                            {stage.done
                              ? stage.confidence
                                ? `${Math.round(stage.confidence)}%`
                                : "เสร็จสิ้น"
                              : stage.error
                              ? "ขัดข้อง"
                              : "รอดำเนินการ"}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: AI & RISK CHECK */}
              {tab === "intelligence" && (
                <div className="space-y-4">
                  {/* Title Screen Details */}
                  {record.titleScreen ? (
                    <Panel className="p-3">
                      <div className="flex items-center justify-between">
                        <Label>
                          การคัดกรองหัวข้อ (Title Screen)
                        </Label>
                        <span
                          className={`rounded-[2px] px-1.5 py-0.5 text-[10px] font-semibold ${
                            record.titleScreen.isItRelated
                              ? "bg-open-bg text-open border border-open-line"
                              : "bg-risk-bg text-risk border border-risk-line"
                          }`}
                        >
                          {record.titleScreen.isItRelated ? "IT Related" : "Non-IT Rejected"}
                        </span>
                      </div>
                      <p className="mt-1.5 text-[12px] leading-relaxed text-ink-2">
                        {record.titleScreen.reason ||
                          "ไม่มีเหตุผลระบุ"}
                      </p>
                      {record.titleScreen.category ? (
                        <p className="mt-1 text-[11px] text-ink-3">
                          Category: {record.titleScreen.category}
                        </p>
                      ) : null}
                    </Panel>
                  ) : null}

                  {/* AI Confidence & Metrics */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Panel className="p-3">
                      <Label>
                        ความมั่นใจ OCR (Optical Char)
                      </Label>
                      <div className="mt-2 flex items-baseline justify-between">
                        <span className="font-mono tnum text-[22px] font-bold text-ink">
                          {ocrPercent != null ? `${ocrPercent}%` : "—"}
                        </span>
                        <span className="text-[10px] text-ink-3">
                          {record.stages?.ocr?.usedOcr ? "Tesseract Engine" : "Digital Text"}
                        </span>
                      </div>
                      {ocrPercent != null && (
                        <div className="mt-2 h-1.5 w-full rounded-full bg-surface-2 overflow-hidden">
                          <div
                            className={`h-full ${
                              ocrPercent >= 80 ? "bg-open" : ocrPercent >= 50 ? "bg-amend" : "bg-risk"
                            }`}
                            style={{ width: `${Math.min(100, ocrPercent)}%` }}
                          />
                        </div>
                      )}
                    </Panel>

                    <Panel className="p-3">
                      <Label>
                        ความมั่นใจการสกัด AI
                      </Label>
                      <div className="mt-2 flex items-baseline justify-between">
                        <span className="font-mono tnum text-[22px] font-bold text-ink">
                          {extPercent != null ? `${extPercent}%` : "—"}
                        </span>
                        <span
                          className={`rounded-[2px] px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                            record.insight?.lockSpecRisk === "high"
                              ? "bg-risk-bg text-risk border border-risk-line"
                              : record.insight?.lockSpecRisk === "medium"
                              ? "bg-amend-bg text-amend border border-amend-line"
                              : "bg-open-bg text-open border border-open-line"
                          }`}
                        >
                          Lock-spec: {record.insight?.lockSpecRisk ?? "low"}
                        </span>
                      </div>
                      {extPercent != null && (
                        <div className="mt-2 h-1.5 w-full rounded-full bg-surface-2 overflow-hidden">
                          <div
                            className={`h-full ${
                              extPercent >= 80 ? "bg-open" : extPercent >= 50 ? "bg-amend" : "bg-risk"
                            }`}
                            style={{ width: `${Math.min(100, extPercent)}%` }}
                          />
                        </div>
                      )}
                    </Panel>
                  </div>

                  {/* Budget & Price Details */}
                  <div className="grid grid-cols-2 gap-2 text-[12px]">
                    <Panel className="p-2.5">
                      <span className="text-ink-3 text-[11px]">
                        งบประมาณ (Budget):
                      </span>
                      <p className="font-mono tnum font-medium text-ink mt-0.5">
                        {formatMoney(record.budgetTHB)}
                      </p>
                    </Panel>
                    <Panel className="p-2.5">
                      <span className="text-ink-3 text-[11px]">
                        ราคากลาง (Reference Price):
                      </span>
                      <p className="font-mono tnum font-medium text-ink mt-0.5">
                        {formatMoney(record.referencePriceTHB)}
                      </p>
                    </Panel>
                  </div>
                </div>
              )}

              {/* TAB 3: DOCUMENT & METADATA */}
              {tab === "document" && (
                <div className="space-y-4">
                  {/* Document Box */}
                  <Panel className="p-3.5">
                    <div className="flex items-center justify-between">
                      <Label>
                        เอกสารแนบจาก e-GP
                      </Label>
                      <button
                        type="button"
                        onClick={() => setShowPdfPreview(true)}
                        className={`${btn.secondary} text-[11px] h-7 px-2.5 flex items-center gap-1 cursor-pointer`}
                      >
                        <span>📄</span>
                        <span>พรีวิว PDF</span>
                      </button>
                    </div>
                    {record.document ? (
                      <div className="mt-2 space-y-2 text-[12px]">
                        <div className="flex justify-between border-b border-line pb-1.5">
                          <span className="text-ink-3">File Name:</span>
                          <span className="text-ink font-medium truncate max-w-[320px]">
                            {record.document.fileName}
                          </span>
                        </div>
                        <div className="flex justify-between border-b border-line pb-1.5">
                          <span className="text-ink-3">Pages:</span>
                          <span className="text-ink font-mono tnum">
                            {record.document.pages ?? "—"}
                          </span>
                        </div>
                        <div className="flex justify-between border-b border-line pb-1.5">
                          <span className="text-ink-3">Size:</span>
                          <span className="text-ink font-mono tnum">
                            {record.document.sizeBytes
                              ? `${(record.document.sizeBytes / (1024 * 1024)).toFixed(2)} MB`
                              : "—"}
                          </span>
                        </div>
                        {record.stages?.ocr?.truncated ? (
                          <div className="flex justify-between border-b border-line pb-1.5 text-amend">
                            <span className="text-[12px] font-medium">OCR Truncation:</span>
                            <span className="font-semibold text-[11px]">
                              {`⚠️ ตัดทอนที่ ${record.stages.ocr.pagesRead ?? 150} หน้า`}
                            </span>
                          </div>
                        ) : null}
                        <div className="flex justify-between">
                          <span className="text-ink-3">Document Type:</span>
                          <span className="text-ink font-semibold">{record.document.documentType}</span>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-2 text-[12px] text-ink-3 italic">
                        ยังไม่มีเอกสารแนบที่ดาวน์โหลด
                      </p>
                    )}
                  </Panel>

                  {/* Metadata Box */}
                  <Panel className="p-3.5">
                    <Label>
                      ข้อมูลและไทม์ไลน์ประกาศ
                    </Label>
                    <div className="mt-2 space-y-2 text-[12px]">
                      <div className="flex justify-between border-b border-line pb-1.5">
                        <span className="text-ink-3">Announce Date:</span>
                        <span className="text-ink font-mono tnum">{record.announceDate || "—"}</span>
                      </div>
                      <div className="flex justify-between border-b border-line pb-1.5">
                        <span className="text-ink-3">Submission Deadline:</span>
                        <span className="text-ink font-mono tnum">{record.submissionDeadline || "—"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-ink-3">Source Portal:</span>
                        <span className="text-ink uppercase font-semibold">{record.source}</span>
                      </div>
                    </div>
                  </Panel>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Footer Actions */}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
          <div className="flex items-center gap-2">
            {record ? (
              <>
                <button
                  type="button"
                  disabled={reExtracting}
                  onClick={async () => {
                    setReExtracting(true);
                    await onReExtract(record.projectId);
                    setReExtracting(false);
                  }}
                  className={`${btn.secondary} h-8 px-3 text-[12px]`}
                >
                  {reExtracting
                    ? "..."
                    : "↻ สั่งอ่านเอกสารใหม่ (Re-extract)"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowPdfPreview(true)}
                  className={`${btn.secondary} h-8 px-3 text-[12px] flex items-center gap-1 cursor-pointer`}
                >
                  <span>📄</span>
                  <span>พรีวิว PDF</span>
                </button>
                <a
                  href={`/tor/${record.projectId}`}
                  target="_blank"
                  rel="noreferrer"
                  className={`${btn.secondary} h-8 px-3 text-[12px]`}
                >
                  เปิดดูบนเว็บ ↗
                </a>
                <a
                  href={`https://process5.gprocurement.go.th/egp-agpc01-web/announcement?keywordSearch=${record.projectId}`}
                  target="_blank"
                  rel="noreferrer"
                  className={`${btn.ghost} h-8 px-2.5 text-[12px]`}
                >
                  e-GP ↗
                </a>
              </>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`${btn.primary} h-8 px-4 text-[12px]`}
          >
            ปิด
          </button>
        </div>
      </div>

      <PdfPreviewModal
        isOpen={showPdfPreview}
        onClose={() => setShowPdfPreview(false)}
        projectId={projectId}
        title={record?.title || projectId}
        agency={record?.agency}
        procurementMethod={record?.procurementMethod}
        officialEgpUrl={
          record?.projectId
            ? `https://process5.gprocurement.go.th/egp-agpc01-web/announcement?keywordSearch=${record.projectId}`
            : null
        }
      />
    </div>
  );
}

