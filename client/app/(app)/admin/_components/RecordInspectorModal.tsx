"use client";

import { useState } from "react";
import type { PipelineRecordDiagnostics } from "../../../_lib/api";
import { btn, Label, Panel } from "../../../_components/ui";

export function RecordInspectorModal({
  projectId,
  record,
  isLoading,
  error,
  lang,
  onClose,
  onRetryStep,
  onDismissFailure,
  onReExtract,
}: {
  projectId: string;
  record: PipelineRecordDiagnostics | null;
  isLoading: boolean;
  error: string | null;
  lang: "th" | "en";
  onClose: () => void;
  onRetryStep: (pid: string, step: string) => Promise<void>;
  onDismissFailure: (pid: string, step: string) => Promise<void>;
  onReExtract: (pid: string) => Promise<void>;
}) {
  const [tab, setTab] = useState<"progression" | "intelligence" | "document">("progression");
  const [retrying, setRetrying] = useState(false);
  const [reExtracting, setReExtracting] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  const handleCopyId = () => {
    navigator.clipboard.writeText(projectId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const formatMoney = (val: number | null | undefined) =>
    typeof val === "number" && val > 0
      ? `฿${val.toLocaleString()}`
      : lang === "th"
      ? "ไม่ได้ระบุ"
      : "Not stated";

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
                        🌊 {record.wavePriority}
                      </span>
                    ) : null}
                  </>
                ) : null}
              </div>
              <h2 className="mt-1.5 text-[16px] font-semibold leading-snug text-ink truncate">
                {record?.title ||
                  (isLoading
                    ? lang === "th"
                      ? "กำลังโหลดข้อมูล..."
                      : "Loading..."
                    : projectId)}
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
                  label: lang === "th" ? "ลำดับขั้น & สถานะ (Progression)" : "Stage Progression",
                },
                {
                  id: "intelligence",
                  label: lang === "th" ? "การสกัด AI & ความเสี่ยง (Intelligence)" : "AI & Risk Check",
                },
                {
                  id: "document",
                  label: lang === "th" ? "เอกสารแนบ & รายละเอียด (Details)" : "Document & Metadata",
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
                {lang === "th"
                  ? "กำลังดึงข้อมูลการประมวลผลของโครงการ..."
                  : "Fetching record lifecycle diagnostics..."}
              </p>
            </div>
          ) : error ? (
            <div className="rounded-[3px] border border-risk-line bg-risk-bg p-4 text-center">
              <p className="font-semibold text-risk text-[14px]">
                {lang === "th" ? "ไม่พบข้อมูลโครงการ" : "Record Diagnostic Lookup Failed"}
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
                          ⚠️ {lang === "th" ? "พบข้อผิดพลาดในขั้นตอน" : "Active Failure in Step"}:{" "}
                          {record.activeFailure.step}
                        </span>
                        <span className="font-mono tnum text-[11px] text-risk">
                          {lang === "th"
                            ? `ครั้งที่ ${record.activeFailure.attempts} / 3`
                            : `Attempt ${record.activeFailure.attempts} of 3`}
                        </span>
                      </div>
                      <p className="mt-2 text-[12px] leading-relaxed text-risk">
                        {record.activeFailure.lastError}
                      </p>
                      <p className="mt-1 text-[10px] text-risk/70">
                        {lang === "th" ? "ผิดพลาดล่าสุดเมื่อ" : "Last failure"}:{" "}
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
                            : lang === "th"
                            ? `รีเซ็ตและสั่งรันขั้นตอน ${record.activeFailure.step} ใหม่`
                            : `Retry ${record.activeFailure.step} Step`}
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
                          {lang === "th" ? "ละเว้นข้อผิดพลาดนี้ (Dismiss)" : "Dismiss Failure"}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {/* 5-Stage Progression Chain */}
                  <div>
                    <Label>
                      {lang === "th"
                        ? "ลำดับขั้นการประมวลผล (Stage Progression)"
                        : "Pipeline Stage Progression"}
                    </Label>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-5">
                      {[
                        {
                          key: "fetched",
                          title: lang === "th" ? "1. ดึงประกาศ" : "1. Fetched",
                          stage: record.stages.fetched,
                        },
                        {
                          key: "downloaded",
                          title: lang === "th" ? "2. ดาวน์โหลด" : "2. Downloaded",
                          stage: record.stages.downloaded,
                        },
                        {
                          key: "ocr",
                          title: lang === "th" ? "3. ทำ OCR" : "3. OCR Text",
                          stage: record.stages.ocr,
                        },
                        {
                          key: "extracted",
                          title: lang === "th" ? "4. สกัดข้อมูล" : "4. Extracted",
                          stage: record.stages.extracted,
                        },
                        {
                          key: "reviewed",
                          title: lang === "th" ? "5. ตรวจทาน" : "5. Reviewed",
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
                                : lang === "th"
                                ? "เสร็จสิ้น"
                                : "Done"
                              : stage.error
                              ? lang === "th"
                                ? "ขัดข้อง"
                                : "Failed"
                              : lang === "th"
                              ? "รอดำเนินการ"
                              : "Pending"}
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
                          {lang === "th"
                            ? "การคัดกรองหัวข้อ (Title Screen)"
                            : "Title Screening Intelligence"}
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
                          (lang === "th" ? "ไม่มีเหตุผลระบุ" : "No reason recorded")}
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
                        {lang === "th" ? "ความมั่นใจ OCR (Optical Char)" : "OCR Confidence"}
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
                        {lang === "th" ? "ความมั่นใจการสกัด AI" : "AI Extraction Score"}
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
                        {lang === "th" ? "งบประมาณ (Budget)" : "Budget"}:
                      </span>
                      <p className="font-mono tnum font-medium text-ink mt-0.5">
                        {formatMoney(record.budgetTHB)}
                      </p>
                    </Panel>
                    <Panel className="p-2.5">
                      <span className="text-ink-3 text-[11px]">
                        {lang === "th" ? "ราคากลาง (Reference Price)" : "Reference Price"}:
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
                    <Label>
                      {lang === "th" ? "เอกสารแนบจาก e-GP" : "e-GP Document Attachment"}
                    </Label>
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
                        <div className="flex justify-between">
                          <span className="text-ink-3">Document Type:</span>
                          <span className="text-ink font-semibold">{record.document.documentType}</span>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-2 text-[12px] text-ink-3 italic">
                        {lang === "th"
                          ? "ยังไม่มีเอกสารแนบที่ดาวน์โหลด"
                          : "No downloaded document package"}
                      </p>
                    )}
                  </Panel>

                  {/* Metadata Box */}
                  <Panel className="p-3.5">
                    <Label>
                      {lang === "th" ? "ข้อมูลและไทม์ไลน์ประกาศ" : "Procurement Timeline & Meta"}
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
                    : lang === "th"
                    ? "↻ สั่งอ่านเอกสารใหม่ (Re-extract)"
                    : "↻ Re-extract"}
                </button>
                <a
                  href={`/tor/${record.projectId}`}
                  target="_blank"
                  rel="noreferrer"
                  className={`${btn.secondary} h-8 px-3 text-[12px]`}
                >
                  {lang === "th" ? "เปิดดูบนเว็บ" : "View in Catalog"} ↗
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
            {lang === "th" ? "ปิด" : "Close"}
          </button>
        </div>
      </div>
    </div>
  );
}

