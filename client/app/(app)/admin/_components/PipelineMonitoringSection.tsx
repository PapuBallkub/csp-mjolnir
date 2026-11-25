"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  adminGetPipelineTasks,
  type PipelineTaskItem,
  type GetPipelineTasksResult,
} from "../../../_lib/api";
import { btn, input, Panel, SectionHeading } from "../../../_components/ui";

type PhaseKey = "all" | "download" | "ocr" | "extract" | "extracted" | "failed";

interface PhaseTabConfig {
  key: PhaseKey;
  label: string;
  badgeColor?: string;
}

const PHASE_TABS: PhaseTabConfig[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "download", label: "1. รอโหลด" },
  { key: "ocr", label: "2. รอ OCR" },
  { key: "extract", label: "3. รอสกัด AI" },
  { key: "extracted", label: "4. สกัดสำเร็จ" },
  { key: "failed", label: "5. ขัดข้อง/ล้มเหลว" },
];

function PipelineTaskTableSkeleton() {
  return (
    <>
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
        <tr key={i} className="animate-pulse border-b border-line align-top last:border-b-0">
          {/* Project ID & Info */}
          <td className="px-3 py-2.5 max-w-[260px]">
            <div className="h-4 w-32 rounded-full bg-surface-3 mb-1.5" />
            <div className="h-3 w-48 max-w-full rounded-full bg-surface-2 mb-1" />
            <div className="h-2.5 w-28 max-w-full rounded-full bg-surface-2" />
          </td>
          {/* Stage / Phase */}
          <td className="px-3 py-2.5">
            <div className="h-5 w-20 rounded-full bg-surface-3" />
          </td>
          {/* Status & Diagnostics */}
          <td className="px-3 py-2.5">
            <div className="h-4 w-24 rounded-full bg-surface-3 mb-1.5" />
            <div className="h-3 w-40 max-w-full rounded-full bg-surface-2" />
          </td>
          {/* Attempts */}
          <td className="px-3 py-2.5 text-right">
            <div className="h-4 w-8 rounded-full bg-surface-3 ml-auto" />
          </td>
          {/* Updated */}
          <td className="px-3 py-2.5 text-right">
            <div className="h-3.5 w-20 rounded-full bg-surface-3 ml-auto" />
          </td>
          {/* Actions */}
          <td className="px-3 py-2.5 text-right">
            <div className="flex items-center justify-end gap-1.5">
              <div className="h-7 w-20 rounded-full bg-surface-3" />
              <div className="h-7 w-7 rounded-full bg-surface-2" />
            </div>
          </td>
        </tr>
      ))}
    </>
  );
}

