"use client";

import { useEffect, useState } from "react";
import {
  adminAddPipelineRecord,
  adminDismissPipelineFailure,
  adminGetPipelineRecord,
  adminOperations,
  adminReExtract,
  adminRetryPipelineStep,
  adminTriggerIngest,
  adminUpdateReview,
  type AdminOperations,
  type ApiError,
  type PipelineRecordDiagnostics,
  type ReviewItem,
  type SourceHealth,
  type UpdateReviewPayload,
} from "../../_lib/api";
import { useLang } from "../../_components/prefs";
import { SignInPrompt } from "../../_components/sign-in-prompt";
import { btn, EmptyState, input, Label, Panel, SectionHeading } from "../../_components/ui";

/**
 * Operational surface, not a marketing one: dense tables, real failure text,
 * and the correction controls sitting next to the thing they correct. The
 * numeric OCR/LLM confidence lives here and only here (§5).
 */

const HEALTH: Record<SourceHealth, { chip: string; label: { th: string; en: string } }> = {
  ok: {
    chip: "border-open-line bg-open-bg text-open",
    label: { th: "ปกติ", en: "Healthy" },
  },
  degraded: {
    chip: "border-amend-line bg-amend-bg text-amend",
    label: { th: "ไม่เสถียร", en: "Degraded" },
  },
  failed: {
    chip: "border-risk-line bg-risk-bg text-risk",
    label: { th: "ล้มเหลว", en: "Failing" },
  },
};

function confidenceTone(value: number): string {
  if (value < 0.7) return "bg-risk";
  if (value < 0.85) return "bg-amend";
  return "bg-open";
}

function ConfidenceBar({ value, label }: { value: number; label: string }) {
  return (
    <span className="flex items-center gap-2 whitespace-nowrap">
      <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">{label}</span>
      <span className="relative h-[4px] w-16 overflow-hidden rounded-full bg-line">
        <span
          className={`absolute inset-y-0 left-0 rounded-full ${confidenceTone(value)}`}
          style={{ width: `${value * 100}%` }}
        />
      </span>
      <span className="font-mono tnum text-[12px] text-ink">{Math.round(value * 100)}%</span>
    </span>
  );
}

/**
 * Loads the dashboard, and is the only thing on this route that runs for a
 * non-admin.
 *
 * The data is not in the bundle. It arrives from /api/admin/operations behind
 * requireRole('admin'), so a guest gets 401 and an ordinary user gets 403,
 * each with nothing attached. That is the actual protection — this component
 * only decides what to say about it. Hiding the nav link never protected
 * anything, because a JavaScript chunk cannot be hidden from the browser it
 * was sent to. See 0011.
 */
