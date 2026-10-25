"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  adminAddPipelineRecord,
  adminCheckSourceHealth,
  adminCreateTechnology,
  adminDeleteTechnology,
  adminDismissPipelineFailure,
  adminGetPipelineRecord,
  adminGetTechnologies,
  adminOperations,
  adminReExtract,
  adminRetryAllPipelineFailures,
  adminRetryPipelineStep,
  adminSuggestProjects,
  adminUpdateTechnology,
  type AdminOperations,
  type AdminTechnology,
  type ApiError,
  type PipelineRecordDiagnostics,
  type SuggestedProject,
} from "../../_lib/api";
import {
  HEALTH,
  PipelineStageFunnel,
  PipelineMonitoringSection,
  PipelineRunsSection,
  ReviewItemCard,
  RecordInspectorModal,
  AddRecordModal,
  TechnologiesSection,
  AddEditTechnologyModal,
} from "./_components";
import { useLang } from "../../_components/prefs";
import { SignInPrompt } from "../../_components/sign-in-prompt";
import { btn, EmptyState, input, Panel, SectionHeading } from "../../_components/ui";

/**
 * Operational surface, not a marketing one: dense tables, real failure text,
 * and the correction controls sitting next to the thing they correct. The
 * numeric OCR/LLM confidence lives here and only here (§5).
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
    <Suspense
      fallback={
        <div className="mx-auto min-h-[60vh] max-w-[1240px] px-4 py-10" aria-busy="true" />
      }
    >
      <AdminDashboard
        ops={ops}
        lang={lang}
        onRefresh={loadOperations}
        isRefreshing={isRefreshing}
      />
    </Suspense>
  );
}

export type AdminJob = "overview" | "review" | "failures" | "history" | "technologies";

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
  const searchParams = useSearchParams();
  const jobParam = searchParams.get("job");
  const urlJob: AdminJob =
    jobParam === "review" ||
    jobParam === "failures" ||
    jobParam === "history" ||
    jobParam === "technologies"
      ? jobParam
      : "overview";

  const [activeJob, setActiveJobState] = useState<AdminJob>(urlJob);
  const [prevJobParam, setPrevJobParam] = useState<string | null>(jobParam);

  if (jobParam !== prevJobParam) {
    setPrevJobParam(jobParam);
    setActiveJobState(urlJob);
  }

  const setActiveJob = (nextJob: AdminJob) => {
    setActiveJobState(nextJob);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (nextJob === "overview") {
        url.searchParams.delete("job");
      } else {
        url.searchParams.set("job", nextJob);
      }
      window.history.replaceState(null, "", url.toString());
    }
  };
  const [jobNavOpen, setJobNavOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(reviewQueue[0]?.docId ?? null);
  const [handled, setHandled] = useState<Record<string, string>>({});
  const [checkingSourceIds, setCheckingSourceIds] = useState<string[]>([]);
  const [checkMessage, setCheckMessage] = useState<string | null>(null);

  // Pipeline Monitoring & Diagnostics State (FR-24)
  const [retryingStep, setRetryingStep] = useState<string | null>(null);
  const [retryingAll, setRetryingAll] = useState(false);
  const [dismissingStep, setDismissingStep] = useState<string | null>(null);
  const [pipelineActionMsg, setPipelineActionMsg] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);


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

  // Autocomplete suggestions for Project Inspector (FR-24)
  const [suggestions, setSuggestions] = useState<SuggestedProject[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Tech & Standards State
  const [techList, setTechList] = useState<AdminTechnology[]>([]);
  const [techPendingCount, setTechPendingCount] = useState(0);
  const [techTotal, setTechTotal] = useState(0);
  const [isTechLoading, setIsTechLoading] = useState(false);
  const [techSearch, setTechSearch] = useState("");
  const [techStatusFilter, setTechStatusFilter] = useState<string>("all");
  const [techCategoryFilter, setTechCategoryFilter] = useState<string>("all");
  const [techActionMsg, setTechActionMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Add / Edit Modal State
  const [isTechModalOpen, setIsTechModalOpen] = useState(false);
  const [editingTech, setEditingTech] = useState<AdminTechnology | null>(null);
  const [techForm, setTechForm] = useState<{
    name: string;
    category: string;
    aliases: string;
    status: "confirmed" | "new" | "rejected";
  }>({
    name: "",
    category: "Framework",
    aliases: "",
    status: "confirmed",
  });
  const [isSubmittingTech, setIsSubmittingTech] = useState(false);
  const [techFormError, setTechFormError] = useState<string | null>(null);

  // Debounced live suggestion search for Inspector
  useEffect(() => {
    const trimmed = searchInspectorId.trim();
    if (!trimmed) return;

    const timer = setTimeout(() => {
      setIsSuggesting(true);
      adminSuggestProjects(trimmed).then((res) => {
        setIsSuggesting(false);
        if (res.ok) {
          setSuggestions(res.data);
          setShowSuggestions(res.data.length > 0);
        }
      });
    }, 250);

    return () => clearTimeout(timer);
  }, [searchInspectorId]);

  // Click outside to close suggestion dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch technologies when filters or search change
  const refreshTechnologies = useCallback(async () => {
    setIsTechLoading(true);
    const res = await adminGetTechnologies({
      status: techStatusFilter,
      search: techSearch,
      limit: 100,
    });
    setIsTechLoading(false);
    if (res.ok) {
      setTechList(res.data.items);
      setTechPendingCount(res.data.pendingRequestsCount);
      setTechTotal(res.data.total);
    }
  }, [techStatusFilter, techSearch]);

  useEffect(() => {
    let cancelled = false;
    adminGetTechnologies({
      status: techStatusFilter,
      search: techSearch,
      limit: 100,
    }).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setTechList(res.data.items);
        setTechPendingCount(res.data.pendingRequestsCount);
        setTechTotal(res.data.total);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [techStatusFilter, techSearch]);

  const handleApproveTech = async (id: string, name: string) => {
    setTechActionMsg(null);
    const res = await adminUpdateTechnology(id, { status: "confirmed" });
    if (res.ok) {
      setTechActionMsg({
        text: lang === "th" ? `อนุมัติ ${name} เรียบร้อยแล้ว` : `Approved ${name} successfully.`,
        type: "success",
      });
      refreshTechnologies();
    } else {
      setTechActionMsg({ text: res.error.message, type: "error" });
    }
  };

  const handleRejectTech = async (id: string, name: string) => {
    const confirmed = window.confirm(
      lang === "th" ? `ยืนยันปฏิเสธคำขอ "${name}" หรือไม่?` : `Reject request for "${name}"?`,
    );
    if (!confirmed) return;
    setTechActionMsg(null);
    const res = await adminUpdateTechnology(id, { status: "rejected" });
    if (res.ok) {
      setTechActionMsg({
        text: lang === "th" ? `ปฏิเสธคำขอ ${name} เรียบร้อยแล้ว` : `Rejected request for ${name}.`,
        type: "success",
      });
      refreshTechnologies();
    } else {
      setTechActionMsg({ text: res.error.message, type: "error" });
    }
  };

  const handleDeleteTech = async (id: string, name: string) => {
    const confirmed = window.confirm(
      lang === "th" ? `ยืนยันลบ "${name}" ออกจากระบบหรือไม่?` : `Delete "${name}" from system?`,
    );
    if (!confirmed) return;
    setTechActionMsg(null);
    const res = await adminDeleteTechnology(id);
    if (res.ok) {
      setTechActionMsg({
        text: lang === "th" ? `ลบ ${name} ออกจากระบบแล้ว` : `Deleted ${name}.`,
        type: "success",
      });
      refreshTechnologies();
    } else {
      setTechActionMsg({ text: res.error.message, type: "error" });
    }
  };

  const handleOpenAddTech = () => {
    setEditingTech(null);
    setTechForm({
      name: "",
      category: "Framework",
      aliases: "",
      status: "confirmed",
    });
    setTechFormError(null);
    setIsTechModalOpen(true);
  };

  const handleOpenEditTech = (tech: AdminTechnology) => {
    setEditingTech(tech);
    setTechForm({
      name: tech.name,
      category: tech.category || "Framework",
      aliases: (tech.aliases || []).join(", "),
      status: tech.status,
    });
    setTechFormError(null);
    setIsTechModalOpen(true);
  };

  const handleSaveTech = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = techForm.name.trim();
    if (!name) {
      setTechFormError(lang === "th" ? "กรุณาระบุชื่อ" : "Name is required");
      return;
    }

    const aliases = techForm.aliases
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);

    setIsSubmittingTech(true);
    setTechFormError(null);

    if (editingTech) {
      const res = await adminUpdateTechnology(editingTech.id, {
        name,
        category: techForm.category,
        aliases,
        status: techForm.status,
      });
      setIsSubmittingTech(false);
      if (res.ok) {
        setIsTechModalOpen(false);
        setTechActionMsg({
          text: lang === "th" ? `บันทึกข้อมูล ${name} เรียบร้อยแล้ว` : `Updated ${name} successfully.`,
          type: "success",
        });
        refreshTechnologies();
      } else {
        setTechFormError(res.error.message);
      }
    } else {
      const res = await adminCreateTechnology({
        name,
        category: techForm.category,
        aliases,
        status: techForm.status,
      });
      setIsSubmittingTech(false);
      if (res.ok) {
        setIsTechModalOpen(false);
        setTechActionMsg({
          text: lang === "th" ? `เพิ่ม ${name} เข้าสู่คลังคำศัพท์เรียบร้อยแล้ว` : `Added ${name} successfully.`,
          type: "success",
        });
        refreshTechnologies();
      } else {
        setTechFormError(res.error.message);
      }
    }
  };

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

  const handleRetryStep = async (projectId: string, step: string, runNow: boolean = false) => {
    const key = `${projectId}-${step}`;
    setRetryingStep(key);
    setPipelineActionMsg(null);
    const res = await adminRetryPipelineStep(projectId, step, runNow);
    setRetryingStep(null);
    if (res.ok) {
      setPipelineActionMsg({
        type: "success",
        text:
          lang === "th"
            ? runNow
              ? `สั่งรันขั้นตอน (${step}) สำหรับโครงการ ${projectId} ทันทีเรียบร้อยแล้ว`
              : `รีเซ็ตและส่งโครงการ ${projectId} ขั้นตอน (${step}) เข้าคิวประมวลผลใหม่เรียบร้อยแล้ว`
            : runNow
              ? `Executed step ${step} immediately for project ${projectId}.`
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

  const handleRetryAllTransient = async () => {
    setRetryingAll(true);
    setPipelineActionMsg(null);
    const res = await adminRetryAllPipelineFailures({ transientOnly: true });
    setRetryingAll(false);
    if (res.ok) {
      setPipelineActionMsg({
        type: "success",
        text:
          lang === "th"
            ? `ส่งข้อผิดพลาดชั่วคราวทั้งหมด (${res.data.clearedCount} รายการ) กลับเข้าคิวประมวลผลแล้ว`
            : `Bulk re-queued ${res.data.clearedCount} transient failure(s).`,
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
  const reviewedCount = reviewQueue.filter(
    (item) => Boolean(handled[item.docId]) || item.reviewStatus === "approved",
  ).length;

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

  const handleHealthCheck = async (sourceId: string = "all") => {
    const targets = sourceId === "all" ? scraperSources.map((s) => s.id) : [sourceId];
    setCheckingSourceIds(targets);
    setCheckMessage(null);
    const res = await adminCheckSourceHealth(sourceId);
    setCheckingSourceIds([]);
    if (res.ok) {
      const summary = Object.entries(res.data.results)
        .map(([id, r]) => {
          const sName = id === "process3" ? "e-GP (RSS)" : id === "datago" ? "data.go.th" : id;
          const statusText =
            r.status === "ok"
              ? lang === "th" ? "ปกติ" : "Healthy"
              : r.status === "degraded"
                ? lang === "th" ? "ล่าช้า" : "Degraded"
                : lang === "th" ? "ขัดข้อง" : "Down";
          return `${sName}: ${statusText} (${r.latencyMs}ms)`;
        })
        .join(" · ");
      setCheckMessage(
        (lang === "th" ? "ผลการตรวจสอบการเชื่อมต่อ: " : "Health check complete: ") + summary,
      );
      onRefresh();
    } else {
      setCheckMessage(res.error.message);
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
      value: pipelineStats.docsAwaitingReview ?? pendingCount,
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
    ...(pipelineStats.requestStreak &&
    (pipelineStats.requestStreak.inARow >= 180 ||
      pipelineStats.requestStreak.cooldownRemainingMs > 0)
      ? [
          {
            value: `${pipelineStats.requestStreak.inARow} / ${pipelineStats.requestStreak.limit}`,
            label: {
              th:
                pipelineStats.requestStreak.cooldownRemainingMs > 0
                  ? `e-GP Pacer (คูลดาวน์ ${Math.ceil(pipelineStats.requestStreak.cooldownRemainingMs / 60000)}น.)`
                  : "e-GP ใกล้ถึงขีดจำกัด (Burst)",
              en:
                pipelineStats.requestStreak.cooldownRemainingMs > 0
                  ? `e-GP Pacer (Cooldown ${Math.ceil(pipelineStats.requestStreak.cooldownRemainingMs / 60000)}m)`
                  : "e-GP Request Streak (Near limit)",
            },
          },
        ]
      : []),
  ];

  const ADMIN_JOBS: {
    id: AdminJob;
    icon: string;
    label: { th: string; en: string };
    description: { th: string; en: string };
    badge?: number;
    badgeTone?: "risk" | "amend" | "neutral";
  }[] = [
    {
      id: "overview",
      icon: "📊",
      label: { th: "ภาพรวม & สแครปเปอร์", en: "Overview & Sources" },
      description: { th: "ตัวชี้วัด, Funnel และสุขภาพแหล่งข้อมูล", en: "KPIs, funnel stages & source health" },
    },
    {
      id: "review",
      icon: "📋",
      label: { th: "คิวตรวจทานเอกสาร", en: "Review Queue" },
      description: { th: "ความมั่นใจ < 80% หรือจัดประเภทผิด", en: "Confidence < 80% or misclassified" },
      badge:
        (pipelineStats.docsAwaitingReview ?? pendingCount) > 0
          ? (pipelineStats.docsAwaitingReview ?? pendingCount)
          : undefined,
      badgeTone: "amend",
    },
    {
      id: "failures",
      icon: "⚙️",
      label: { th: "เฝ้าระวัง Pipeline", en: "Pipeline Monitoring" },
      description: { th: "ตัวกรองทุกขั้นตอน & จัดการรายโครงการ", en: "Monitor stages, filters & step controls" },
      badge: (ops.pipelineFailures?.length ?? 0) > 0 ? ops.pipelineFailures?.length : undefined,
      badgeTone: "risk",
    },
    {
      id: "history",
      icon: "⏱️",
      label: { th: "ประวัติงาน & บันทึก", en: "Runs & Audit Logs" },
      description: { th: "รอบประมวลผลและ Audit Log", en: "Scheduled runs and activity logs" },
      badge: (ops.pipelineRuns?.length ?? 0) > 0 ? ops.pipelineRuns?.length : undefined,
      badgeTone: "neutral",
    },
    {
      id: "technologies",
      icon: "🏷️",
      label: { th: "คลังเทคโนโลยี & มาตรฐาน", en: "Tech & Standards" },
      description: { th: "จัดการคำขอและคลังคำศัพท์ระบบ", en: "Vocabulary directory & review" },
      badge: techPendingCount > 0 ? techPendingCount : undefined,
      badgeTone: "amend",
    },
  ];

  const activeJobObj = ADMIN_JOBS.find((j) => j.id === activeJob) ?? ADMIN_JOBS[0];
  const currentJobLabel = activeJobObj.label[lang];

  const adminRail = (
    <div className="flex flex-col gap-4">
      {/* Jobs Selection Panel */}
      <Panel className="overflow-hidden">
        <div className="border-b border-line bg-surface-2 px-3.5 py-2.5">
          <h2 className="text-[12px] font-semibold text-ink">
            {lang === "th" ? "หน้าที่ผู้ดูแล (Admin Jobs)" : "Operational Jobs"}
          </h2>
        </div>

        <nav className="flex flex-col p-1.5 gap-1" aria-label="Admin Navigation">
          {ADMIN_JOBS.map((job) => {
            const isActive = activeJob === job.id;
            return (
              <button
                key={job.id}
                type="button"
                onClick={() => {
                  setActiveJob(job.id);
                  setJobNavOpen(false);
                }}
                aria-current={isActive ? "page" : undefined}
                className={`flex w-full items-start justify-between rounded-[3px] px-3 py-2.5 text-left transition-all duration-150 cursor-pointer ${
                  isActive
                    ? "bg-ink text-surface shadow-xs font-semibold"
                    : "text-ink-2 hover:bg-surface-2 hover:text-ink"
                }`}
              >
                <div className="min-w-0 pr-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px]">{job.icon}</span>
                    <span className="text-[13px] leading-tight font-medium">
                      {job.label[lang]}
                    </span>
                  </div>
                  <p
                    className={`mt-0.5 text-[11px] leading-thai ${
                      isActive ? "text-surface/80" : "text-ink-3"
                    }`}
                  >
                    {job.description[lang]}
                  </p>
                </div>

                {job.badge !== undefined && (
                  <span
                    className={`shrink-0 rounded-[2px] px-1.5 py-0.5 font-mono tnum text-[11px] font-medium ${
                      isActive
                        ? "bg-surface/20 text-surface"
                        : job.badgeTone === "risk"
                          ? "bg-risk-bg text-risk border border-risk-line"
                          : job.badgeTone === "amend"
                            ? "bg-amend-bg text-amend border border-amend-line"
                            : "bg-surface-3 text-ink-3"
                    }`}
                  >
                    {job.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </Panel>
    </div>
  );

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-6">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-line pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-[2px] bg-ink text-surface px-1.5 py-0.5 text-[10px] uppercase font-semibold tracking-wider font-mono">
              ADMIN OPS
            </span>
            <span className="text-[11px] text-ink-3">
              {lang === "th" ? "แดชบอร์ดดูแลระบบและความสมบูรณ์ข้อมูล" : "Pipeline Telemetry & Data Integrity"}
            </span>
          </div>
          <h1 className="mt-1.5 text-[24px] sm:text-[28px] leading-tight font-bold tracking-tight text-ink">
            {lang === "th" ? "สุขภาพระบบเก็บข้อมูลและการตรวจสอบข้อมูล" : "Pipeline Health & Data Integrity"}
          </h1>
          <p className="mt-1 text-[13px] text-ink-2">
            {lang === "th"
              ? "ระบบติดตามการดึงข้อมูล e-GP ตรวจสอบความถูกต้องของการสกัดข้อความ และจัดการงานที่ติดขัด"
              : "Operational telemetry, extraction verification queue, and automated failure recovery."}
          </p>
        </div>

        {/* Action Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Project Inspector Autocomplete Search (Leftmost) */}
          <div ref={searchContainerRef} className="relative w-full sm:w-64 md:w-72">
            <div className="relative flex items-center">
              <input
                type="text"
                value={searchInspectorId}
                onChange={(e) => {
                  const val = e.target.value;
                  setSearchInspectorId(val);
                  if (!val.trim()) {
                    setSuggestions([]);
                    setShowSuggestions(false);
                  } else {
                    setShowSuggestions(true);
                  }
                }}
                onFocus={() => {
                  if (suggestions.length > 0) setShowSuggestions(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (searchInspectorId.trim()) {
                      handleInspect(searchInspectorId.trim());
                      setShowSuggestions(false);
                    }
                  }
                }}
                placeholder={lang === "th" ? "ตรวจสอบโครงการ (รหัส/ชื่อ)..." : "Inspect project (ID/title)..."}
                className={`${input} h-9 pr-7 text-[12px] w-full font-mono placeholder:font-sans`}
              />
              <button
                type="button"
                onClick={() => {
                  if (searchInspectorId.trim()) {
                    handleInspect(searchInspectorId.trim());
                    setShowSuggestions(false);
                  }
                }}
                disabled={!searchInspectorId.trim()}
                className="absolute right-1 text-ink-3 hover:text-ink disabled:opacity-30 p-1.5 cursor-pointer"
                title={lang === "th" ? "ตรวจสอบสถานะรายโครงการ (Enter)" : "Inspect Record (Enter)"}
              >
                {isSuggesting ? (
                  <span className="animate-spin inline-block text-[11px]">↻</span>
                ) : (
                  "🔍"
                )}
              </button>
            </div>

            {/* Suggestions Dropdown Popover */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute left-0 right-0 z-50 mt-1 max-h-72 overflow-y-auto rounded-[3px] border border-line bg-surface shadow-2xl text-[12px]">
                <div className="px-2.5 py-1.5 text-[10px] uppercase font-semibold text-ink-3 bg-surface-2 border-b border-line flex justify-between items-center">
                  <span>{lang === "th" ? "โครงการที่พบ" : "Matches"}</span>
                  <span className="font-mono">{suggestions.length}</span>
                </div>
                <ul className="divide-y divide-line/40">
                  {suggestions.map((p) => (
                    <li key={p.projectId}>
                      <button
                        type="button"
                        onClick={() => {
                          setSearchInspectorId(p.projectId);
                          setShowSuggestions(false);
                          handleInspect(p.projectId);
                        }}
                        className="w-full text-left px-2.5 py-2 hover:bg-surface-2 transition-colors flex flex-col gap-0.5 cursor-pointer"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-mono font-bold text-[11px] text-ink">
                            {p.projectId}
                          </span>
                          <span className="text-[10px] px-1 py-0.2 rounded border border-line bg-surface-2 text-ink-3 font-mono">
                            {p.status}
                          </span>
                        </div>
                        <p className="text-[11px] text-ink-2 line-clamp-1 leading-snug">
                          {p.title}
                        </p>
                        {p.agency && (
                          <span className="text-[10px] text-ink-3 truncate">
                            🏛️ {p.agency}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Manual Add Button (FR-24) */}
          <button
            type="button"
            onClick={() => {
              setAddProjectId("");
              setAddError(null);
              setIsAddModalOpen(true);
            }}
            className={`${btn.primary} h-9 px-3.5 text-[12px]`}
          >
            <span className="text-[14px] leading-none">+</span>
            <span>{lang === "th" ? "เพิ่มโครงการ e-GP" : "Add e-GP Project"}</span>
          </button>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing || checkingSourceIds.length > 0}
            className={`${btn.secondary} h-9 px-3 text-[12px]`}
            aria-label={lang === "th" ? "รีเฟรชสถานะ" : "Refresh status"}
          >
            {isRefreshing ? (
              <span className="animate-spin inline-block">↻</span>
            ) : (
              "↻"
            )}{" "}
            <span className="hidden sm:inline">{lang === "th" ? "รีเฟรช" : "Refresh"}</span>
          </button>
        </div>
      </header>

      {/* Semi-Sidebar Layout Matching /search */}
      <div className="grid gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
        {/* Mobile Job Switcher Button (lg:hidden) */}
        <div className="lg:hidden">
          <button
            type="button"
            onClick={() => setJobNavOpen(!jobNavOpen)}
            aria-expanded={jobNavOpen}
            className={`${btn.secondary} w-full justify-between`}
          >
            <span className="flex items-center gap-2">
              <span className="text-ink-3">{lang === "th" ? "หน้าที่งาน:" : "Admin job:"}</span>
              <span className="font-semibold text-ink flex items-center gap-1.5">
                <span>{activeJobObj.icon}</span>
                <span>{currentJobLabel}</span>
              </span>
            </span>
            <span className="font-mono text-[11px] text-ink-3">{jobNavOpen ? "−" : "+"}</span>
          </button>
          {jobNavOpen ? <div className="mt-3">{adminRail}</div> : null}
        </div>

        {/* Desktop Semi-Sidebar Rail (hidden lg:block) */}
        <aside className="hidden lg:block">
          <div className="sticky top-[76px] max-h-[calc(100vh-90px)] overflow-y-auto overscroll-contain pr-1.5 [scrollbar-width:thin] [scrollbar-color:var(--line)_transparent]">
            {adminRail}
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="min-w-0">
          {/* Job 1: Overview & Scrapers */}
          {activeJob === "overview" && (
            <div>
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
              <PipelineStageFunnel stageSnapshot={ops.stageSnapshot} lang={lang} />

      {/* Scrapers by Source */}
      <section className="mb-8">
        <SectionHeading
          right={
            <div className="flex items-center gap-3">
              {inMaintenance ? (
                <span className="rounded-[2px] border border-amend-line bg-amend-bg px-2 py-1 text-[11px] font-medium text-amend">
                  {lang === "th" ? "⚠️ ปิดปรับปรุง 00:00–04:00" : "⚠️ Maintenance 00:00–04:00"}
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => handleHealthCheck("all")}
                disabled={checkingSourceIds.length > 0 || isRefreshing}
                className={btn.primary}
              >
                {lang === "th" ? "ทดสอบการเชื่อมต่อทุกแหล่ง" : "Check All Sources"}
              </button>
            </div>
          }
        >
          {lang === "th" ? "สถานะการเชื่อมต่อแหล่งข้อมูล" : "Data sources & connectivity"}
        </SectionHeading>

        {checkMessage ? (
          <div className="mb-3 flex items-center justify-between rounded-[3px] border border-open-line bg-open-bg px-3 py-2 text-[12px] text-ink">
            <span className="flex items-center gap-2">
              <span className="text-open">●</span>
              {checkMessage}
            </span>
            <button
              type="button"
              onClick={() => setCheckMessage(null)}
              className="text-ink-3 hover:text-ink text-[11px] ml-4 cursor-pointer"
            >
              ✕
            </button>
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
                        <span className="rounded-[2px] border border-amend-line bg-amend-bg px-1.5 py-[1px] text-[10px] text-amend">
                          {lang === "th" ? "ปิดปรับปรุง 00:00–04:00" : "Maintenance 00:00–04:00"}
                        </span>
                      ) : null}
                    </div>
                    <span className="mt-0.5 block text-[10px] text-ink-3">
                      {source.portal} · {source.format}
                    </span>
                    {source.error ? (
                      <p className="mt-1.5 max-w-[420px] rounded-[3px] border border-risk-line bg-risk-bg px-2 py-1.5 text-[11px] leading-relaxed text-risk">
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
                          className={`w-[4px] rounded-[1px] transition-all ${
                            succeeded === null
                              ? "h-[5px] bg-line/60"
                              : succeeded
                                ? "h-[12px] bg-open"
                                : "h-[16px] bg-risk"
                          }`}
                          title={
                            succeeded === null
                              ? (lang === "th" ? "ยังไม่มีรอบทำงาน" : "No run recorded yet")
                              : succeeded
                                ? (lang === "th" ? "สำเร็จ" : "Succeeded")
                                : (lang === "th" ? "ล้มเหลว" : "Failed")
                          }
                        />
                      ))}
                    </span>
                    <span className="sr-only">
                      {source.history.filter((s) => s === true).length}/{source.history.filter((s) => s !== null).length} runs succeeded
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
                      onClick={() => handleHealthCheck(source.id)}
                      disabled={checkingSourceIds.length > 0 || isRefreshing}
                      className={`${btn.secondary} text-[11px] py-1 px-2.5`}
                    >
                      {checkingSourceIds.includes(source.id) ? (
                        <span className="animate-spin inline-block mr-1">↻</span>
                      ) : null}
                      {lang === "th" ? "ทดสอบการเชื่อมต่อ" : "Check health"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </section>
            </div>
          )}

          {/* Job 2: Extraction Review Queue (FR-23, NFR-17) */}
          {activeJob === "review" && (
            <section>
              <SectionHeading
                right={
                  <span className="text-[11px] text-ink-3">
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
                    { id: "reviewed", label: { th: `ตรวจทานแล้ว (${reviewedCount})`, en: `Reviewed (${reviewedCount})` } },
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
                    className={`${input} text-[12px] h-8`}
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
                      onSuccess={onRefresh}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Job 3: Pipeline Monitoring & Control (FR-24) */}
          {activeJob === "failures" && (
            <PipelineMonitoringSection
              lang={lang}
              onInspect={handleInspect}
              onRetry={handleRetryStep}
              onRetryAllTransient={handleRetryAllTransient}
              onDismiss={handleDismissFailure}
              retryingStep={retryingStep}
              retryingAll={retryingAll}
              dismissingStep={dismissingStep}
              actionMsg={pipelineActionMsg}
            />
          )}

          {/* Job 4: Pipeline Runs & History (FR-24) */}
          {activeJob === "history" && (
            <div className="space-y-8">
              {/* Scheduled Job History (FR-24) */}
              <PipelineRunsSection
                runs={ops.pipelineRuns}
                lang={lang}
              />

              {/* Recent Ingestion Execution Activity */}
              {recentLogs && recentLogs.length > 0 ? (
                <section className="mb-8">
                  <SectionHeading
                    right={
                      <span className="text-[11px] text-ink-3">
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
                              className={`px-3 py-2 text-[10px] font-medium uppercase tracking-[0.12em] text-ink-3 ${
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
                            <td className="px-3 py-2 font-mono tnum text-[11px] text-ink-2 whitespace-nowrap">
                              {log.startedAt}
                            </td>
                            <td className="px-3 py-2">
                              <span className="rounded-[2px] border border-line bg-surface-2 px-1.5 py-[2px] text-[10px] text-ink font-medium">
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
                            <td className="px-3 py-2 text-right font-mono tnum text-[11px] text-ink-2">
                              {log.durationMs > 1000
                                ? `${(log.durationMs / 1000).toFixed(1)}s`
                                : `${log.durationMs}ms`}
                            </td>
                            <td className="px-3 py-2 text-right font-mono tnum text-[11px] text-ink font-medium">
                              {log.itemsDiscovered} / {log.itemsIngested}
                            </td>
                            <td className="px-3 py-2 text-[11px]">
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
            </div>
          )}

          {/* Job 5: Technology & Standards Management */}
          {activeJob === "technologies" && (
            <TechnologiesSection
              technologies={techList}
              isLoading={isTechLoading}
              pendingCount={techPendingCount}
              totalCount={techTotal}
              search={techSearch}
              onSearchChange={setTechSearch}
              statusFilter={techStatusFilter}
              onStatusFilterChange={setTechStatusFilter}
              categoryFilter={techCategoryFilter}
              onCategoryFilterChange={setTechCategoryFilter}
              actionMsg={techActionMsg}
              onApprove={handleApproveTech}
              onReject={handleRejectTech}
              onDelete={handleDeleteTech}
              onOpenAdd={handleOpenAddTech}
              onOpenEdit={handleOpenEditTech}
              lang={lang}
            />
          )}
        </main>
      </div>

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

      {/* Technology Add / Edit Modal */}
      {isTechModalOpen && (
        <AddEditTechnologyModal
          isOpen={isTechModalOpen}
          editingTech={editingTech}
          form={techForm}
          onChangeForm={setTechForm}
          onSubmit={handleSaveTech}
          isLoading={isSubmittingTech}
          error={techFormError}
          lang={lang}
          onClose={() => {
            setIsTechModalOpen(false);
            setTechFormError(null);
          }}
        />
      )}
    </div>
  );
}
