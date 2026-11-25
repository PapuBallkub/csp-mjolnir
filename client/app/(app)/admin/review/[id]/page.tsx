"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  adminGetReviewItem,
  adminGetTorVersions,
  adminReExtract,
  adminRollbackTorVersion,
  adminUpdateReview,
  getTechnologies,
  type TechnologyItem,
  type TorVersionItem,
} from "../../../../_lib/api";
import PdfPreviewModal from "../../../../_components/PdfPreviewModal";
import { SignInPrompt } from "../../../../_components/sign-in-prompt";
import { btn, EmptyState } from "../../../../_components/ui";
import { getEgpAnnouncementUrl } from "../../../../_lib/format";
import {
  EditSummaryConfirmModal,
  EvidenceGroundingDrawer,
  VersionHistoryDrawer,
} from "./ReviewEditorComponents";
import {
  buildApprovePayload,
  getFieldConfidenceScore,
  type ReviewItemData,
} from "./_lib/review-form";
import { useReviewForm } from "./_lib/useReviewForm";
import { ReclassifyModal } from "./_components/ReclassifyModal";
import { ReviewSectionNav } from "./_components/ReviewSectionNav";
import { ReviewTopBar } from "./_components/ReviewTopBar";
import { EligibilityContractSection } from "./_components/sections/EligibilityContractSection";
import { IdentificationSection } from "./_components/sections/IdentificationSection";
import { IntegrationOpsSection } from "./_components/sections/IntegrationOpsSection";
import { KeyFactsSection } from "./_components/sections/KeyFactsSection";
import { OverviewDeliverablesSection } from "./_components/sections/OverviewDeliverablesSection";
import { TechnicalSpecsSection } from "./_components/sections/TechnicalSpecsSection";