export default function AdminPage() {
  const { lang } = useLang();
  const [ops, setOps] = useState<AdminOperations | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadOperations = async () => {
    setIsRefreshing(true);
    const result = await adminOperations();
    setIsRefreshing(false);
    if (result.ok) {
      setOps(result.data);
      setError(null);
    } else {
      setError(result.error);
    }
  };

  useEffect(() => {
    let cancelled = false;

    adminOperations().then((result) => {
      if (cancelled) return;
      if (result.ok) setOps(result.data);
      else setError(result.error);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (error?.status === 401) {
    return (
      <div className="mx-auto max-w-[1240px] px-4 py-10">
        <SignInPrompt
          next="/admin"
          headline={lang === "th" ? "ส่วนนี้สำหรับผู้ดูแลระบบ" : "This area is for administrators"}
          body={
            lang === "th"
              ? "เข้าสู่ระบบด้วยบัญชีผู้ดูแลเพื่อดูสถานะ scraper และคิวตรวจทาน"
              : "Sign in with an administrator account to see scraper health and the review queue."
          }
          cta={lang === "th" ? "เข้าสู่ระบบ" : "Sign in"}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-[1240px] px-4 py-10">
        <EmptyState
          headline={
            error.status === 403
              ? lang === "th"
                ? "บัญชีของคุณไม่มีสิทธิ์เข้าถึงส่วนนี้"
                : "Your account does not have access to this area"
              : lang === "th"
                ? "โหลดข้อมูลไม่สำเร็จ"
                : "Could not load the dashboard"
          }
          body={
            error.status === 403
              ? lang === "th"
                ? "ส่วนนี้จำกัดเฉพาะผู้ดูแลระบบ หากคุณควรมีสิทธิ์ ให้ติดต่อคนในทีมเพื่อกำหนดบทบาทให้"
                : "Administrator accounts only. If you should have access, ask a teammate to grant it."
              : error.message
          }
        />
      </div>
    );
  }

  if (!ops) {
    return <div className="mx-auto min-h-[60vh] max-w-[1240px] px-4 py-10" aria-busy="true" />;
  }

  return (
    <AdminDashboard
      ops={ops}
      lang={lang}
      onRefresh={loadOperations}
      isRefreshing={isRefreshing}
    />
  );
}

function AdminDashboard({
  ops,
  lang,
  onRefresh,
  isRefreshing,
}: {
  ops: AdminOperations;
  lang: "th" | "en";
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  const { sources: scraperSources, reviewQueue, stats: pipelineStats, recentLogs } = ops;
  const [expanded, setExpanded] = useState<string | null>(reviewQueue[0]?.docId ?? null);
  const [handled, setHandled] = useState<Record<string, string>>({});
  const [isPolling, setIsPolling] = useState(false);
  const [pollingSource, setPollingSource] = useState<string | null>(null);
  const [pollMessage, setPollMessage] = useState<string | null>(null);

  // Pipeline Monitoring & Diagnostics State (FR-24)
  const [retryingStep, setRetryingStep] = useState<string | null>(null);
  const [dismissingStep, setDismissingStep] = useState<string | null>(null);
  const [pipelineActionMsg, setPipelineActionMsg] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);
  const [expandedFailureId, setExpandedFailureId] = useState<string | null>(null);
  const [showJobHistory, setShowJobHistory] = useState(false);

  // Record Diagnostic Inspector & Manual Addition State (FR-24)
  const [searchInspectorId, setSearchInspectorId] = useState("");
  const [inspectingProjectId, setInspectingProjectId] = useState<string | null>(null);
  const [diagnosticRecord, setDiagnosticRecord] = useState<PipelineRecordDiagnostics | null>(null);
  const [isInspectorLoading, setIsInspectorLoading] = useState(false);
  const [inspectorError, setInspectorError] = useState<string | null>(null);

  // Manual Add Modal State (FR-24)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addProjectId, setAddProjectId] = useState("");
  const [isAddingProject, setIsAddingProject] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const handleInspect = async (projectId: string) => {
    const cleanId = projectId.trim();
    if (!cleanId) return;
    setInspectingProjectId(cleanId);
    setIsInspectorLoading(true);
    setInspectorError(null);
    const res = await adminGetPipelineRecord(cleanId);
    setIsInspectorLoading(false);
    if (res.ok) {
      setDiagnosticRecord(res.data.record);
    } else {
      setInspectorError(res.error.message);
    }
  };

  const handleQuickSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInspectorId.trim()) {
      handleInspect(searchInspectorId.trim());
    }
  };

  const handleAddProject = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = addProjectId.trim();
    if (!/^\d{11}$/.test(cleanId)) {
      setAddError(
        lang === "th"
          ? "รหัสโครงการต้องเป็นตัวเลข 11 หลัก เช่น 69099683466"
          : "e-GP project ID must be exactly 11 digits (e.g. 69099683466)",
      );
      return;
    }
    setIsAddingProject(true);
    setAddError(null);
    const res = await adminAddPipelineRecord(cleanId);
    setIsAddingProject(false);
    if (res.ok) {
      setIsAddModalOpen(false);
      setAddProjectId("");
      setPipelineActionMsg({
        type: "success",
        text:
          lang === "th"
            ? `เพิ่มโครงการ ${res.data.projectId} และดาวน์โหลดเอกสาร e-GP เรียบร้อยแล้ว`
            : `Project ${res.data.projectId} added and e-GP package downloaded successfully.`,
      });
      onRefresh();
      handleInspect(cleanId);
    } else {
      setAddError(res.error.message);
    }
  };

  const handleRetryStep = async (projectId: string, step: string) => {
    const key = `${projectId}-${step}`;
    setRetryingStep(key);
    setPipelineActionMsg(null);
    const res = await adminRetryPipelineStep(projectId, step);
    setRetryingStep(null);
    if (res.ok) {
      setPipelineActionMsg({
        type: "success",
        text:
          lang === "th"
            ? `รีเซ็ตและส่งโครงการ ${projectId} ขั้นตอน (${step}) เข้าคิวประมวลผลใหม่เรียบร้อยแล้ว`
            : `Re-queued project ${projectId} for ${step} processing.`,
      });
      onRefresh();
    } else {
      setPipelineActionMsg({
        type: "error",
        text: res.error.message,
      });
    }
  };

  const handleDismissFailure = async (projectId: string, step: string) => {
    const confirmMsg =
      lang === "th"
        ? `ยืนยันการละเว้นข้อผิดพลาดของโครงการ ${projectId} (${step})? ระบบจะยกเว้นเอกสารนี้และไม่ดึงมาประมวลผลซ้ำอีก`
        : `Confirm dismissing failure for project ${projectId} (${step})? The pipeline will exclude this document from future runs.`;
    if (!window.confirm(confirmMsg)) return;

    const key = `${projectId}-${step}`;
    setDismissingStep(key);
    setPipelineActionMsg(null);
    const res = await adminDismissPipelineFailure(projectId, step);
    setDismissingStep(null);
    if (res.ok) {
      setPipelineActionMsg({
        type: "success",
        text:
          lang === "th"
            ? `ละเว้นข้อผิดพลาดโครงการ ${projectId} (${step}) เรียบร้อยแล้ว`
            : `Dismissed failure for project ${projectId} (${step}).`,
      });
      onRefresh();
    } else {
      setPipelineActionMsg({
        type: "error",
        text: res.error.message,
      });
    }
  };

  // Review Queue Search & Filters
  const [filterTab, setFilterTab] = useState<"all" | "pending" | "misclassified" | "reviewed">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const pendingCount = reviewQueue.filter(
    (item) => !handled[item.docId] && item.reviewStatus !== "approved",
  ).length;
  const misclassifiedCount = reviewQueue.filter((item) => item.misclassified).length;

  const filteredQueue = reviewQueue.filter((item) => {
    const isHandled = Boolean(handled[item.docId]) || item.reviewStatus === "approved";
    if (filterTab === "pending" && isHandled) return false;
    if (filterTab === "misclassified" && !item.misclassified) return false;
    if (filterTab === "reviewed" && !isHandled) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchId = item.docId.toLowerCase().includes(q);
      const matchTitle = item.title.toLowerCase().includes(q);
      const matchAgency = item.agency.toLowerCase().includes(q);
      if (!matchId && !matchTitle && !matchAgency) return false;
    }
    return true;
  });

  const inMaintenance = (() => {
    const bangkokHour = (new Date().getUTCHours() + 7) % 24;
    return bangkokHour >= 0 && bangkokHour < 4;
  })();

  const handleTriggerPoll = async (sourceId: string = "all") => {
    setIsPolling(true);
    setPollingSource(sourceId);
    setPollMessage(null);
    const res = await adminTriggerIngest(sourceId);
    setIsPolling(false);
    setPollingSource(null);
    if (res.ok) {
      const maintenanceNote = inMaintenance
        ? lang === "th"
          ? " (หมายเหตุ: ขณะนี้อยู่ในช่วงปิดปรับปรุง e-GP 00:00–04:00 น. อาจไม่พบประกาศใหม่)"
          : " (Note: e-GP is currently in nightly maintenance 00:00–04:00)"
        : "";
      setPollMessage(
        (lang === "th"
          ? `ดึงข้อมูลสำเร็จ: ค้นพบ/อัปเดต ${res.data.fetched} ประกาศใหม่ (${sourceId === "all" ? "ทุกแหล่ง" : sourceId})`
          : `Ingestion poll complete: discovered ${res.data.fetched} notice(s) for ${sourceId}`) +
          maintenanceNote,
      );
      onRefresh();
    } else {
      setPollMessage(res.error.message);
    }
  };

  const stats = [
    {
      value: pipelineStats.totalIndexedTors ?? 29,
      label: { th: "เอกสารทั้งหมดในระบบ", en: "Total in catalog" },
    },
    {
      value: pipelineStats.docsIngestedToday,
      label: { th: "เอกสารเข้าวันนี้", en: "Ingested today" },
    },
    {
      value: pendingCount,
      label: { th: "รอตรวจทาน", en: "Awaiting review" },
    },
    {
      value: `${Math.round(pipelineStats.avgOcrConfidence * 100)}%`,
      label: { th: "ความมั่นใจ OCR เฉลี่ย", en: "Avg OCR confidence" },
    },
    {
      value: `${Math.round(pipelineStats.avgExtractionConfidence * 100)}%`,
      label: { th: "ความมั่นใจการสกัดข้อมูล", en: "Avg extraction confidence" },
    },
  ];

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
            {lang === "th" ? "สำหรับผู้ดูแลระบบ" : "Platform admin"}
          </p>
          <h1 className="mt-1 text-[26px] leading-tight font-semibold tracking-tight text-ink">
            {lang === "th" ? "สุขภาพระบบเก็บข้อมูลและการตรวจสอบข้อมูล" : "Pipeline Health & Data Integrity"}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Project Inspector Search (FR-24) */}
          <form onSubmit={handleQuickSearchSubmit} className="flex items-center gap-1.5">
            <input
              type="text"
              value={searchInspectorId}
              onChange={(e) => setSearchInspectorId(e.target.value)}
              placeholder={lang === "th" ? "ตรวจรหัส 11 หลัก..." : "Inspect project ID..."}
              className={`${input} h-9 w-44 font-mono text-[12px]`}
            />
            <button
              type="submit"
              disabled={!searchInspectorId.trim()}
              className={`${btn.secondary} h-9 px-3 text-[12px]`}
              title={lang === "th" ? "ตรวจสอบสถานะรายโครงการ" : "Inspect Record"}
            >
              🔍 {lang === "th" ? "ตรวจสอบ" : "Inspect"}
            </button>
          </form>

          {/* Manual Add Button (FR-24) */}
          <button
            type="button"
            onClick={() => {
              setAddProjectId("");
              setAddError(null);
              setIsAddModalOpen(true);
            }}
            className={`${btn.primary} h-9 px-3 text-[12px]`}
          >
            + {lang === "th" ? "เพิ่มโครงการ e-GP" : "Add e-GP Project"}
          </button>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing || isPolling}
            className={`${btn.secondary} h-9 px-3 text-[12px]`}
            aria-label={lang === "th" ? "รีเฟรชข้อมูล" : "Refresh data"}
          >
            {isRefreshing ? (
              <span className="animate-spin inline-block">↻</span>
            ) : (
              "↻"
            )}{" "}
            {lang === "th" ? "รีเฟรชสถานะ" : "Refresh status"}
          </button>
        </div>
      </header>

      {/* KPI Stats Strip */}
      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((stat) => (
          <Panel key={stat.label.en} className="px-3 py-2.5">
            <p className="font-mono tnum text-[24px] leading-none font-medium text-ink">
              {stat.value}
            </p>
            <p className="mt-1.5 text-[11px] leading-thai text-ink-3">{stat.label[lang]}</p>
          </Panel>
        ))}
      </div>

      {/* Pipeline Stage Funnel (FR-24) */}
      <section className="mb-8">
        <SectionHeading
          sub={
            lang === "th"
              ? "การเคลื่อนที่ของข้อมูลตามลำดับขั้น ตั้งแต่ดึงประกาศ e-GP จนถึงสกัดข้อมูลด้วย AI"
              : "End-to-end data progression from raw e-GP notice to structured AI extraction"
          }
        >
          {lang === "th" ? "โฟลว์สถานะ Pipeline" : "Pipeline stage funnel"}
        </SectionHeading>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Panel className="p-3.5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-wider text-ink-3">Stage 1</span>
                <span className="rounded-[2px] border border-line bg-surface-2 px-1.5 py-[1px] font-mono text-[10px] text-ink-2">Feed / RSS</span>
              </div>
              <p className="mt-1 font-mono tnum text-[22px] font-semibold text-ink">
                {ops.stageSnapshot?.stages?.fetched ?? 0}
              </p>
              <p className="mt-1 text-[12px] leading-thai text-ink-2 font-medium">
                {lang === "th" ? "ตรวจพบประกาศ (Fetched)" : "Discovered notices"}
              </p>
            </div>
            <p className="mt-2 text-[11px] leading-thai text-ink-3 border-t border-line/60 pt-2">
              {lang === "th" ? "ดึงผ่าน RSS process3 / CKAN data.go.th" : "Retrieved from RSS & open data portals"}
            </p>
          </Panel>

          <Panel className="p-3.5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-wider text-ink-3">Stage 2</span>
                <span className="rounded-[2px] border border-line bg-surface-2 px-1.5 py-[1px] font-mono text-[10px] text-ink-2">PDF Package</span>
              </div>
              <p className="mt-1 font-mono tnum text-[22px] font-semibold text-ink">
                {ops.stageSnapshot?.stages?.downloaded ?? 0}
              </p>
              <p className="mt-1 text-[12px] leading-thai text-ink-2 font-medium">
                {lang === "th" ? "ดาวน์โหลดเอกสารแล้ว (Downloaded)" : "PDF files downloaded"}
              </p>
            </div>
            <p className="mt-2 text-[11px] leading-thai text-ink-3 border-t border-line/60 pt-2">
              {lang === "th" ? "ไฟล์แนบ TOR และราคากลางพร้อมอ่าน" : "TOR attachments ready for text extraction"}
            </p>
          </Panel>

          <Panel className="p-3.5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-wider text-ink-3">Stage 3</span>
                <span className="rounded-[2px] border border-line bg-surface-2 px-1.5 py-[1px] font-mono text-[10px] text-ink-2">Tesseract / OCR</span>
              </div>
              <div className="flex items-baseline gap-2">
                <p className="mt-1 font-mono tnum text-[22px] font-semibold text-ink">
                  {ops.stageSnapshot?.stages?.ocr_done ?? 0}
                </p>
                {(ops.stageSnapshot?.stages?.ocr_preview ?? 0) > 0 && (
                  <span className="text-[11px] font-mono text-amend">
                    (+{ops.stageSnapshot?.stages?.ocr_preview} preview)
                  </span>
                )}
              </div>
              <p className="mt-1 text-[12px] leading-thai text-ink-2 font-medium">
                {lang === "th" ? "อ่านข้อความสำเร็จ (OCR Done)" : "OCR text ready"}
              </p>
            </div>
            <p className="mt-2 text-[11px] leading-thai text-ink-3 border-t border-line/60 pt-2">
              {lang === "th" ? "แปลงสแกน PDF เป็นข้อความดิจิทัล" : "Converted scanned PDFs to readable text"}
            </p>
          </Panel>

          <Panel className="p-3.5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-wider text-ink-3">Stage 4</span>
                <span className="rounded-[2px] border border-open-line bg-open-bg px-1.5 py-[1px] font-mono text-[10px] text-open font-medium">Gemini LLM</span>
              </div>
              <div className="flex items-baseline gap-2">
                <p className="mt-1 font-mono tnum text-[22px] font-semibold text-open">
                  {ops.stageSnapshot?.insights?.extracted ?? 0}
                </p>
                {(ops.stageSnapshot?.insights?.excluded ?? 0) > 0 && (
                  <span className="text-[11px] font-mono text-ink-3">
                    ({ops.stageSnapshot?.insights?.excluded} non-IT)
                  </span>
                )}
              </div>
              <p className="mt-1 text-[12px] leading-thai text-ink-2 font-medium">
                {lang === "th" ? "สกัดข้อมูล IT สำเร็จ (Extracted)" : "Structured TORs extracted"}
              </p>
            </div>
            <p className="mt-2 text-[11px] leading-thai text-ink-3 border-t border-line/60 pt-2">
              {lang === "th" ? "พร้อมให้ผู้ใช้ค้นหาและประเมินความเสี่ยง" : "Ready for search, matching & risk check"}
            </p>
          </Panel>
        </div>
      </section>

      {/* Stuck & Failed Tasks Table (FR-24) */}
      <section className="mb-8">
        <SectionHeading
          right={
            (ops.pipelineFailures?.length ?? 0) > 0 ? (
              <span className="rounded-[2px] border border-risk-line bg-risk-bg px-2 py-0.5 font-mono text-[11px] text-risk font-medium">
                {ops.pipelineFailures?.length} {lang === "th" ? "รายการที่ต้องแก้ไข" : "stuck task(s)"}
              </span>
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

        {pipelineActionMsg ? (
          <div
            className={`mb-3 rounded-[3px] border px-3 py-2 font-mono text-[12px] ${
              pipelineActionMsg.type === "success"
                ? "border-open-line bg-open-bg text-open"
                : "border-risk-line bg-risk-bg text-risk"
            }`}
          >
            {pipelineActionMsg.text}
          </div>
        ) : null}

        {(!ops.pipelineFailures || ops.pipelineFailures.length === 0) ? (
          <Panel className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="text-open text-[16px]">✓</span>
              <span className="text-[13px] leading-thai text-ink-2">
                {lang === "th"
                  ? "ระบบทำงานราบรื่น — ไม่มีงานที่ติดค้างในขั้นตอน Download, OCR หรือ Extraction"
                  : "All pipeline stages are healthy — no stuck or failed tasks."}
              </span>
            </div>
            <span className="font-mono text-[11px] text-ink-3">0 failures</span>
          </Panel>
        ) : (
          <Panel className="overflow-x-auto">
            <table className="w-full min-w-[880px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line bg-surface-2">
                  {[
                    { text: lang === "th" ? "รหัส / โครงการ" : "Project", right: false },
                    { text: lang === "th" ? "ขั้นตอน" : "Step", right: false },
                    { text: lang === "th" ? "ลักษณะปัญหา" : "Error Nature", right: false },
                    { text: lang === "th" ? "พยายาม" : "Attempts", right: true },
                    { text: lang === "th" ? "ข้อความแจ้งเตือนล่าสุด" : "Diagnostic message", right: false },
                    { text: lang === "th" ? "เวลาที่พบ" : "Last failed", right: true },
                    { text: lang === "th" ? "การจัดการ" : "Action", right: true },
                  ].map((col) => (
                    <th
                      key={col.text}
                      className={`px-3 py-2 text-[11px] font-medium text-ink-3 ${
                        col.right ? "text-right" : ""
                      }`}
                    >
                      {col.text}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ops.pipelineFailures.map((failure) => {
                  const isRetrying = retryingStep === `${failure.projectId}-${failure.step}`;
                  const isDismissing = dismissingStep === `${failure.projectId}-${failure.step}`;
                  const isExpanded = expandedFailureId === `${failure.projectId}-${failure.step}`;

                  return (
                    <tr
                      key={`${failure.projectId}-${failure.step}`}
                      className="border-b border-line align-top last:border-b-0 hover:bg-surface-2/40"
                    >
                      <td className="px-3 py-2.5 max-w-[280px]">
                        <button
                          type="button"
                          onClick={() => handleInspect(failure.projectId)}
                          className="font-mono text-[11px] font-semibold text-ink hover:text-open hover:underline cursor-pointer text-left block"
                          title={lang === "th" ? "คลิกเพื่อตรวจสอบสถานะรายโครงการ" : "Click to inspect record"}
                        >
                          {failure.projectId} 🔍
                        </button>
                        <p className="text-[12px] leading-thai text-ink font-medium line-clamp-1">
                          {failure.projectTitle}
                        </p>
                        <p className="text-[11px] text-ink-3 line-clamp-1">{failure.agency}</p>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="rounded-[2px] border border-line bg-surface-2 px-1.5 py-[2px] font-mono text-[10px] uppercase font-semibold text-ink">
                          {failure.step}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {failure.lastTransient ? (
                          <span className="inline-flex rounded-[2px] border border-amend-line bg-amend-bg px-1.5 py-[2px] text-[10px] font-medium text-amend">
                            {lang === "th" ? "⚠️ ขัดข้องชั่วคราว (Outage)" : "⚠️ Transient (Outage)"}
                          </span>
                        ) : (
                          <span className="inline-flex rounded-[2px] border border-risk-line bg-risk-bg px-1.5 py-[2px] text-[10px] font-medium text-risk">
                            {lang === "th" ? "❌ ข้อผิดพลาดถาวร (Defect)" : "❌ Permanent defect"}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-[12px] text-ink">
                        {failure.attempts} / 3
                      </td>
                      <td className="px-3 py-2.5 max-w-[320px]">
                        <p className="font-mono text-[11px] leading-relaxed text-risk line-clamp-2">
                          {failure.lastError}
                        </p>
                        {failure.lastError && failure.lastError.length > 80 ? (
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedFailureId(isExpanded ? null : `${failure.projectId}-${failure.step}`)
                            }
                            className="mt-1 text-[11px] text-ink-3 underline hover:text-ink cursor-pointer"
                          >
                            {isExpanded
                              ? lang === "th"
                                ? "ย่อรายละเอียด"
                                : "Collapse"
                              : lang === "th"
                                ? "ดูข้อความเต็ม..."
                                : "View full error..."}
                          </button>
                        ) : null}
                        {isExpanded ? (
                          <pre className="mt-2 p-2 rounded-[2px] border border-line bg-surface font-mono text-[10px] text-ink-2 whitespace-pre-wrap max-h-48 overflow-y-auto">
                            {failure.lastError}
                          </pre>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-[11px] text-ink-3 whitespace-nowrap">
                        {failure.lastFailedAt}
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleRetryStep(failure.projectId, failure.step)}
                            disabled={isRetrying || isDismissing}
                            className={`${btn.primary} font-mono text-[11px] py-1 px-2.5`}
                            aria-label={`Retry ${failure.step} for ${failure.projectId}`}
                          >
                            {isRetrying ? (
                              <span className="animate-spin inline-block mr-1">↻</span>
                            ) : (
                              "↻ "
                            )}
                            {lang === "th" ? "ลองใหม่" : "Retry"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDismissFailure(failure.projectId, failure.step)}
                            disabled={isRetrying || isDismissing}
                            className={`${btn.ghost} font-mono text-[11px] py-1 px-2 text-ink-3 hover:text-risk`}
                            aria-label={`Dismiss failure for ${failure.projectId}`}
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
                })}
              </tbody>
            </table>
          </Panel>
        )}
      </section>

      {/* Scrapers by Source */}
      <section className="mb-8">
        <SectionHeading
          right={
            <div className="flex items-center gap-3">
              {inMaintenance ? (
                <span className="rounded-[2px] border border-amend-line bg-amend-bg px-2 py-1 font-mono text-[11px] font-medium text-amend">
                  {lang === "th" ? "⚠️ ปิดปรับปรุง 00:00–04:00" : "⚠️ Maintenance 00:00–04:00"}
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => handleTriggerPoll("all")}
                disabled={isPolling || isRefreshing}
                className={btn.primary}
              >
                {isPolling && pollingSource === "all" ? (
                  <span className="animate-spin inline-block mr-1">↻</span>
                ) : null}
                {lang === "th" ? "สั่งดึงข้อมูลทุกแหล่งเดี๋ยวนี้" : "Poll All Sources Now"}
              </button>
            </div>
          }
        >
          {lang === "th" ? "ตัวเก็บข้อมูลรายแหล่ง" : "Scrapers by source"}
        </SectionHeading>

        {pollMessage ? (
          <div className="mb-3 rounded-[3px] border border-open-line bg-open-bg px-3 py-2 font-mono text-[12px] text-open">
            {pollMessage}
          </div>
        ) : null}

        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-left">
            <thead>
              <tr className="border-b border-line bg-surface-2">
                {[
                  { text: lang === "th" ? "แหล่งข้อมูล" : "Source", right: false },
                  { text: lang === "th" ? "สถานะ" : "Health", right: false },
                  { text: lang === "th" ? "14 วันล่าสุด" : "Last 14 runs", right: false },
                  { text: lang === "th" ? "ความพร้อมใช้" : "Uptime", right: true },
                  { text: lang === "th" ? "เอกสารในระบบ" : "Docs in system", right: true },
                  { text: lang === "th" ? "รอบล่าสุด" : "Last run", right: true },
                  { text: lang === "th" ? "คำสั่ง" : "Action", right: true },
                ].map((column) => (
                  <th
                    key={column.text}
                    className={`px-3 py-2 text-[11px] font-medium text-ink-3 ${
                      column.right ? "text-right" : ""
                    }`}
                  >
                    {column.text}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scraperSources.map((source) => (
                <tr
                  key={source.id}
                  className="border-b border-line align-top last:border-b-0"
                >
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="block text-[13px] leading-thai text-ink font-medium">
                        {source.name}
                      </span>
                      {inMaintenance && source.id === "process3" ? (
                        <span className="rounded-[2px] border border-amend-line bg-amend-bg px-1.5 py-[1px] font-mono text-[10px] text-amend">
                          {lang === "th" ? "ปิดปรับปรุง 00:00–04:00" : "Maintenance 00:00–04:00"}
                        </span>
                      ) : null}
                    </div>
                    <span className="mt-0.5 block font-mono text-[10px] text-ink-3">
                      {source.portal} · {source.format}
                    </span>
                    {source.error ? (
                      <p className="mt-1.5 max-w-[420px] rounded-[3px] border border-risk-line bg-risk-bg px-2 py-1.5 font-mono text-[11px] leading-relaxed text-risk">
                        {source.error}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-flex rounded-[2px] border px-1.5 py-[3px] text-[11px] font-medium ${
                        HEALTH[source.health]?.chip ?? "border-line bg-surface-2 text-ink-2"
                      }`}
                    >
                      {HEALTH[source.health]?.label[lang] ?? source.health}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="flex items-end gap-[2px]" aria-hidden="true">
                      {source.history.map((succeeded, index) => (
                        <span
                          key={index}
                          className={`w-[4px] rounded-[1px] ${
                            succeeded ? "h-[12px] bg-open" : "h-[16px] bg-risk"
                          }`}
                        />
                      ))}
                    </span>
                    <span className="sr-only">
                      {source.history.filter(Boolean).length}/14 runs succeeded
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tnum text-[12px] text-ink">
                    {source.uptime.toFixed(1)}%
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tnum text-[12px] text-ink-2">
                    {source.docsLast7Days}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tnum text-[11px] text-ink-3">
                    {source.lastRun}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => handleTriggerPoll(source.id)}
                      disabled={isPolling || isRefreshing}
                      className={`${btn.secondary} font-mono text-[11px] py-1 px-2.5`}
                    >
                      {isPolling && pollingSource === source.id ? (
                        <span className="animate-spin inline-block mr-1">↻</span>
                      ) : null}
                      {lang === "th" ? "ดึงแหล่งนี้" : "Poll"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </section>

      {/* Recent Ingestion Execution Activity */}
      {recentLogs && recentLogs.length > 0 ? (
        <section className="mb-8">
          <SectionHeading
            right={
              <span className="font-mono text-[11px] text-ink-3">
                {recentLogs.length} {lang === "th" ? "รอบล่าสุด" : "recent runs"}
              </span>
            }
          >
            {lang === "th" ? "ประวัติการดึงข้อมูลล่าสุด" : "Recent ingestion activity"}
          </SectionHeading>

          <Panel className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line bg-surface-2">
                  {[
                    { text: lang === "th" ? "เวลาเริ่มต้น" : "Timestamp", right: false },
                    { text: lang === "th" ? "แหล่งข้อมูล" : "Source", right: false },
                    { text: lang === "th" ? "สถานะ" : "Status", right: false },
                    { text: lang === "th" ? "เวลาที่ใช้" : "Duration", right: true },
                    { text: lang === "th" ? "ค้นพบ / บันทึก" : "Discovered / Ingested", right: true },
                    { text: lang === "th" ? "ผลการทำงาน" : "Details", right: false },
                  ].map((column) => (
                    <th
                      key={column.text}
                      className={`px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-ink-3 ${
                        column.right ? "text-right" : ""
                      }`}
                    >
                      {column.text}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentLogs.map((log) => (
                  <tr
                    key={log.id}
                    className="border-b border-line align-middle last:border-b-0"
                  >
                    <td className="px-3 py-2 font-mono text-[11px] text-ink-2 whitespace-nowrap">
                      {log.startedAt}
                    </td>
                    <td className="px-3 py-2">
                      <span className="rounded-[2px] border border-line bg-surface-2 px-1.5 py-[2px] font-mono text-[10px] text-ink font-medium">
                        {log.source === "process3" ? "process3 (e-GP)" : "datago (data.go.th)"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-[2px] border px-1.5 py-[2px] text-[10px] font-medium ${
                          HEALTH[log.status]?.chip ?? "border-line bg-surface-2 text-ink-2"
                        }`}
                      >
                        {HEALTH[log.status]?.label[lang] ?? log.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[11px] text-ink-2">
                      {log.durationMs > 1000
                        ? `${(log.durationMs / 1000).toFixed(1)}s`
                        : `${log.durationMs}ms`}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[11px] text-ink font-medium">
                      {log.itemsDiscovered} / {log.itemsIngested}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px]">
                      {log.error ? (
                        <span className="text-risk">{log.error}</span>
                      ) : (
                        <span className="text-open">
                          {lang === "th" ? "สำเร็จ เรียบร้อย" : "Completed successfully"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </section>
      ) : null}

      {/* Scheduled Job History (FR-24) */}
      {ops.pipelineRuns && ops.pipelineRuns.length > 0 ? (
        <section className="mb-8">
          <SectionHeading
            right={
              <button
                type="button"
                onClick={() => setShowJobHistory(!showJobHistory)}
                className={`${btn.secondary} font-mono text-[11px] py-0.5 px-2`}
              >
                {showJobHistory
                  ? lang === "th"
                    ? "ซ่อนประวัติ"
                    : "Hide history"
                  : lang === "th"
                    ? "แสดงประวัติ"
                    : "Show history"}
              </button>
            }
            sub={
              lang === "th"
                ? "บันทึกการทำงานของคำสั่งอัตโนมัติ (poll, sweep, process) พร้อมสถานะของแต่ละขั้นตอน"
                : "Execution telemetry for cron & scheduled pipeline jobs with step breakdown."
            }
          >
            {lang === "th" ? "ประวัติการรัน Job อัตโนมัติ" : "Scheduled job execution history"}
          </SectionHeading>

          {showJobHistory ? (
            <Panel className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-line bg-surface-2">
                    {[
                      { text: lang === "th" ? "เวลาเริ่มต้น" : "Timestamp", right: false },
                      { text: lang === "th" ? "งาน (Job)" : "Job", right: false },
                      { text: lang === "th" ? "ผลลัพธ์" : "Outcome", right: false },
                      { text: lang === "th" ? "เวลาที่ใช้" : "Duration", right: true },
                      { text: lang === "th" ? "ขั้นตอนย่อย" : "Steps", right: false },
                    ].map((col) => (
                      <th
                        key={col.text}
                        className={`px-3 py-2 text-[11px] font-medium text-ink-3 ${
                          col.right ? "text-right" : ""
                        }`}
                      >
                        {col.text}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ops.pipelineRuns.map((run) => (
                    <tr
                      key={run.id}
                      className="border-b border-line align-middle last:border-b-0 hover:bg-surface-2/40"
                    >
                      <td className="px-3 py-2 font-mono text-[11px] text-ink-2 whitespace-nowrap">
                        {run.startedAt}
                      </td>
                      <td className="px-3 py-2">
                        <span className="rounded-[2px] border border-line bg-surface-2 px-1.5 py-[2px] font-mono text-[10px] text-ink font-semibold uppercase">
                          {run.job}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex rounded-[2px] border px-1.5 py-[2px] font-mono text-[10px] uppercase font-medium ${
                            run.outcome === "done"
                              ? "border-open-line bg-open-bg text-open"
                              : run.outcome === "timed-out"
                                ? "border-amend-line bg-amend-bg text-amend"
                                : run.outcome === "failed"
                                  ? "border-risk-line bg-risk-bg text-risk"
                                  : "border-line bg-surface-2 text-ink-2"
                          }`}
                        >
                          {run.outcome}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-[11px] text-ink-2">
                        {run.durationMs > 1000
                          ? `${(run.durationMs / 1000).toFixed(1)}s`
                          : `${run.durationMs}ms`}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {run.steps.map((step, idx) => (
                            <span
                              key={idx}
                              className={`inline-flex items-center gap-1 rounded-[2px] border px-1.5 py-[1px] font-mono text-[10px] ${
                                step.exitCode === 0
                                  ? "border-line bg-surface text-ink-2"
                                  : step.exitCode === null
                                    ? "border-line/60 bg-surface-2 text-ink-3"
                                    : "border-risk-line bg-risk-bg text-risk"
                              }`}
                              title={`${step.name}: exit code ${step.exitCode ?? "none"}, ${step.ms}ms`}
                            >
                              <span>{step.name}</span>
                              <span className="text-[9px]">
                                {step.exitCode === 0 ? "✓" : step.exitCode === null ? "—" : "✗"}
                              </span>
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          ) : null}
        </section>
      ) : null}


      {/* Extraction Review Queue */}
      <section>
        <SectionHeading
          right={
            <span className="font-mono text-[11px] text-ink-3">
              {pendingCount} {lang === "th" ? "รอดำเนินการ" : "pending"}
            </span>
          }
        >
          {lang === "th" ? "คิวตรวจทานผลการอ่านเอกสาร" : "Extraction review queue"}
        </SectionHeading>

        {/* Filter Pills & Search Bar */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {[
              { id: "all", label: { th: `ทั้งหมด (${reviewQueue.length})`, en: `All (${reviewQueue.length})` } },
              { id: "pending", label: { th: `รอตรวจทาน (${pendingCount})`, en: `Pending (${pendingCount})` } },
              { id: "misclassified", label: { th: `ตรวจประเภท (${misclassifiedCount})`, en: `Misclassified (${misclassifiedCount})` } },
              { id: "reviewed", label: { th: "ตรวจทานแล้ว", en: "Reviewed" } },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterTab(tab.id as typeof filterTab)}
                className={`rounded-[3px] px-2.5 py-1 text-[12px] font-medium transition-colors cursor-pointer ${
                  filterTab === tab.id
                    ? "bg-ink text-surface"
                    : "border border-line bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink"
                }`}
              >
                {tab.label[lang]}
              </button>
            ))}
          </div>

          <div className="w-full sm:w-72">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={lang === "th" ? "ค้นหาด้วยเลขโครงการ / ชื่อ..." : "Filter by project ID / title..."}
              className={`${input} font-mono text-[12px] h-8`}
            />
          </div>
        </div>

        {filteredQueue.length === 0 ? (
          <Panel className="p-6 text-center text-[13px] text-ink-3">
            {lang === "th" ? "ไม่พบรายการในเงื่อนไขที่เลือก" : "No items match the selected filter."}
          </Panel>
        ) : (
          <div className="flex flex-col gap-2">
            {filteredQueue.map((item) => (
              <ReviewItemCard
                key={item.docId}
                item={item}
                lang={lang}
                isOpen={expanded === item.docId}
                onToggle={() => setExpanded(expanded === item.docId ? null : item.docId)}
                resolution={handled[item.docId] || null}
                onResolution={(text) => setHandled((prev) => ({ ...prev, [item.docId]: text }))}
              />
            ))}
          </div>
        )}
      </section>

      {/* Record Inspector Modal (FR-24) */}
      {inspectingProjectId && (
        <RecordInspectorModal
          projectId={inspectingProjectId}
          record={diagnosticRecord}
          isLoading={isInspectorLoading}
          error={inspectorError}
          lang={lang}
          onClose={() => {
            setInspectingProjectId(null);
            setDiagnosticRecord(null);
            setInspectorError(null);
          }}
          onRetryStep={async (pid, step) => {
            await handleRetryStep(pid, step);
            handleInspect(pid);
          }}
          onDismissFailure={async (pid, step) => {
            await handleDismissFailure(pid, step);
            handleInspect(pid);
          }}
          onReExtract={async (pid) => {
            const res = await adminReExtract(pid);
            if (res.ok) {
              setPipelineActionMsg({
                type: "success",
                text:
                  lang === "th"
                    ? `เริ่มอ่านเอกสารโครงการ ${pid} ใหม่เรียบร้อยแล้ว`
                    : `Re-extraction queued for project ${pid}`,
              });
              onRefresh();
              handleInspect(pid);
            }
          }}
        />
      )}

      {/* Manual Add Record Modal (FR-24) */}
      {isAddModalOpen && (
        <AddRecordModal
          isOpen={isAddModalOpen}
          projectId={addProjectId}
          onChangeProjectId={setAddProjectId}
          onSubmit={handleAddProject}
          isLoading={isAddingProject}
          error={addError}
          lang={lang}
          onClose={() => {
            setIsAddModalOpen(false);
            setAddError(null);
          }}
        />
      )}
    </div>
  );
}

function ReviewItemCard({
  item,
  lang,
  isOpen,
  onToggle,
  resolution,
  onResolution,
}: {
  item: ReviewItem;
  lang: "th" | "en";
  isOpen: boolean;
  onToggle: () => void;
  resolution: string | null;
  onResolution: (text: string) => void;
}) {
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const f of item.lowFields) {
      initial[f.field] = f.value;
    }
    return initial;
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSaveAndPublish = async () => {
    setIsSubmitting(true);
    setErrorMsg(null);

    const fieldsPayload: UpdateReviewPayload["fields"] = {};
    for (const [key, val] of Object.entries(fieldValues)) {
      if (key.includes("ชื่อโครงการ") || key.includes("Project Title") || key === "title") {
        fieldsPayload.title = val.trim();
      } else if (key.includes("หน่วยงาน") || key.includes("Agency Name") || key === "agency") {
        fieldsPayload.agency = val.trim();
      } else if (
        key.includes("ราคากลาง") ||
        key.includes("Reference Price") ||
        key.includes("Maximum Budget")
      ) {
        const num = Number(val.replace(/,/g, "").trim());
        fieldsPayload.referencePriceTHB = Number.isFinite(num) ? num : null;
      } else if (key.includes("งบประมาณ") || key.includes("Budget")) {
        const num = Number(val.replace(/,/g, "").trim());
        fieldsPayload.budgetTHB = Number.isFinite(num) ? num : null;
      } else if (key.includes("Deadline")) {
        fieldsPayload.submissionDeadline = val.trim() || null;
      } else if (key.includes("Penalty")) {
        fieldsPayload.penaltyClause = val.trim() || null;
      } else if (key.includes("Tech")) {
        fieldsPayload.requiredTechnologies = val.trim() || "";
      }
    }

    const res = await adminUpdateReview(item.docId, {
      action: "approve",
      fields: fieldsPayload,
    });

    setIsSubmitting(false);
    if (res.ok) {
      onResolution(lang === "th" ? "ตรวจทานและเผยแพร่แล้ว" : "Saved & Published");
    } else {
      setErrorMsg(res.error.message);
    }
  };

  const handleReclassify = async () => {
    setIsSubmitting(true);
    setErrorMsg(null);

    const res = await adminUpdateReview(item.docId, {
      action: "reclassify",
      reclassifyReason: item.misclassified?.likely || "Civil works — out of scope",
    });

    setIsSubmitting(false);
    if (res.ok) {
      onResolution(lang === "th" ? "จัดประเภทเป็นงานนอกขอบเขตแล้ว" : "Reclassified out of scope");
    } else {
      setErrorMsg(res.error.message);
    }
  };

  const handleConfirmClassification = async () => {
    setIsSubmitting(true);
    setErrorMsg(null);

    const res = await adminUpdateReview(item.docId, {
      action: "confirm_classification",
    });

    setIsSubmitting(false);
    if (res.ok) {
      onResolution(lang === "th" ? "ยืนยันการจัดประเภทแล้ว" : "Classification confirmed");
    } else {
      setErrorMsg(res.error.message);
    }
  };

  const handleReExtract = async () => {
    setIsSubmitting(true);
    setErrorMsg(null);

    const res = await adminReExtract(item.docId);

    setIsSubmitting(false);
    if (res.ok) {
      onResolution(lang === "th" ? "ส่งอ่านใหม่แล้ว" : "Re-queued");
    } else {
      setErrorMsg(res.error.message);
    }
  };

  return (
    <Panel className="overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full flex-col gap-2 px-3.5 py-3 text-left transition-colors hover:bg-surface-2 sm:flex-row sm:items-center sm:gap-4 cursor-pointer"
        aria-expanded={isOpen}
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono tnum text-[10px] text-ink-3">{item.docId}</span>
            {item.reviewStatus === "approved" || resolution?.includes("บันทึก") || resolution?.includes("Published") ? (
              <span className="rounded-[2px] border border-open-line bg-open-bg px-1.5 py-[2px] text-[10px] font-medium text-open">
                {lang === "th" ? "ตรวจทานแล้ว" : "Reviewed"}
              </span>
            ) : item.reviewStatus === "rejected" || resolution?.includes("นอกขอบเขต") || resolution?.includes("scope") ? (
              <span className="rounded-[2px] border border-risk-line bg-risk-bg px-1.5 py-[2px] text-[10px] font-medium text-risk">
                {lang === "th" ? "คัดออกนอกขอบเขต" : "Excluded"}
              </span>
            ) : (
              <span className="rounded-[2px] border border-amend-line bg-amend-bg px-1.5 py-[2px] text-[10px] font-medium text-amend">
                {lang === "th" ? "รอตรวจทาน" : "Pending review"}
              </span>
            )}
            {item.misclassified ? (
              <span className="rounded-[2px] border border-risk-line bg-risk-bg px-1.5 py-[2px] text-[10px] font-medium text-risk">
                {lang === "th" ? "อาจจัดประเภทผิด" : "Likely misclassified"}
              </span>
            ) : null}
            {resolution ? (
              <span className="rounded-[2px] border border-open-line bg-open-bg px-1.5 py-[2px] text-[10px] font-medium text-open">
                {resolution}
              </span>
            ) : null}
          </span>
          <span className="mt-1 block text-[13px] leading-thai text-ink font-medium">{item.title}</span>
          <span className="mt-0.5 block text-[11px] text-ink-3">
            {item.agency} · {item.ingestedAt}
          </span>
        </span>

        <span className="flex shrink-0 flex-col gap-1.5">
          <ConfidenceBar value={item.ocr} label="OCR" />
          <ConfidenceBar value={item.extraction} label="LLM" />
        </span>
      </button>

      {isOpen ? (
        <div className="border-t border-line bg-surface-2 px-3.5 py-3">
          {errorMsg ? (
            <div className="mb-3 rounded-[3px] border border-risk-line bg-risk-bg p-2.5 font-mono text-[12px] text-risk">
              {errorMsg}
            </div>
          ) : null}

          {item.misclassified ? (
            <div className="mb-3 flex flex-col gap-2 rounded-[3px] border border-line bg-surface p-3">
              <Label>{lang === "th" ? "การจัดประเภท" : "Classification"}</Label>
              <p className="text-[13px] leading-thai text-ink-2">
                {lang === "th"
                  ? `ระบบจัดเป็น “${item.misclassified.predicted}” แต่เนื้อหาน่าจะเป็น “${item.misclassified.likely}”`
                  : `Classified as “${item.misclassified.predicted}”, but the content reads as “${item.misclassified.likely}”.`}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleReclassify}
                  className={btn.primary}
                >
                  {isSubmitting
                    ? lang === "th"
                      ? "กำลังบันทึก..."
                      : "Saving..."
                    : lang === "th"
                      ? "จัดประเภทใหม่เป็นงานนอกขอบเขต"
                      : "Reclassify as out of scope"}
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleConfirmClassification}
                  className={btn.secondary}
                >
                  {lang === "th" ? "ยืนยันว่าถูกต้องแล้ว" : "Classification is correct"}
                </button>
              </div>
            </div>
          ) : null}

          {item.lowFields.length > 0 ? (
            <div className="flex flex-col gap-3">
              <Label>
                {lang === "th"
                  ? "ฟิลด์ที่ความมั่นใจต่ำ — แก้ไขได้ที่นี่"
                  : "Low-confidence fields — correct them here"}
              </Label>
              {item.lowFields.map((field) => (
                <div
                  key={field.field}
                  className="flex flex-col gap-1.5 rounded-[3px] border border-line bg-surface p-3 sm:flex-row sm:items-center sm:gap-3"
                >
                  <span className="min-w-[200px] text-[12px] leading-thai text-ink-2 font-medium">
                    {field.field}
                  </span>
                  <input
                    value={fieldValues[field.field] ?? field.value}
                    onChange={(e) =>
                      setFieldValues((prev) => ({ ...prev, [field.field]: e.target.value }))
                    }
                    className={`${input} font-mono flex-1`}
                    aria-label={field.field}
                  />
                  <span className="font-mono tnum text-[11px] text-ink-3">
                    {Math.round(field.confidence * 100)}%
                  </span>
                </div>
              ))}
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleSaveAndPublish}
                  className={btn.primary}
                >
                  {isSubmitting
                    ? lang === "th"
                      ? "กำลังบันทึก..."
                      : "Saving..."
                    : lang === "th"
                      ? "บันทึกและปล่อยให้ผู้ใช้เห็น"
                      : "Save and publish"}
                </button>
                <a
                  href={`/tor/${item.docId}`}
                  target="_blank"
                  rel="noreferrer"
                  className={btn.secondary}
                >
                  {lang === "th" ? "ดูหน้าประกาศบนเว็บ" : "View on GIPDP"} ↗
                </a>
                <a
                  href={`https://process5.gprocurement.go.th/egp-agpc01-web/announcement?keywordSearch=${item.docId}`}
                  target="_blank"
                  rel="noreferrer"
                  className={btn.secondary}
                >
                  {lang === "th" ? "เปิดไฟล์ต้นฉบับเทียบ" : "Open source file"} ↗
                </a>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleReExtract}
                  className={btn.ghost}
                >
                  {lang === "th" ? "สั่งให้อ่านเอกสารใหม่" : "Re-run extraction"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}

function RecordInspectorModal({
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
  const [retrying, setRetrying] = useState(false);
  const [reExtracting, setReExtracting] = useState(false);

  const formatMoney = (val: number | null | undefined) =>
    typeof val === "number" && val > 0
      ? `฿${val.toLocaleString()}`
      : lang === "th"
      ? "ไม่ได้ระบุ"
      : "Not stated";

  const formatDate = (iso: string | null | undefined) =>
    iso ? iso.slice(0, 16).replace("T", " ") : "—";

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[4px] border border-line bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-line pb-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[14px] font-bold text-ink">
                {projectId}
              </span>
              {record ? (
                <>
                  <span className="rounded-[2px] border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] uppercase font-medium text-ink-2">
                    {record.source}
                  </span>
                  <span
                    className={`rounded-[2px] border px-1.5 py-0.5 font-mono text-[10px] font-medium ${
                      record.status === "Open"
                        ? "border-open-line bg-open-bg text-open"
                        : "border-line bg-surface-2 text-ink"
                    }`}
                  >
                    {record.status}
                  </span>
                  <span className="rounded-[2px] border border-line-2 bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-ink">
                    Stage: {record.pipelineStatus}
                  </span>
                </>
              ) : null}
            </div>
            <h2 className="mt-1.5 text-[16px] font-semibold leading-snug text-ink">
              {record?.title ||
                (isLoading
                  ? lang === "th"
                    ? "กำลังโหลดข้อมูล..."
                    : "Loading..."
                  : projectId)}
            </h2>
            {record?.agency ? (
              <p className="mt-0.5 text-[12px] text-ink-3">{record.agency}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[3px] border border-line-2 bg-surface px-2.5 py-1 font-mono text-[12px] text-ink-2 hover:bg-surface-2 hover:text-ink cursor-pointer"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="py-4">
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
              <p className="mt-1 font-mono text-[12px] text-risk/80">{error}</p>
            </div>
          ) : record ? (
            <div className="space-y-5">
              {/* Active Failure Callout */}
              {record.activeFailure ? (
                <div className="rounded-[3px] border border-risk-line bg-risk-bg/50 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[12px] font-bold text-risk uppercase">
                      ⚠️ {lang === "th" ? "พบข้อผิดพลาดในขั้นตอน" : "Active Failure in Step"}:{" "}
                      {record.activeFailure.step}
                    </span>
                    <span className="font-mono text-[11px] text-risk">
                      {lang === "th"
                        ? `ครั้งที่ ${record.activeFailure.attempts} / 3`
                        : `Attempt ${record.activeFailure.attempts} of 3`}
                    </span>
                  </div>
                  <p className="mt-2 font-mono text-[12px] leading-relaxed text-risk">
                    {record.activeFailure.lastError}
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-risk/70">
                    {lang === "th" ? "ผิดพลาดล่าสุดเมื่อ" : "Last failure"}:{" "}
                    {formatDate(record.activeFailure.lastFailedAt)}
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

              {/* Stage Progression Flow */}
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
                        <span className="font-mono text-[12px] font-bold">
                          {stage.done ? "✓" : stage.error ? "✕" : "○"}
                        </span>
                        <span className="text-[11px] font-medium">{title}</span>
                      </div>
                      <p className="mt-1 font-mono text-[10px] text-ink-2 truncate">
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

              {/* Document Details & OCR / Insight Grid */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {/* Document Box */}
                <Panel className="p-3">
                  <Label>
                    {lang === "th" ? "เอกสารแนบจาก e-GP" : "e-GP Document Attachment"}
                  </Label>
                  {record.document ? (
                    <div className="mt-2 space-y-1.5 font-mono text-[12px]">
                      <div className="flex justify-between border-b border-line pb-1">
                        <span className="text-ink-3">File:</span>
                        <span className="text-ink truncate max-w-[180px]">
                          {record.document.fileName}
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-line pb-1">
                        <span className="text-ink-3">Pages:</span>
                        <span className="text-ink">
                          {record.document.pages ?? "—"}
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-line pb-1">
                        <span className="text-ink-3">Size:</span>
                        <span className="text-ink">
                          {record.document.sizeBytes
                            ? `${(record.document.sizeBytes / (1024 * 1024)).toFixed(2)} MB`
                            : "—"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-ink-3">Type:</span>
                        <span className="text-ink">{record.document.documentType}</span>
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

                {/* AI Insight Box */}
                <Panel className="p-3">
                  <Label>
                    {lang === "th"
                      ? "การประเมินและการสกัดข้อมูล AI"
                      : "AI Extraction & Intelligence"}
                  </Label>
                  <div className="mt-2 space-y-2 font-mono text-[12px]">
                    <div className="flex items-center justify-between border-b border-line pb-1">
                      <span className="text-ink-3">OCR Score:</span>
                      <span className="font-bold text-ink">
                        {(() => {
                          const ocrConf = record.stages.ocr?.confidence ?? record.ocr?.confidence;
                          return ocrConf != null ? `${Math.round(ocrConf * 100)}%` : "—";
                        })()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-b border-line pb-1">
                      <span className="text-ink-3">Extraction Score:</span>
                      <span className="font-bold text-ink">
                        {record.insight?.confidence != null
                          ? `${record.insight.confidence}%`
                          : "—"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-b border-line pb-1">
                      <span className="text-ink-3">Lock-spec Risk:</span>
                      <span
                        className={`rounded-[2px] px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                          record.insight?.lockSpecRisk === "high"
                            ? "bg-risk-bg text-risk border border-risk-line"
                            : record.insight?.lockSpecRisk === "medium"
                            ? "bg-amend-bg text-amend border border-amend-line"
                            : "bg-open-bg text-open border border-open-line"
                        }`}
                      >
                        {record.insight?.lockSpecRisk ?? "low"}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between pt-0.5">
                      <span className="text-ink-3">Review Status:</span>
                      <span className="text-ink font-medium">
                        {record.insight?.reviewStatus ?? "pending"}
                      </span>
                    </div>
                  </div>
                </Panel>
              </div>

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
                      className={`rounded-[2px] px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
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
                    <p className="mt-1 font-mono text-[11px] text-ink-3">
                      Category: {record.titleScreen.category}
                    </p>
                  ) : null}
                </Panel>
              ) : null}

              {/* Budget & Price Details */}
              <div className="grid grid-cols-2 gap-2 text-[12px]">
                <Panel className="p-2.5">
                  <span className="text-ink-3 text-[11px]">
                    {lang === "th" ? "งบประมาณ" : "Budget"}:
                  </span>
                  <p className="font-mono font-medium text-ink mt-0.5">
                    {formatMoney(record.budgetTHB)}
                  </p>
                </Panel>
                <Panel className="p-2.5">
                  <span className="text-ink-3 text-[11px]">
                    {lang === "th" ? "ราคากลาง" : "Reference Price"}:
                  </span>
                  <p className="font-mono font-medium text-ink mt-0.5">
                    {formatMoney(record.referencePriceTHB)}
                  </p>
                </Panel>
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer Actions */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
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

function AddRecordModal({
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
            className="rounded-[3px] border border-line-2 bg-surface px-2 py-0.5 font-mono text-[12px] text-ink-2 hover:bg-surface-2 hover:text-ink cursor-pointer"
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
            <div className="mt-1 flex items-center justify-between text-[11px] font-mono">
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
            <div className="rounded-[3px] border border-risk-line bg-risk-bg p-2.5 font-mono text-[12px] text-risk">
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

