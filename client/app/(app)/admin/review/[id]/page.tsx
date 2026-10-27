"use client";

import { use, useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  adminGetReviewItem,
  adminGetTorVersions,
  adminReExtract,
  adminRollbackTorVersion,
  adminUpdateReview,
  getTechnologies,
  type GetReviewItemResult,
  type TechnologyItem,
  type TorVersionItem,
  type UpdateReviewPayload,
} from "../../../../_lib/api";
import { useLang } from "../../../../_components/prefs";
import { SignInPrompt } from "../../../../_components/sign-in-prompt";
import { btn, EmptyState, input, Label, Panel, SectionHeading, textarea } from "../../../../_components/ui";
import {
  DynamicListEditor,
  EditSummaryConfirmModal,
  type EditDiffItem,
  EvidenceGroundingDrawer,
  KeyValueListEditor,
  VersionHistoryDrawer,
} from "./ReviewEditorComponents";
import PdfPreviewModal from "../../../../_components/PdfPreviewModal";
import { getEgpAnnouncementUrl } from "../../../../_lib/format";

function confidenceTone(value: number): string {
  if (value < 0.7) return "bg-risk text-white";
  if (value < 0.85) return "bg-amend text-ink";
  return "bg-open text-white";
}

function FieldConfidenceBadge({
  confidence,
  lang,
}: {
  confidence: number;
  lang: "th" | "en";
}) {
  const pct = Math.round(confidence <= 1 ? confidence * 100 : confidence);
  const tone =
    pct >= 85
      ? "border-open-line bg-open-bg text-open"
      : pct >= 70
      ? "border-amend-line bg-amend-bg text-amend"
      : "border-risk-line bg-risk-bg text-risk";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-[2px] border px-1.5 py-0.5 text-[10px] font-mono font-medium ${tone}`}
      title={lang === "th" ? `ความมั่นใจ AI: ${pct}%` : `AI Confidence: ${pct}%`}
    >
      <span>LLM</span>
      <span>{pct}%</span>
    </span>
  );
}

function FieldHeader({
  label,
  fieldKey,
  diffItem,
  onRevert,
  htmlFor,
  confidenceBadge,
  lang = "th",
}: {
  label: string;
  fieldKey?: string;
  diffItem?: EditDiffItem;
  onRevert?: (fieldKey: string) => void;
  htmlFor?: string;
  confidenceBadge?: React.ReactNode;
  lang?: "th" | "en";
}) {
  return (
    <div className="mb-1 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Label htmlFor={htmlFor}>{label}</Label>
        {diffItem && fieldKey && (
          <span className="inline-flex items-center gap-1 rounded-[2px] bg-amend-bg border border-amend-line px-1.5 py-0.2 text-[10.5px] font-semibold text-amend">
            <span>●</span>
            <span>{lang === "th" ? "แก้ไขแล้ว" : "Modified"}</span>
            {onRevert && (
              <button
                type="button"
                onClick={() => onRevert(fieldKey)}
                className="ml-0.5 text-amend hover:underline cursor-pointer"
                title={lang === "th" ? "คืนค่าเดิม" : "Revert to original"}
              >
                ↺
              </button>
            )}
          </span>
        )}
      </div>
      {confidenceBadge}
    </div>
  );
}

function modInput(isMod: boolean | undefined) {
  return isMod ? "border-amend/80 bg-amend-bg/15 ring-1 ring-amend/60 focus:border-amend focus:ring-amend" : "";
}

function parseNumberInput(val: string): { valid: boolean; value: number | null } {
  const trimmed = val.replace(/,/g, "").trim();
  if (!trimmed) return { valid: true, value: null };
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return { valid: false, value: null };
  const num = Number(trimmed);
  if (!Number.isFinite(num) || num < 0) return { valid: false, value: null };
  return { valid: true, value: num };
}

function parseIntegerInput(val: string): { valid: boolean; value: number | null } {
  const trimmed = val.replace(/,/g, "").trim();
  if (!trimmed) return { valid: true, value: null };
  if (!/^\d+$/.test(trimmed)) return { valid: false, value: null };
  const num = Number(trimmed);
  if (!Number.isSafeInteger(num) || num < 0) return { valid: false, value: null };
  return { valid: true, value: num };
}

function toDateInputValue(val: string | null | undefined): string {
  if (!val) return "";
  const match = val.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  try {
    const d = new Date(val);
    if (!Number.isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10);
    }
  } catch {
    // fallback
  }
  return val.slice(0, 10);
}

const SECTIONS_LIST = [
  { id: "sec-identification", labelTh: "1. ข้อมูลทั่วไปและการจัดประเภท", labelEn: "1. Identification" },
  { id: "sec-keyfacts", labelTh: "2. ข้อมูลสำคัญและราคา", labelEn: "2. Key Facts" },
  { id: "sec-overview", labelTh: "3. ภาพรวมและขอบเขต", labelEn: "3. Overview" },
  { id: "sec-deliverables", labelTh: "4. ขอบเขตงานส่งมอบ", labelEn: "4. Deliverables" },
  { id: "sec-tech", labelTh: "5. ข้อกำหนดเทคโนโลยี", labelEn: "5. Tech Stack" },
  { id: "sec-integration", labelTh: "6. ระบบเดิมและสภาพแวดล้อม", labelEn: "6. Integration" },
  { id: "sec-ops", labelTh: "7. การติดตั้งและบำรุงรักษา", labelEn: "7. Operations" },
  { id: "sec-eligibility", labelTh: "8. คุณสมบัติผู้ยื่นข้อเสนอ", labelEn: "8. Eligibility" },
  { id: "sec-contract", labelTh: "9. เงื่อนไขสัญญา", labelEn: "9. Contract" },
  { id: "sec-amendments", labelTh: "10. ประวัติการแก้ไข", labelEn: "10. Amendments" },
];

export default function DedicatedReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = use(params);
  const router = useRouter();
  const { lang } = useLang();

  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [data, setData] = useState<GetReviewItemResult["item"] | null>(null);

  // 1. Identification
  const [title, setTitle] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [agency, setAgency] = useState("");
  const [department, setDepartment] = useState("");
  const [category, setCategory] = useState("software-development");
  const [status, setStatus] = useState("Open");

  // 2. Key Facts
  const [budgetTHB, setBudgetTHB] = useState("");
  const [referencePriceTHB, setReferencePriceTHB] = useState("");
  const [submissionDeadline, setSubmissionDeadline] = useState("");
  const [commentDeadline, setCommentDeadline] = useState("");
  const [deliveryPeriodDays, setDeliveryPeriodDays] = useState("");
  const [procurementMethod, setProcurementMethod] = useState("");
  const [contractDurationDays, setContractDurationDays] = useState("");
  const [warrantyYears, setWarrantyYears] = useState("");
  const [penaltyClause, setPenaltyClause] = useState("");
  const [postedDate, setPostedDate] = useState("");

  // 3. Project Overview
  const [objective, setObjective] = useState("");
  const [systemArchetype, setSystemArchetype] = useState("");
  const [complexityTier, setComplexityTier] = useState("");
  const [highLevelScope, setHighLevelScope] = useState("");
  const [majorComponents, setMajorComponents] = useState<string[]>([]);

  // 4. Contractor Deliverables
  const [deliverablesSystem, setDeliverablesSystem] = useState<string[]>([]);
  const [deliverablesImplementation, setDeliverablesImplementation] = useState<string[]>([]);
  const [deliverablesValidation, setDeliverablesValidation] = useState<string[]>([]);
  const [deliverablesSupportingWork, setDeliverablesSupportingWork] = useState<string[]>([]);

  // 5. Technical Requirements
  const [selectedTechs, setSelectedTechs] = useState<string[]>([]);
  const [techVersions, setTechVersions] = useState<Record<string, string>>({});
  const [customTechInput, setCustomTechInput] = useState("");
  const [customTechVersion, setCustomTechVersion] = useState("");
  const [availableTechs, setAvailableTechs] = useState<TechnologyItem[]>([]);
  const [searchTech, setSearchTech] = useState("");
  const [isTechSearchFocused, setIsTechSearchFocused] = useState(false);

  const [requiredCapabilities, setRequiredCapabilities] = useState<string[]>([]);
  const [infrastructureSpecs, setInfrastructureSpecs] = useState<Array<{ key: string; value: string }>>([]);
  const [technicalConstraints, setTechnicalConstraints] = useState<Array<{ key: string; value: string }>>([]);

  // 6. Integration Environment
  const [existingSystems, setExistingSystems] = useState<string[]>([]);
  const [interfacesAndApis, setInterfacesAndApis] = useState<string[]>([]);
  const [dataMigrationNotes, setDataMigrationNotes] = useState("");
  const [deploymentLocation, setDeploymentLocation] = useState("");

  // 7. Operational Requirements
  const [installationAndConfig, setInstallationAndConfig] = useState<string[]>([]);
  const [training, setTraining] = useState<string[]>([]);
  const [technicalSupportAndSla, setTechnicalSupportAndSla] = useState("");
  const [maintenance, setMaintenance] = useState<string[]>([]);

  // 8. Bid Eligibility
  const [companyReqs, setCompanyReqs] = useState<string[]>([]);
  const [requiredCertifications, setRequiredCertifications] = useState<string[]>([]);
  const [manufacturerAuthorizations, setManufacturerAuthorizations] = useState<string[]>([]);
  const [personnelQualifications, setPersonnelQualifications] = useState<string[]>([]);
  const [previousExperience, setPreviousExperience] = useState("");
  const [previousExperienceMinTHB, setPreviousExperienceMinTHB] = useState("");

  // 9. Contract Conditions
  const [paymentTerms, setPaymentTerms] = useState("");
  const [deliveryConditions, setDeliveryConditions] = useState("");
  const [evaluationMethod, setEvaluationMethod] = useState("");

  // 10. Amendment Info
  const [isAmended, setIsAmended] = useState(false);
  const [amendmentSummary, setAmendmentSummary] = useState("");
  const [changedSections, setChangedSections] = useState<string[]>([]);

  // Validation Checks
  const refPriceCheck = parseNumberInput(referencePriceTHB);
  const budgetCheck = parseNumberInput(budgetTHB);
  const durationCheck = parseIntegerInput(contractDurationDays);
  const deliveryPeriodCheck = parseIntegerInput(deliveryPeriodDays);
  const warrantyCheck = parseNumberInput(warrantyYears);
  const minExpCheck = parseNumberInput(previousExperienceMinTHB);

  const hasValidationErrors =
    !refPriceCheck.valid ||
    !budgetCheck.valid ||
    !durationCheck.valid ||
    !deliveryPeriodCheck.valid ||
    !warrantyCheck.valid ||
    !minExpCheck.valid;

  // Action status states
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isReExtracting, setIsReExtracting] = useState(false);
  const [reExtractNotice, setReExtractNotice] = useState<string | null>(null);

  // Edit Summary & Confirmation Alert Modal
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const [showReclassifyModal, setShowReclassifyModal] = useState(false);
  const [reclassifyReason, setReclassifyReason] = useState("");
  const [isReclassifying, setIsReclassifying] = useState(false);

  // Version history drawer states (NFR-07, ADR 0031)
  const [showVersionDrawer, setShowVersionDrawer] = useState(false);
  const [versionsList, setVersionsList] = useState<TorVersionItem[]>([]);
  const [currentVersion, setCurrentVersion] = useState<number | null>(null);
  const [isRollingBack, setIsRollingBack] = useState(false);

  // Evidence grounding drawer states (NFR-17)
  const [showEvidenceDrawer, setShowEvidenceDrawer] = useState(false);

  // PDF Preview modal state
  const [showPdfModal, setShowPdfModal] = useState(false);

  // Active section scroll tracking
  const [activeSection, setActiveSection] = useState("sec-identification");

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

  const loadVersions = async () => {
    const res = await adminGetTorVersions(projectId);
    if (res.ok) {
      setVersionsList(res.data.versions);
      setCurrentVersion(res.data.current);
    }
  };

  const handleRollback = async (version: number) => {
    setIsRollingBack(true);
    setErrorMessage(null);
    const res = await adminRollbackTorVersion(projectId, version);
    setIsRollingBack(false);
    if (res.ok) {
      setShowVersionDrawer(false);
      // Cleanly re-populate review item and form state in-place
      const freshRes = await adminGetReviewItem(projectId);
      if (freshRes.ok) {
        setData(freshRes.data.item);
        applyItemToForm(freshRes.data.item);
      }
      loadVersions();
      setSaveSuccess(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
      setTimeout(() => setSaveSuccess(false), 6000);
    } else {
      setErrorMessage(res.error?.message || "Rollback failed");
    }
  };

  const toggleTech = (name: string) => {
    setSelectedTechs((prev) =>
      prev.includes(name) ? prev.filter((t) => t !== name) : [...prev, name]
    );
  };

  const removeTech = (name: string) => {
    setSelectedTechs((prev) => prev.filter((t) => t !== name));
    setTechVersions((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  const handleAddCustomTech = (e: React.FormEvent) => {
    e.preventDefault();
    const name = customTechInput.trim();
    if (!name) return;
    if (!selectedTechs.some((t) => t.toLowerCase() === name.toLowerCase())) {
      setSelectedTechs((prev) => [...prev, name]);
      if (customTechVersion.trim()) {
        setTechVersions((prev) => ({ ...prev, [name]: customTechVersion.trim() }));
      }
    }
    setCustomTechInput("");
    setCustomTechVersion("");
  };

  const getFieldScore = (fieldName: string, fallback: number = 0.85): number => {
    if (!data?.lowFields?.length) return data?.extraction ?? fallback;
    const match = data.lowFields.find((f) =>
      f.field.toLowerCase().includes(fieldName.toLowerCase())
    );
    return match?.confidence ?? (data?.extraction ?? fallback);
  };

  const applyItemToForm = useCallback((item: GetReviewItemResult["item"]) => {
    const det = item.details || {};

    // 1. Identification
    setTitle(item.title || "");
    setTitleEn(det.titleEn || "");
    setAgency(item.agency || "");
    setDepartment(det.department || "");
    setCategory(det.category || "software-development");
    setStatus(det.status || "Open");

    // 2. Key Facts
    setBudgetTHB(item.budgetTHB != null ? String(item.budgetTHB) : "");
    setReferencePriceTHB(item.referencePriceTHB != null ? String(item.referencePriceTHB) : "");
    setSubmissionDeadline(toDateInputValue(item.submissionDeadline));
    setCommentDeadline(toDateInputValue(det.commentDeadline));
    setDeliveryPeriodDays(det.deliveryPeriodDays != null ? String(det.deliveryPeriodDays) : "");
    setProcurementMethod(det.procurementMethod || "");
    setContractDurationDays(
      det.contractDurationDays != null ? String(det.contractDurationDays) : ""
    );
    setWarrantyYears(det.warrantyYears != null ? String(det.warrantyYears) : "");
    setPenaltyClause(det.penaltyClause || "");
    setPostedDate(toDateInputValue(det.postedDate));

    // 3. Project Overview
    setObjective(det.objective || "");
    setSystemArchetype(det.systemArchetype || "");
    setComplexityTier(det.complexityTier || "");
    setHighLevelScope(det.highLevelScope || "");
    setMajorComponents(det.majorComponents || []);

    // 4. Deliverables
    setDeliverablesSystem(det.deliverables?.system || []);
    setDeliverablesImplementation(det.deliverables?.implementation || []);
    setDeliverablesValidation(det.deliverables?.validation || []);
    setDeliverablesSupportingWork(det.deliverables?.supportingWork || []);

    // 5. Technical Requirements
    const initialTechVersions: Record<string, string> = {};
    const techList: string[] = [];
    if (det.technologiesList && Array.isArray(det.technologiesList)) {
      det.technologiesList.forEach((t) => {
        if (t?.name) {
          techList.push(t.name);
          if (t.version) initialTechVersions[t.name] = t.version;
        }
      });
    } else if (det.requiredTechnologies) {
      det.requiredTechnologies
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((t) => techList.push(t));
    }
    setSelectedTechs(techList);
    setTechVersions(initialTechVersions);

    setRequiredCapabilities(det.requiredCapabilities || []);
    setInfrastructureSpecs(
      (det.infrastructureSpecifications || []).map((s) => ({
        key: s.item,
        value: s.specification,
      }))
    );
    setTechnicalConstraints(
      (det.technicalConstraints || []).map((c) => ({
        key: c.metric,
        value: c.value,
      }))
    );

    // 6. Integration Environment
    setExistingSystems(det.integrationEnvironment?.existingSystems || []);
    setInterfacesAndApis(det.integrationEnvironment?.interfacesAndApis || []);
    setDataMigrationNotes(det.integrationEnvironment?.dataMigrationNotes || "");
    setDeploymentLocation(det.integrationEnvironment?.deploymentLocation || "");

    // 7. Operational Requirements
    setInstallationAndConfig(det.operationalRequirements?.installationAndConfig || []);
    setTraining(det.operationalRequirements?.training || []);
    setTechnicalSupportAndSla(det.operationalRequirements?.technicalSupportAndSla || "");
    setMaintenance(det.operationalRequirements?.maintenance || []);

    // 8. Eligibility
    if (Array.isArray(det.companyRequirements)) {
      setCompanyReqs(det.companyRequirements);
    } else if (det.companyRequirements) {
      setCompanyReqs(
        String(det.companyRequirements)
          .split("\n")
          .map((s) => s.trim().replace(/^[-*•\d.]+\s*/, ""))
          .filter(Boolean)
      );
    } else {
      setCompanyReqs([]);
    }
    setRequiredCertifications(det.requiredCertifications || []);
    setManufacturerAuthorizations(det.manufacturerAuthorizations || []);
    setPersonnelQualifications(det.personnelQualifications || []);
    setPreviousExperience(det.previousExperience || "");
    setPreviousExperienceMinTHB(
      det.previousExperienceMinTHB != null ? String(det.previousExperienceMinTHB) : ""
    );

    // 9. Contract Conditions
    setPaymentTerms(det.paymentTerms || "");
    setDeliveryConditions(det.deliveryConditions || "");
    setEvaluationMethod(det.evaluationMethod || "");

    // 10. Amendment Info
    setIsAmended(Boolean(det.amendmentInfo?.isAmended));
    setAmendmentSummary(det.amendmentInfo?.amendmentSummary || "");
    setChangedSections(det.amendmentInfo?.changedSections || []);

    setCurrentVersion(det.version || 1);
  }, []);

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
      applyItemToForm(item);
      setLoading(false);
    }

    loadItem();
    return () => {
      cancelled = true;
    };
  }, [projectId, applyItemToForm]);

  const diffs = useMemo<EditDiffItem[]>(() => {
    if (!data) return [];
    const det = data.details || {};
    const result: EditDiffItem[] = [];

    const check = (
      section: string,
      field: string,
      labelTh: string,
      labelEn: string,
      before: string | number | null | undefined,
      after: string | number | null | undefined
    ) => {
      const b = before == null ? "" : String(before).trim();
      const a = after == null ? "" : String(after).trim();
      if (b !== a) {
        result.push({ section, field, labelTh, labelEn, from: b, to: a });
      }
    };

    // 1. Identification
    check("1. Identification", "title", "ชื่อโครงการ (TH)", "Project Title (TH)", data.title, title.trim());
    check("1. Identification", "titleEn", "ชื่อโครงการ (EN)", "Project Title (EN)", det.titleEn, titleEn.trim());
    check("1. Identification", "agency", "หน่วยงานจัดจ้าง", "Agency", data.agency, agency.trim());
    check("1. Identification", "department", "สำนัก/กอง/ส่วนงาน", "Department", det.department, department.trim());
    check("1. Identification", "category", "หมวดหมู่โครงการ", "Category", det.category, category);
    check("1. Identification", "status", "สถานะโครงการ", "Status", det.status, status);

    // 2. Key Facts
    check("2. Key Facts", "budgetTHB", "งบประมาณ (บาท)", "Approved Budget (THB)", data.budgetTHB, budgetCheck.value);
    check("2. Key Facts", "referencePriceTHB", "ราคากลาง (บาท)", "Reference Price (THB)", data.referencePriceTHB, refPriceCheck.value);
    check("2. Key Facts", "submissionDeadline", "วันสิ้นสุดรับซอง", "Submission Deadline", toDateInputValue(data.submissionDeadline), submissionDeadline);
    check("2. Key Facts", "commentDeadline", "วันสิ้นสุดรับฟังคำวิจารณ์", "Comment Deadline", toDateInputValue(det.commentDeadline), commentDeadline);
    check("2. Key Facts", "deliveryPeriodDays", "ระยะเวลาส่งมอบ (วัน)", "Delivery Period (Days)", det.deliveryPeriodDays, deliveryPeriodCheck.value);
    check("2. Key Facts", "procurementMethod", "วิธีการจัดซื้อจัดจ้าง", "Procurement Method", det.procurementMethod, procurementMethod.trim());
    check("2. Key Facts", "contractDurationDays", "ระยะเวลาสัญญา (วัน)", "Contract Duration (Days)", det.contractDurationDays, durationCheck.value);
    check("2. Key Facts", "warrantyYears", "ระยะเวลารับประกัน (ปี)", "Warranty (Years)", det.warrantyYears, warrantyCheck.value);
    check("2. Key Facts", "penaltyClause", "เงื่อนไขค่าปรับ", "Penalty Clause", det.penaltyClause, penaltyClause.trim());
    check("2. Key Facts", "postedDate", "วันที่ประกาศ", "Posted Date", toDateInputValue(det.postedDate), postedDate);

    // 3. Project Overview
    check("3. Overview", "objective", "วัตถุประสงค์", "Objective", det.objective, objective.trim());
    check("3. Overview", "systemArchetype", "ประเภทระบบ", "System Archetype", det.systemArchetype, systemArchetype.trim());
    check("3. Overview", "complexityTier", "ระดับความซับซ้อน", "Complexity Tier", det.complexityTier, complexityTier.trim());
    check("3. Overview", "highLevelScope", "ขอบเขตงานภาพรวม", "High-level Scope", det.highLevelScope, highLevelScope.trim());
    check("3. Overview", "majorComponents", "องค์ประกอบสำคัญ", "Major Components", (det.majorComponents || []).join(", "), majorComponents.filter(Boolean).join(", "));

    // 4. Deliverables
    check("4. Deliverables", "deliverables.system", "งานส่งมอบระบบหลัก", "System Deliverables", (det.deliverables?.system || []).join("; "), deliverablesSystem.filter(Boolean).join("; "));
    check("4. Deliverables", "deliverables.implementation", "งานติดตั้งและบริการ", "Implementation Deliverables", (det.deliverables?.implementation || []).join("; "), deliverablesImplementation.filter(Boolean).join("; "));
    check("4. Deliverables", "deliverables.validation", "งานทดสอบและตรวจรับ", "Validation Deliverables", (det.deliverables?.validation || []).join("; "), deliverablesValidation.filter(Boolean).join("; "));
    check("4. Deliverables", "deliverables.supportingWork", "งานสนับสนุนและอบรม", "Supporting Work", (det.deliverables?.supportingWork || []).join("; "), deliverablesSupportingWork.filter(Boolean).join("; "));

    // 5. Technical Requirements
    const origTechs = (det.technologiesList?.map((t) => t.name) || (det.requiredTechnologies ? det.requiredTechnologies.split(",").map((s) => s.trim()).filter(Boolean) : [])).join(", ");
    check("5. Tech Stack", "requiredTechnologies", "เทคโนโลยีที่กำหนด", "Required Tech", origTechs, selectedTechs.join(", "));
    check("5. Tech Stack", "requiredCapabilities", "ความสามารถทางเทคนิค", "Required Capabilities", (det.requiredCapabilities || []).join("; "), requiredCapabilities.filter(Boolean).join("; "));
    const origInfra = (det.infrastructureSpecifications || []).map((s: { item: string; specification: string }) => `${s.item}: ${s.specification}`).join("; ");
    const currInfra = infrastructureSpecs.map((s) => `${s.key}: ${s.value}`).join("; ");
    check("5. Tech Stack", "infrastructureSpecifications", "คุณลักษณะฮาร์ดแวร์/อุปกรณ์", "Infrastructure Specs", origInfra, currInfra);
    const origConstraints = (det.technicalConstraints || []).map((c: { metric: string; value: string }) => `${c.metric}: ${c.value}`).join("; ");
    const currConstraints = technicalConstraints.map((c) => `${c.key}: ${c.value}`).join("; ");
    check("5. Tech Stack", "technicalConstraints", "ข้อจำกัดทางเทคนิค", "Technical Constraints", origConstraints, currConstraints);

    // 6. Integration Environment
    check("6. Integration", "existingSystems", "ระบบเดิมที่เชื่อมต่อ", "Existing Systems", (det.integrationEnvironment?.existingSystems || []).join("; "), existingSystems.filter(Boolean).join("; "));
    check("6. Integration", "interfacesAndApis", "อินเทอร์เฟซและ API", "Interfaces & APIs", (det.integrationEnvironment?.interfacesAndApis || []).join("; "), interfacesAndApis.filter(Boolean).join("; "));
    check("6. Integration", "deploymentLocation", "สถานที่ติดตั้ง/ระบบคลาวด์", "Deployment Location", det.integrationEnvironment?.deploymentLocation, deploymentLocation.trim());
    check("6. Integration", "dataMigrationNotes", "การโอนย้ายข้อมูล", "Data Migration", det.integrationEnvironment?.dataMigrationNotes, dataMigrationNotes.trim());

    // 7. Operational Requirements
    check("7. Operations", "installationAndConfig", "ข้อกำหนดการติดตั้ง", "Installation & Config", (det.operationalRequirements?.installationAndConfig || []).join("; "), installationAndConfig.filter(Boolean).join("; "));
    check("7. Operations", "training", "การฝึกอบรม", "Training Curriculum", (det.operationalRequirements?.training || []).join("; "), training.filter(Boolean).join("; "));
    check("7. Operations", "technicalSupportAndSla", "การซัพพอร์ตและ SLA", "Technical Support & SLA", det.operationalRequirements?.technicalSupportAndSla, technicalSupportAndSla.trim());
    check("7. Operations", "maintenance", "การบำรุงรักษา", "Maintenance", (det.operationalRequirements?.maintenance || []).join("; "), maintenance.filter(Boolean).join("; "));

    // 8. Eligibility
    const origCompany = Array.isArray(det.companyRequirements) ? det.companyRequirements.join("; ") : (det.companyRequirements || "");
    check("8. Eligibility", "companyRequirements", "คุณสมบัติบริษัท", "Company Requirements", origCompany, companyReqs.filter(Boolean).join("; "));
    check("8. Eligibility", "requiredCertifications", "มาตรฐานและใบรับรอง", "Required Certifications", (det.requiredCertifications || []).join("; "), requiredCertifications.filter(Boolean).join("; "));
    check("8. Eligibility", "manufacturerAuthorizations", "หนังสือแต่งตั้งตัวแทนจำหน่าย", "Manufacturer Authorizations", (det.manufacturerAuthorizations || []).join("; "), manufacturerAuthorizations.filter(Boolean).join("; "));
    check("8. Eligibility", "personnelQualifications", "คุณสมบัติบุคลากร", "Personnel Qualifications", (det.personnelQualifications || []).join("; "), personnelQualifications.filter(Boolean).join("; "));
    check("8. Eligibility", "previousExperienceMinTHB", "มูลค่าผลงานขั้นต่ำ (บาท)", "Min Experience (THB)", det.previousExperienceMinTHB, minExpCheck.value);
    check("8. Eligibility", "previousExperience", "เงื่อนไขผลงานที่ผ่านมา", "Previous Experience", det.previousExperience, previousExperience.trim());

    // 9. Contract Conditions
    check("9. Contract", "paymentTerms", "การจ่ายเงินและงวดงาน", "Payment Terms", det.paymentTerms, paymentTerms.trim());
    check("9. Contract", "deliveryConditions", "เงื่อนไขการส่งมอบ", "Delivery Conditions", det.deliveryConditions, deliveryConditions.trim());
    check("9. Contract", "evaluationMethod", "เกณฑ์การพิจารณา", "Evaluation Method", det.evaluationMethod, evaluationMethod.trim());

    // 10. Amendment Info
    check("10. Amendments", "isAmended", "สถานะการแก้ไข (Amended)", "Is Amended Flag", Boolean(det.amendmentInfo?.isAmended) ? "Yes" : "No", isAmended ? "Yes" : "No");
    check("10. Amendments", "amendmentSummary", "สรุปประเด็นการแก้ไข", "Amendment Summary", det.amendmentInfo?.amendmentSummary, amendmentSummary.trim());
    check("10. Amendments", "changedSections", "ส่วนที่แก้ไข", "Changed Sections", (det.amendmentInfo?.changedSections || []).join("; "), changedSections.filter(Boolean).join("; "));

    return result;
  }, [
    data,
    title,
    titleEn,
    agency,
    department,
    category,
    status,
    budgetCheck.value,
    refPriceCheck.value,
    submissionDeadline,
    commentDeadline,
    deliveryPeriodCheck.value,
    procurementMethod,
    durationCheck.value,
    warrantyCheck.value,
    penaltyClause,
    postedDate,
    objective,
    systemArchetype,
    complexityTier,
    highLevelScope,
    majorComponents,
    deliverablesSystem,
    deliverablesImplementation,
    deliverablesValidation,
    deliverablesSupportingWork,
    selectedTechs,
    requiredCapabilities,
    infrastructureSpecs,
    technicalConstraints,
    existingSystems,
    interfacesAndApis,
    deploymentLocation,
    dataMigrationNotes,
    installationAndConfig,
    training,
    technicalSupportAndSla,
    maintenance,
    companyReqs,
    requiredCertifications,
    manufacturerAuthorizations,
    personnelQualifications,
    minExpCheck.value,
    previousExperience,
    paymentTerms,
    deliveryConditions,
    evaluationMethod,
    isAmended,
    amendmentSummary,
    changedSections,
  ]);

  const diffsByField = useMemo(() => {
    const map: Record<string, EditDiffItem> = {};
    for (const d of diffs) {
      map[d.field] = d;
    }
    return map;
  }, [diffs]);

  const diffsBySection = useMemo(() => {
    const map: Record<string, number> = {};
    for (const d of diffs) {
      map[d.section] = (map[d.section] || 0) + 1;
    }
    return map;
  }, [diffs]);

  const handleRevertField = useCallback(
    (fieldKey: string) => {
      if (!data) return;
      const det = data.details || {};
      switch (fieldKey) {
        case "title":
          setTitle(data.title || "");
          break;
        case "titleEn":
          setTitleEn(det.titleEn || "");
          break;
        case "agency":
          setAgency(data.agency || "");
          break;
        case "department":
          setDepartment(det.department || "");
          break;
        case "category":
          setCategory(det.category || "software-development");
          break;
        case "status":
          setStatus(det.status || "Open");
          break;
        case "budgetTHB":
          setBudgetTHB(data.budgetTHB != null ? String(data.budgetTHB) : "");
          break;
        case "referencePriceTHB":
          setReferencePriceTHB(data.referencePriceTHB != null ? String(data.referencePriceTHB) : "");
          break;
        case "submissionDeadline":
          setSubmissionDeadline(toDateInputValue(data.submissionDeadline));
          break;
        case "commentDeadline":
          setCommentDeadline(toDateInputValue(det.commentDeadline));
          break;
        case "deliveryPeriodDays":
          setDeliveryPeriodDays(det.deliveryPeriodDays != null ? String(det.deliveryPeriodDays) : "");
          break;
        case "procurementMethod":
          setProcurementMethod(det.procurementMethod || "");
          break;
        case "contractDurationDays":
          setContractDurationDays(det.contractDurationDays != null ? String(det.contractDurationDays) : "");
          break;
        case "warrantyYears":
          setWarrantyYears(det.warrantyYears != null ? String(det.warrantyYears) : "");
          break;
        case "penaltyClause":
          setPenaltyClause(det.penaltyClause || "");
          break;
        case "postedDate":
          setPostedDate(toDateInputValue(det.postedDate));
          break;
        case "objective":
          setObjective(det.objective || "");
          break;
        case "systemArchetype":
          setSystemArchetype(det.systemArchetype || "");
          break;
        case "complexityTier":
          setComplexityTier(det.complexityTier || "");
          break;
        case "highLevelScope":
          setHighLevelScope(det.highLevelScope || "");
          break;
        case "majorComponents":
          setMajorComponents(det.majorComponents || []);
          break;
        case "deliverables.system":
          setDeliverablesSystem(det.deliverables?.system || []);
          break;
        case "deliverables.implementation":
          setDeliverablesImplementation(det.deliverables?.implementation || []);
          break;
        case "deliverables.validation":
          setDeliverablesValidation(det.deliverables?.validation || []);
          break;
        case "deliverables.supportingWork":
          setDeliverablesSupportingWork(det.deliverables?.supportingWork || []);
          break;
        case "requiredTechnologies": {
          const techList: string[] = [];
          if (det.technologiesList && Array.isArray(det.technologiesList)) {
            det.technologiesList.forEach((t) => {
              if (t?.name) techList.push(t.name);
            });
          } else if (det.requiredTechnologies) {
            det.requiredTechnologies
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
              .forEach((t) => techList.push(t));
          }
          setSelectedTechs(techList);
          break;
        }
        case "requiredCapabilities":
          setRequiredCapabilities(det.requiredCapabilities || []);
          break;
        case "deploymentLocation":
          setDeploymentLocation(det.integrationEnvironment?.deploymentLocation || "");
          break;
        case "dataMigrationNotes":
          setDataMigrationNotes(det.integrationEnvironment?.dataMigrationNotes || "");
          break;
        case "technicalSupportAndSla":
          setTechnicalSupportAndSla(det.operationalRequirements?.technicalSupportAndSla || "");
          break;
        case "companyRequirements":
          if (Array.isArray(det.companyRequirements)) {
            setCompanyReqs(det.companyRequirements);
          } else if (det.companyRequirements) {
            setCompanyReqs(
              String(det.companyRequirements)
                .split("\n")
                .map((s) => s.trim().replace(/^[-*•\d.]+\s*/, ""))
                .filter(Boolean)
            );
          } else {
            setCompanyReqs([]);
          }
          break;
        case "previousExperienceMinTHB":
          setPreviousExperienceMinTHB(det.previousExperienceMinTHB != null ? String(det.previousExperienceMinTHB) : "");
          break;
        case "previousExperience":
          setPreviousExperience(det.previousExperience || "");
          break;
        case "infrastructureSpecifications":
          setInfrastructureSpecs(
            (det.infrastructureSpecifications || []).map((s: { item: string; specification: string }) => ({
              key: s.item,
              value: s.specification,
            }))
          );
          break;
        case "technicalConstraints":
          setTechnicalConstraints(
            (det.technicalConstraints || []).map((c: { metric: string; value: string }) => ({
              key: c.metric,
              value: c.value,
            }))
          );
          break;
        case "existingSystems":
          setExistingSystems(det.integrationEnvironment?.existingSystems || []);
          break;
        case "interfacesAndApis":
          setInterfacesAndApis(det.integrationEnvironment?.interfacesAndApis || []);
          break;
        case "installationAndConfig":
          setInstallationAndConfig(det.operationalRequirements?.installationAndConfig || []);
          break;
        case "training":
          setTraining(det.operationalRequirements?.training || []);
          break;
        case "maintenance":
          setMaintenance(det.operationalRequirements?.maintenance || []);
          break;
        case "requiredCertifications":
          setRequiredCertifications(det.requiredCertifications || []);
          break;
        case "manufacturerAuthorizations":
          setManufacturerAuthorizations(det.manufacturerAuthorizations || []);
          break;
        case "personnelQualifications":
          setPersonnelQualifications(det.personnelQualifications || []);
          break;
        case "paymentTerms":
          setPaymentTerms(det.paymentTerms || "");
          break;
        case "deliveryConditions":
          setDeliveryConditions(det.deliveryConditions || "");
          break;
        case "evaluationMethod":
          setEvaluationMethod(det.evaluationMethod || "");
          break;
        case "isAmended":
          setIsAmended(Boolean(det.amendmentInfo?.isAmended));
          break;
        case "amendmentSummary":
          setAmendmentSummary(det.amendmentInfo?.amendmentSummary || "");
          break;
        case "changedSections":
          setChangedSections(det.amendmentInfo?.changedSections || []);
          break;
        default:
          break;
      }
    },
    [data]
  );

  const handleDiscardAll = useCallback(() => {
    if (!data) return;
    applyItemToForm(data);
  }, [data, applyItemToForm]);

  function handleSaveAndPublish(e: React.FormEvent) {
    e.preventDefault();

    if (!refPriceCheck.valid) {
      setErrorMessage(
        lang === "th"
          ? "ราคากลาง (Reference Price) ไม่ถูกต้อง: ต้องระบุเป็นตัวเลขเท่านั้น เช่น 1,500,000 หรือ 1500000"
          : "Invalid Reference Price: must be a valid non-negative number"
      );
      return;
    }

    if (!budgetCheck.valid) {
      setErrorMessage(
        lang === "th"
          ? "งบประมาณ (Approved Budget) ไม่ถูกต้อง: ต้องระบุเป็นตัวเลขเท่านั้น เช่น 1,800,000 หรือ 1800000"
          : "Invalid Approved Budget: must be a valid non-negative number"
      );
      return;
    }

    if (!durationCheck.valid) {
      setErrorMessage(
        lang === "th"
          ? "ระยะเวลาสัญญา (Contract Duration) ไม่ถูกต้อง: ต้องระบุเป็นจำนวนวัน (ตัวเลขจำนวนเต็มบวก)"
          : "Invalid Contract Duration: must be positive integer days"
      );
      return;
    }

    if (!deliveryPeriodCheck.valid) {
      setErrorMessage(
        lang === "th"
          ? "ระยะเวลาส่งมอบ (Delivery Period) ไม่ถูกต้อง: ต้องระบุเป็นจำนวนวัน (ตัวเลขจำนวนเต็มบวก)"
          : "Invalid Delivery Period: must be positive integer days"
      );
      return;
    }

    if (!warrantyCheck.valid) {
      setErrorMessage(
        lang === "th"
          ? "ระยะเวลารับประกัน (Warranty Period) ไม่ถูกต้อง: ต้องระบุเป็นตัวเลขปี เช่น 1 หรือ 2"
          : "Invalid Warranty Period: must be a valid number of years"
      );
      return;
    }

    if (!minExpCheck.valid) {
      setErrorMessage(
        lang === "th"
          ? "มูลค่าผลงานขั้นต่ำ (Minimum Experience Value) ไม่ถูกต้อง: ต้องระบุเป็นตัวเลข เช่น 5,000,000"
          : "Invalid Minimum Experience Value: must be a valid non-negative number"
      );
      return;
    }

    setErrorMessage(null);
    setSaveSuccess(false);

    // Prompt confirmation modal with live calculated diffs
    setShowConfirmModal(true);
  }

  async function executeApprove() {
    setIsSaving(true);
    setErrorMessage(null);
    setSaveSuccess(false);

    try {
      const payload: UpdateReviewPayload = {
        action: "approve",
        fields: {
          // 1. Identification
          title: title.trim(),
          titleEn: titleEn.trim() || null,
          agency: agency.trim(),
          department: department.trim() || null,
          category: category || null,
          status: status || null,

          // 2. Key Facts
          budgetTHB: budgetCheck.value,
          referencePriceTHB: refPriceCheck.value,
          submissionDeadline: submissionDeadline.trim() || null,
          commentDeadline: commentDeadline.trim() || null,
          deliveryPeriodDays: deliveryPeriodCheck.value,
          procurementMethod: procurementMethod.trim() || null,
          contractDurationDays: durationCheck.value,
          warrantyYears: warrantyCheck.value,
          penaltyClause: penaltyClause.trim() || null,
          postedDate: postedDate.trim() || null,

          // 3. Overview
          objective: objective.trim() || null,
          systemArchetype: systemArchetype.trim() || null,
          complexityTier: complexityTier.trim() || null,
          majorComponents: majorComponents.filter(Boolean),
          highLevelScope: highLevelScope.trim() || null,

          // 4. Deliverables
          deliverables: {
            system: deliverablesSystem.filter(Boolean),
            implementation: deliverablesImplementation.filter(Boolean),
            validation: deliverablesValidation.filter(Boolean),
            supportingWork: deliverablesSupportingWork.filter(Boolean),
          },

          // 5. Technical Requirements
          requiredTechnologies: selectedTechs.join(", "),
          technologiesList: selectedTechs.map((name) => ({
            name,
            version: techVersions[name] || undefined,
          })),
          requiredCapabilities: requiredCapabilities.filter(Boolean),
          infrastructureSpecifications: infrastructureSpecs
            .filter((it) => it.key || it.value)
            .map((it) => ({ item: it.key, specification: it.value })),
          technicalConstraints: technicalConstraints
            .filter((it) => it.key || it.value)
            .map((it) => ({ metric: it.key, value: it.value })),

          // 6. Integration Environment
          integrationEnvironment: {
            existingSystems: existingSystems.filter(Boolean),
            interfacesAndApis: interfacesAndApis.filter(Boolean),
            dataMigrationNotes: dataMigrationNotes.trim() || null,
            deploymentLocation: deploymentLocation.trim() || null,
          },

          // 7. Operational Requirements
          operationalRequirements: {
            installationAndConfig: installationAndConfig.filter(Boolean),
            training: training.filter(Boolean),
            technicalSupportAndSla: technicalSupportAndSla.trim() || null,
            maintenance: maintenance.filter(Boolean),
          },

          // 8. Eligibility
          companyRequirements: companyReqs.filter(Boolean),
          requiredCertifications: requiredCertifications.filter(Boolean),
          manufacturerAuthorizations: manufacturerAuthorizations.filter(Boolean),
          personnelQualifications: personnelQualifications.filter(Boolean),
          previousExperience: previousExperience.trim() || null,
          previousExperienceMinTHB: minExpCheck.value,

          // 9. Contract Conditions
          paymentTerms: paymentTerms.trim() || null,
          deliveryConditions: deliveryConditions.trim() || null,
          evaluationMethod: evaluationMethod.trim() || null,

          // 10. Amendment Info
          amendmentInfo: {
            isAmended,
            amendmentSummary: amendmentSummary.trim(),
            changedSections: changedSections.filter(Boolean),
          },
        },
      };

      const res = await adminUpdateReview(projectId, payload);
      setIsSaving(false);

      if (res.ok) {
        setShowConfirmModal(false);
        setSaveSuccess(true);
        // Refresh active review item so data matches the newly approved record
        const freshRes = await adminGetReviewItem(projectId);
        if (freshRes.ok) {
          setData(freshRes.data.item);
          applyItemToForm(freshRes.data.item);
        }
        loadVersions();
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
        lang === "th"
          ? "ส่งเอกสารกลับเข้าคิว AI Extraction เรียบร้อยแล้ว ระบบจะอ่านข้อมูลใหม่ในรอบถัดไป"
          : "TOR has been re-queued for AI extraction. It will be re-processed shortly."
      );
    } else {
      setErrorMessage(res.error?.message || "Failed to trigger re-extraction");
    }
  }

  const scrollToSection = (id: string) => {
    setActiveSection(id);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", `#${id}`);
      }
    }
  };

  useEffect(() => {
    if (loading || !data) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
          setActiveSection(visible[0].target.id);
        }
      },
      {
        rootMargin: "-120px 0px -60% 0px",
        threshold: [0, 0.2],
      }
    );

    SECTIONS_LIST.forEach((sec) => {
      const el = document.getElementById(sec.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [loading, data]);

  if (authError) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <SignInPrompt
          next={`/admin/review/${projectId}`}
          headline={lang === "th" ? "ส่วนนี้สำหรับผู้ดูแลระบบ" : "This area is for administrators"}
          body={
            lang === "th"
              ? "เข้าสู่ระบบด้วยบัญชีผู้ดูแลเพื่อตรวจทานและแก้ไขข้อมูล TOR"
              : "Sign in with an administrator account to review and edit TOR details."
          }
          cta={lang === "th" ? "เข้าสู่ระบบ" : "Sign in"}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12 text-center text-ink-3">
        <p className="animate-pulse text-[14px]">
          {lang === "th" ? "กำลังโหลดข้อมูล TOR สำหรับการตรวจทาน..." : "Loading TOR review workspace..."}
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <EmptyState
          headline={lang === "th" ? "ไม่พบเอกสาร TOR" : "TOR Document Not Found"}
          body={lang === "th" ? `ไม่พบข้อมูลสำหรับรหัสโครงการ ${projectId}` : `No review item found for project ${projectId}`}
          action={
            <Link href="/admin?job=review" className={btn.secondary}>
              {lang === "th" ? "กลับไปหน้าคิวตรวจทาน" : "Back to Review Queue"}
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {/* Top Bar Header (offset below App Shell header at 53px) */}
      <div className="sticky top-[53px] z-20 mb-6 flex flex-col gap-2.5 rounded-[3px] border border-line bg-surface/95 px-4 py-2.5 backdrop-blur shadow-sm xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <Link
            href="/admin?job=review"
            className="text-[12px] font-medium text-ink-3 hover:text-ink transition-colors flex items-center gap-1 shrink-0"
          >
            <span>←</span>
            <span>{lang === "th" ? "คิวตรวจทาน" : "Review Queue"}</span>
          </Link>
          <span className="text-line-2">|</span>
          <span className="font-mono text-[12px] font-bold text-ink shrink-0">{projectId}</span>
          <span className={`rounded-[2px] px-2 py-0.5 text-[11px] font-medium font-mono shrink-0 ${confidenceTone(data.extraction)}`}>
            {Math.round(data.extraction * 100)}%
          </span>
          {currentVersion ? (
            <button
              type="button"
              onClick={() => setShowVersionDrawer(true)}
              className="rounded-[2px] border border-line bg-surface-2 px-2 py-0.5 text-[11px] font-mono text-ink-2 hover:border-ink hover:text-ink transition-colors cursor-pointer shrink-0"
              title={lang === "th" ? "ดูประวัติเวอร์ชันและย้อนกลับ" : "View version history and rollback"}
            >
              v{currentVersion} ↗
            </button>
          ) : null}
          {diffs.length > 0 && (
            <span className="rounded-[2px] border border-amend-line bg-amend-bg px-2 py-0.5 text-[11px] font-medium text-amend shrink-0 flex items-center gap-1">
              <span>●</span>
              <span>{lang === "th" ? `แก้ไข ${diffs.length} รายการ` : `${diffs.length} edited`}</span>
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 xl:justify-end">
          <button
            type="button"
            onClick={() => setShowPdfModal(true)}
            className={`${btn.secondary} text-[11px] h-7 px-2 flex items-center gap-1 shrink-0`}
            title={lang === "th" ? "พรีวิวเอกสาร PDF ต้นฉบับ" : "Preview original PDF"}
          >
            <span>📄</span>
            <span>{lang === "th" ? "พรีวิว PDF" : "Preview PDF"}</span>
          </button>
          {data.details?.evidence ? (
            <button
              type="button"
              onClick={() => setShowEvidenceDrawer(true)}
              className={`${btn.secondary} text-[11px] h-7 px-2 flex items-center gap-1 shrink-0`}
            >
              <span>🔍</span>
              <span>{lang === "th" ? "หลักฐาน TOR" : "Evidence"}</span>
            </button>
          ) : null}
          <a
            href={`/tor/${projectId}`}
            target="_blank"
            rel="noreferrer"
            className={`${btn.secondary} text-[11px] h-7 px-2 flex items-center gap-1 shrink-0`}
          >
            <span>{lang === "th" ? "ดูหน้าเว็บ" : "Public View"}</span>
            <span className="text-[10px] opacity-75">↗</span>
          </a>
          <button
            type="button"
            disabled={isReExtracting}
            onClick={handleReExtractTrigger}
            className={`${btn.secondary} text-[11px] h-7 px-2 text-ink-2 shrink-0`}
          >
            {isReExtracting
              ? lang === "th"
                ? "กำลังส่งอ่าน..."
                : "Queueing..."
              : lang === "th"
                ? "ส่งอ่านใหม่"
                : "Re-extract"}
          </button>
          <button
            type="button"
            onClick={() => setShowReclassifyModal(true)}
            className="inline-flex items-center justify-center gap-1.5 rounded-[3px] border border-risk-line bg-risk-bg px-3.5 h-9 text-[13px] font-medium text-risk hover:opacity-85 transition-opacity cursor-pointer shrink-0"
          >
            {lang === "th" ? "คัดออก" : "Reclassify"}
          </button>
          <button
            type="submit"
            form="review-form"
            disabled={isSaving || hasValidationErrors}
            className={`${btn.primary} text-[13px] h-9 px-4 font-semibold shrink-0 cursor-pointer`}
          >
            {isSaving
              ? lang === "th"
                ? "กำลังบันทึก..."
                : "Saving..."
              : lang === "th"
                ? "บันทึกและอนุมัติ"
                : "Approve & Publish"}
          </button>
        </div>
      </div>

      {/* Notifications */}
      {errorMessage && (
        <div className="mb-4 rounded-[3px] border border-risk-line bg-risk-bg p-3 text-[13px] text-risk">
          {errorMessage}
        </div>
      )}
      {saveSuccess && (
        <div className="mb-4 rounded-[3px] border border-open-line bg-open-bg p-3 text-[13px] text-open">
          {lang === "th"
            ? "✓ บันทึกการแก้ไขและอนุมัติข้อมูลเรียบร้อยแล้ว ข้อมูลจะแสดงผลบนหน้า TOR ทันที"
            : "✓ Changes saved and TOR approved successfully. The public page is updated."}
        </div>
      )}
      {reExtractNotice && (
        <div className="mb-4 rounded-[3px] border border-amend-line bg-amend-bg p-3 text-[13px] text-amend">
          {reExtractNotice}
        </div>
      )}

      {/* Main Workspace Layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        {/* Sticky Sidebar Navigation (10 Sections) */}
        <div className="lg:col-span-1">
          <div className="sticky top-[125px] flex flex-col gap-1 rounded-[3px] border border-line bg-surface p-2 shadow-xs">
            <span className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-3">
              {lang === "th" ? "หัวข้อข้อมูล TOR ทั้ง 10 ส่วน" : "10 TOR Sections"}
            </span>
            {SECTIONS_LIST.map((sec) => {
              const sectionDiffCount = diffsBySection[sec.labelEn] || 0;
              return (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => scrollToSection(sec.id)}
                  className={`flex items-center justify-between text-left px-3 py-2 text-[12px] rounded-[2px] transition-colors cursor-pointer ${
                    activeSection === sec.id
                      ? "bg-surface-2 font-semibold text-ink border-l-2 border-ink"
                      : "text-ink-2 hover:bg-surface-2 hover:text-ink"
                  }`}
                >
                  <span className="truncate">{lang === "th" ? sec.labelTh : sec.labelEn}</span>
                  {sectionDiffCount > 0 ? (
                    <span className="ml-2 rounded-full bg-amend text-surface text-[10px] font-bold px-1.5 py-0.2 shrink-0">
                      {sectionDiffCount}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content Form Editor */}
        <div className="lg:col-span-3">
          <form id="review-form" onSubmit={handleSaveAndPublish} className="flex flex-col gap-6">

            {/* SECTION 1: Identification & Classification */}
            <Panel id="sec-identification" className="p-5 scroll-mt-[135px]">
              <div className="border-b border-line pb-3">
                <SectionHeading>
                  {lang === "th" ? "1. ข้อมูลทั่วไปและการจัดประเภท" : "1. Project Identification & Scope"}
                </SectionHeading>
                <p className="text-[12px] text-ink-3 mt-1">
                  {lang === "th" ? "ชื่อโครงการ หน่วยงาน และประเภทงานตามประกาศทางการ" : "Project identity, procuring agency, and procurement categorization"}
                </p>
              </div>

              <div className="mt-4 flex flex-col gap-4">
                <div>
                  <FieldHeader
                    label={lang === "th" ? "ชื่อโครงการ (ภาษาไทย)" : "Project Title (Thai)"}
                    fieldKey="title"
                    htmlFor="field-title"
                    diffItem={diffsByField["title"]}
                    onRevert={handleRevertField}
                    confidenceBadge={<FieldConfidenceBadge confidence={getFieldScore("Title")} lang={lang} />}
                    lang={lang}
                  />
                  <input
                    id="field-title"
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className={`${input} ${modInput(Boolean(diffsByField["title"]))}`}
                  />
                </div>

                <div>
                  <FieldHeader
                    label={lang === "th" ? "ชื่อโครงการ (ภาษาอังกฤษ)" : "Project Title (English)"}
                    fieldKey="titleEn"
                    htmlFor="field-title-en"
                    diffItem={diffsByField["titleEn"]}
                    onRevert={handleRevertField}
                    lang={lang}
                  />
                  <input
                    id="field-title-en"
                    type="text"
                    value={titleEn}
                    onChange={(e) => setTitleEn(e.target.value)}
                    placeholder="e.g. Bangkok Smart Traffic Data Infrastructure Development"
                    className={`${input} ${modInput(Boolean(diffsByField["titleEn"]))}`}
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <FieldHeader
                      label={lang === "th" ? "หน่วยงานผู้จัดซื้อ" : "Procuring Organization"}
                      fieldKey="agency"
                      htmlFor="field-agency"
                      diffItem={diffsByField["agency"]}
                      onRevert={handleRevertField}
                      confidenceBadge={<FieldConfidenceBadge confidence={getFieldScore("Agency")} lang={lang} />}
                      lang={lang}
                    />
                    <input
                      id="field-agency"
                      type="text"
                      required
                      value={agency}
                      onChange={(e) => setAgency(e.target.value)}
                      className={`${input} ${modInput(Boolean(diffsByField["agency"]))}`}
                    />
                  </div>

                  <div>
                    <FieldHeader
                      label={lang === "th" ? "สำนัก / กอง / ฝ่ายที่รับผิดชอบ" : "Department / Division"}
                      fieldKey="department"
                      htmlFor="field-dept"
                      diffItem={diffsByField["department"]}
                      onRevert={handleRevertField}
                      lang={lang}
                    />
                    <input
                      id="field-dept"
                      type="text"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      placeholder="เช่น กองสารสนเทศระบายน้ำ"
                      className={`${input} mt-1 ${modInput(Boolean(diffsByField["department"]))}`}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <FieldHeader
                      label={lang === "th" ? "หมวดหมู่งานไอที" : "IT Category"}
                      fieldKey="category"
                      htmlFor="field-category"
                      diffItem={diffsByField["category"]}
                      onRevert={handleRevertField}
                      lang={lang}
                    />
                    <select
                      id="field-category"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className={`${input} mt-1 cursor-pointer ${modInput(Boolean(diffsByField["category"]))}`}
                    >
                      <option value="software-development">{lang === "th" ? "พัฒนาซอฟต์แวร์ / ระบบสารสนเทศ" : "Software Development"}</option>
                      <option value="hardware-infrastructure">{lang === "th" ? "โครงสร้างพื้นฐานฮาร์ดแวร์และเครือข่าย" : "Hardware & Infra"}</option>
                      <option value="cloud-and-datacenter">{lang === "th" ? "ระบบคลาวด์และศูนย์ข้อมูล" : "Cloud & Data Center"}</option>
                      <option value="data-and-ai">{lang === "th" ? "ระบบข้อมูลและปัญญาประดิษฐ์ (AI)" : "Data & AI"}</option>
                      <option value="cybersecurity">{lang === "th" ? "ความมั่นคงปลอดภัยไซเบอร์" : "Cybersecurity"}</option>
                      <option value="maintenance-and-support">{lang === "th" ? "บำรุงรักษาและสนับสนุนระบบ" : "Maintenance & Support"}</option>
                      <option value="non-IT">{lang === "th" ? "งานนอกขอบเขต / ไม่ใช่งานไอที" : "Out of Scope / Non-IT"}</option>
                    </select>
                  </div>

                  <div>
                    <FieldHeader
                      label={lang === "th" ? "สถานะการจัดซื้อ" : "Procurement Status"}
                      fieldKey="status"
                      htmlFor="field-status"
                      diffItem={diffsByField["status"]}
                      onRevert={handleRevertField}
                      lang={lang}
                    />
                    <select
                      id="field-status"
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      className={`${input} mt-1 cursor-pointer ${modInput(Boolean(diffsByField["status"]))}`}
                    >
                      <option value="Draft">{lang === "th" ? "ร่างประกาศ" : "Draft"}</option>
                      <option value="Open">{lang === "th" ? "เปิดรับซอง / ยื่นข้อเสนอ" : "Open"}</option>
                      <option value="Awarded">{lang === "th" ? "ประกาศผู้ชนะแล้ว" : "Awarded"}</option>
                      <option value="Closed">{lang === "th" ? "สิ้นสุดการยื่นข้อเสนอ" : "Closed"}</option>
                      <option value="Cancelled">{lang === "th" ? "ยกเลิกประกาศ" : "Cancelled"}</option>
                    </select>
                  </div>
                </div>
              </div>
            </Panel>

            {/* SECTION 2: Key Facts & Deadlines */}
            <Panel id="sec-keyfacts" className="p-5 scroll-mt-[135px]">
              <div className="border-b border-line pb-3">
                <SectionHeading>
                  {lang === "th" ? "2. ข้อมูลสำคัญ ราคา และกำหนดการ" : "2. Procurement Facts & Deadlines"}
                </SectionHeading>
                <p className="text-[12px] text-ink-3 mt-1">
                  {lang === "th" ? "งบประมาณ ราคากลาง กำหนดส่งมอบ และเงื่อนไขค่าปรับ" : "Budget, reference price, deadlines, and penalty terms"}
                </p>
              </div>

              <div className="mt-4 flex flex-col gap-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <FieldHeader
                      label={lang === "th" ? "งบประมาณ (บาท)" : "Approved Budget (THB)"}
                      fieldKey="budgetTHB"
                      htmlFor="field-budget"
                      diffItem={diffsByField["budgetTHB"]}
                      onRevert={handleRevertField}
                      confidenceBadge={<FieldConfidenceBadge confidence={getFieldScore("Budget")} lang={lang} />}
                      lang={lang}
                    />
                    <input
                      id="field-budget"
                      type="text"
                      value={budgetTHB}
                      onChange={(e) => setBudgetTHB(e.target.value)}
                      placeholder="เช่น 1,800,000"
                      className={`${input} ${!budgetCheck.valid ? "border-risk focus:border-risk" : ""} ${modInput(Boolean(diffsByField["budgetTHB"]))}`}
                    />
                    {!budgetCheck.valid ? (
                      <p className="mt-1 text-[11px] text-risk">
                        {lang === "th" ? "โปรดระบุเป็นตัวเลขเท่านั้น (เช่น 1,500,000 หรือ 1500000)" : "Must be a valid positive number"}
                      </p>
                    ) : null}
                  </div>

                  <div>
                    <FieldHeader
                      label={lang === "th" ? "ราคากลาง (บาท)" : "Reference Price (THB)"}
                      fieldKey="referencePriceTHB"
                      htmlFor="field-ref-price"
                      diffItem={diffsByField["referencePriceTHB"]}
                      onRevert={handleRevertField}
                      confidenceBadge={<FieldConfidenceBadge confidence={getFieldScore("Reference")} lang={lang} />}
                      lang={lang}
                    />
                    <input
                      id="field-ref-price"
                      type="text"
                      value={referencePriceTHB}
                      onChange={(e) => setReferencePriceTHB(e.target.value)}
                      placeholder="เช่น 1,750,000"
                      className={`${input} ${!refPriceCheck.valid ? "border-risk focus:border-risk" : ""} ${modInput(Boolean(diffsByField["referencePriceTHB"]))}`}
                    />
                    {!refPriceCheck.valid ? (
                      <p className="mt-1 text-[11px] text-risk">
                        {lang === "th" ? "โปรดระบุเป็นตัวเลขเท่านั้น (เช่น 1,500,000 หรือ 1500000)" : "Must be a valid positive number"}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <FieldHeader
                      label={lang === "th" ? "วันสิ้นสุดรับซอง" : "Submission Deadline"}
                      fieldKey="submissionDeadline"
                      htmlFor="field-deadline"
                      diffItem={diffsByField["submissionDeadline"]}
                      onRevert={handleRevertField}
                      confidenceBadge={<FieldConfidenceBadge confidence={getFieldScore("Deadline")} lang={lang} />}
                      lang={lang}
                    />
                    <input
                      id="field-deadline"
                      type="date"
                      value={submissionDeadline}
                      onChange={(e) => setSubmissionDeadline(e.target.value)}
                      className={`${input} ${modInput(Boolean(diffsByField["submissionDeadline"]))}`}
                    />
                  </div>

                  <div>
                    <FieldHeader
                      label={lang === "th" ? "วันสิ้นสุดวิจารณ์" : "Public Hearing Deadline"}
                      fieldKey="commentDeadline"
                      htmlFor="field-comment-deadline"
                      diffItem={diffsByField["commentDeadline"]}
                      onRevert={handleRevertField}
                      lang={lang}
                    />
                    <input
                      id="field-comment-deadline"
                      type="date"
                      value={commentDeadline}
                      onChange={(e) => setCommentDeadline(e.target.value)}
                      className={`${input} ${modInput(Boolean(diffsByField["commentDeadline"]))}`}
                    />
                  </div>

                  <div>
                    <FieldHeader
                      label={lang === "th" ? "วันที่ประกาศ" : "Posted Date"}
                      fieldKey="postedDate"
                      htmlFor="field-posted-date"
                      diffItem={diffsByField["postedDate"]}
                      onRevert={handleRevertField}
                      lang={lang}
                    />
                    <input
                      id="field-posted-date"
                      type="date"
                      value={postedDate}
                      onChange={(e) => setPostedDate(e.target.value)}
                      className={`${input} ${modInput(Boolean(diffsByField["postedDate"]))}`}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <FieldHeader
                      label={lang === "th" ? "ระยะเวลาสัญญา (วัน)" : "Contract Duration (Days)"}
                      fieldKey="contractDurationDays"
                      htmlFor="field-duration"
                      diffItem={diffsByField["contractDurationDays"]}
                      onRevert={handleRevertField}
                      lang={lang}
                    />
                    <input
                      id="field-duration"
                      type="text"
                      value={contractDurationDays}
                      onChange={(e) => setContractDurationDays(e.target.value)}
                      placeholder="เช่น 180"
                      className={`${input} ${!durationCheck.valid ? "border-risk focus:border-risk" : ""} ${modInput(Boolean(diffsByField["contractDurationDays"]))}`}
                    />
                  </div>

                  <div>
                    <FieldHeader
                      label={lang === "th" ? "ระยะเวลาส่งมอบงาน (วัน)" : "Delivery Period (Days)"}
                      fieldKey="deliveryPeriodDays"
                      htmlFor="field-delivery-period"
                      diffItem={diffsByField["deliveryPeriodDays"]}
                      onRevert={handleRevertField}
                      lang={lang}
                    />
                    <input
                      id="field-delivery-period"
                      type="text"
                      value={deliveryPeriodDays}
                      onChange={(e) => setDeliveryPeriodDays(e.target.value)}
                      placeholder="เช่น 120"
                      className={`${input} ${!deliveryPeriodCheck.valid ? "border-risk focus:border-risk" : ""} ${modInput(Boolean(diffsByField["deliveryPeriodDays"]))}`}
                    />
                  </div>

                  <div>
                    <FieldHeader
                      label={lang === "th" ? "ระยะเวลารับประกัน (ปี)" : "Warranty Period (Years)"}
                      fieldKey="warrantyYears"
                      htmlFor="field-warranty"
                      diffItem={diffsByField["warrantyYears"]}
                      onRevert={handleRevertField}
                      lang={lang}
                    />
                    <input
                      id="field-warranty"
                      type="text"
                      value={warrantyYears}
                      onChange={(e) => setWarrantyYears(e.target.value)}
                      placeholder="เช่น 1 หรือ 2"
                      className={`${input} ${!warrantyCheck.valid ? "border-risk focus:border-risk" : ""} ${modInput(Boolean(diffsByField["warrantyYears"]))}`}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <FieldHeader
                      label={lang === "th" ? "วิธีการจัดซื้อจัดจ้าง" : "Procurement Method"}
                      fieldKey="procurementMethod"
                      htmlFor="field-method"
                      diffItem={diffsByField["procurementMethod"]}
                      onRevert={handleRevertField}
                      lang={lang}
                    />
                    <input
                      id="field-method"
                      type="text"
                      value={procurementMethod}
                      onChange={(e) => setProcurementMethod(e.target.value)}
                      placeholder="เช่น ประกวดราคาอิเล็กทรอนิกส์ (e-bidding) หรือ วิธีคัดเลือก"
                      className={`${input} ${modInput(Boolean(diffsByField["procurementMethod"]))}`}
                    />
                  </div>

                  <div>
                    <FieldHeader
                      label={lang === "th" ? "เงื่อนไขค่าปรับล่าช้า" : "Penalty Clause"}
                      fieldKey="penaltyClause"
                      htmlFor="field-penalty"
                      diffItem={diffsByField["penaltyClause"]}
                      onRevert={handleRevertField}
                      confidenceBadge={<FieldConfidenceBadge confidence={getFieldScore("Penalty")} lang={lang} />}
                      lang={lang}
                    />
                    <input
                      id="field-penalty"
                      type="text"
                      value={penaltyClause}
                      onChange={(e) => setPenaltyClause(e.target.value)}
                      placeholder="เช่น ร้อยละ 0.20 ต่อวันของมูลค่าสัญญา"
                      className={`${input} ${modInput(Boolean(diffsByField["penaltyClause"]))}`}
                    />
                  </div>
                </div>
              </div>
            </Panel>

            {/* SECTION 3: Project Overview & Scope */}
            <Panel id="sec-overview" className="p-5 scroll-mt-[135px]">
              <div className="border-b border-line pb-3">
                <SectionHeading>
                  {lang === "th" ? "3. ภาพรวมโครงการและขอบเขตงาน" : "3. Project Overview & Scope"}
                </SectionHeading>
                <p className="text-[12px] text-ink-3 mt-1">
                  {lang === "th" ? "วัตถุประสงค์ สถาปัตยกรรมระบบ และขอบเขตงานภาพรวม" : "Objective, architecture archetype, and high-level scope"}
                </p>
              </div>

              <div className="mt-4 flex flex-col gap-4">
                <div>
                  <FieldHeader
                    label={lang === "th" ? "วัตถุประสงค์โครงการ" : "Project Objective"}
                    fieldKey="objective"
                    htmlFor="field-objective"
                    diffItem={diffsByField["objective"]}
                    onRevert={handleRevertField}
                    confidenceBadge={<FieldConfidenceBadge confidence={getFieldScore("Objective")} lang={lang} />}
                    lang={lang}
                  />
                  <textarea
                    id="field-objective"
                    rows={4}
                    value={objective}
                    onChange={(e) => setObjective(e.target.value)}
                    placeholder={lang === "th" ? "ระบุวัตถุประสงค์หลักของโครงการตามที่ระบุในเอกสาร TOR..." : "Specify project objectives..."}
                    className={`${textarea} min-h-[100px] ${modInput(Boolean(diffsByField["objective"]))}`}
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <FieldHeader
                      label={lang === "th" ? "รูปแบบสถาปัตยกรรมระบบ" : "System Archetype"}
                      fieldKey="systemArchetype"
                      htmlFor="field-archetype"
                      diffItem={diffsByField["systemArchetype"]}
                      onRevert={handleRevertField}
                      lang={lang}
                    />
                    <select
                      id="field-archetype"
                      value={systemArchetype}
                      onChange={(e) => setSystemArchetype(e.target.value)}
                      className={`${input} cursor-pointer ${modInput(Boolean(diffsByField["systemArchetype"]))}`}
                    >
                      <option value="">{lang === "th" ? "-- เลือกสถาปัตยกรรมระบบ --" : "-- Select System Archetype --"}</option>
                      <option value="Web Application">Web Application</option>
                      <option value="Mobile Application">Mobile Application</option>
                      <option value="Enterprise Resource Planning">Enterprise Resource Planning (ERP)</option>
                      <option value="Data Warehouse & AI Analytics">Data Warehouse & AI Analytics</option>
                      <option value="Cloud Infrastructure">Cloud Infrastructure & Migration</option>
                      <option value="Network & Security">Network & Security Infrastructure</option>
                      <option value="Maintenance & Support">Maintenance & Technical Support</option>
                      <option value="Hardware & Appliances">Hardware & System Appliances</option>
                      <option value="Other IT System">Other IT System</option>
                    </select>
                  </div>

                  <div>
                    <FieldHeader
                      label={lang === "th" ? "ระดับความซับซ้อนของระบบ" : "Complexity Tier"}
                      fieldKey="complexityTier"
                      htmlFor="field-tier"
                      diffItem={diffsByField["complexityTier"]}
                      onRevert={handleRevertField}
                      lang={lang}
                    />
                    <select
                      id="field-tier"
                      value={complexityTier}
                      onChange={(e) => setComplexityTier(e.target.value)}
                      className={`${input} cursor-pointer ${modInput(Boolean(diffsByField["complexityTier"]))}`}
                    >
                      <option value="">{lang === "th" ? "-- เลือกระดับความซับซ้อน --" : "-- Select Complexity Tier --"}</option>
                      <option value="Tier 1 - Standard / Low Complexity">Tier 1 - Standard / Low Complexity</option>
                      <option value="Tier 2 - Moderate / Mid-Range">Tier 2 - Moderate / Mid-Range</option>
                      <option value="Tier 3 - Complex / Enterprise">Tier 3 - Complex / Enterprise</option>
                    </select>
                  </div>
                </div>

                <div>
                  <FieldHeader
                    label={lang === "th" ? "ขอบเขตงานภาพรวม" : "High-Level Scope"}
                    fieldKey="highLevelScope"
                    htmlFor="field-scope"
                    diffItem={diffsByField["highLevelScope"]}
                    onRevert={handleRevertField}
                    lang={lang}
                  />
                  <textarea
                    id="field-scope"
                    rows={3}
                    value={highLevelScope}
                    onChange={(e) => setHighLevelScope(e.target.value)}
                    placeholder={lang === "th" ? "สรุปขอบเขตงานภาพรวมที่ผู้รับจ้างต้องดำเนินการ..." : "High-level summary of contractor obligations..."}
                    className={`${textarea} min-h-[90px] ${modInput(Boolean(diffsByField["highLevelScope"]))}`}
                  />
                </div>

                <DynamicListEditor
                  label={lang === "th" ? "องค์ประกอบหลักของระบบ" : "Major System Components"}
                  items={majorComponents}
                  onChange={setMajorComponents}
                  placeholder={lang === "th" ? "เช่น ระบบประมวลผลข้อมูลกลาง (Central API)" : "e.g. Central Processing Engine"}
                  addLabel={lang === "th" ? "เพิ่มองค์ประกอบระบบ" : "Add Component"}
                  emptyHint={lang === "th" ? "ยังไม่ได้ระบุองค์ประกอบหลัก (คลิก + เพื่อเพิ่ม)" : "No major components listed"}
                  isModified={Boolean(diffsByField["majorComponents"])}
                  onRevert={() => handleRevertField("majorComponents")}
                  lang={lang}
                />
              </div>
            </Panel>

            {/* SECTION 4: Contractor Deliverables */}
            <Panel id="sec-deliverables" className="p-5 scroll-mt-[135px]">
              <div className="border-b border-line pb-3">
                <SectionHeading>
                  {lang === "th" ? "4. ขอบเขตงานส่งมอบของผู้รับจ้าง" : "4. Contractor Deliverables"}
                </SectionHeading>
                <p className="text-[12px] text-ink-3 mt-1">
                  {lang === "th" ? "รายการสิ่งส่งมอบ 4 ด้าน: งานระบบ, งานติดตั้ง, การทดสอบ, และเอกสาร/งานสนับสนุน" : "Deliverables split across system, implementation, validation, and support"}
                </p>
              </div>

              <div className="mt-4 flex flex-col gap-5">
                <DynamicListEditor
                  label={lang === "th" ? "4.1 สิ่งส่งมอบด้านระบบซอฟต์แวร์/ฮาร์ดแวร์" : "4.1 System Deliverables"}
                  items={deliverablesSystem}
                  onChange={setDeliverablesSystem}
                  placeholder={lang === "th" ? "เช่น ซอร์สโค้ดและโปรแกรมระบบบริหารจัดการข้อมูล..." : "e.g. Software source code and deployed web app..."}
                  addLabel={lang === "th" ? "เพิ่มสิ่งส่งมอบด้านระบบ" : "Add System Deliverable"}
                  isModified={Boolean(diffsByField["deliverables.system"])}
                  onRevert={() => handleRevertField("deliverables.system")}
                  lang={lang}
                />

                <DynamicListEditor
                  label={lang === "th" ? "4.2 สิ่งส่งมอบด้านการติดตั้งและปรับแต่ง" : "4.2 Implementation Deliverables"}
                  items={deliverablesImplementation}
                  onChange={setDeliverablesImplementation}
                  placeholder={lang === "th" ? "เช่น รายงานผลการติดตั้งและปรับแต่งค่าความปลอดภัยเซิร์ฟเวอร์..." : "e.g. Server installation & hardening report..."}
                  addLabel={lang === "th" ? "เพิ่มสิ่งส่งมอบด้านการติดตั้ง" : "Add Implementation Deliverable"}
                  isModified={Boolean(diffsByField["deliverables.implementation"])}
                  onRevert={() => handleRevertField("deliverables.implementation")}
                  lang={lang}
                />

                <DynamicListEditor
                  label={lang === "th" ? "4.3 สิ่งส่งมอบด้านการทดสอบและตรวจรับ" : "4.3 Validation Deliverables"}
                  items={deliverablesValidation}
                  onChange={setDeliverablesValidation}
                  placeholder={lang === "th" ? "เช่น รายงานผลการทดสอบเจาะระบบ (Penetration Test Report)..." : "e.g. User Acceptance & Pentest report..."}
                  addLabel={lang === "th" ? "เพิ่มสิ่งส่งมอบด้านการทดสอบ" : "Add Validation Deliverable"}
                  isModified={Boolean(diffsByField["deliverables.validation"])}
                  onRevert={() => handleRevertField("deliverables.validation")}
                  lang={lang}
                />

                <DynamicListEditor
                  label={lang === "th" ? "4.4 เอกสารและงานสนับสนุน" : "4.4 Supporting Work Deliverables"}
                  items={deliverablesSupportingWork}
                  onChange={setDeliverablesSupportingWork}
                  placeholder={lang === "th" ? "เช่น คู่มือการใช้งานสำหรับผู้ดูแลระบบและผู้ใช้งานทั่วไป..." : "e.g. Admin & user manuals, SLA documentation..."}
                  addLabel={lang === "th" ? "เพิ่มเอกสาร/งานสนับสนุน" : "Add Supporting Work"}
                  isModified={Boolean(diffsByField["deliverables.supportingWork"])}
                  onRevert={() => handleRevertField("deliverables.supportingWork")}
                  lang={lang}
                />
              </div>
            </Panel>

            {/* SECTION 5: Technical Requirements */}
            <Panel id="sec-tech" className="p-5 scroll-mt-[135px]">
              <div className="border-b border-line pb-3">
                <SectionHeading>
                  {lang === "th" ? "5. ข้อกำหนดด้านเทคโนโลยีและมาตรฐาน" : "5. Technical Requirements & Stack"}
                </SectionHeading>
                <p className="text-[12px] text-ink-3 mt-1">
                  {lang === "th" ? "เทคโนโลยีที่กำหนด คุณลักษณะฮาร์ดแวร์/ซอฟต์แวร์ และเกณฑ์ทางเทคนิค" : "Required tech stack, hardware/software specs, and constraints"}
                </p>
              </div>

              <div className="mt-4 flex flex-col gap-5">
                {/* Tech Stack Selector */}
                <div className={`rounded-[3px] transition-colors ${diffsByField["requiredTechnologies"] ? "p-3 bg-amend-bg/15 border border-amend-line/80" : ""}`}>
                  <FieldHeader
                    label={lang === "th" ? "เทคโนโลยีที่กำหนดใน TOR" : "Required Tech Stack"}
                    fieldKey="requiredTechnologies"
                    diffItem={diffsByField["requiredTechnologies"]}
                    onRevert={handleRevertField}
                    lang={lang}
                  />
                  <p className="text-[12px] text-ink-3 mt-0.5">
                    {lang === "th" ? "เลือกจากคลังเทคโนโลยีมาตรฐาน หรือเพิ่มเทคโนโลยีพร้อมระบุเวอร์ชัน" : "Select from vocabulary or add custom technologies with version"}
                  </p>

                  {/* Selected Tags */}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedTechs.map((name) => {
                      const ver = techVersions[name];
                      return (
                        <div
                          key={name}
                          className="inline-flex items-center gap-1.5 rounded-[3px] border border-line bg-surface-2 px-2.5 py-1 text-[12px]"
                        >
                          <span className="font-medium text-ink">{name}</span>
                          {ver ? (
                            <span className="rounded-[2px] bg-ink/10 px-1 py-0.2 text-[10px] font-mono text-ink-2">
                              {ver}
                            </span>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => removeTech(name)}
                            title={lang === "th" ? "ลบ" : "Remove"}
                            className="text-ink-3 hover:text-risk cursor-pointer ml-1"
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {/* Autocomplete Search Bar */}
                  <div className="relative mt-3">
                    <input
                      type="text"
                      value={searchTech}
                      onFocus={() => setIsTechSearchFocused(true)}
                      onBlur={() => setTimeout(() => setIsTechSearchFocused(false), 200)}
                      onChange={(e) => setSearchTech(e.target.value)}
                      placeholder={lang === "th" ? "พิมพ์เพื่อค้นหาเทคโนโลยีในคลัง..." : "Type to search vocabulary..."}
                      className={input}
                    />

                    {isTechSearchFocused && (
                      <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-[3px] border border-line bg-surface shadow-lg">
                        {availableTechs
                          .filter((t) =>
                            !searchTech.trim() ||
                            t.name.toLowerCase().includes(searchTech.trim().toLowerCase())
                          )
                          .slice(0, 15)
                          .map((tech) => {
                            const isSelected = selectedTechs.includes(tech.name);
                            return (
                              <button
                                key={tech.name}
                                type="button"
                                onMouseDown={() => toggleTech(tech.name)}
                                className={`flex w-full items-center justify-between px-3 py-2 text-left text-[12px] hover:bg-surface-2 cursor-pointer ${
                                  isSelected ? "bg-open-bg/40 font-semibold text-open" : "text-ink"
                                }`}
                              >
                                <span>{tech.name}</span>
                                <span className="font-mono text-[10px] text-ink-3 uppercase">{tech.category}</span>
                              </button>
                            );
                          })}
                      </div>
                    )}
                  </div>

                  {/* Add Custom Tech with Version */}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={customTechInput}
                      onChange={(e) => setCustomTechInput(e.target.value)}
                      placeholder={lang === "th" ? "ชื่อเทคโนโลยีเพิ่มเติม..." : "Custom tech name..."}
                      className={`${input} flex-1 sm:max-w-[200px]`}
                    />
                    <input
                      type="text"
                      value={customTechVersion}
                      onChange={(e) => setCustomTechVersion(e.target.value)}
                      placeholder={lang === "th" ? "เวอร์ชัน (ถ้ามี) เช่น 2019" : "Version (e.g. 2019)"}
                      className={`${input} flex-1 sm:max-w-[140px]`}
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomTech}
                      className={`${btn.secondary} text-[12px] h-9 px-3`}
                    >
                      {lang === "th" ? "+ เพิ่มเทคโนโลยีนี้" : "+ Add Custom Tech"}
                    </button>
                  </div>
                </div>

                <DynamicListEditor
                  label={lang === "th" ? "สมรรถนะและความสามารถทางเทคนิคที่ต้องมี" : "Required Technical Capabilities"}
                  items={requiredCapabilities}
                  onChange={setRequiredCapabilities}
                  placeholder={lang === "th" ? "เช่น รองรับการเชื่อมต่อพร้อมกันไม่น้อยกว่า 1,000 คน (Concurrent Users)" : "e.g. Support min 1,000 concurrent users"}
                  addLabel={lang === "th" ? "เพิ่มสมรรถนะเทคนิค" : "Add Capability"}
                  isModified={Boolean(diffsByField["requiredCapabilities"])}
                  onRevert={() => handleRevertField("requiredCapabilities")}
                  lang={lang}
                />

                <KeyValueListEditor
                  label={lang === "th" ? "คุณลักษณะเฉพาะด้านโครงสร้างพื้นฐาน" : "Infrastructure Specifications"}
                  items={infrastructureSpecs}
                  onChange={setInfrastructureSpecs}
                  keyLabel={lang === "th" ? "รายการ / ฮาร์ดแวร์" : "Item / Component"}
                  valueLabel={lang === "th" ? "คุณลักษณะที่กำหนด (Spec)" : "Required Specification"}
                  addLabel={lang === "th" ? "เพิ่มคุณลักษณะอุปกรณ์" : "Add Hardware Spec"}
                  isModified={Boolean(diffsByField["infrastructureSpecifications"])}
                  onRevert={() => handleRevertField("infrastructureSpecifications")}
                  lang={lang}
                />

                <KeyValueListEditor
                  label={lang === "th" ? "ข้อจำกัดและตัวชี้วัดทางเทคนิค" : "Technical Constraints & Metrics"}
                  items={technicalConstraints}
                  onChange={setTechnicalConstraints}
                  keyLabel={lang === "th" ? "ตัวชี้วัด (Metric)" : "Metric"}
                  valueLabel={lang === "th" ? "เกณฑ์ที่กำหนด (Target Value)" : "Target Value"}
                  addLabel={lang === "th" ? "เพิ่มเกณฑ์ทางเทคนิค" : "Add Constraint"}
                  isModified={Boolean(diffsByField["technicalConstraints"])}
                  onRevert={() => handleRevertField("technicalConstraints")}
                  lang={lang}
                />
              </div>
            </Panel>

            {/* SECTION 6: Integration Environment */}
            <Panel id="sec-integration" className="p-5 scroll-mt-[135px]">
              <div className="border-b border-line pb-3">
                <SectionHeading>
                  {lang === "th" ? "6. ระบบเดิมและสภาพแวดล้อมที่ต้องเชื่อมต่อ" : "6. Integration & Existing Environment"}
                </SectionHeading>
                <p className="text-[12px] text-ink-3 mt-1">
                  {lang === "th" ? "ระบบเดิมของหน่วยงาน อินเทอร์เฟซ API การถ่ายโอนข้อมูล และสถานที่ติดตั้ง" : "Existing systems, API integration, data migration, and deployment location"}
                </p>
              </div>

              <div className="mt-4 flex flex-col gap-4">
                <DynamicListEditor
                  label={lang === "th" ? "ระบบเดิมที่ต้องเชื่อมต่อ" : "Existing Systems to Integrate"}
                  items={existingSystems}
                  onChange={setExistingSystems}
                  placeholder={lang === "th" ? "เช่น ระบบทะเบียนราษฎร์ กรมการปกครอง (DOPA)" : "e.g. DOPA Resident Database"}
                  addLabel={lang === "th" ? "เพิ่มระบบเดิม" : "Add Existing System"}
                  isModified={Boolean(diffsByField["existingSystems"])}
                  onRevert={() => handleRevertField("existingSystems")}
                  lang={lang}
                />

                <DynamicListEditor
                  label={lang === "th" ? "อินเทอร์เฟซและบริการ API" : "Interfaces & APIs"}
                  items={interfacesAndApis}
                  onChange={setInterfacesAndApis}
                  placeholder={lang === "th" ? "เช่น RESTful API ด้วย JSON Web Token (JWT)" : "e.g. REST API with JWT Auth"}
                  addLabel={lang === "th" ? "เพิ่ม API Interface" : "Add Interface"}
                  isModified={Boolean(diffsByField["interfacesAndApis"])}
                  onRevert={() => handleRevertField("interfacesAndApis")}
                  lang={lang}
                />

                <div>
                  <FieldHeader
                    label={lang === "th" ? "ข้อมูลและเงื่อนไขการย้ายข้อมูล" : "Data Migration Notes"}
                    fieldKey="dataMigrationNotes"
                    htmlFor="field-migration"
                    diffItem={diffsByField["dataMigrationNotes"]}
                    onRevert={handleRevertField}
                    lang={lang}
                  />
                  <textarea
                    id="field-migration"
                    rows={3}
                    value={dataMigrationNotes}
                    onChange={(e) => setDataMigrationNotes(e.target.value)}
                    placeholder={lang === "th" ? "ระบุรายละเอียดการถ่ายโอนข้อมูลจากฐานข้อมูลเดิม..." : "Specify data migration requirements..."}
                    className={`${textarea} min-h-[85px] ${modInput(Boolean(diffsByField["dataMigrationNotes"]))}`}
                  />
                </div>

                <div>
                  <FieldHeader
                    label={lang === "th" ? "สถานที่และสภาพแวดล้อมการติดตั้ง" : "Deployment Location"}
                    fieldKey="deploymentLocation"
                    htmlFor="field-deploy-loc"
                    diffItem={diffsByField["deploymentLocation"]}
                    onRevert={handleRevertField}
                    lang={lang}
                  />
                  <input
                    id="field-deploy-loc"
                    type="text"
                    value={deploymentLocation}
                    onChange={(e) => setDeploymentLocation(e.target.value)}
                    placeholder={lang === "th" ? "เช่น ศูนย์ข้อมูล กทม. ดินแดง หรือ ระบบคลาวด์กลางภาครัฐ (GDCC)" : "e.g. Government Data Center / GDCC Cloud"}
                    className={`${input} ${modInput(Boolean(diffsByField["deploymentLocation"]))}`}
                  />
                </div>
              </div>
            </Panel>

            {/* SECTION 7: Operational Requirements */}
            <Panel id="sec-ops" className="p-5 scroll-mt-[135px]">
              <div className="border-b border-line pb-3">
                <SectionHeading>
                  {lang === "th" ? "7. การติดตั้งและบำรุงรักษา" : "7. Operations, Training & SLA"}
                </SectionHeading>
                <p className="text-[12px] text-ink-3 mt-1">
                  {lang === "th" ? "เงื่อนไขการติดตั้ง ฝึกอบรม ข้อตกลงระดับบริการ (SLA) และการบำรุงรักษา" : "Installation, training curriculum, SLA, and maintenance scope"}
                </p>
              </div>

              <div className="mt-4 flex flex-col gap-4">
                <DynamicListEditor
                  label={lang === "th" ? "ข้อกำหนดด้านการติดตั้งและปรับแต่ง" : "Installation & Configuration"}
                  items={installationAndConfig}
                  onChange={setInstallationAndConfig}
                  placeholder={lang === "th" ? "เช่น ติดตั้งระบบปฏิบัติการและตั้งค่า Firewall ตามมาตรฐาน CIS Benchmark" : "e.g. Hardening and setup"}
                  addLabel={lang === "th" ? "เพิ่มข้อกำหนดการติดตั้ง" : "Add Installation Requirement"}
                  isModified={Boolean(diffsByField["installationAndConfig"])}
                  onRevert={() => handleRevertField("installationAndConfig")}
                  lang={lang}
                />

                <DynamicListEditor
                  label={lang === "th" ? "การฝึกอบรมบุคลากร" : "Training Curriculum"}
                  items={training}
                  onChange={setTraining}
                  placeholder={lang === "th" ? "เช่น อบรมการใช้งานระบบสำหรับเจ้าหน้าที่ 2 รุ่น รุ่นละ 30 คน" : "e.g. 2 sessions of admin training for 30 staff"}
                  addLabel={lang === "th" ? "เพิ่มหลักสูตรฝึกอบรม" : "Add Training"}
                  isModified={Boolean(diffsByField["training"])}
                  onRevert={() => handleRevertField("training")}
                  lang={lang}
                />

                <div>
                  <FieldHeader
                    label={lang === "th" ? "ข้อตกลงระดับการให้บริการและการสนับสนุนเทคนิค" : "Support & SLA Terms"}
                    fieldKey="technicalSupportAndSla"
                    htmlFor="field-sla"
                    diffItem={diffsByField["technicalSupportAndSla"]}
                    onRevert={handleRevertField}
                    lang={lang}
                  />
                  <textarea
                    id="field-sla"
                    rows={3}
                    value={technicalSupportAndSla}
                    onChange={(e) => setTechnicalSupportAndSla(e.target.value)}
                    placeholder={lang === "th" ? "เช่น ให้บริการแก้ไขเหตุขัดข้องแบบ 24x7 และตอบสนองภายใน 2 ชั่วโมง" : "e.g. 24x7 incident response within 2 hours"}
                    className={`${textarea} min-h-[85px] ${modInput(Boolean(diffsByField["technicalSupportAndSla"]))}`}
                  />
                </div>

                <DynamicListEditor
                  label={lang === "th" ? "การบำรุงรักษาระบบ" : "Maintenance Requirements"}
                  items={maintenance}
                  onChange={setMaintenance}
                  placeholder={lang === "th" ? "เช่น ตรวจสอบสถานะการทำงานเชิงป้องกัน (Preventive Maintenance) ทุก 3 เดือน" : "e.g. Quarterly preventive maintenance"}
                  addLabel={lang === "th" ? "เพิ่มข้อกำหนดบำรุงรักษา" : "Add Maintenance Requirement"}
                  isModified={Boolean(diffsByField["maintenance"])}
                  onRevert={() => handleRevertField("maintenance")}
                  lang={lang}
                />
              </div>
            </Panel>

            {/* SECTION 8: Bid Eligibility & Qualifications */}
            <Panel id="sec-eligibility" className="p-5 scroll-mt-[135px]">
              <div className="border-b border-line pb-3">
                <SectionHeading>
                  {lang === "th" ? "8. คุณสมบัติผู้ยื่นข้อเสนอ" : "8. Bidder Qualifications & Certifications"}
                </SectionHeading>
                <p className="text-[12px] text-ink-3 mt-1">
                  {lang === "th" ? "คุณสมบัตินิติบุคคล หนังสือรับรอง มาตรฐาน ISO/CMMI และผลงานที่ผ่านมา" : "Company requirements, certifications, authorizations, and past experience"}
                </p>
              </div>

              <div className="mt-4 flex flex-col gap-4">
                <DynamicListEditor
                  label={lang === "th" ? "คุณสมบัติบริษัท/นิติบุคคล" : "Company Requirements"}
                  items={companyReqs}
                  onChange={setCompanyReqs}
                  placeholder={lang === "th" ? "เช่น มีทุนจดทะเบียนชำระแล้วไม่น้อยกว่า 5,000,000 บาท" : "e.g. Registered capital not less than 5,000,000 THB"}
                  addLabel={lang === "th" ? "เพิ่มคุณสมบัติบริษัท" : "Add Company Requirement"}
                  confidenceBadge={<FieldConfidenceBadge confidence={getFieldScore("Company")} lang={lang} />}
                  isModified={Boolean(diffsByField["companyRequirements"])}
                  onRevert={() => handleRevertField("companyRequirements")}
                  lang={lang}
                />

                <DynamicListEditor
                  label={lang === "th" ? "มาตรฐานและใบรับรองที่กำหนด" : "Required Certifications"}
                  items={requiredCertifications}
                  onChange={setRequiredCertifications}
                  placeholder={lang === "th" ? "เช่น ได้รับการรับรองมาตรฐาน ISO/IEC 29110 หรือ CMMI Level 3" : "e.g. ISO/IEC 29110 or CMMI Level 3"}
                  addLabel={lang === "th" ? "เพิ่มใบรับรอง/มาตรฐาน" : "Add Certification"}
                  isModified={Boolean(diffsByField["requiredCertifications"])}
                  onRevert={() => handleRevertField("requiredCertifications")}
                  lang={lang}
                />

                <DynamicListEditor
                  label={lang === "th" ? "หนังสือแต่งตั้งตัวแทนจำหน่าย" : "Manufacturer Authorizations (MAF)"}
                  items={manufacturerAuthorizations}
                  onChange={setManufacturerAuthorizations}
                  placeholder={lang === "th" ? "เช่น มีหนังสือแต่งตั้งตัวแทนจำหน่ายอย่างเป็นทางการจากเจ้าของผลิตภัณฑ์" : "e.g. Official Manufacturer Authorization Letter"}
                  addLabel={lang === "th" ? "เพิ่มหนังสือแต่งตั้ง" : "Add Authorization"}
                  isModified={Boolean(diffsByField["manufacturerAuthorizations"])}
                  onRevert={() => handleRevertField("manufacturerAuthorizations")}
                  lang={lang}
                />

                <DynamicListEditor
                  label={lang === "th" ? "คุณสมบัติบุคลากรประจำโครงการ" : "Personnel Qualifications"}
                  items={personnelQualifications}
                  onChange={setPersonnelQualifications}
                  placeholder={lang === "th" ? "เช่น ผู้จัดการโครงการต้องได้รับประกาศนียบัตร PMP และมีประสบการณ์ไม่น้อยกว่า 5 ปี" : "e.g. Project Manager certified PMP with 5+ yrs exp"}
                  addLabel={lang === "th" ? "เพิ่มคุณสมบัติบุคลากร" : "Add Personnel Qualification"}
                  isModified={Boolean(diffsByField["personnelQualifications"])}
                  onRevert={() => handleRevertField("personnelQualifications")}
                  lang={lang}
                />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="sm:col-span-2">
                    <FieldHeader
                      label={lang === "th" ? "ผลงานและประสบการณ์ที่ต้องมี" : "Required Experience"}
                      fieldKey="previousExperience"
                      htmlFor="field-prev-exp"
                      diffItem={diffsByField["previousExperience"]}
                      onRevert={handleRevertField}
                      confidenceBadge={<FieldConfidenceBadge confidence={getFieldScore("Experience")} lang={lang} />}
                      lang={lang}
                    />
                    <textarea
                      id="field-prev-exp"
                      rows={3}
                      value={previousExperience}
                      onChange={(e) => setPreviousExperience(e.target.value)}
                      placeholder={lang === "th" ? "เช่น มีผลงานพัฒนาระบบเทคโนโลยีสารสนเทศที่มีลักษณะคล้ายคลึงกันในสัญญาเดียว..." : "e.g. Prior track record delivering similar government IT systems..."}
                      className={`${textarea} min-h-[90px] ${modInput(Boolean(diffsByField["previousExperience"]))}`}
                    />
                  </div>

                  <div>
                    <FieldHeader
                      label={lang === "th" ? "มูลค่าผลงานขั้นต่ำ (บาท)" : "Min Experience Value (THB)"}
                      fieldKey="previousExperienceMinTHB"
                      htmlFor="field-min-exp"
                      diffItem={diffsByField["previousExperienceMinTHB"]}
                      onRevert={handleRevertField}
                      lang={lang}
                    />
                    <input
                      id="field-min-exp"
                      type="text"
                      value={previousExperienceMinTHB}
                      onChange={(e) => setPreviousExperienceMinTHB(e.target.value)}
                      placeholder="เช่น 5,000,000"
                      className={`${input} ${!minExpCheck.valid ? "border-risk focus:border-risk" : ""} ${modInput(Boolean(diffsByField["previousExperienceMinTHB"]))}`}
                    />
                    {!minExpCheck.valid ? (
                      <p className="mt-1 text-[11px] text-risk">
                        {lang === "th" ? "โปรดระบุเป็นตัวเลขเท่านั้น" : "Must be a valid positive number"}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            </Panel>

            {/* SECTION 9: Contract & Commercial Conditions */}
            <Panel id="sec-contract" className="p-5 scroll-mt-[135px]">
              <div className="border-b border-line pb-3">
                <SectionHeading>
                  {lang === "th" ? "9. เงื่อนไขสัญญาและการชำระเงิน" : "9. Contract Terms & Payment"}
                </SectionHeading>
                <p className="text-[12px] text-ink-3 mt-1">
                  {lang === "th" ? "งวดการจ่ายเงิน เงื่อนไขการตรวจรับ และเกณฑ์การพิจารณาตัดสิน" : "Payment milestone schedule, delivery conditions, and evaluation criteria"}
                </p>
              </div>

              <div className="mt-4 flex flex-col gap-4">
                <div>
                  <FieldHeader
                    label={lang === "th" ? "งวดการจ่ายเงิน" : "Payment Schedule & Terms"}
                    fieldKey="paymentTerms"
                    htmlFor="field-payment"
                    diffItem={diffsByField["paymentTerms"]}
                    onRevert={handleRevertField}
                    confidenceBadge={<FieldConfidenceBadge confidence={getFieldScore("Payment")} lang={lang} />}
                    lang={lang}
                  />
                  <textarea
                    id="field-payment"
                    rows={3}
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                    placeholder={lang === "th" ? "เช่น แบ่งจ่าย 4 งวดตามผลการตรวจรับมอบงาน..." : "e.g. 4 milestone payments upon deliverable acceptance..."}
                    className={`${textarea} min-h-[90px] ${modInput(Boolean(diffsByField["paymentTerms"]))}`}
                  />
                </div>

                <div>
                  <FieldHeader
                    label={lang === "th" ? "เงื่อนไขการตรวจรับมอบงาน" : "Delivery Conditions"}
                    fieldKey="deliveryConditions"
                    htmlFor="field-delivery-cond"
                    diffItem={diffsByField["deliveryConditions"]}
                    onRevert={handleRevertField}
                    lang={lang}
                  />
                  <textarea
                    id="field-delivery-cond"
                    rows={3}
                    value={deliveryConditions}
                    onChange={(e) => setDeliveryConditions(e.target.value)}
                    placeholder={lang === "th" ? "เช่น ตรวจรับภายใน 5 วันทำการหลังส่งมอบครบถ้วน..." : "e.g. Acceptance testing within 5 business days..."}
                    className={`${textarea} min-h-[85px] ${modInput(Boolean(diffsByField["deliveryConditions"]))}`}
                  />
                </div>

                <div>
                  <FieldHeader
                    label={lang === "th" ? "เกณฑ์การพิจารณาคัดเลือก" : "Evaluation Method"}
                    fieldKey="evaluationMethod"
                    htmlFor="field-eval-method"
                    diffItem={diffsByField["evaluationMethod"]}
                    onRevert={handleRevertField}
                    lang={lang}
                  />
                  <input
                    id="field-eval-method"
                    type="text"
                    value={evaluationMethod}
                    onChange={(e) => setEvaluationMethod(e.target.value)}
                    placeholder={lang === "th" ? "เช่น เกณฑ์ราคา หรือ เกณฑ์ประสิทธิภาพต่อราคา (Price-Performance Ratio)" : "e.g. Price Criteria or Price-Performance"}
                    className={`${input} ${modInput(Boolean(diffsByField["evaluationMethod"]))}`}
                  />
                </div>
              </div>
            </Panel>

            {/* SECTION 10: Amendment History & Tracking */}
            <Panel id="sec-amendments" className="p-5 scroll-mt-[135px]">
              <div className="border-b border-line pb-3">
                <SectionHeading>
                  {lang === "th" ? "10. ข้อมูลการแก้ไขประกาศ" : "10. Amendment Information"}
                </SectionHeading>
                <p className="text-[12px] text-ink-3 mt-1">
                  {lang === "th" ? "การเปลี่ยนแปลงหรือแก้ไขข้อกำหนด TOR หลังเผยแพร่ประกาศครั้งแรก (FR-16)" : "Post-publication TOR amendments, changes, and diffs (FR-16)"}
                </p>
              </div>

              <div className="mt-4 flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isAmended}
                      onChange={(e) => setIsAmended(e.target.checked)}
                      className="h-4 w-4 rounded border-line-2 accent-ink"
                    />
                    <span className="text-[13px] font-medium text-ink">
                      {lang === "th" ? "ประกาศนี้มีการแก้ไข TOR" : "This TOR has been amended (isAmended flag)"}
                    </span>
                  </label>
                  {diffsByField["isAmended"] && (
                    <span className="inline-flex items-center gap-1 rounded-[2px] bg-amend-bg border border-amend-line px-1.5 py-0.2 text-[10.5px] font-semibold text-amend">
                      <span>●</span>
                      <span>{lang === "th" ? "แก้ไขแล้ว" : "Modified"}</span>
                      <button
                        type="button"
                        onClick={() => handleRevertField("isAmended")}
                        className="ml-0.5 text-amend hover:underline cursor-pointer"
                        title={lang === "th" ? "คืนค่าเดิม" : "Revert"}
                      >
                        ↺
                      </button>
                    </span>
                  )}
                </div>

                {isAmended ? (
                  <div className="flex flex-col gap-4 rounded-[3px] border border-amend-line bg-amend-bg/15 p-4 animate-in fade-in duration-200">
                    <div>
                      <FieldHeader
                        label={lang === "th" ? "สรุปสาระสำคัญที่มีการแก้ไข" : "Amendment Summary"}
                        fieldKey="amendmentSummary"
                        htmlFor="field-amend-summary"
                        diffItem={diffsByField["amendmentSummary"]}
                        onRevert={handleRevertField}
                        lang={lang}
                      />
                      <textarea
                        id="field-amend-summary"
                        rows={3}
                        value={amendmentSummary}
                        onChange={(e) => setAmendmentSummary(e.target.value)}
                        placeholder={lang === "th" ? "เช่น ขยายเวลารับซองออกไป 7 วัน และปรับลดข้อกำหนดคุณสมบัติ ISO..." : "e.g. Extended submission deadline by 7 days..."}
                        className={`${textarea} min-h-[85px] ${modInput(Boolean(diffsByField["amendmentSummary"]))}`}
                      />
                    </div>

                    <DynamicListEditor
                      label={lang === "th" ? "ส่วนของเอกสารที่มีการแก้ไข" : "Changed Sections"}
                      items={changedSections}
                      onChange={setChangedSections}
                      placeholder={lang === "th" ? "เช่น ข้อ 4.2 ขยายเวลารับซอง" : "e.g. Section 4.2 Extended deadline"}
                      addLabel={lang === "th" ? "เพิ่มส่วนที่แก้ไข" : "Add Section"}
                      isModified={Boolean(diffsByField["changedSections"])}
                      onRevert={() => handleRevertField("changedSections")}
                      lang={lang}
                    />
                  </div>
                ) : null}
              </div>
            </Panel>

            {/* Bottom Actions Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <Link href="/admin?job=review" className={`${btn.secondary} text-[13px]`}>
                {lang === "th" ? "← ยกเลิกและกลับไปคิวตรวจทาน" : "Cancel & Return"}
              </Link>

              <button
                type="submit"
                disabled={isSaving || hasValidationErrors}
                className={`${btn.primary} text-[13px] h-10 px-6 font-semibold`}
              >
                {isSaving
                  ? lang === "th"
                    ? "กำลังบันทึกข้อมูล..."
                    : "Saving Changes..."
                  : lang === "th"
                    ? "บันทึกและอนุมัติข้อมูล"
                    : "Approve & Publish"}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Version History Drawer Modal */}
      <VersionHistoryDrawer
        isOpen={showVersionDrawer}
        onClose={() => setShowVersionDrawer(false)}
        versions={versionsList}
        currentVersion={currentVersion}
        onRollback={handleRollback}
        isRollingBack={isRollingBack}
        lang={lang}
      />

      {/* Evidence Grounding Drawer Modal */}
      <EvidenceGroundingDrawer
        isOpen={showEvidenceDrawer}
        onClose={() => setShowEvidenceDrawer(false)}
        evidence={data.details?.evidence}
        lang={lang}
      />

      {/* Reclassify Modal */}
      {showReclassifyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[1px] p-4">
          <div className="w-full max-w-md rounded-[3px] border border-line bg-surface p-5 shadow-xl animate-in zoom-in-95 duration-150">
            <h3 className="text-[15px] font-semibold text-ink">
              {lang === "th" ? "ยืนยันการจัดประเภทใหม่เป็นงานนอกขอบเขต" : "Reclassify Out of Scope"}
            </h3>
            <p className="mt-1 text-[12.5px] leading-thai text-ink-3">
              {lang === "th"
                ? "โครงการนี้จะถูกทำเครื่องหมายเป็นงานนอกขอบเขต (non-IT) และซ่อนจากหน้าสืบค้นสาธารณะ"
                : "This TOR will be marked as out of scope (non-IT) and hidden from the public catalog."}
            </p>

            <form onSubmit={handleReclassifySubmit} className="mt-4 flex flex-col gap-3">
              <div>
                <Label htmlFor="modal-reclassify-reason">{lang === "th" ? "เหตุผลในการคัดออก" : "Reason"}</Label>
                <input
                  id="modal-reclassify-reason"
                  type="text"
                  required
                  value={reclassifyReason}
                  onChange={(e) => setReclassifyReason(e.target.value)}
                  placeholder={lang === "th" ? "เช่น งานก่อสร้างปรับปรุงอาคาร ไม่ใช่งานไอที" : "e.g. Civil construction work"}
                  className={`${input} mt-1`}
                />
              </div>

              <div className="mt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowReclassifyModal(false)}
                  className={btn.secondary}
                >
                  {lang === "th" ? "ยกเลิก" : "Cancel"}
                </button>
                <button
                  type="submit"
                  disabled={isReclassifying}
                  className="rounded-[3px] border border-risk-line bg-risk px-3.5 h-9 text-[13px] font-medium text-white hover:opacity-85 transition-opacity cursor-pointer disabled:opacity-50"
                >
                  {isReclassifying
                    ? lang === "th"
                      ? "กำลังบันทึก..."
                      : "Saving..."
                    : lang === "th"
                      ? "ยืนยันคัดออก"
                      : "Confirm Reclassify"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PDF Preview Modal */}
      <PdfPreviewModal
        isOpen={showPdfModal}
        onClose={() => setShowPdfModal(false)}
        projectId={projectId}
        title={data?.title || ""}
        agency={data?.agency || ""}
        officialEgpUrl={getEgpAnnouncementUrl(projectId)}
        lang={lang}
      />

      {/* Edit Summary & Confirmation Alert Modal */}
      <EditSummaryConfirmModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={executeApprove}
        diffs={diffs}
        isSaving={isSaving}
        onRevertField={handleRevertField}
        onDiscardAll={handleDiscardAll}
        lang={lang}
      />
    </div>
  );
}
