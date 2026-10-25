"use client";

import { useEffect, useState, useCallback } from "react";
import {
  adminGetPipelineTasks,
  adminSkipPipelineStep,
  type PipelineTaskItem,
  type GetPipelineTasksResult,
} from "../../../_lib/api";
import { btn, input, Panel, SectionHeading } from "../../../_components/ui";

type PhaseKey = "all" | "download" | "ocr" | "extract" | "extracted" | "failed";

interface PhaseTabConfig {
  key: PhaseKey;
  label: { th: string; en: string };
  badgeColor?: string;
}

const PHASE_TABS: PhaseTabConfig[] = [
  { key: "all", label: { th: "ทั้งหมด", en: "All" } },
  { key: "download", label: { th: "1. รอโหลด", en: "1. Download" } },
  { key: "ocr", label: { th: "2. ขั้นตอน OCR", en: "2. OCR Phase" } },
  { key: "extract", label: { th: "3. กำลังสกัด AI", en: "3. AI Extract" } },
  { key: "extracted", label: { th: "4. สกัดสำเร็จ", en: "4. Extracted" } },
  { key: "failed", label: { th: "5. ติดขัด/ล้มเหลว", en: "5. Failed/Stuck" } },
];

export function PipelineMonitoringSection({
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
  const [activePhase, setActivePhase] = useState<PhaseKey>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [limit] = useState(20);

  const [tasksData, setTasksData] = useState<GetPipelineTasksResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [skippingStep, setSkippingStep] = useState<string | null>(null);
  const [localMessage, setLocalMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  const fetchTasks = useCallback(async () => {
    setIsLoading(true);
    const res = await adminGetPipelineTasks({
      phase: activePhase,
      search: searchQuery.trim(),
      page,
      limit,
    });
    setIsLoading(false);
    if (res.ok) {
      setTasksData(res.data);
    }
  }, [activePhase, searchQuery, page, limit]);

  useEffect(() => {
    let cancelled = false;
    adminGetPipelineTasks({
      phase: activePhase,
      search: searchQuery.trim(),
      page,
      limit,
    }).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setTasksData(res.data);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [activePhase, searchQuery, page, limit]);

  const handlePhaseChange = (phase: PhaseKey) => {
    setActivePhase(phase);
    setPage(1);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchTasks();
  };

  const handleSkip = async (projectId: string, step: string) => {
    const key = `${projectId}-${step}`;
    setSkippingStep(key);
    setLocalMessage(null);
    const res = await adminSkipPipelineStep(projectId, step);
    setSkippingStep(null);
    if (res.ok) {
      setLocalMessage({
        text:
          lang === "th"
            ? `ข้ามขั้นตอน ${step} ของโครงการ ${projectId} เรียบร้อยแล้ว (สถานะใหม่: ${res.data.nextStatus})`
            : `Advanced project ${projectId} past ${step} step (new status: ${res.data.nextStatus})`,
        type: "success",
      });
      fetchTasks();
    } else {
      setLocalMessage({
        text: res.error.message,
        type: "error",
      });
    }
  };

  const handleRowRetry = async (projectId: string, step: string, runNow: boolean) => {
    await onRetry(projectId, step, runNow);
    fetchTasks();
  };

  const handleRowDismiss = async (projectId: string, step: string) => {
    await onDismiss(projectId, step);
    fetchTasks();
  };

  const handleRetryAllClick = async () => {
    if (onRetryAllTransient) {
      await onRetryAllTransient();
      fetchTasks();
    }
  };

  const counts = tasksData?.counts || {
    all: 0,
    download: 0,
    ocr: 0,
    extract: 0,
    extracted: 0,
    failed: 0,
  };

  const tasks = tasksData?.tasks || [];
  const total = tasksData?.total || 0;
  const totalPages = Math.ceil(total / limit) || 1;

  const currentMsg = localMessage || actionMsg;

  return (
    <section className="mb-8">
      <SectionHeading
        right={
          <div className="flex flex-wrap items-center gap-2">
            {counts.failed > 0 && onRetryAllTransient ? (
              <button
                type="button"
                onClick={handleRetryAllClick}
                disabled={retryingAll}
                className={`${btn.primary} text-[11px] py-1 px-3 cursor-pointer`}
                title={
                  lang === "th"
                    ? "สั่งรันใหม่เฉพาะรายการที่ขัดข้องชั่วคราว (เช่น Timeout หรือเครือข่ายขัดข้อง) โดยไม่แตะต้องข้อผิดพลาดถาวร"
                    : "Retry only transient failures (e.g. timeouts or network issues) without touching permanent errors"
                }
              >
                {retryingAll ? (
                  <span className="animate-spin inline-block mr-1">↻</span>
                ) : (
                  <span className="inline-block mr-1">↻</span>
                )}
                {lang === "th"
                  ? "สั่งรันใหม่เฉพาะรายการขัดข้องชั่วคราว (Retry All Transient)"
                  : "Retry All Transient"}
              </button>
            ) : null}
          </div>
        }
        sub={
          lang === "th"
            ? "เฝ้าระวังและจัดการงานใน Pipeline ทุกขั้นตอน (ดาวน์โหลด, OCR, สกัดข้อความด้วย AI) พร้อมตัวกรองตามขั้นตอนและคำสั่งควบคุมรายโครงการ"
            : "Monitor and manage pipeline tasks across all phases (Download, OCR, AI Extraction) with phase filters and granular row controls."
        }
      >
        {lang === "th" ? "การเฝ้าระวังและควบคุม Pipeline" : "Pipeline Monitoring & Control"}
      </SectionHeading>

      {/* Action Notification Alert */}
      {currentMsg && (
        <div
          className={`mb-3 rounded-[3px] border px-3 py-2 text-[12px] ${
            currentMsg.type === "success"
              ? "border-open-line bg-open-bg text-open"
              : "border-risk-line bg-risk-bg text-risk"
          }`}
        >
          {currentMsg.text}
        </div>
      )}

      {/* Phase Filter Tabs */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5 border-b border-line pb-2">
        {PHASE_TABS.map((tab) => {
          const isActive = activePhase === tab.key;
          const count = counts[tab.key] ?? 0;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => handlePhaseChange(tab.key)}
              className={`flex items-center gap-2 px-3 py-1.5 text-[12px] font-medium transition-colors cursor-pointer rounded-t-[3px] border ${
                isActive
                  ? "border-b-transparent border-line bg-surface text-ink font-semibold shadow-xs"
                  : "border-transparent text-ink-3 hover:text-ink hover:bg-surface-2/60"
              }`}
            >
              <span>{tab.label[lang]}</span>
              <span
                className={`rounded-[2px] px-1.5 py-[1px] font-mono text-[10px] ${
                  tab.key === "failed" && count > 0
                    ? "bg-risk-bg text-risk border border-risk-line"
                    : isActive
                      ? "bg-surface-2 text-ink"
                      : "bg-surface-2/60 text-ink-3"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search & Utility Bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 max-w-md w-full">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              lang === "th"
                ? "ค้นหาตามรหัสโครงการ, ชื่อ หรือหน่วยงาน..."
                : "Search by project ID, title, or agency..."
            }
            className={`${input} text-[12px] h-8 w-full font-sans`}
          />
          <button type="submit" className={`${btn.secondary} text-[11px] h-8 px-3 cursor-pointer`}>
            {lang === "th" ? "ค้นหา" : "Search"}
          </button>
        </form>

        <div className="flex items-center gap-2 text-[11px] text-ink-3">
          <span>
            {lang === "th" ? "พบทั้งหมด" : "Found"} {total} {lang === "th" ? "รายการ" : "items"}
          </span>
          <button
            type="button"
            onClick={fetchTasks}
            disabled={isLoading}
            className={`${btn.ghost} text-[11px] p-1.5 cursor-pointer`}
            title={lang === "th" ? "รีเฟรชตาราง" : "Refresh table"}
          >
            <span className={isLoading ? "animate-spin inline-block" : ""}>↻</span>
          </button>
        </div>
      </div>

      {/* Main Table */}
      {isLoading && tasks.length === 0 ? (
        <Panel className="p-8 text-center text-[12px] text-ink-3">
          <span className="animate-spin inline-block mr-2 text-[14px]">↻</span>
          {lang === "th" ? "กำลังโหลดข้อมูล Pipeline..." : "Loading pipeline tasks..."}
        </Panel>
      ) : tasks.length === 0 ? (
        <Panel className="p-6 flex items-center justify-between border-dashed">
          <div className="flex items-center gap-2.5">
            <span className="text-open text-[16px] font-bold">✓</span>
            <span className="text-[13px] leading-thai text-ink-2 font-medium">
              {lang === "th"
                ? "ไม่พบรายการงานในหมวดหมู่นี้ หรือการค้นหาไม่ตรงกับรายการใด"
                : "No tasks found matching this phase filter or search query."}
            </span>
          </div>
          <span className="text-[11px] text-ink-3">0 tasks</span>
        </Panel>
      ) : (
        <Panel className="overflow-x-auto shadow-xs">
          <table className="w-full min-w-[920px] border-collapse text-left">
            <thead>
              <tr className="border-b border-line bg-surface-2">
                {[
                  { text: lang === "th" ? "รหัส / โครงการ" : "Project", right: false },
                  { text: lang === "th" ? "ขั้นตอน (Stage)" : "Stage / Phase", right: false },
                  { text: lang === "th" ? "สถานะ / วินิจฉัยข้อผิดพลาด" : "Status & Diagnostics", right: false },
                  { text: lang === "th" ? "พยายาม" : "Attempts", right: true },
                  { text: lang === "th" ? "อัปเดตล่าสุด" : "Updated", right: true },
                  { text: lang === "th" ? "คำสั่งควบคุม" : "Actions", right: true },
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
              {tasks.map((task) => (
                <PipelineTaskRow
                  key={`${task.projectId}-${task.step}`}
                  task={task}
                  lang={lang}
                  onInspect={onInspect}
                  onRetry={handleRowRetry}
                  onSkip={handleSkip}
                  onDismiss={handleRowDismiss}
                  isRetrying={retryingStep === `${task.projectId}-${task.step}`}
                  isSkipping={skippingStep === `${task.projectId}-${task.step}`}
                  isDismissing={dismissingStep === `${task.projectId}-${task.step}`}
                />
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between text-[11px] text-ink-3">
          <span>
            {lang === "th" ? "หน้า" : "Page"} {page} {lang === "th" ? "จาก" : "of"} {totalPages}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || isLoading}
              className={`${btn.secondary} text-[11px] py-1 px-2.5 cursor-pointer disabled:opacity-40`}
            >
              {lang === "th" ? "ย้อนกลับ" : "Previous"}
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || isLoading}
              className={`${btn.secondary} text-[11px] py-1 px-2.5 cursor-pointer disabled:opacity-40`}
            >
              {lang === "th" ? "ถัดไป" : "Next"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function PipelineTaskRow({
  task,
  lang,
  onInspect,
  onRetry,
  onSkip,
  onDismiss,
  isRetrying,
  isSkipping,
  isDismissing,
}: {
  task: PipelineTaskItem;
  lang: "th" | "en";
  onInspect: (projectId: string) => void;
  onRetry: (projectId: string, step: string, runNow: boolean) => Promise<void>;
  onSkip: (projectId: string, step: string) => Promise<void>;
  onDismiss: (projectId: string, step: string) => Promise<void>;
  isRetrying: boolean;
  isSkipping: boolean;
  isDismissing: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = () => {
    if (task.lastError) {
      navigator.clipboard.writeText(task.lastError);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const isFailed = task.phase === "failed" || Boolean(task.lastError);
  const isCanSkip = task.phase === "download" || task.phase === "ocr" || task.step === "download" || task.step === "ocr";

  return (
    <tr className="border-b border-line align-top last:border-b-0 hover:bg-surface-2/40 transition-colors">
      {/* Project ID & Info */}
      <td className="px-3 py-2.5 max-w-[260px]">
        <button
          type="button"
          onClick={() => onInspect(task.projectId)}
          className="font-mono text-[12px] font-bold text-ink hover:text-open hover:underline cursor-pointer text-left block"
          title={lang === "th" ? "คลิกเพื่อตรวจสอบสถานะรายโครงการ" : "Click to inspect record"}
        >
          {task.projectId} 🔍
        </button>
        <p className="text-[12px] leading-thai text-ink font-medium line-clamp-1 mt-0.5">
          {task.title}
        </p>
        <p className="text-[11px] text-ink-3 line-clamp-1">{task.agency}</p>
      </td>

      {/* Stage / Phase Badge */}
      <td className="px-3 py-2.5 whitespace-nowrap">
        {task.phase === "failed" ? (
          <span className="inline-flex items-center gap-1 rounded-[2px] border border-risk-line bg-risk-bg px-2 py-[2px] text-[10px] font-semibold text-risk">
            <span>⚠️</span>
            <span>{task.step ? `${task.step}` : "Failed"}</span>
          </span>
        ) : task.phase === "download" ? (
          <span className="inline-flex rounded-[2px] border border-line bg-surface-2 px-2 py-[2px] text-[10px] font-medium text-ink">
            {lang === "th" ? "1. รอโหลด (Download)" : "1. Download"}
          </span>
        ) : task.phase === "ocr" ? (
          <span className="inline-flex rounded-[2px] border border-line bg-surface-2 px-2 py-[2px] text-[10px] font-medium text-ink">
            {lang === "th" ? "2. ประมวลผล OCR" : "2. OCR Processing"}
          </span>
        ) : task.phase === "extract" ? (
          <span className="inline-flex rounded-[2px] border border-amend-line bg-amend-bg px-2 py-[2px] text-[10px] font-medium text-amend">
            {lang === "th" ? "3. กำลังสกัด AI" : "3. AI Extracting"}
          </span>
        ) : (
          <span className="inline-flex rounded-[2px] border border-open-line bg-open-bg px-2 py-[2px] text-[10px] font-medium text-open">
            {lang === "th" ? "✓ สกัดสำเร็จ" : "✓ Extracted"}
          </span>
        )}
        <div className="mt-1 font-mono text-[10px] text-ink-3">
          status: {task.pipelineStatus}
        </div>
      </td>

      {/* Diagnostics / Error / Nature */}
      <td className="px-3 py-2.5 max-w-[300px]">
        {isFailed ? (
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              {task.lastTransient ? (
                <span className="inline-flex rounded-[2px] border border-amend-line bg-amend-bg px-1.5 py-[1px] text-[10px] font-medium text-amend">
                  {lang === "th" ? "⚠️ ขัดข้องชั่วคราว" : "⚠️ Transient"}
                </span>
              ) : (
                <span className="inline-flex rounded-[2px] border border-risk-line bg-risk-bg px-1.5 py-[1px] text-[10px] font-medium text-risk">
                  {lang === "th" ? "❌ ผิดพลาดถาวร" : "❌ Defect"}
                </span>
              )}
            </div>
            <p className="text-[11px] leading-relaxed text-risk line-clamp-2">
              {task.lastError || "Unknown error encountered"}
            </p>
            {task.lastError && (
              <div className="mt-1 flex items-center gap-2">
                {task.lastError.length > 60 && (
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
                    ? lang === "th" ? "✓ คัดลอกแล้ว" : "✓ Copied"
                    : lang === "th" ? "📋 คัดลอก" : "📋 Copy"}
                </button>
              </div>
            )}
            {isExpanded && task.lastError && (
              <pre className="mt-2 p-2 rounded-[2px] border border-line bg-surface font-mono text-[10px] text-ink-2 whitespace-pre-wrap max-h-48 overflow-y-auto">
                {task.lastError}
              </pre>
            )}
          </div>
        ) : (
          <div className="text-[11px] text-ink-3">
            {task.phase === "extracted" ? (
              <span className="text-open">{lang === "th" ? "พร้อมให้ตรวจสอบหรือเผยแพร่" : "Extracted & ready"}</span>
            ) : (
              <span>{lang === "th" ? "กำลังดำเนินตามกระบวนการ" : "Processing as scheduled"}</span>
            )}
          </div>
        )}
      </td>

      {/* Attempts */}
      <td className="px-3 py-2.5 text-right font-mono tnum text-[12px] text-ink whitespace-nowrap">
        {task.attempts > 0 ? (
          <span className={task.attempts >= 3 ? "text-risk font-bold" : ""}>
            {task.attempts} / 3
          </span>
        ) : (
          <span className="text-ink-3">-</span>
        )}
      </td>

      {/* Last Updated */}
      <td className="px-3 py-2.5 text-right font-mono tnum text-[11px] text-ink-3 whitespace-nowrap">
        {task.updatedAt}
      </td>

      {/* Row Control Actions */}
      <td className="px-3 py-2.5 text-right whitespace-nowrap">
        <div className="flex items-center justify-end gap-1.5 flex-wrap">
          {/* Retry / Run Now Controls */}
          <button
            type="button"
            onClick={() => onRetry(task.projectId, task.step || "download", false)}
            disabled={isRetrying || isSkipping || isDismissing}
            className={`${btn.secondary} text-[11px] py-1 px-2.5 cursor-pointer`}
            title={
              lang === "th"
                ? "เคลียร์ข้อผิดพลาดและส่งเข้าคิวรอรอบเวลาปกติ"
                : "Clear error and queue for next scheduled cycle"
            }
          >
            {isRetrying ? (
              <span className="animate-spin inline-block mr-1">↻</span>
            ) : (
              <span className="inline-block mr-1">↻</span>
            )}
            {lang === "th" ? "เข้าคิวใหม่" : "Re-queue"}
          </button>

          <button
            type="button"
            onClick={() => onRetry(task.projectId, task.step || "download", true)}
            disabled={isRetrying || isSkipping || isDismissing}
            className={`${btn.primary} text-[11px] py-1 px-2.5 cursor-pointer`}
            title={
              lang === "th"
                ? "สั่งรันขั้นตอนนี้ทันทีโดยไม่ต้องรอรอบเวลา"
                : "Execute step immediately on-demand"
            }
          >
            {lang === "th" ? "รันทันที" : "Run Now"}
          </button>

          {/* Skip Step Control */}
          {isCanSkip && (
            <button
              type="button"
              onClick={() => onSkip(task.projectId, task.step || "download")}
              disabled={isRetrying || isSkipping || isDismissing}
              className={`${btn.secondary} text-[11px] py-1 px-2 cursor-pointer border-amend-line text-amend hover:bg-amend-bg`}
              title={
                lang === "th"
                  ? "ข้ามขั้นตอนที่ติดขัดนี้ไปยังขั้นตอนถัดไป"
                  : "Skip stuck step and advance project"
              }
            >
              {isSkipping ? (
                <span className="animate-spin inline-block mr-1">↻</span>
              ) : null}
              {lang === "th" ? "ข้ามขั้น" : "Skip"}
            </button>
          )}

          {/* Dismiss Failure Control */}
          {isFailed && (
            <button
              type="button"
              onClick={() => onDismiss(task.projectId, task.step || "download")}
              disabled={isRetrying || isSkipping || isDismissing}
              className={`${btn.ghost} text-[11px] py-1 px-2 text-ink-3 hover:text-risk cursor-pointer`}
              title={lang === "th" ? "ละเว้นข้อผิดพลาดนี้อย่างถาวร" : "Dismiss failure permanently"}
            >
              {isDismissing ? (
                <span className="animate-spin inline-block mr-1">↻</span>
              ) : null}
              {lang === "th" ? "ละเว้น" : "Dismiss"}
            </button>
          )}

          {/* Inspect Button */}
          <button
            type="button"
            onClick={() => onInspect(task.projectId)}
            className={`${btn.ghost} text-[11px] py-1 px-2 text-ink-3 hover:text-ink cursor-pointer`}
            title={lang === "th" ? "ตรวจสอบสถานะรายโครงการ" : "Inspect record"}
          >
            🔍
          </button>
        </div>
      </td>
    </tr>
  );
}
