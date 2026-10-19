"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  adminRetryPipelineStep,
  adminSuggestProjects,
  adminUpdateReview,
  adminUpdateTechnology,
  type AdminOperations,
  type AdminTechnology,
  type ApiError,
  type PipelineFailureItem,
  type PipelineRecordDiagnostics,
  type PipelineRunItem,
  type PipelineStageSnapshot,
  type ReviewItem,
  type SourceHealth,
  type SuggestedProject,
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

function ConfidenceBar({ value, label }: { value: number | null | undefined; label: string }) {
  if (value == null) {
    return (
      <span className="flex items-center gap-2 whitespace-nowrap">
        <span className="text-[10px] uppercase font-semibold tracking-[0.1em] text-ink-3">{label}</span>
        <span className="relative h-[4px] w-16 overflow-hidden rounded-full bg-line" />
        <span className="font-mono tnum text-[12px] text-ink-3">—</span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2 whitespace-nowrap">
      <span className="text-[10px] uppercase font-semibold tracking-[0.1em] text-ink-3">{label}</span>
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
  const [activeJob, setActiveJob] = useState<AdminJob>("overview");
  const [jobNavOpen, setJobNavOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(reviewQueue[0]?.docId ?? null);
  const [handled, setHandled] = useState<Record<string, string>>({});
  const [checkingSourceIds, setCheckingSourceIds] = useState<string[]>([]);
  const [checkMessage, setCheckMessage] = useState<string | null>(null);

  // Pipeline Monitoring & Diagnostics State (FR-24)
  const [retryingStep, setRetryingStep] = useState<string | null>(null);
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
      icon: "⚠️",
      label: { th: "งานที่ติดขัดในระบบ", en: "Pipeline Failures" },
      description: { th: "งานดาวน์โหลด, OCR, แยกข้อความ", en: "Stuck tasks & retry controls" },
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

      {/* System & Maintenance Status Panel */}
      <Panel className="overflow-hidden p-3 text-[12px]">
        <div className="flex items-center justify-between">
          <span className="font-medium text-ink-2">
            {lang === "th" ? "หน้าต่าง e-GP" : "e-GP Window"}
          </span>
          {inMaintenance ? (
            <span className="rounded-[2px] border border-amend-line bg-amend-bg px-1.5 py-0.5 text-[10px] font-medium text-amend">
              ⚠️ 00:00–04:00
            </span>
          ) : (
            <span className="rounded-[2px] border border-open-line bg-open-bg px-1.5 py-0.5 text-[10px] font-medium text-open">
              ✓ ปกติ
            </span>
          )}
        </div>
        <p className="mt-1 text-[11px] leading-thai text-ink-3">
          {inMaintenance
            ? lang === "th"
              ? "กำลังอยู่ในช่วงบำรุงรักษาประจำวันของ e-GP"
              : "Nightly e-GP maintenance active"
            : lang === "th"
              ? "ระบบเชื่อมต่อดึงข้อมูลได้ตามปกติ"
              : "e-GP feeds operating normally"}
        </p>

        <div className="mt-2.5 pt-2 border-t border-line flex items-center justify-between text-[11px] text-ink-3">
          <span>{lang === "th" ? "สถานะการเชื่อมต่อ" : "Feed status"}</span>
          <span className="font-mono text-[10px] text-ink-2">
            {isRefreshing
              ? lang === "th"
                ? "กำลังอัปเดต..."
                : "Updating..."
              : lang === "th"
              ? "เชื่อมต่อแล้ว"
              : "Connected"}
          </span>
        </div>
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

          {/* Job 3: Pipeline Failures & Stuck Items (FR-24) */}
          {activeJob === "failures" && (
            <PipelineFailuresSection
              failures={ops.pipelineFailures}
              lang={lang}
              onInspect={handleInspect}
              onRetry={handleRetryStep}
              onDismiss={handleDismissFailure}
              retryingStep={retryingStep}
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

function PipelineStageFunnel({
  stageSnapshot,
  lang,
}: {
  stageSnapshot?: PipelineStageSnapshot;
  lang: "th" | "en";
}) {
  const stages = stageSnapshot?.stages || {};
  const insights = stageSnapshot?.insights || {};

  const funnel = [
    {
      num: 1,
      badge: "Feed / RSS",
      title: lang === "th" ? "1. ตรวจพบประกาศ" : "1. Discovered notices",
      count: stages.fetched ?? 0,
      sub: lang === "th" ? "ดึงผ่าน RSS process3 / CKAN data.go.th" : "Retrieved from RSS & open data portals",
      tech: "process3 & CKAN",
      highlight: false,
    },
    {
      num: 2,
      badge: "PDF Package",
      title: lang === "th" ? "2. ดาวน์โหลดเอกสาร" : "2. PDF packages",
      count: stages.downloaded ?? 0,
      sub: lang === "th" ? "ไฟล์แนบ TOR และราคากลางพร้อมอ่าน" : "TOR attachments ready for text extraction",
      tech: "e-GP Archive",
      highlight: false,
    },
    {
      num: 3,
      badge: "OCR Engine",
      title: lang === "th" ? "3. ทำ OCR ดิจิทัล" : "3. OCR text ready",
      count: stages.ocr_done ?? 0,
      extra: (stages.ocr_preview ?? 0) > 0 ? `+${stages.ocr_preview} preview` : null,
      sub: lang === "th" ? "แปลงสแกน PDF เป็นข้อความดิจิทัล" : "Converted scanned PDFs to readable text",
      tech: "Tesseract OCR",
      highlight: false,
    },
    {
      num: 4,
      badge: "Gemini AI",
      title: lang === "th" ? "4. สกัดข้อมูล IT สำเร็จ" : "4. Structured TORs",
      count: insights.extracted ?? 0,
      extra: (insights.excluded ?? 0) > 0 ? `${insights.excluded} non-IT` : null,
      sub: lang === "th" ? "พร้อมให้ผู้ใช้ค้นหาและประเมินความเสี่ยง" : "Ready for search, matching & risk check",
      tech: "Gemini 2.5 Flash",
      highlight: true,
    },
  ];

  return (
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {funnel.map((item, idx) => (
          <Panel
            key={item.num}
            className={`p-4 flex flex-col justify-between relative transition-shadow hover:shadow-xs ${
              item.highlight
                ? "border-open-line bg-open-bg/15"
                : "border-line bg-surface"
            }`}
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold tracking-wider text-ink-3">
                  STAGE {item.num}
                </span>
                <span
                  className={`rounded-[2px] border px-1.5 py-[1px] text-[10px] ${
                    item.highlight
                      ? "border-open-line bg-open-bg text-open font-semibold"
                      : "border-line bg-surface-2 text-ink-2"
                  }`}
                >
                  {item.badge}
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <p
                  className={`font-mono tnum text-[26px] font-bold ${
                    item.highlight ? "text-open" : "text-ink"
                  }`}
                >
                  {item.count.toLocaleString()}
                </p>
                {item.extra && (
                  <span className="text-[11px] text-amend font-medium">
                    ({item.extra})
                  </span>
                )}
              </div>
              <p className="mt-1 text-[13px] font-medium leading-tight text-ink">
                {item.title}
              </p>
            </div>
            <div className="mt-3 border-t border-line/60 pt-2 flex items-center justify-between text-[11px] text-ink-3">
              <span className="leading-thai truncate">{item.sub}</span>
              {idx < funnel.length - 1 && (
                <span className="hidden lg:inline text-ink-3 ml-1">→</span>
              )}
            </div>
          </Panel>
        ))}
      </div>
    </section>
  );
}

function PipelineFailuresSection({
  failures,
  lang,
  onInspect,
  onRetry,
  onDismiss,
  retryingStep,
  dismissingStep,
  actionMsg,
}: {
  failures?: PipelineFailureItem[];
  lang: "th" | "en";
  onInspect: (projectId: string) => void;
  onRetry: (projectId: string, step: string) => Promise<void>;
  onDismiss: (projectId: string, step: string) => Promise<void>;
  retryingStep: string | null;
  dismissingStep: string | null;
  actionMsg: { text: string; type: "success" | "error" } | null;
}) {
  const failureCount = failures?.length ?? 0;

  return (
    <section className="mb-8">
      <SectionHeading
        right={
          failureCount > 0 ? (
            <span className="rounded-[2px] border border-risk-line bg-risk-bg px-2 py-0.5 text-[11px] text-risk font-semibold">
              {failureCount} {lang === "th" ? "รายการที่ติดขัด" : "stuck task(s)"}
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

function PipelineFailureRow({
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
  onRetry: (projectId: string, step: string) => Promise<void>;
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
            onClick={() => onRetry(failure.projectId, failure.step)}
            disabled={isRetrying || isDismissing}
            className={`${btn.primary} text-[11px] py-1 px-2.5`}
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
            onClick={() => onDismiss(failure.projectId, failure.step)}
            disabled={isRetrying || isDismissing}
            className={`${btn.ghost} text-[11px] py-1 px-2 text-ink-3 hover:text-risk`}
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
}

function PipelineRunsSection({
  runs,
  lang,
}: {
  runs?: PipelineRunItem[];
  lang: "th" | "en";
}) {
  if (!runs || runs.length === 0) return null;

  return (
    <section className="mb-8">
      <SectionHeading
        right={
          <span className="text-[11px] text-ink-3">
            {runs.length} {lang === "th" ? "รอบล่าสุด" : "recent runs"}
          </span>
        }
        sub={
          lang === "th"
            ? "บันทึกการทำงานของคำสั่งอัตโนมัติ (poll, sweep, process) พร้อมสถานะของแต่ละขั้นตอน"
            : "Execution telemetry for cron & scheduled pipeline jobs with step breakdown."
        }
      >
        {lang === "th" ? "ประวัติการรัน Job อัตโนมัติ" : "Scheduled job execution history"}
      </SectionHeading>

      <Panel className="overflow-x-auto shadow-xs">
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
              {runs.map((run) => (
                <PipelineRunRow key={run.id} run={run} lang={lang} />
              ))}
            </tbody>
          </table>
        </Panel>
    </section>
  );
}

function PipelineRunRow({
  run,
  lang,
}: {
  run: PipelineRunItem;
  lang: "th" | "en";
}) {
  return (
    <tr className="border-b border-line align-middle last:border-b-0 hover:bg-surface-2/40">
      <td className="px-3 py-2 font-mono tnum text-[11px] text-ink-2 whitespace-nowrap">
        {run.startedAt}
      </td>
      <td className="px-3 py-2">
        <span className="rounded-[2px] border border-line bg-surface-2 px-1.5 py-[2px] text-[10px] text-ink font-semibold uppercase">
          {run.job}
        </span>
      </td>
      <td className="px-3 py-2">
        <span
          className={`inline-flex rounded-[2px] border px-1.5 py-[2px] text-[10px] uppercase font-medium ${
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
      <td className="px-3 py-2 text-right font-mono tnum text-[11px] text-ink-2">
        {run.durationMs > 1000
          ? `${(run.durationMs / 1000).toFixed(1)}s`
          : `${run.durationMs}ms`}
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {run.steps && run.steps.length > 0 ? (
            run.steps.map((step, idx) => (
              <span
                key={idx}
                className={`inline-flex items-center gap-1 rounded-[2px] border px-1.5 py-[1px] text-[10px] ${
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
            ))
          ) : (
            <span className="text-[11px] text-ink-3 italic">
              {lang === "th" ? "ไม่มีขั้นตอนย่อย" : "No step details"}
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}

function ReviewItemCard({
  item,
  lang,
  isOpen,
  onToggle,
  resolution,
  onResolution,
  onSuccess,
}: {
  item: ReviewItem;
  lang: "th" | "en";
  isOpen: boolean;
  onToggle: () => void;
  resolution: string | null;
  onResolution: (text: string) => void;
  onSuccess?: () => void;
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
  const [savedSuccess, setSavedSuccess] = useState<string | null>(null);

  const [prevDocId, setPrevDocId] = useState(item.docId);
  if (prevDocId !== item.docId) {
    setPrevDocId(item.docId);
    const initial: Record<string, string> = {};
    for (const f of item.lowFields) {
      initial[f.field] = f.value;
    }
    setFieldValues(initial);
  }

  const handleSaveAndPublish = async () => {
    setIsSubmitting(true);
    setErrorMsg(null);
    setSavedSuccess(null);

    try {
      const fieldsPayload: UpdateReviewPayload["fields"] = {};
      for (const [key, rawVal] of Object.entries(fieldValues)) {
        const val = String(rawVal ?? "").trim();
        if (key.includes("ชื่อโครงการ") || key.includes("Project Title") || key === "title") {
          fieldsPayload.title = val;
        } else if (key.includes("หน่วยงาน") || key.includes("Agency Name") || key === "agency") {
          fieldsPayload.agency = val;
        } else if (
          key.includes("ราคากลาง") ||
          key.includes("Reference Price") ||
          key.includes("Maximum Budget")
        ) {
          const num = Number(val.replace(/,/g, ""));
          fieldsPayload.referencePriceTHB = Number.isFinite(num) ? num : null;
        } else if (key.includes("งบประมาณ") || key.includes("Budget")) {
          const num = Number(val.replace(/,/g, ""));
          fieldsPayload.budgetTHB = Number.isFinite(num) ? num : null;
        } else if (key.includes("Deadline")) {
          fieldsPayload.submissionDeadline = val || null;
        } else if (key.includes("Penalty")) {
          fieldsPayload.penaltyClause = val || null;
        } else if (key.includes("Tech")) {
          fieldsPayload.requiredTechnologies = val || "";
        }
      }

      const res = await adminUpdateReview(item.docId, {
        action: "approve",
        fields: fieldsPayload,
      });

      setIsSubmitting(false);
      if (res.ok) {
        const successNotice =
          lang === "th"
            ? "บันทึกและเผยแพร่ข้อมูลสำเร็จแล้ว (แสดงผลต่อสาธารณะ)"
            : "Saved & Published successfully (publicly visible)";
        setSavedSuccess(successNotice);
        onResolution(lang === "th" ? "ตรวจทานและเผยแพร่แล้ว" : "Saved & Published");
        onSuccess?.();
      } else {
        setErrorMsg(res.error.message);
      }
    } catch (err: unknown) {
      setIsSubmitting(false);
      setErrorMsg(
        err instanceof Error ? err.message : lang === "th" ? "เกิดข้อผิดพลาดในการบันทึก" : "Failed to save review item"
      );
    }
  };

  const handleReclassify = async () => {
    setIsSubmitting(true);
    setErrorMsg(null);
    setSavedSuccess(null);

    const res = await adminUpdateReview(item.docId, {
      action: "reclassify",
      reclassifyReason: item.misclassified?.likely || "Civil works — out of scope",
    });

    setIsSubmitting(false);
    if (res.ok) {
      const msg = lang === "th" ? "จัดประเภทเป็นงานนอกขอบเขตแล้ว" : "Reclassified out of scope";
      setSavedSuccess(msg);
      onResolution(msg);
      onSuccess?.();
    } else {
      setErrorMsg(res.error.message);
    }
  };

  const handleConfirmClassification = async () => {
    setIsSubmitting(true);
    setErrorMsg(null);
    setSavedSuccess(null);

    const res = await adminUpdateReview(item.docId, {
      action: "confirm_classification",
    });

    setIsSubmitting(false);
    if (res.ok) {
      const msg = lang === "th" ? "ยืนยันการจัดประเภทแล้ว" : "Classification confirmed";
      setSavedSuccess(msg);
      onResolution(msg);
      onSuccess?.();
    } else {
      setErrorMsg(res.error.message);
    }
  };

  const handleReExtract = async () => {
    setIsSubmitting(true);
    setErrorMsg(null);
    setSavedSuccess(null);

    const res = await adminReExtract(item.docId);

    setIsSubmitting(false);
    if (res.ok) {
      const msg = lang === "th" ? "ส่งอ่านใหม่แล้ว" : "Re-queued";
      setSavedSuccess(msg);
      onResolution(msg);
      onSuccess?.();
    } else {
      setErrorMsg(res.error.message);
    }
  };

  const isReviewed =
    item.reviewStatus === "approved" ||
    Boolean(savedSuccess) ||
    resolution?.includes("ตรวจทาน") ||
    resolution?.includes("บันทึก") ||
    resolution?.includes("Published");

  const isExcluded =
    item.reviewStatus === "rejected" ||
    resolution?.includes("นอกขอบเขต") ||
    resolution?.includes("scope");

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
            {isReviewed ? (
              <span className="rounded-[2px] border border-open-line bg-open-bg px-1.5 py-[2px] text-[10px] font-medium text-open">
                {lang === "th" ? "ตรวจทานแล้ว" : "Reviewed"}
              </span>
            ) : isExcluded ? (
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
          {savedSuccess ? (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-[3px] border border-open-line bg-open-bg p-3 text-[13px] text-open">
              <span className="flex items-center gap-2 font-medium">
                <span className="text-[14px]">✓</span>
                <span>{savedSuccess}</span>
              </span>
              <a
                href={`/tor/${item.docId}`}
                target="_blank"
                rel="noreferrer"
                className="text-[12px] font-medium underline hover:text-ink"
              >
                {lang === "th" ? "ดูหน้าประกาศบนเว็บ ↗" : "View on GIPDP ↗"}
              </a>
            </div>
          ) : null}

          {errorMsg ? (
            <div className="mb-3 rounded-[3px] border border-risk-line bg-risk-bg p-2.5 text-[12px] text-risk">
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
                    className={`${input} flex-1`}
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
                  disabled={isSubmitting || Boolean(savedSuccess)}
                  onClick={handleSaveAndPublish}
                  className={savedSuccess ? btn.secondary : btn.primary}
                >
                  {isSubmitting
                    ? lang === "th"
                      ? "กำลังบันทึก..."
                      : "Saving..."
                    : savedSuccess
                      ? lang === "th"
                        ? "✓ เผยแพร่แล้ว"
                        : "✓ Published"
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

function TechnologiesSection({
  technologies,
  isLoading,
  pendingCount,
  totalCount,
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  categoryFilter,
  onCategoryFilterChange,
  actionMsg,
  onApprove,
  onReject,
  onDelete,
  onOpenAdd,
  onOpenEdit,
  lang,
}: {
  technologies: AdminTechnology[];
  isLoading: boolean;
  pendingCount: number;
  totalCount: number;
  search: string;
  onSearchChange: (val: string) => void;
  statusFilter: string;
  onStatusFilterChange: (val: string) => void;
  categoryFilter: string;
  onCategoryFilterChange: (val: string) => void;
  actionMsg: { text: string; type: "success" | "error" } | null;
  onApprove: (id: string, name: string) => void;
  onReject: (id: string, name: string) => void;
  onDelete: (id: string, name: string) => void;
  onOpenAdd: () => void;
  onOpenEdit: (tech: AdminTechnology) => void;
  lang: "th" | "en";
}) {
  const CATEGORIES = [
    { id: "all", label: { th: "ทุกหมวดหมู่", en: "All Categories" } },
    { id: "Framework", label: { th: "Framework & Library", en: "Framework & Library" } },
    { id: "Database", label: { th: "Database (ฐานข้อมูล)", en: "Database" } },
    { id: "Language", label: { th: "Programming Language", en: "Programming Language" } },
    { id: "Operating System", label: { th: "Operating System (ระบบปฏิบัติการ)", en: "Operating System" } },
    { id: "Virtualization / Container", label: { th: "Virtualization & Container", en: "Virtualization & Container" } },
    { id: "Cloud / Infrastructure", label: { th: "Cloud & Infrastructure", en: "Cloud & Infrastructure" } },
    { id: "Standard / ISO", label: { th: "Standard & Certifications (ISO/CMMI)", en: "Standard & ISO" } },
    { id: "Security / Network", label: { th: "Security & Network", en: "Security & Network" } },
    { id: "Other", label: { th: "อื่น ๆ", en: "Other" } },
  ];

  const pendingItems = technologies.filter((t) => t.status === "new");

  const filteredTech = technologies.filter((t) => {
    if (categoryFilter !== "all") {
      const catLower = (t.category || "").toLowerCase();
      const targetLower = categoryFilter.toLowerCase();
      if (!catLower.includes(targetLower)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header & Primary Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[18px] font-bold text-ink">
              {lang === "th"
                ? "คลังเทคโนโลยีและมาตรฐาน (Tech & Standards Vocabulary)"
                : "Technology & Standards Vocabulary"}
            </h2>
            {pendingCount > 0 && (
              <span className="rounded-[2px] border border-amend-line bg-amend-bg px-2 py-0.5 text-[11px] font-semibold text-amend">
                {lang === "th" ? `รออนุมัติ ${pendingCount} รายการ` : `${pendingCount} pending`}
              </span>
            )}
          </div>
          <p className="mt-1 text-[13px] text-ink-2">
            {lang === "th"
              ? "จัดการคำศัพท์ที่ใช้ในการสกัดข้อมูล TOR ตรวจจับ Lock-spec และจับคู่ความสามารถของผู้ใช้ (Matching)"
              : "Shared vocabulary for TOR extraction, lock-spec analysis, and contractor profile matching."}
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenAdd}
          className={`${btn.primary} h-9 px-3.5 text-[12px] flex items-center gap-1.5 shrink-0`}
        >
          <span className="text-[14px] font-bold leading-none">+</span>
          <span>{lang === "th" ? "เพิ่มเทคโนโลยี / มาตรฐาน" : "Add Tech / Standard"}</span>
        </button>
      </div>

      {/* Action Notification Banner */}
      {actionMsg && (
        <div
          className={`rounded-[3px] border p-3 text-[12px] animate-in fade-in flex items-center justify-between ${
            actionMsg.type === "success"
              ? "border-open-line bg-open-bg text-open"
              : "border-risk-line bg-risk-bg text-risk"
          }`}
        >
          <span>{actionMsg.text}</span>
        </div>
      )}

      {/* Section 1: Pending User Requests (Review Queue) */}
      {pendingItems.length > 0 && (
        <Panel className="border-amend-line bg-amend-bg/10 overflow-hidden">
          <div className="border-b border-amend-line/40 bg-amend-bg/30 px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[14px]">⏳</span>
              <h3 className="text-[13px] font-bold text-ink">
                {lang === "th" ? "คำขอใหม่รอการอนุมัติจากผู้ใช้" : "Pending Requests from Users"}
              </h3>
              <span className="rounded-full bg-amend text-surface text-[10px] font-bold px-2 py-0.2">
                {pendingItems.length}
              </span>
            </div>
            <span className="text-[11px] text-ink-3">
              {lang === "th" ? "ตรวจทานและอนุมัติเข้าสู่ระบบ" : "Review and approve into vocabulary"}
            </span>
          </div>

          <div className="divide-y divide-line/60">
            {pendingItems.map((tech) => (
              <div
                key={tech.id}
                className="p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:bg-surface-2 transition-colors"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-bold text-ink">{tech.name}</span>
                    {tech.category && (
                      <span className="rounded-[2px] border border-line bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-ink-2">
                        {tech.category}
                      </span>
                    )}
                    <span className="rounded-[2px] border border-amend-line bg-amend-bg px-1.5 py-0.5 text-[10px] font-medium text-amend">
                      {lang === "th" ? "รออนุมัติ" : "Pending"}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 text-[11px] text-ink-3">
                    <span>
                      {lang === "th" ? "ที่มา: " : "Origin: "}
                      <strong className="font-normal text-ink-2">
                        {tech.firstSeenIn?.startsWith("user-request")
                          ? lang === "th"
                            ? "ผู้ใช้ขอเพิ่มจากหน้าโปรไฟล์"
                            : "User request from profile"
                          : tech.firstSeenIn || "User request"}
                      </strong>
                    </span>
                    {tech.createdAt && (
                      <span>
                        {new Date(tech.createdAt).toLocaleDateString(
                          lang === "th" ? "th-TH" : "en-US",
                          { dateStyle: "medium" },
                        )}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                  <button
                    type="button"
                    onClick={() => onApprove(tech.id, tech.name)}
                    className="cursor-pointer rounded-[3px] border border-open-line bg-open-bg px-2.5 py-1 text-[11px] font-medium text-open hover:bg-open hover:text-white transition-colors"
                  >
                    ✓ {lang === "th" ? "อนุมัติ" : "Approve"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenEdit(tech)}
                    className="cursor-pointer rounded-[3px] border border-line bg-surface px-2.5 py-1 text-[11px] font-medium text-ink hover:border-ink transition-colors"
                  >
                    ✏️ {lang === "th" ? "แก้ไขก่อนอนุมัติ" : "Edit & Approve"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onReject(tech.id, tech.name)}
                    className="cursor-pointer rounded-[3px] border border-risk-line bg-risk-bg px-2.5 py-1 text-[11px] font-medium text-risk hover:bg-risk hover:text-white transition-colors"
                  >
                    ✕ {lang === "th" ? "ปฏิเสธ" : "Reject"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Section 2: All Technologies Directory */}
      <Panel className="overflow-hidden">
        {/* Filter Toolbar */}
        <div className="border-b border-line bg-surface-2 p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative min-w-[200px] sm:min-w-[240px]">
              <input
                type="text"
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={lang === "th" ? "ค้นหาชื่อ หรือคำพ้อง..." : "Search name or alias..."}
                className={`${input} h-8 text-[12px] pr-7 w-full`}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => onSearchChange("")}
                  className="absolute right-2 top-2 text-ink-3 hover:text-ink text-[12px] cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Category Select */}
            <select
              value={categoryFilter}
              onChange={(e) => onCategoryFilterChange(e.target.value)}
              className={`${input} h-8 text-[12px] cursor-pointer w-auto`}
            >
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label[lang]}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter Pills */}
          <div className="flex items-center gap-1.5 self-start md:self-auto">
            {[
              { id: "all", label: { th: "ทั้งหมด", en: "All" } },
              { id: "confirmed", label: { th: "ยืนยันแล้ว", en: "Confirmed" } },
              { id: "new", label: { th: "รออนุมัติ", en: "Pending" } },
              { id: "rejected", label: { th: "ปฏิเสธ", en: "Rejected" } },
            ].map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => onStatusFilterChange(st.id)}
                className={`cursor-pointer rounded-[3px] border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  statusFilter === st.id
                    ? "border-ink bg-ink text-surface"
                    : "border-line bg-surface text-ink-2 hover:border-ink hover:text-ink"
                }`}
              >
                {st.label[lang]}
              </button>
            ))}
          </div>
        </div>

        {/* Vocabulary Table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[650px] border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-[10px] uppercase font-semibold text-ink-3 tracking-wider">
                <th className="px-3.5 py-2.5">{lang === "th" ? "ชื่อที่แสดง (Name)" : "Name"}</th>
                <th className="px-3 py-2.5">{lang === "th" ? "หมวดหมู่" : "Category"}</th>
                <th className="px-3 py-2.5">
                  {lang === "th" ? "คำพ้อง / คำที่เขียนคล้ายกัน (Aliases)" : "Aliases"}
                </th>
                <th className="px-3 py-2.5">{lang === "th" ? "สถานะ" : "Status"}</th>
                <th className="px-3 py-2.5 text-right">{lang === "th" ? "การจัดการ" : "Actions"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-ink-3">
                    <span className="animate-spin inline-block text-[14px] mr-2">↻</span>
                    {lang === "th" ? "กำลังโหลดข้อมูลคำศัพท์..." : "Loading vocabulary..."}
                  </td>
                </tr>
              ) : filteredTech.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-ink-3">
                    {lang === "th"
                      ? "ไม่พบเทคโนโลยีหรือมาตรฐานที่ตรงกับเงื่อนไข"
                      : "No matching technologies found."}
                  </td>
                </tr>
              ) : (
                filteredTech.map((tech) => (
                  <tr key={tech.id} className="hover:bg-surface-2 transition-colors">
                    <td className="px-3.5 py-2.5">
                      <div className="font-semibold text-ink">{tech.name}</div>
                      <div className="font-mono text-[10px] text-ink-3">{tech.key}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      {tech.category ? (
                        <span className="inline-block rounded-[2px] border border-line bg-surface px-1.5 py-0.5 text-[11px] text-ink-2">
                          {tech.category}
                        </span>
                      ) : (
                        <span className="text-ink-3 text-[11px]">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 max-w-[280px]">
                      {tech.aliases && tech.aliases.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {tech.aliases.map((alias) => (
                            <span
                              key={alias}
                              className="inline-block rounded-[2px] bg-surface-2 border border-line/60 px-1.5 py-0.2 font-mono text-[10px] text-ink-2"
                            >
                              {alias}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-ink-3 text-[11px]">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {tech.status === "confirmed" ? (
                        <span className="inline-flex items-center gap-1 rounded-[2px] border border-open-line bg-open-bg px-1.5 py-0.5 text-[10px] font-medium text-open">
                          ✓ {lang === "th" ? "ยืนยันแล้ว" : "Confirmed"}
                        </span>
                      ) : tech.status === "rejected" ? (
                        <span className="inline-flex items-center gap-1 rounded-[2px] border border-risk-line bg-risk-bg px-1.5 py-0.5 text-[10px] font-medium text-risk">
                          ✕ {lang === "th" ? "ปฏิเสธ" : "Rejected"}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-[2px] border border-amend-line bg-amend-bg px-1.5 py-0.5 text-[10px] font-medium text-amend">
                          ⏳ {lang === "th" ? "รออนุมัติ" : "Pending"}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => onOpenEdit(tech)}
                          className="cursor-pointer rounded-[2px] border border-line bg-surface px-2 py-1 text-[11px] font-medium text-ink hover:border-ink transition-colors"
                          title={lang === "th" ? "แก้ไขข้อมูล" : "Edit details"}
                        >
                          {lang === "th" ? "แก้ไข" : "Edit"}
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(tech.id, tech.name)}
                          className="cursor-pointer rounded-[2px] border border-line bg-surface px-2 py-1 text-[11px] font-medium text-risk hover:border-risk hover:bg-risk-bg transition-colors"
                          title={lang === "th" ? "ลบรายการนี้" : "Delete entry"}
                        >
                          {lang === "th" ? "ลบ" : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer info */}
        <div className="border-t border-line bg-surface-2 px-3.5 py-2 text-[11px] text-ink-3 flex justify-between items-center">
          <span>
            {lang === "th"
              ? `แสดงผล ${filteredTech.length} รายการ (จากทั้งหมด ${totalCount})`
              : `Showing ${filteredTech.length} of ${totalCount}`}
          </span>
          <span className="font-mono text-[10px]">ADR 0014 Vocabulary</span>
        </div>
      </Panel>
    </div>
  );
}

function AddEditTechnologyModal({
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


