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
  PasswordResetCard,
} from "./_components";
import { SignInPrompt } from "../../_components/sign-in-prompt";
import { btn, EmptyState, input, Panel, SectionHeading } from "../../_components/ui";

/**
 * Operational surface, not a marketing one: dense tables, real failure text,
 * and the correction controls sitting next to the thing they correct. The
 * numeric OCR/LLM confidence lives here and only here (§5).
 */

function OverviewTabSkeleton() {
  return (
    <div className="w-full space-y-6 animate-pulse" aria-busy="true">
      {/* 5 KPI Stat Cards Skeleton */}
      <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {[1, 2, 3, 4, 5].map((i) => (
          <Panel key={i} className="px-3 py-2.5 h-[68px]">
            <div className="h-6 w-16 rounded-[2px] bg-surface-3 mb-1.5" />
            <div className="h-3 w-24 rounded-[2px] bg-surface-2" />
          </Panel>
        ))}
      </div>

      {/* Funnel Skeleton */}
      <Panel className="w-full p-4">
        <div className="grid w-full grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-36 rounded-[2px] bg-surface-2" />
          ))}
        </div>
      </Panel>

      {/* Data Sources Table Skeleton */}
      <Panel className="w-full overflow-x-auto shadow-xs">
        <table className="w-full min-w-[820px] border-collapse text-left">
          <thead>
            <tr className="border-b border-line bg-surface-2">
              <th className="px-3 py-2.5 text-[11px] font-medium text-ink-3">แหล่งข้อมูล</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-ink-3">สถานะ</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-ink-3">14 วันล่าสุด</th>
              <th className="px-3 py-2.5 text-right text-[11px] font-medium text-ink-3">ความพร้อมใช้</th>
              <th className="px-3 py-2.5 text-right text-[11px] font-medium text-ink-3">เอกสารในระบบ</th>
              <th className="px-3 py-2.5 text-right text-[11px] font-medium text-ink-3">รอบล่าสุด</th>
              <th className="px-3 py-2.5 text-right text-[11px] font-medium text-ink-3">คำสั่ง</th>
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5].map((i) => (
              <tr key={i} className="border-b border-line last:border-b-0">
                <td className="px-3 py-3">
                  <div className="h-4 w-36 bg-surface-3 rounded mb-1" />
                  <div className="h-2.5 w-24 bg-surface-2 rounded" />
                </td>
                <td className="px-3 py-3"><div className="h-5 w-16 bg-surface-3 rounded" /></td>
                <td className="px-3 py-3"><div className="h-4 w-28 bg-surface-2 rounded" /></td>
                <td className="px-3 py-3 text-right"><div className="h-4 w-12 bg-surface-3 ml-auto rounded" /></td>
                <td className="px-3 py-3 text-right"><div className="h-4 w-10 bg-surface-2 ml-auto rounded" /></td>
                <td className="px-3 py-3 text-right"><div className="h-3.5 w-20 bg-surface-2 ml-auto rounded" /></td>
                <td className="px-3 py-3 text-right"><div className="h-6 w-24 bg-surface-3 ml-auto rounded" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

function ReviewTabSkeleton() {
  return (
    <div className="w-full space-y-4 animate-pulse" aria-busy="true">
      <div className="flex items-center justify-between pb-2">
        <div className="h-5 w-48 rounded-[2px] bg-surface-3" />
        <div className="h-4 w-20 rounded-[2px] bg-surface-2" />
      </div>
      <div className="flex gap-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-8 w-24 rounded-[3px] bg-surface-2" />
        ))}
      </div>
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <Panel key={i} className="p-4 space-y-3">
            <div className="h-5 w-3/4 rounded-[2px] bg-surface-3" />
            <div className="h-3.5 w-1/2 rounded-[2px] bg-surface-2" />
            <div className="h-3 w-1/3 rounded-[2px] bg-surface-2" />
          </Panel>
        ))}
      </div>
    </div>
  );
}