export default function DedicatedReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = use(params);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [data, setData] = useState<ReviewItemData | null>(null);
  const [availableTechs, setAvailableTechs] = useState<TechnologyItem[]>([]);

  const {
    form,
    setField,
    resetFromItem,
    validation,
    diffs,
    diffsByField,
    diffsBySection,
    revertField,
    discardAll,
    toggleTech,
    removeTech,
    addCustomTech,
  } = useReviewForm();

  // Action & modal states
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isReExtracting, setIsReExtracting] = useState(false);
  const [reExtractNotice, setReExtractNotice] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const [showReclassifyModal, setShowReclassifyModal] = useState(false);
  const [reclassifyReason, setReclassifyReason] = useState("");
  const [isReclassifying, setIsReclassifying] = useState(false);

  // Version history, Evidence, and PDF modal states
  const [showVersionDrawer, setShowVersionDrawer] = useState(false);
  const [versionsList, setVersionsList] = useState<TorVersionItem[]>([]);
  const [currentVersion, setCurrentVersion] = useState<number | null>(null);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [showEvidenceDrawer, setShowEvidenceDrawer] = useState(false);
  const [showPdfModal, setShowPdfModal] = useState(false);

  // TOC active section tracking & mobile toggle
  const [activeSection, setActiveSection] = useState("sec-identification");
  const [mobileTocOpen, setMobileTocOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getTechnologies().then((res) => {
      if (cancelled) return;
      if (res.ok && res.data.technologies) {
        setAvailableTechs(res.data.technologies);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadVersions = useCallback(async () => {
    const res = await adminGetTorVersions(projectId);
    if (res.ok) {
      setVersionsList(res.data.versions);
      setCurrentVersion(res.data.current);
    }
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    async function loadItem() {
      setLoading(true);
      setErrorMessage(null);

      const [res, verRes] = await Promise.all([
        adminGetReviewItem(projectId),
        adminGetTorVersions(projectId),
      ]);
      if (cancelled) return;

      if (verRes.ok) {
        setVersionsList(verRes.data.versions);
        setCurrentVersion(verRes.data.current);
      }

      if (!res.ok) {
        if (res.error?.status === 401 || res.error?.status === 403) {
          setAuthError(true);
        } else {
          setErrorMessage(res.error?.message || "Failed to load project for review");
        }
        setLoading(false);
        return;
      }

      const item = res.data.item;
      setData(item);
      resetFromItem(item);
      setCurrentVersion((prev) => prev ?? (item.details?.version || 1));
      setLoading(false);
    }

    loadItem();
    return () => {
      cancelled = true;
    };
  }, [projectId, resetFromItem]);

  const getFieldScore = useCallback(
    (fieldName: string, fallback: number = 0.85) =>
      getFieldConfidenceScore(data, fieldName, fallback),
    [data]
  );

  const handleRollback = async (version: number) => {
    setIsRollingBack(true);
    setErrorMessage(null);
    const res = await adminRollbackTorVersion(projectId, version);
    setIsRollingBack(false);
    if (res.ok) {
      setShowVersionDrawer(false);
      const freshRes = await adminGetReviewItem(projectId);
      if (freshRes.ok) {
        setData(freshRes.data.item);
        resetFromItem(freshRes.data.item);
      }
      loadVersions();
      setSaveSuccess(true);
      setActiveSection("sec-identification");
      window.scrollTo({ top: 0, behavior: "smooth" });
      setTimeout(() => setSaveSuccess(false), 6000);
    } else {
      setErrorMessage(res.error?.message || "Rollback failed");
    }
  };

  function handleSaveAndPublish(e: React.FormEvent) {
    e.preventDefault();
    if (validation.firstErrorMessage) {
      setErrorMessage(validation.firstErrorMessage);
      return;
    }
    setErrorMessage(null);
    setSaveSuccess(false);
    setShowConfirmModal(true);
  }

  async function executeApprove() {
    setIsSaving(true);
    setErrorMessage(null);
    setSaveSuccess(false);

    try {
      const payload = buildApprovePayload(form, validation);
      const res = await adminUpdateReview(projectId, payload);
      setIsSaving(false);

      if (res.ok) {
        setShowConfirmModal(false);
        setSaveSuccess(true);
        const freshRes = await adminGetReviewItem(projectId);
        if (freshRes.ok) {
          setData(freshRes.data.item);
          resetFromItem(freshRes.data.item);
        }
        loadVersions();
        setActiveSection("sec-identification");
        window.scrollTo({ top: 0, behavior: "smooth" });
        setTimeout(() => setSaveSuccess(false), 6000);
      } else {
        setShowConfirmModal(false);
        setErrorMessage(res.error?.message || "Failed to update review record");
      }
    } catch (err: unknown) {
      setIsSaving(false);
      setShowConfirmModal(false);
      setErrorMessage(err instanceof Error ? err.message : "An unexpected error occurred");
    }
  }

  async function handleReclassifySubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsReclassifying(true);
    setErrorMessage(null);

    const res = await adminUpdateReview(projectId, {
      action: "reclassify",
      reclassifyReason: reclassifyReason.trim() || "Civil works — out of scope",
    });

    setIsReclassifying(false);
    if (res.ok) {
      setShowReclassifyModal(false);
      router.push("/admin?job=review");
    } else {
      setErrorMessage(res.error?.message || "Failed to reclassify TOR");
    }
  }

  async function handleReExtractTrigger() {
    setIsReExtracting(true);
    setReExtractNotice(null);
    setErrorMessage(null);

    const res = await adminReExtract(projectId);
    setIsReExtracting(false);

    if (res.ok) {
      setReExtractNotice(
        "ส่งเอกสารกลับเข้าคิว AI Extraction เรียบร้อยแล้ว ระบบจะอ่านข้อมูลใหม่ในรอบถัดไป"
      );
    } else {
      setErrorMessage(res.error?.message || "Failed to trigger re-extraction");
    }
  }

  const scrollToSection = (id: string) => {
    setMobileTocOpen(false);
    setActiveSection(id);
    const element = document.getElementById(id);
    if (element) {
      const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth";
      element.scrollIntoView({ behavior, block: "start" });
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", `#${id}`);
      }
    }
  };

  if (authError) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-12">
        <SignInPrompt
          next={`/admin/review/${projectId}`}
          headline={"ส่วนนี้สำหรับผู้ดูแลระบบ"}
          body={"เข้าสู่ระบบด้วยบัญชีผู้ดูแลเพื่อตรวจทานและแก้ไขข้อมูล TOR"}
          cta={"เข้าสู่ระบบ"}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-12 text-center text-ink-3">
        <p className="animate-pulse text-[14px]">
          {"กำลังโหลดข้อมูล TOR สำหรับการตรวจทาน..."}
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-12">
        <EmptyState
          headline={"ไม่พบเอกสาร TOR"}
          body={`ไม่พบข้อมูลสำหรับรหัสโครงการ ${projectId}`}
          action={
            <Link href="/admin?job=review" className={btn.secondary}>
              {"กลับไปหน้าคิวตรวจทาน"}
            </Link>
          }
        />
      </div>
    );
  }

  const sectionBaseProps = {
    form,
    setField,
    diffsByField,
    onRevert: revertField,
    getFieldScore,
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <ReviewTopBar
        projectId={projectId}
        extraction={data.extraction}
        currentVersion={currentVersion}
        diffCount={diffs.length}
        hasEvidence={Boolean(data.details?.evidence)}
        isReExtracting={isReExtracting}
        isSaving={isSaving}
        hasValidationErrors={validation.hasErrors}
        onOpenVersions={() => setShowVersionDrawer(true)}
        onOpenPdf={() => setShowPdfModal(true)}
        onOpenEvidence={() => setShowEvidenceDrawer(true)}
        onReExtract={handleReExtractTrigger}
        onOpenReclassify={() => setShowReclassifyModal(true)}
      />

      {errorMessage && (
        <div className="mb-4 rounded-xl border border-risk-line bg-risk-bg p-3 text-[13px] text-risk">
          {errorMessage}
        </div>
      )}
      {saveSuccess && (
        <div className="mb-4 rounded-xl border border-open-line bg-open-bg p-3 text-[13px] text-open">
          {"✓ บันทึกการแก้ไขและอนุมัติข้อมูลเรียบร้อยแล้ว ข้อมูลจะแสดงผลบนหน้า TOR ทันที"}
        </div>
      )}
      {reExtractNotice && (
        <div className="mb-4 rounded-xl border border-amend-line bg-amend-bg p-3 text-[13px] text-amend">
          {reExtractNotice}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <ReviewSectionNav
          activeSection={activeSection}
          diffsBySection={diffsBySection}
          totalDiffs={diffs.length}
          mobileTocOpen={mobileTocOpen}
          onToggleMobileToc={() => setMobileTocOpen((prev) => !prev)}
          onSelectSection={scrollToSection}
        />

        <div className="lg:col-span-3">
          <form id="review-form" onSubmit={handleSaveAndPublish} className="flex flex-col gap-6">
            <IdentificationSection {...sectionBaseProps} />
            <KeyFactsSection {...sectionBaseProps} validation={validation} />
            <OverviewDeliverablesSection {...sectionBaseProps} />
            <TechnicalSpecsSection
              form={form}
              setField={setField}
              diffsByField={diffsByField}
              onRevert={revertField}
              availableTechs={availableTechs}
              onToggleTech={toggleTech}
              onRemoveTech={removeTech}
              onAddCustomTech={addCustomTech}
            />
            <IntegrationOpsSection
              form={form}
              setField={setField}
              diffsByField={diffsByField}
              onRevert={revertField}
            />
            <EligibilityContractSection {...sectionBaseProps} validation={validation} />

            {/* Bottom Actions Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <Link href="/admin?job=review" className={`${btn.secondary} text-[13px]`}>
                {"← ยกเลิกและกลับไปคิวตรวจทาน"}
              </Link>

              <button
                type="submit"
                disabled={isSaving || validation.hasErrors}
                className={`${btn.primary} text-[13px] h-10 px-6 font-semibold`}
              >
                {isSaving ? "กำลังบันทึกข้อมูล..." : "บันทึกและอนุมัติข้อมูล"}
              </button>
            </div>
          </form>
        </div>
      </div>

      <VersionHistoryDrawer
        isOpen={showVersionDrawer}
        onClose={() => setShowVersionDrawer(false)}
        versions={versionsList}
        currentVersion={currentVersion}
        onRollback={handleRollback}
        isRollingBack={isRollingBack}
      />

      <EvidenceGroundingDrawer
        isOpen={showEvidenceDrawer}
        onClose={() => setShowEvidenceDrawer(false)}
        evidence={data.details?.evidence}
      />

      <ReclassifyModal
        isOpen={showReclassifyModal}
        reason={reclassifyReason}
        onChangeReason={setReclassifyReason}
        isSubmitting={isReclassifying}
        onClose={() => setShowReclassifyModal(false)}
        onSubmit={handleReclassifySubmit}
      />

      <PdfPreviewModal
        isOpen={showPdfModal}
        onClose={() => setShowPdfModal(false)}
        projectId={projectId}
        title={data?.title || ""}
        agency={data?.agency || ""}
        procurementMethod={data?.procurementMethod || data?.details?.procurementMethod}
        officialEgpUrl={getEgpAnnouncementUrl(projectId)}
      />

      <EditSummaryConfirmModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={executeApprove}
        diffs={diffs}
        isSaving={isSaving}
        onRevertField={revertField}
        onDiscardAll={discardAll}
      />
    </div>
  );
}