export function PipelineMonitoringSection({
  onInspect,
  onRetry,
  onRetryAllTransient,
  onDismiss,
  retryingStep,
  retryingAll,
  dismissingStep,
  actionMsg,
}: {
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
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit] = useState(10);

  const [tasksData, setTasksData] = useState<GetPipelineTasksResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Debounce search input by 300ms
  useEffect(() => {
    if (searchInput.trim() === debouncedSearch) return;
    const timer = setTimeout(() => {
      setIsLoading(true);
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, debouncedSearch]);

  const fetchTasks = useCallback(async () => {
    setIsLoading(true);
    const res = await adminGetPipelineTasks({
      phase: activePhase,
      search: debouncedSearch,
      page,
      limit,
    });
    setIsLoading(false);
    if (res.ok) {
      setTasksData(res.data);
    }
  }, [activePhase, debouncedSearch, page, limit]);

  useEffect(() => {
    let cancelled = false;
    adminGetPipelineTasks({
      phase: activePhase,
      search: debouncedSearch,
      page,
      limit,
    }).then((res) => {
      if (cancelled) return;
      setIsLoading(false);
      if (res.ok) {
        setTasksData(res.data);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [activePhase, debouncedSearch, page, limit]);

  const handlePhaseChange = (phase: PhaseKey) => {
    setIsLoading(true);
    setActivePhase(phase);
    setPage(1);
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

  return (
    <section className="mb-8 w-full">
      <SectionHeading
        right={
          <div className="flex flex-wrap items-center gap-2">
            {counts.failed > 0 && onRetryAllTransient ? (
              <button
                type="button"
                onClick={handleRetryAllClick}
                disabled={retryingAll}
                className={`${btn.primary} text-[11px] py-1 px-3 cursor-pointer`}
                title="สั่งรันใหม่เฉพาะรายการที่ขัดข้องชั่วคราว (เช่น Timeout หรือเครือข่ายขัดข้อง) โดยไม่แตะต้องข้อผิดพลาดถาวร"
              >
                {retryingAll ? (
                  <span className="animate-spin inline-block mr-1">↻</span>
                ) : (
                  <span className="inline-block mr-1">↻</span>
                )}
                สั่งรันใหม่เฉพาะรายการขัดข้องชั่วคราว (Retry All Transient)
              </button>
            ) : null}
          </div>
        }
        sub="เฝ้าระวังความคืบหน้าของ Pipeline อัตโนมัติทุกขั้นตอน พร้อมคำสั่งสั่งรันใหม่และแก้ไขสำหรับงานที่เกิดข้อผิดพลาด"
      >
        การเฝ้าระวังและควบคุม Pipeline
      </SectionHeading>

      {/* Action Notification Alert */}
      {actionMsg && (
        <div
          className={`mb-3 rounded-xl border px-3.5 py-2 text-[12px] ${
            actionMsg.type === "success"
              ? "border-open-line bg-open-bg text-open"
              : "border-risk-line bg-risk-bg text-risk"
          }`}
        >
          {actionMsg.text}
        </div>
      )}

      {/* Phase Filter Tabs */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5 border-b border-line pb-3">
        {PHASE_TABS.map((tab) => {
          const isActive = activePhase === tab.key;
          const count = counts[tab.key] ?? 0;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => handlePhaseChange(tab.key)}
              className={`flex items-center gap-2 px-3 py-1.5 text-[12px] font-medium transition-colors cursor-pointer rounded-full border ${
                isActive
                  ? "border-ink bg-ink text-surface font-semibold shadow-xs"
                  : "border-line bg-surface text-ink-2 hover:text-ink hover:bg-surface-2"
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`rounded-full px-1.5 py-[1px] font-mono text-[10px] ${
                  tab.key === "failed" && count > 0
                    ? "bg-risk-bg text-risk border border-risk-line"
                    : isActive
                      ? "bg-surface/20 text-surface"
                      : "bg-surface-2 text-ink-3"
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
        <div className="relative w-full sm:w-72">
          <span className="absolute inset-y-0 left-2.5 flex items-center text-ink-3 pointer-events-none text-[12px]">
            🔍
          </span>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="ค้นหาตามรหัสโครงการ, ชื่อ หรือหน่วยงาน..."
            className={`${input} text-[12px] h-8 w-full pl-8 pr-7 font-sans`}
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              className="absolute inset-y-0 right-2 flex items-center text-ink-3 hover:text-ink text-[12px] cursor-pointer"
              title="ล้างคำค้นหา"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 text-[11px] text-ink-3">
          <span>
            พบทั้งหมด {total} รายการ
          </span>
          <button
            type="button"
            onClick={fetchTasks}
            disabled={isLoading}
            className={`${btn.ghost} text-[11px] p-1.5 cursor-pointer`}
            title="รีเฟรชตาราง"
          >
            <span className={isLoading ? "animate-spin inline-block" : ""}>↻</span>
          </button>
        </div>
      </div>

      {/* Main Table */}
      <Panel className="w-full overflow-x-auto shadow-xs">
        <table className="w-full min-w-[820px] border-collapse text-left">
          <thead>
            <tr className="border-b border-line bg-surface-2">
              {[
                { text: "รหัส / โครงการ", right: false },
                { text: "ขั้นตอน (Stage)", right: false },
                { text: "สถานะ / วินิจฉัยข้อผิดพลาด", right: false },
                { text: "พยายาม", right: true, width: "w-24" },
                { text: "อัปเดตล่าสุด", right: true },
                { text: "คำสั่งควบคุม", right: true },
              ].map((col) => (
                <th
                  key={col.text}
                  className={`px-3 py-2.5 text-[11px] font-medium text-ink-3 whitespace-nowrap ${
                    col.right ? "text-right" : ""
                  } ${col.width || ""}`}
                >
                  {col.text}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <PipelineTaskTableSkeleton />
            ) : tasks.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-ink-3">
                  <div className="flex flex-col items-center justify-center gap-1.5">
                    <span className="text-open text-[18px] font-bold">✓</span>
                    <span className="text-[13px] font-medium text-ink-2">
                      ไม่พบรายการงานในหมวดหมู่นี้ หรือการค้นหาไม่ตรงกับรายการใด
                    </span>
                    <span className="text-[11px] text-ink-3 font-mono">0 tasks</span>
                  </div>
                </td>
              </tr>
            ) : (
              tasks.map((task) => (
                <PipelineTaskRow
                  key={`${task.projectId}-${task.step}`}
                  task={task}
                  onInspect={onInspect}
                  onRetry={handleRowRetry}
                  onDismiss={handleRowDismiss}
                  isRetrying={retryingStep === `${task.projectId}-${task.step}`}
                  isDismissing={dismissingStep === `${task.projectId}-${task.step}`}
                />
              ))
            )}
          </tbody>
        </table>
      </Panel>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between text-[11px] text-ink-3">
          <span>
            หน้า {page} จาก {totalPages}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || isLoading}
              className={`${btn.secondary} text-[11px] py-1 px-2.5 cursor-pointer disabled:opacity-40`}
            >
              ย้อนกลับ
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || isLoading}
              className={`${btn.secondary} text-[11px] py-1 px-2.5 cursor-pointer disabled:opacity-40`}
            >
              ถัดไป
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function PipelineTaskRow({
  task,
  onInspect,
  onRetry,
  onDismiss,
  isRetrying,
  isDismissing,
}: {
  task: PipelineTaskItem;
  onInspect: (projectId: string) => void;
  onRetry: (projectId: string, step: string, runNow: boolean) => Promise<void>;
  onDismiss: (projectId: string, step: string) => Promise<void>;
  isRetrying: boolean;
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

  const getStatusText = () => {
    if (task.phase === "failed") {
      return "ข้อผิดพลาด";
    }
    if (task.phase === "extracted" || task.pipelineStatus === "extracted") {
      return "สกัดสำเร็จ";
    }
    if (task.phase === "extract" || task.pipelineStatus === "ocr_done") {
      return "OCR เสร็จสิ้น";
    }
    if (task.pipelineStatus === "ocr_preview") {
      return "OCR พรีวิว";
    }
    if (task.phase === "ocr" || task.pipelineStatus === "downloaded") {
      return "ดาวน์โหลดแล้ว";
    }
    return "พบประกาศ";
  };

  return (
    <tr className="border-b border-line align-top last:border-b-0 hover:bg-surface-2/40 transition-colors">
      {/* Project ID & Info */}
      <td className="px-3 py-2.5 max-w-[260px]">
        <button
          type="button"
          onClick={() => onInspect(task.projectId)}
          className="font-mono text-[12px] font-bold text-ink hover:text-open hover:underline cursor-pointer text-left block"
          title="คลิกเพื่อตรวจสอบสถานะรายโครงการ"
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
          <span className="inline-flex items-center gap-1 rounded-full border border-risk-line bg-risk-bg px-2.5 py-[2px] text-[10px] font-semibold text-risk">
            <span>⚠️</span>
            <span>{task.step ? `${task.step}` : "Failed"}</span>
          </span>
        ) : task.phase === "download" ? (
          <span className="inline-flex rounded-full border border-line bg-surface-2 px-2.5 py-[2px] text-[10px] font-medium text-ink">
            1. รอโหลด
          </span>
        ) : task.phase === "ocr" ? (
          <span className="inline-flex rounded-full border border-line bg-surface-2 px-2.5 py-[2px] text-[10px] font-medium text-ink">
            2. รอ OCR
          </span>
        ) : task.phase === "extract" ? (
          <span className="inline-flex rounded-full border border-amend-line bg-amend-bg px-2.5 py-[2px] text-[10px] font-medium text-amend">
            3. รอสกัด AI
          </span>
        ) : (
          <span className="inline-flex rounded-full border border-open-line bg-open-bg px-2.5 py-[2px] text-[10px] font-medium text-open">
            ✓ สกัดสำเร็จ
          </span>
        )}
        <div className="mt-1 font-mono text-[10px] text-ink-3">
          status: {getStatusText()}
        </div>
      </td>

      {/* Diagnostics / Error / Nature */}
      <td className="px-3 py-2.5 max-w-[300px]">
        {isFailed ? (
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              {task.lastTransient ? (
                <span className="inline-flex rounded-full border border-amend-line bg-amend-bg px-2 py-[1px] text-[10px] font-medium text-amend">
                  ⚠️ ขัดข้องชั่วคราว
                </span>
              ) : (
                <span className="inline-flex rounded-full border border-risk-line bg-risk-bg px-2 py-[1px] text-[10px] font-medium text-risk">
                  ❌ ผิดพลาดถาวร
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
                    {isExpanded ? "ย่อ" : "ดูเต็ม..."}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleCopy}
                  className="text-[10px] text-ink-3 hover:text-ink cursor-pointer"
                >
                  {isCopied ? "✓ คัดลอกแล้ว" : "📋 คัดลอก"}
                </button>
              </div>
            )}
            {isExpanded && task.lastError && (
              <pre className="mt-2 p-2.5 rounded-lg border border-line bg-surface font-mono text-[10px] text-ink-2 whitespace-pre-wrap max-h-48 overflow-y-auto">
                {task.lastError}
              </pre>
            )}
          </div>
        ) : (
          <div className="text-[11px]">
            {task.phase === "extracted" ? (
              <span className="text-open flex items-center gap-1 font-medium">
                <span>✓</span>
                <span>สกัดข้อมูลสมบูรณ์ (พร้อมใช้งาน)</span>
              </span>
            ) : task.phase === "extract" ? (
              <span className="text-ink-2">
                OCR เรียบร้อย รอคิวสกัดโครงสร้าง AI
              </span>
            ) : task.phase === "ocr" ? (
              <span className="text-ink-2">
                {task.pipelineStatus === "ocr_preview"
                  ? "OCR พรีวิวแล้ว รอทำ OCR ฉบับเต็ม"
                  : "ดาวน์โหลดไฟล์แล้ว รอคิวทำ OCR"}
              </span>
            ) : (
              <span className="text-ink-3">
                ตรวจพบประกาศ รอคิวดาวน์โหลดไฟล์ PDF
              </span>
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

      {/* Row Control Actions: Aligned cleanly in a single horizontal row */}
      <td className="px-3 py-2.5 text-right whitespace-nowrap">
        <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
          {isFailed ? (
            <>
              {/* Re-queue is ONLY displayed for failed items */}
              <button
                type="button"
                onClick={() => onRetry(task.projectId, task.step || "download", false)}
                disabled={isRetrying || isDismissing}
                className={`${btn.secondary} text-[11px] h-7.5 px-2.5 cursor-pointer shrink-0`}
                title="เคลียร์ข้อผิดพลาดและส่งเข้าคิวรอรอบเวลาปกติ"
              >
                {isRetrying ? (
                  <span className="animate-spin inline-block mr-1">↻</span>
                ) : (
                  <span className="inline-block mr-1">↻</span>
                )}
                เข้าคิวใหม่
              </button>

              {/* Primary Action Button with retry verb */}
              <button
                type="button"
                onClick={() => onRetry(task.projectId, task.step || "download", true)}
                disabled={isRetrying || isDismissing}
                className={`${btn.primary} text-[11px] h-7.5 px-3 cursor-pointer shrink-0`}
                title="สั่งรันขั้นตอนที่ล้มเหลวทันทีโดยไม่ต้องรอรอบเวลา"
              >
                {isRetrying ? (
                  <span className="animate-spin inline-block mr-1">↻</span>
                ) : null}
                ลองใหม่ทันที
              </button>

              {/* Dismiss Failure Control */}
              <button
                type="button"
                onClick={() => onDismiss(task.projectId, task.step || "download")}
                disabled={isRetrying || isDismissing}
                className={`${btn.ghost} text-[11px] h-7.5 px-2 text-ink-3 hover:text-risk cursor-pointer shrink-0`}
                title="ละเว้นข้อผิดพลาดนี้อย่างถาวร"
              >
                {isDismissing ? (
                  <span className="animate-spin inline-block mr-1">↻</span>
                ) : null}
                ละเว้น
              </button>

              {/* Inspect Button */}
              <button
                type="button"
                onClick={() => onInspect(task.projectId)}
                className={`${btn.ghost} text-[11px] h-7.5 w-7.5 flex items-center justify-center p-0 text-ink-3 hover:text-ink cursor-pointer shrink-0`}
                title="ตรวจสอบสถานะรายโครงการ"
              >
                🔍
              </button>
            </>
          ) : (
            <>
              {/* For extracted items: link to TOR detail page */}
              {task.phase === "extracted" && (
                <Link
                  href={`/tor/${task.projectId}`}
                  className={`${btn.secondary} text-[11px] h-7.5 px-2.5 inline-flex items-center gap-1 shrink-0 text-ink-2 hover:text-ink`}
                  title="เปิดดูหน้าประกาศและผลวิเคราะห์ TOR"
                >
                  <span>📄</span>
                  <span>ดูประกาศ</span>
                </Link>
              )}

              {/* Inspect Button for normal monitoring rows */}
              <button
                type="button"
                onClick={() => onInspect(task.projectId)}
                className={`${btn.secondary} text-[11px] h-7.5 px-2.5 inline-flex items-center gap-1 shrink-0 text-ink hover:text-open cursor-pointer`}
                title="ตรวจสอบสถานะและข้อมูลดิบรายโครงการ"
              >
                <span>🔍</span>
                <span>ตรวจสอบ</span>
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