function HistoryTabSkeleton() {
  return (
    <div className="w-full space-y-6 animate-pulse" aria-busy="true">
      {/* 4 KPI Metric Cards Skeleton */}
      <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Panel key={i} className="px-3 py-2.5 h-[68px]">
            <div className="h-6 w-16 rounded-[2px] bg-surface-3 mb-1.5" />
            <div className="h-3 w-28 rounded-[2px] bg-surface-2" />
          </Panel>
        ))}
      </div>

      {/* Table Skeleton */}
      <Panel className="w-full overflow-x-auto shadow-xs">
        <table className="w-full min-w-[820px] border-collapse text-left">
          <thead>
            <tr className="border-b border-line bg-surface-2">
              <th className="px-3.5 py-2.5 text-[11px] font-medium text-ink-3">เวลาเริ่มต้น</th>
              <th className="px-3.5 py-2.5 text-[11px] font-medium text-ink-3">แหล่งข้อมูล</th>
              <th className="px-3.5 py-2.5 text-[11px] font-medium text-ink-3">สถานะ</th>
              <th className="px-3.5 py-2.5 text-right text-[11px] font-medium text-ink-3">เวลาที่ใช้</th>
              <th className="px-3.5 py-2.5 text-right text-[11px] font-medium text-ink-3">ค้นพบ / บันทึก</th>
              <th className="px-3.5 py-2.5 text-[11px] font-medium text-ink-3">ผลการทำงาน</th>
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
              <tr key={i} className="border-b border-line last:border-b-0">
                <td className="px-3.5 py-3"><div className="h-3.5 w-32 rounded bg-surface-3" /></td>
                <td className="px-3.5 py-3"><div className="h-4 w-28 rounded bg-surface-2" /></td>
                <td className="px-3.5 py-3"><div className="h-4 w-16 rounded bg-surface-3" /></td>
                <td className="px-3.5 py-3 text-right"><div className="h-3.5 w-14 rounded bg-surface-3 ml-auto" /></td>
                <td className="px-3.5 py-3 text-right"><div className="h-3.5 w-16 rounded bg-surface-3 ml-auto" /></td>
                <td className="px-3.5 py-3"><div className="h-3.5 w-36 rounded bg-surface-2" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

export default function AdminPage() {
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
      <div className="mx-auto w-full max-w-[1240px] px-4 py-10">
        <SignInPrompt
          next="/admin"
          headline={"ส่วนนี้สำหรับผู้ดูแลระบบ"}
          body={
            "เข้าสู่ระบบด้วยบัญชีผู้ดูแลเพื่อดูสถานะ scraper และคิวตรวจทาน"
          }
          cta={"เข้าสู่ระบบ"}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-[1240px] px-4 py-10">
        <EmptyState
          headline={
            error.status === 403
              ? "บัญชีของคุณไม่มีสิทธิ์เข้าถึงส่วนนี้"
              : "โหลดข้อมูลไม่สำเร็จ"
          }
          body={
            error.status === 403
              ? "ส่วนนี้จำกัดเฉพาะผู้ดูแลระบบ หากคุณควรมีสิทธิ์ ให้ติดต่อคนในทีมเพื่อกำหนดบทบาทให้"
              : error.message
          }
        />
      </div>
    );
  }

  return (
    <Suspense fallback={<div className="mx-auto w-full max-w-[1240px] px-4 py-6 min-h-[640px]" />}>
      <AdminDashboard
        ops={ops}
        onRefresh={loadOperations}
        isRefreshing={isRefreshing}
      />
    </Suspense>
  );
}

export type AdminJob = "overview" | "review" | "failures" | "history" | "technologies";

function AdminDashboard({
  ops,
  onRefresh,
  isRefreshing,
}: {
  ops: AdminOperations | null;
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  const scraperSources = ops?.sources ?? [];
  const reviewQueue = ops?.reviewQueue ?? [];
  const pipelineStats: AdminOperations["stats"] = ops?.stats ?? {
    totalIndexedTors: 0,
    docsIngestedToday: 0,
    docsAwaitingReview: 0,
    avgOcrConfidence: 0,
    avgExtractionConfidence: 0,
    amendmentsDetected7d: 0,
  };
  const recentLogs = ops?.recentLogs ?? [];
  const searchParams = useSearchParams();
  const rawParam = searchParams.get("job") || searchParams.get("tab");
  const jobParam = rawParam === "monitoring" ? "failures" : rawParam;
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
  const [isTechLoading, setIsTechLoading] = useState(true);
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
      setIsTechLoading(false);
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
        text: `อนุมัติ ${name} เรียบร้อยแล้ว`,
        type: "success",
      });
      refreshTechnologies();
    } else {
      setTechActionMsg({ text: res.error.message, type: "error" });
    }
  };

  const handleRejectTech = async (id: string, name: string) => {
    const confirmed = window.confirm(
      `ยืนยันปฏิเสธคำขอ "${name}" หรือไม่?`,
    );
    if (!confirmed) return;
    setTechActionMsg(null);
    const res = await adminUpdateTechnology(id, { status: "rejected" });
    if (res.ok) {
      setTechActionMsg({
        text: `ปฏิเสธคำขอ ${name} เรียบร้อยแล้ว`,
        type: "success",
      });
      refreshTechnologies();
    } else {
      setTechActionMsg({ text: res.error.message, type: "error" });
    }
  };

  const handleDeleteTech = async (id: string, name: string) => {
    const confirmed = window.confirm(
      `ยืนยันลบ "${name}" ออกจากระบบหรือไม่?`,
    );
    if (!confirmed) return;
    setTechActionMsg(null);
    const res = await adminDeleteTechnology(id);
    if (res.ok) {
      setTechActionMsg({
        text: `ลบ ${name} ออกจากระบบแล้ว`,
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
      setTechFormError("กรุณาระบุชื่อ");
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
          text: `บันทึกข้อมูล ${name} เรียบร้อยแล้ว`,
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
          text: `เพิ่ม ${name} เข้าสู่คลังคำศัพท์เรียบร้อยแล้ว`,
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
        "รหัสโครงการต้องเป็นตัวเลข 11 หลัก เช่น 69099683466",
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
          `เพิ่มโครงการ ${res.data.projectId} และดาวน์โหลดเอกสาร e-GP เรียบร้อยแล้ว`,
      });
      onRefresh();
      handleInspect(cleanId);
    } else {
      setAddError(res.error.message);
    }
  };

  const handleRetryStep = async (
    projectId: string,
    step: string,
    runNow: boolean = false,
    maxPages?: number,
  ) => {
    const key = `${projectId}-${step}`;
    setRetryingStep(key);
    setPipelineActionMsg(null);
    const res = await adminRetryPipelineStep(projectId, step, runNow, maxPages);
    setRetryingStep(null);
    if (res.ok) {
      setPipelineActionMsg({
        type: "success",
        text:
          runNow
              ? `สั่งรันขั้นตอน (${step}) สำหรับโครงการ ${projectId} ทันทีเรียบร้อยแล้ว`
              : `รีเซ็ตและส่งโครงการ ${projectId} ขั้นตอน (${step}) เข้าคิวประมวลผลใหม่เรียบร้อยแล้ว`,
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
          `ส่งข้อผิดพลาดชั่วคราวทั้งหมด (${res.data.clearedCount} รายการ) กลับเข้าคิวประมวลผลแล้ว`,
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
      `ยืนยันการละเว้นข้อผิดพลาดของโครงการ ${projectId} (${step})? ระบบจะยกเว้นเอกสารนี้และไม่ดึงมาประมวลผลซ้ำอีก`;
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
          `ละเว้นข้อผิดพลาดโครงการ ${projectId} (${step}) เรียบร้อยแล้ว`,
      });
      onRefresh();
    } else {
      setPipelineActionMsg({
        type: "error",
        text: res.error.message,
      });
    }
  };

  // Review Queue Search, Filter & Sort
  const [filterTab, setFilterTab] = useState<"all" | "pending" | "misclassified" | "low-confidence" | "reviewed">("all");
  const [sortOption, setSortOption] = useState<"confidence-asc" | "confidence-desc" | "newest" | "budget-desc">("confidence-asc");
  const [searchQuery, setSearchQuery] = useState("");

  const pendingCount = reviewQueue.filter(
    (item) => !handled[item.docId] && item.reviewStatus !== "approved",
  ).length;
  const misclassifiedCount = reviewQueue.filter((item) => item.misclassified).length;
  const lowConfidenceCount = reviewQueue.filter(
    (item) => (item.ocr != null && item.ocr < 0.8) || item.extraction < 0.8,
  ).length;
  const reviewedCount = reviewQueue.filter(
    (item) => Boolean(handled[item.docId]) || item.reviewStatus === "approved",
  ).length;

  const filteredQueue = reviewQueue.filter((item) => {
    const isHandled = Boolean(handled[item.docId]) || item.reviewStatus === "approved";
    if (filterTab === "pending" && isHandled) return false;
    if (filterTab === "misclassified" && !item.misclassified) return false;
    if (filterTab === "low-confidence" && !((item.ocr != null && item.ocr < 0.8) || item.extraction < 0.8)) return false;
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

  const sortedQueue = [...filteredQueue].sort((a, b) => {
    if (sortOption === "confidence-asc") {
      const aScore = Math.min(a.extraction, a.ocr ?? a.extraction);
      const bScore = Math.min(b.extraction, b.ocr ?? b.extraction);
      return aScore - bScore;
    }
    if (sortOption === "confidence-desc") {
      const aScore = Math.min(a.extraction, a.ocr ?? a.extraction);
      const bScore = Math.min(b.extraction, b.ocr ?? b.extraction);
      return bScore - aScore;
    }
    if (sortOption === "budget-desc") {
      const aBudget = a.details?.budgetTHB ?? 0;
      const bBudget = b.details?.budgetTHB ?? 0;
      return bBudget - aBudget;
    }
    const aDate = a.ingestedAt ? new Date(a.ingestedAt.replace(" ", "T")).getTime() : 0;
    const bDate = b.ingestedAt ? new Date(b.ingestedAt.replace(" ", "T")).getTime() : 0;
    return bDate - aDate;
  });

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
              ? "ปกติ"
              : r.status === "degraded"
                ? "ล่าช้า"
                : "ขัดข้อง";
          return `${sName}: ${statusText} (${r.latencyMs}ms)`;
        })
        .join(" · ");
      setCheckMessage(
        ("ผลการตรวจสอบการเชื่อมต่อ: ") + summary,
      );
      onRefresh();
    } else {
      setCheckMessage(res.error.message);
    }
  };

  const stats = [
    {
      value: pipelineStats.totalIndexedTors ?? 29,
      label: "เอกสารทั้งหมดในระบบ",
    },
    {
      value: pipelineStats.docsIngestedToday,
      label: "เอกสารเข้าวันนี้",
    },
    {
      value: pipelineStats.docsAwaitingReview ?? pendingCount,
      label: "รอตรวจทาน",
    },
    {
      value: `${Math.round(pipelineStats.avgOcrConfidence * 100)}%`,
      label: "ความมั่นใจ OCR เฉลี่ย",
    },
    {
      value: `${Math.round(pipelineStats.avgExtractionConfidence * 100)}%`,
      label: "ความมั่นใจการสกัดข้อมูล",
    },
    ...(pipelineStats.requestStreak &&
    (pipelineStats.requestStreak.inARow >= 180 ||
      pipelineStats.requestStreak.cooldownRemainingMs > 0)
      ? [
          {
            value: `${pipelineStats.requestStreak.inARow} / ${pipelineStats.requestStreak.limit}`,
            label:
              pipelineStats.requestStreak.cooldownRemainingMs > 0
                ? `e-GP Pacer (คูลดาวน์ ${Math.ceil(pipelineStats.requestStreak.cooldownRemainingMs / 60000)}น.)`
                : "e-GP ใกล้ถึงขีดจำกัด (Burst)",
          },
        ]
      : []),
  ];

  const ADMIN_JOBS: {
    id: AdminJob;
    icon: string;
    label: string;
    description: string;
    badge?: number;
    badgeTone?: "risk" | "amend" | "neutral";
  }[] = [
    {
      id: "overview",
      icon: "📊",
      label: "ภาพรวม & สแครปเปอร์",
      description: "ตัวชี้วัด, Funnel และสุขภาพแหล่งข้อมูล",
    },
    {
      id: "review",
      icon: "📋",
      label: "คิวตรวจทานเอกสาร",
      description: "ความมั่นใจ < 80% หรือจัดประเภทผิด",
      badge:
        ops && (pipelineStats.docsAwaitingReview ?? pendingCount) > 0
          ? (pipelineStats.docsAwaitingReview ?? pendingCount)
          : undefined,
      badgeTone: "amend",
    },
    {
      id: "failures",
      icon: "⚙️",
      label: "เฝ้าระวัง Pipeline",
      description: "ตัวกรองทุกขั้นตอน & จัดการรายโครงการ",
      badge: (ops?.pipelineFailures?.length ?? 0) > 0 ? ops?.pipelineFailures?.length : undefined,
      badgeTone: "risk",
    },
    {
      id: "history",
      icon: "⏱️",
      label: "ประวัติงาน & บันทึก",
      description: "รอบประมวลผลและ Audit Log",
      badge: (ops?.pipelineRuns?.length ?? 0) > 0 ? ops?.pipelineRuns?.length : undefined,
      badgeTone: "neutral",
    },
    {
      id: "technologies",
      icon: "🏷️",
      label: "คลังเทคโนโลยี & มาตรฐาน",
      description: "จัดการคำขอและคลังคำศัพท์ระบบ",
      badge: techPendingCount > 0 ? techPendingCount : undefined,
      badgeTone: "amend",
    },
  ];

  const activeJobObj = ADMIN_JOBS.find((j) => j.id === activeJob) ?? ADMIN_JOBS[0];
  const currentJobLabel = activeJobObj.label;

  const adminRail = (
    <div className="flex flex-col gap-4">
      {/* Jobs Selection Panel */}
      <Panel className="overflow-hidden">
        <div className="border-b border-line bg-surface-2 px-3.5 py-2.5">
          <h2 className="text-[12px] font-semibold text-ink">
            {"หน้าที่ผู้ดูแล (Admin Jobs)"}
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
                      {job.label}
                    </span>
                  </div>
                  <p
                    className={`mt-0.5 text-[11px] leading-thai ${
                      isActive ? "text-surface/80" : "text-ink-3"
                    }`}
                  >
                    {job.description}
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
    <div className="mx-auto w-full max-w-[1240px] px-4 py-6">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-line pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-[2px] bg-ink text-surface px-1.5 py-0.5 text-[10px] uppercase font-semibold tracking-wider font-mono">
              ADMIN OPS
            </span>
            <span className="text-[11px] text-ink-3">
              {"แดชบอร์ดดูแลระบบและความสมบูรณ์ข้อมูล"}
            </span>
          </div>
          <h1 className="mt-1.5 text-[24px] sm:text-[28px] leading-tight font-bold tracking-tight text-ink">
            {"สุขภาพระบบเก็บข้อมูลและการตรวจสอบข้อมูล"}
          </h1>
          <p className="mt-1 text-[13px] text-ink-2">
            {"ระบบติดตามการดึงข้อมูล e-GP ตรวจสอบความถูกต้องของการสกัดข้อความ และจัดการงานที่ติดขัด"}
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
                placeholder={"ตรวจสอบโครงการ (รหัส/ชื่อ)..."}
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
                title={"ตรวจสอบสถานะรายโครงการ (Enter)"}
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
                  <span>{"โครงการที่พบ"}</span>
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
            <span>{"เพิ่มโครงการ e-GP"}</span>
          </button>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing || checkingSourceIds.length > 0}
            className={`${btn.secondary} h-9 px-3 text-[12px]`}
            aria-label={"รีเฟรชสถานะ"}
          >
            {isRefreshing ? (
              <span className="animate-spin inline-block">↻</span>
            ) : (
              "↻"
            )}{" "}
            <span className="hidden sm:inline">{"รีเฟรช"}</span>
          </button>
        </div>
      </header>

      {/* Semi-Sidebar Layout Matching /search */}
      <div className="w-full grid gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
        {/* Mobile Job Switcher Button (lg:hidden) */}
        <div className="lg:hidden">
          <button
            type="button"
            onClick={() => setJobNavOpen(!jobNavOpen)}
            aria-expanded={jobNavOpen}
            className={`${btn.secondary} w-full justify-between`}
          >
            <span className="flex items-center gap-2">
              <span className="text-ink-3">{"หน้าที่งาน:"}</span>
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
        <main className="w-full min-w-0 min-h-[640px]">
          {/* Job 1: Overview & Scrapers */}
          <div className={activeJob === "overview" ? "block w-full" : "hidden"}>
            {!ops ? (
              <OverviewTabSkeleton />
            ) : (
            <div className="w-full">
              {/* KPI Stats Strip */}
              <div className="mb-6 grid w-full grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {stats.map((stat) => (
                  <Panel key={stat.label} className="px-3 py-2.5">
                    <p className="font-mono tnum text-[24px] leading-none font-medium text-ink">
                      {stat.value}
                    </p>
                    <p className="mt-1.5 text-[11px] leading-thai text-ink-3">{stat.label}</p>
                  </Panel>
                ))}
              </div>

              {/* Pipeline Stage Funnel (FR-24) */}
              <PipelineStageFunnel stageSnapshot={ops.stageSnapshot} />

      {/* Scrapers by Source */}
      <section className="mb-8 w-full">
        <SectionHeading
          right={
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => handleHealthCheck("all")}
                disabled={checkingSourceIds.length > 0 || isRefreshing}
                className={btn.primary}
              >
                {"ทดสอบการเชื่อมต่อทุกแหล่ง"}
              </button>
            </div>
          }
        >
          {"สถานะการเชื่อมต่อแหล่งข้อมูล"}
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

        <Panel className="w-full overflow-x-auto shadow-xs">
          <table className="w-full min-w-[820px] border-collapse text-left">
            <thead>
              <tr className="border-b border-line bg-surface-2">
                {[
                  { text: "แหล่งข้อมูล", right: false },
                  { text: "สถานะ", right: false },
                  { text: "14 วันล่าสุด", right: false },
                  { text: "ความพร้อมใช้", right: true },
                  { text: "เอกสารในระบบ", right: true },
                  { text: "รอบล่าสุด", right: true },
                  { text: "คำสั่ง", right: true },
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
                      {HEALTH[source.health]?.label ?? source.health}
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
                              ? ("ยังไม่มีรอบทำงาน")
                              : succeeded
                                ? ("สำเร็จ")
                                : ("ล้มเหลว")
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
                      {"ทดสอบการเชื่อมต่อ"}
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
            {/* A user's account: send them a reset link (0042) */}
            <PasswordResetCard />
          </div>

          {/* Job 2: Extraction Review Queue (FR-23, NFR-17) */}
          <div className={activeJob === "review" ? "block w-full" : "hidden"}>
            {!ops ? (
              <ReviewTabSkeleton />
            ) : (
            <section className="w-full">
              <SectionHeading
                right={
                  <span className="text-[11px] text-ink-3">
                    {pendingCount} {"รอดำเนินการ"}
                  </span>
                }
              >
                {"คิวตรวจทานผลการอ่านเอกสาร"}
              </SectionHeading>

              {/* Row 1: Filter Tabs */}
              <div className="mb-3 flex flex-wrap gap-1.5 border-b border-line pb-3">
                {[
                  { id: "all", label: `ทั้งหมด (${reviewQueue.length})` },
                  { id: "pending", label: `รอตรวจทาน (${pendingCount})` },
                  { id: "low-confidence", label: `⚠️ มั่นใจต่ำ (< 80%) (${lowConfidenceCount})` },
                  { id: "misclassified", label: `ตรวจประเภท (${misclassifiedCount})` },
                  { id: "reviewed", label: `ตรวจทานแล้ว (${reviewedCount})` },
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
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Row 2: Search Input & Sort Selector */}
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="relative w-full sm:w-72">
                  <span className="absolute inset-y-0 left-2.5 flex items-center text-ink-3 pointer-events-none text-[12px]">
                    🔍
                  </span>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={"ค้นหาด้วยเลขโครงการ / ชื่อ..."}
                    className={`${input} text-[12px] h-8 pl-8 pr-7 w-full`}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute inset-y-0 right-2 flex items-center text-ink-3 hover:text-ink text-[12px] cursor-pointer"
                      title={"ล้างคำค้นหา"}
                    >
                      ✕
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-ink-3 whitespace-nowrap">
                    {"เรียงตาม:"}
                  </span>
                  <select
                    value={sortOption}
                    onChange={(e) => setSortOption(e.target.value as typeof sortOption)}
                    className="h-8 rounded-[3px] border border-line bg-surface px-2.5 text-[12px] text-ink focus:border-ink-2 focus:outline-none cursor-pointer"
                  >
                    <option value="confidence-asc">
                      {"คะแนนความมั่นใจต่ำสุดก่อน"}
                    </option>
                    <option value="confidence-desc">
                      {"คะแนนความมั่นใจสูงสุดก่อน"}
                    </option>
                    <option value="newest">
                      {"อัปเดตล่าสุด"}
                    </option>
                    <option value="budget-desc">
                      {"งบประมาณสูงสุด"}
                    </option>
                  </select>
                </div>
              </div>

              {sortedQueue.length === 0 ? (
                <Panel className="p-6 text-center text-[13px] text-ink-3">
                  {"ไม่พบรายการในเงื่อนไขที่เลือก"}
                </Panel>
              ) : (
                <div className="flex flex-col gap-2">
                  {sortedQueue.map((item) => (
                    <ReviewItemCard
                      key={item.docId}
                      item={item}
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
          </div>

          {/* Job 3: Pipeline Monitoring & Control (FR-24) */}
          <div className={activeJob === "failures" ? "block w-full" : "hidden"}>
            <PipelineMonitoringSection
              onInspect={handleInspect}
              onRetry={handleRetryStep}
              onRetryAllTransient={handleRetryAllTransient}
              onDismiss={handleDismissFailure}
              retryingStep={retryingStep}
              retryingAll={retryingAll}
              dismissingStep={dismissingStep}
              actionMsg={pipelineActionMsg}
            />
          </div>

          {/* Job 4: Pipeline Runs & History (FR-24) */}
          <div className={activeJob === "history" ? "block w-full" : "hidden"}>
            {!ops ? (
              <HistoryTabSkeleton />
            ) : (
            <div className="w-full space-y-6">
              {/* History KPI Cards Strip matching Overview scale */}
              <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4">
                <Panel className="px-3 py-2.5">
                  <p className="font-mono tnum text-[24px] leading-none font-medium text-ink">
                    {recentLogs.length}
                  </p>
                  <p className="mt-1.5 text-[11px] leading-thai text-ink-3">
                    {"รอบบันทึกล่าสุด"}
                  </p>
                </Panel>
                <Panel className="px-3 py-2.5">
                  <p className="font-mono tnum text-[24px] leading-none font-medium text-open">
                    {recentLogs.length > 0
                      ? `${Math.round((recentLogs.filter((l) => l.status === "ok").length / recentLogs.length) * 100)}%`
                      : "100%"}
                  </p>
                  <p className="mt-1.5 text-[11px] leading-thai text-ink-3">
                    {"อัตราความสำเร็จ"}
                  </p>
                </Panel>
                <Panel className="px-3 py-2.5">
                  <p className="font-mono tnum text-[24px] leading-none font-medium text-ink">
                    {recentLogs.reduce((acc, l) => acc + (l.itemsDiscovered || 0), 0)}
                  </p>
                  <p className="mt-1.5 text-[11px] leading-thai text-ink-3">
                    {"เอกสารค้นพบทั้งหมด"}
                  </p>
                </Panel>
                <Panel className="px-3 py-2.5">
                  <p className="font-mono tnum text-[24px] leading-none font-medium text-ink">
                    {recentLogs.reduce((acc, l) => acc + (l.itemsIngested || 0), 0)}
                  </p>
                  <p className="mt-1.5 text-[11px] leading-thai text-ink-3">
                    {"เอกสารบันทึกสำเร็จ"}
                  </p>
                </Panel>
              </div>

              {/* Scheduled Job History (FR-24) */}
              <PipelineRunsSection
                runs={ops.pipelineRuns}
              />

              {/* Recent Ingestion Execution Activity */}
              {recentLogs && recentLogs.length > 0 ? (
                <section className="mb-8 w-full">
                  <SectionHeading
                    right={
                      <span className="text-[11px] text-ink-3">
                        {recentLogs.length} {"รอบล่าสุด"}
                      </span>
                    }
                  >
                    {"ประวัติการดึงข้อมูลล่าสุด"}
                  </SectionHeading>

                  <Panel className="w-full overflow-x-auto shadow-xs">
                    <table className="w-full min-w-[820px] border-collapse text-left">
                      <thead>
                        <tr className="border-b border-line bg-surface-2">
                          {[
                            { text: "เวลาเริ่มต้น", right: false },
                            { text: "แหล่งข้อมูล", right: false },
                            { text: "สถานะ", right: false },
                            { text: "เวลาที่ใช้", right: true },
                            { text: "ค้นพบ / บันทึก", right: true },
                            { text: "ผลการทำงาน", right: false },
                          ].map((column) => (
                            <th
                              key={column.text}
                              className={`px-3.5 py-2.5 text-[11px] font-medium text-ink-3 ${
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
                            className="border-b border-line align-middle last:border-b-0 hover:bg-surface-2/40"
                          >
                            <td className="px-3.5 py-2.5 font-mono tnum text-[12px] text-ink-2 whitespace-nowrap">
                              {log.startedAt}
                            </td>
                            <td className="px-3.5 py-2.5">
                              <span className="rounded-[2px] border border-line bg-surface-2 px-2 py-0.5 text-[11px] text-ink font-medium">
                                {log.source === "process3" ? "process3 (e-GP)" : "datago (data.go.th)"}
                              </span>
                            </td>
                            <td className="px-3.5 py-2.5">
                              <span
                                className={`inline-flex rounded-[2px] border px-2 py-0.5 text-[11px] font-medium ${
                                  HEALTH[log.status]?.chip ?? "border-line bg-surface-2 text-ink-2"
                                }`}
                              >
                                {HEALTH[log.status]?.label ?? log.status}
                              </span>
                            </td>
                            <td className="px-3.5 py-2.5 text-right font-mono tnum text-[12px] text-ink-2">
                              {log.durationMs > 1000
                                ? `${(log.durationMs / 1000).toFixed(1)}s`
                                : `${log.durationMs}ms`}
                            </td>
                            <td className="px-3.5 py-2.5 text-right font-mono tnum text-[12px] text-ink font-semibold">
                              {log.itemsDiscovered} / {log.itemsIngested}
                            </td>
                            <td className="px-3.5 py-2.5 text-[12px]">
                              {log.error ? (
                                <span className="text-risk">{log.error}</span>
                              ) : (
                                <span className="text-open">
                                  {"สำเร็จ เรียบร้อย"}
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

              {(!recentLogs || recentLogs.length === 0) && (!ops.pipelineRuns || ops.pipelineRuns.length === 0) ? (
                <Panel className="w-full p-8 text-center text-ink-3">
                  <p className="text-[13px]">{"ยังไม่มีประวัติการทำงานในระบบ"}</p>
                </Panel>
              ) : null}
            </div>
            )}
          </div>

          {/* Job 5: Technology & Standards Management */}
          <div className={activeJob === "technologies" ? "block w-full" : "hidden"}>
            <TechnologiesSection
              technologies={techList}
              isLoading={isTechLoading}
              pendingCount={techPendingCount}
              totalCount={techTotal}
              search={techSearch}
              onSearchChange={(val) => {
                setIsTechLoading(true);
                setTechSearch(val);
              }}
              statusFilter={techStatusFilter}
              onStatusFilterChange={(val) => {
                setIsTechLoading(true);
                setTechStatusFilter(val);
              }}
              categoryFilter={techCategoryFilter}
              onCategoryFilterChange={setTechCategoryFilter}
              actionMsg={techActionMsg}
              onApprove={handleApproveTech}
              onReject={handleRejectTech}
              onDelete={handleDeleteTech}
              onOpenAdd={handleOpenAddTech}
              onOpenEdit={handleOpenEditTech}
            />
          </div>
        </main>
      </div>

      {/* Record Inspector Modal (FR-24) */}
      {inspectingProjectId && (
        <RecordInspectorModal
          projectId={inspectingProjectId}
          record={diagnosticRecord}
          isLoading={isInspectorLoading}
          error={inspectorError}
          onClose={() => {
            setInspectingProjectId(null);
            setDiagnosticRecord(null);
            setInspectorError(null);
          }}
          onRetryStep={async (pid, step, maxPages) => {
            await handleRetryStep(pid, step, false, maxPages);
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
                  `เริ่มอ่านเอกสารโครงการ ${pid} ใหม่เรียบร้อยแล้ว`,
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
          onClose={() => {
            setIsTechModalOpen(false);
            setTechFormError(null);
          }}
        />
      )}
    </div>
  );
}
