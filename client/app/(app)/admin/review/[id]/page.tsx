"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  adminGetReviewItem,
  adminReExtract,
  adminUpdateReview,
  getTechnologies,
  type GetReviewItemResult,
  type TechnologyItem,
  type UpdateReviewPayload,
} from "../../../../_lib/api";
import { useLang } from "../../../../_components/prefs";
import { SignInPrompt } from "../../../../_components/sign-in-prompt";
import { btn, EmptyState, input, Label, Panel, SectionHeading } from "../../../../_components/ui";

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

  // Form states
  const [title, setTitle] = useState("");
  const [agency, setAgency] = useState("");
  const [budgetTHB, setBudgetTHB] = useState("");
  const [referencePriceTHB, setReferencePriceTHB] = useState("");
  const [submissionDeadline, setSubmissionDeadline] = useState("");

  const [objective, setObjective] = useState("");
  const [systemArchetype, setSystemArchetype] = useState("");
  const [complexityTier, setComplexityTier] = useState("");

  const [contractDurationDays, setContractDurationDays] = useState("");
  const [warrantyYears, setWarrantyYears] = useState("");
  const [penaltyClause, setPenaltyClause] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");

  const [companyRequirements, setCompanyRequirements] = useState("");
  const [previousExperience, setPreviousExperience] = useState("");
  const [previousExperienceMinTHB, setPreviousExperienceMinTHB] = useState("");

  // Tech stack dynamic selector states
  const [selectedTechs, setSelectedTechs] = useState<string[]>([]);
  const [availableTechs, setAvailableTechs] = useState<TechnologyItem[]>([]);
  const [searchTech, setSearchTech] = useState("");
  const [isTechSearchFocused, setIsTechSearchFocused] = useState(false);

  const refPriceCheck = parseNumberInput(referencePriceTHB);
  const budgetCheck = parseNumberInput(budgetTHB);
  const durationCheck = parseIntegerInput(contractDurationDays);
  const warrantyCheck = parseNumberInput(warrantyYears);
  const minExpCheck = parseNumberInput(previousExperienceMinTHB);

  const hasValidationErrors =
    !refPriceCheck.valid ||
    !budgetCheck.valid ||
    !durationCheck.valid ||
    !warrantyCheck.valid ||
    !minExpCheck.valid;

  // Action status states
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isReExtracting, setIsReExtracting] = useState(false);
  const [reExtractNotice, setReExtractNotice] = useState<string | null>(null);

  const [showReclassifyModal, setShowReclassifyModal] = useState(false);
  const [reclassifyReason, setReclassifyReason] = useState("");
  const [isReclassifying, setIsReclassifying] = useState(false);

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

  const toggleTech = (name: string) => {
    setSelectedTechs((prev) =>
      prev.includes(name) ? prev.filter((t) => t !== name) : [...prev, name]
    );
  };

  const removeTech = (name: string) => {
    setSelectedTechs((prev) => prev.filter((t) => t !== name));
  };

  const addCustomTech = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (!selectedTechs.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
      setSelectedTechs((prev) => [...prev, trimmed]);
    }
  };

  const filteredSuggestions = searchTech.trim()
    ? availableTechs
        .filter((t) =>
          t.name.toLowerCase().includes(searchTech.trim().toLowerCase())
        )
        .slice(0, 15)
    : availableTechs.slice(0, 10);

  const getFieldScore = (fieldName: string, fallback: number = 0.85): number => {
    if (!data?.lowFields?.length) return data?.extraction ?? fallback;
    const match = data.lowFields.find((f) =>
      f.field.toLowerCase().includes(fieldName.toLowerCase())
    );
    return match?.confidence ?? (data?.extraction ?? fallback);
  };

  useEffect(() => {
    let cancelled = false;
    async function loadItem() {
      setLoading(true);
      setErrorMessage(null);

      const res = await adminGetReviewItem(projectId);
      if (cancelled) return;

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

      // Populate form
      setTitle(item.title || "");
      setAgency(item.agency || "");
      setBudgetTHB(item.budgetTHB != null ? String(item.budgetTHB) : "");
      setReferencePriceTHB(item.referencePriceTHB != null ? String(item.referencePriceTHB) : "");
      setSubmissionDeadline(item.submissionDeadline || "");

      setObjective(item.details?.objective || "");
      setSystemArchetype(item.details?.systemArchetype || "");
      setComplexityTier(item.details?.complexityTier || "");

      setContractDurationDays(
        item.details?.contractDurationDays != null
          ? String(item.details?.contractDurationDays)
          : "",
      );
      setWarrantyYears(
        item.details?.warrantyYears != null ? String(item.details?.warrantyYears) : "",
      );
      setPenaltyClause(item.details?.penaltyClause || "");
      setPaymentTerms(item.details?.paymentTerms || "");

      setCompanyRequirements(
        Array.isArray(item.details?.companyRequirements)
          ? item.details.companyRequirements.join("\n")
          : "",
      );
      setPreviousExperience(item.details?.previousExperience || "");
      setPreviousExperienceMinTHB(
        item.details?.previousExperienceMinTHB != null
          ? String(item.details?.previousExperienceMinTHB)
          : "",
      );

      const rawTech = item.details?.requiredTechnologies || "";
      const parsedTechs = rawTech
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      setSelectedTechs(parsedTechs);
      setLoading(false);
    }

    loadItem();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  async function handleSaveAndPublish(e: React.FormEvent) {
    e.preventDefault();

    if (!refPriceCheck.valid) {
      setErrorMessage(
        lang === "th"
          ? "ราคากลาง (Reference Price) ไม่ถูกต้อง: ต้องระบุเป็นตัวเลขเท่านั้น เช่น 1,500,000 หรือ 1500000"
          : "Invalid Reference Price: must be a valid non-negative number",
      );
      return;
    }

    if (!budgetCheck.valid) {
      setErrorMessage(
        lang === "th"
          ? "งบประมาณ (Approved Budget) ไม่ถูกต้อง: ต้องระบุเป็นตัวเลขเท่านั้น เช่น 1,800,000 หรือ 1800000"
          : "Invalid Approved Budget: must be a valid non-negative number",
      );
      return;
    }

    if (!durationCheck.valid) {
      setErrorMessage(
        lang === "th"
          ? "ระยะเวลาสัญญา (Contract Duration) ไม่ถูกต้อง: ต้องระบุเป็นจำนวนวัน (ตัวเลขจำนวนเต็มบวก)"
          : "Invalid Contract Duration: must be positive integer days",
      );
      return;
    }

    if (!warrantyCheck.valid) {
      setErrorMessage(
        lang === "th"
          ? "ระยะเวลารับประกัน (Warranty Period) ไม่ถูกต้อง: ต้องระบุเป็นตัวเลขจำนวนปี"
          : "Invalid Warranty: must be a valid number",
      );
      return;
    }

    if (!minExpCheck.valid) {
      setErrorMessage(
        lang === "th"
          ? "มูลค่าผลงานขั้นต่ำ (Min Experience THB) ไม่ถูกต้อง: ต้องระบุเป็นตัวเลขเท่านั้น"
          : "Invalid Min Experience THB: must be a valid number",
      );
      return;
    }

    setIsSaving(true);
    setSaveSuccess(false);
    setErrorMessage(null);

    const payload: UpdateReviewPayload = {
      action: "approve",
      fields: {
        title: title.trim(),
        agency: agency.trim(),
        budgetTHB: budgetCheck.value,
        referencePriceTHB: refPriceCheck.value,
        submissionDeadline: submissionDeadline || null,
        objective: objective.trim() || null,
        systemArchetype: systemArchetype.trim() || null,
        complexityTier: complexityTier.trim() || null,
        contractDurationDays: durationCheck.value,
        warrantyYears: warrantyCheck.value,
        penaltyClause: penaltyClause.trim() || null,
        paymentTerms: paymentTerms.trim() || null,
        companyRequirements: companyRequirements
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        previousExperience: previousExperience.trim() || null,
        previousExperienceMinTHB: minExpCheck.value,
        requiredTechnologies: selectedTechs.join(", "),
      },
    };

    const res = await adminUpdateReview(projectId, payload);
    setIsSaving(false);

    if (!res.ok) {
      setErrorMessage(res.error?.message || "Failed to save and publish");
      return;
    }

    setSaveSuccess(true);
    setTimeout(() => {
      router.push("/admin?job=review");
    }, 1500);
  }

  async function handleReExtract() {
    setIsReExtracting(true);
    setReExtractNotice(null);

    const res = await adminReExtract(projectId);
    setIsReExtracting(false);

    if (res.ok) {
      setReExtractNotice(
        lang === "th"
          ? "สั่งให้อ่านเอกสารใหม่เรียบร้อยแล้ว กำลังประมวลผลในรอบถัดไป"
          : "Re-extraction queued successfully",
      );
    } else {
      setErrorMessage(res.error?.message || "Failed to trigger re-extraction");
    }
  }

  async function handleReclassify(e: React.FormEvent) {
    e.preventDefault();
    if (!reclassifyReason.trim()) return;

    setIsReclassifying(true);
    setErrorMessage(null);

    const res = await adminUpdateReview(projectId, {
      action: "reclassify",
      reclassifyReason: reclassifyReason.trim(),
    });
    setIsReclassifying(false);

    if (!res.ok) {
      setErrorMessage(res.error?.message || "Failed to reclassify project");
      return;
    }

    setShowReclassifyModal(false);
    router.push("/admin?job=review");
  }

  if (authError) {
    return (
      <div className="mx-auto max-w-[900px] px-4 py-16">
        <SignInPrompt
          next="/admin?job=review"
          headline={lang === "th" ? "ต้องใช้สิทธิ์ผู้ดูแลระบบ" : "Administrator access required"}
          body={
            lang === "th"
              ? "หน้าตรวจสอบและแก้ไขข้อมูล (Review Workspace) จำกัดเฉพาะผู้ดูแลระบบเท่านั้น"
              : "Review Workspace is restricted to team administrators."
          }
          cta={lang === "th" ? "เข้าสู่ระบบ" : "Sign in"}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-[1100px] px-4 py-12">
        <div className="flex items-center gap-3 text-ink-3 text-[14px]">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-line border-t-ink" />
          <span>{lang === "th" ? "กำลังโหลดข้อมูลโครงการ..." : "Loading project for review..."}</span>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-[1100px] px-4 py-12">
        <EmptyState
          headline={lang === "th" ? "ไม่พบเอกสารโครงการนี้" : "Project not found"}
          body={errorMessage || (lang === "th" ? "อาจถูกลบหรือไม่มีอยู่ในระบบ" : "May have been deleted or missing.")}
        />
        <div className="mt-4">
          <Link href="/admin?job=review" className={btn.secondary}>
            ← {lang === "th" ? "กลับหน้ารายการคิวตรวจทาน" : "Back to Review Queue"}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 pb-28">
      {/* Top Breadcrumb & Quick Actions */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-line pb-3">
        <div className="flex items-center gap-2 text-[12px] text-ink-3">
          <Link href="/admin?job=review" className="hover:text-ink hover:underline">
            ← {lang === "th" ? "กลับหน้ารายการคิวตรวจทาน" : "Back to Review Queue"}
          </Link>
          <span>/</span>
          <span className="font-mono text-ink-2">Doc #{projectId}</span>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={`https://process5.gprocurement.go.th/egp-agpc01-web/announcement?keywordSearch=${projectId}`}
            target="_blank"
            rel="noreferrer"
            className={`${btn.secondary} text-[11px] py-1 px-2.5`}
          >
            📄 {lang === "th" ? "เปิดเทียบไฟล์ต้นฉบับ e-GP" : "View e-GP source"} ↗
          </a>
          <a
            href={`/tor/${projectId}`}
            target="_blank"
            rel="noreferrer"
            className={`${btn.secondary} text-[11px] py-1 px-2.5`}
          >
            🌐 {lang === "th" ? "ดูหน้าประกาศบนเว็บ GIPDP" : "View on GIPDP"} ↗
          </a>
          <button
            type="button"
            disabled={isReExtracting}
            onClick={handleReExtract}
            className={`${btn.ghost} text-[11px] py-1 px-2.5`}
          >
            {isReExtracting
              ? lang === "th"
                ? "กำลังสั่ง..."
                : "Queueing..."
              : lang === "th"
              ? "⚡ สั่งให้อ่านใหม่"
              : "Re-run extraction"}
          </button>
        </div>
      </div>

      {/* Header Banner */}
      <Panel className="p-5 mb-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-[2px] border border-line-2 bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-ink">
                {projectId}
              </span>
              <span
                className={`rounded-[2px] px-1.5 py-0.5 text-[11px] font-semibold ${
                  data.reviewStatus === "approved"
                    ? "bg-open-bg text-open border border-open-line"
                    : data.reviewStatus === "rejected"
                    ? "bg-risk-bg text-risk border border-risk-line"
                    : "bg-surface-2 text-ink-2 border border-line-2"
                }`}
              >
                {data.reviewStatus === "approved"
                  ? lang === "th"
                    ? "✓ อนุมัติและเผยแพร่แล้ว"
                    : "Approved"
                  : data.reviewStatus === "rejected"
                  ? lang === "th"
                    ? "✕ ปฏิเสธ (ไม่ใช่ IT)"
                    : "Rejected (Non-IT)"
                  : lang === "th"
                  ? "⏳ รอตรวจทาน (Pending Review)"
                  : "Pending Review"}
              </span>
              {data.misclassified && (
                <span className="rounded-[2px] border border-risk-line bg-risk-bg px-1.5 py-0.5 text-[11px] text-risk font-medium">
                  ⚠️ {lang === "th" ? "อาจจำแนกหมวดหมู่ผิด" : "Suspected Misclassification"}
                </span>
              )}
            </div>

            <h1 className="mt-2 text-[18px] sm:text-[20px] font-semibold text-ink leading-tight">
              {data.title}
            </h1>
            <p className="mt-1 text-[13px] text-ink-2">{data.agency}</p>
          </div>

          <div className="flex items-center gap-4 self-start border-t border-line sm:border-t-0 sm:border-l sm:pl-4 pt-3 sm:pt-0">
            <div className="text-right">
              <span className="text-[10px] uppercase tracking-wider text-ink-3 block">
                {lang === "th" ? "ความมั่นใจการสกัด" : "Extraction Confidence"}
              </span>
              <span
                className={`inline-block mt-0.5 rounded-[2px] px-2 py-0.5 text-[13px] font-mono font-semibold ${confidenceTone(
                  data.extraction,
                )}`}
              >
                {Math.round(data.extraction * 100)}%
              </span>
            </div>

            {data.ocr != null && (
              <div className="text-right">
                <span className="text-[10px] uppercase tracking-wider text-ink-3 block">
                  {lang === "th" ? "คะแนน OCR" : "OCR Score"}
                </span>
                <span className="inline-block mt-0.5 font-mono text-[13px] font-semibold text-ink">
                  {Math.round(data.ocr * 100)}%
                </span>
              </div>
            )}
          </div>
        </div>

        {reExtractNotice && (
          <div className="mt-4 rounded-[2px] border border-open-line bg-open-bg p-2.5 text-[12px] text-open">
            ✓ {reExtractNotice}
          </div>
        )}

        {errorMessage && (
          <div className="mt-4 rounded-[2px] border border-risk-line bg-risk-bg p-2.5 text-[12px] text-risk">
            ⚠️ {errorMessage}
          </div>
        )}

        {saveSuccess && (
          <div className="mt-4 rounded-[2px] border border-open-line bg-open-bg p-2.5 text-[12px] text-open font-medium">
            ✓ {lang === "th" ? "บันทึกและเผยแพร่ข้อมูลสำเร็จ! กำลังกลับหน้ารายการ..." : "Successfully saved and published! Returning..."}
          </div>
        )}
      </Panel>

      {/* Main Form */}
      <form onSubmit={handleSaveAndPublish} className="flex flex-col gap-6 pb-28">
        {/* Section 1: Core Info & Budget */}
        <Panel className="p-5">
          <SectionHeading
            sub={
              lang === "th"
                ? "ข้อมูลโครงการพื้นฐานที่ใช้ในการแสดงผลและจัดทำดัชนีสืบค้น"
                : "Essential procurement facts for indexing and public display"
            }
          >
            {lang === "th" ? "1. ข้อมูลโครงการและงบประมาณ (Core Details & Budget)" : "1. Core Details & Budget"}
          </SectionHeading>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <div className="mb-1 flex items-center justify-between">
                <Label htmlFor="field-title">{lang === "th" ? "ชื่อโครงการ (Project Title)" : "Project Title"} *</Label>
                <FieldConfidenceBadge confidence={getFieldScore("Title")} lang={lang} />
              </div>
              <input
                id="field-title"
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={input}
              />
            </div>

            <div className="sm:col-span-2">
              <div className="mb-1 flex items-center justify-between">
                <Label htmlFor="field-agency">{lang === "th" ? "หน่วยงานเจ้าของโครงการ (Agency Name)" : "Agency Name"} *</Label>
                <FieldConfidenceBadge confidence={getFieldScore("Agency")} lang={lang} />
              </div>
              <input
                id="field-agency"
                type="text"
                required
                value={agency}
                onChange={(e) => setAgency(e.target.value)}
                className={input}
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <Label htmlFor="field-ref-price">{lang === "th" ? "ราคากลาง (Reference Price THB)" : "Reference Price (THB)"}</Label>
                <FieldConfidenceBadge confidence={getFieldScore("Reference Price")} lang={lang} />
              </div>
              <input
                id="field-ref-price"
                type="text"
                value={referencePriceTHB}
                onChange={(e) => setReferencePriceTHB(e.target.value)}
                placeholder="เช่น 1,500,000"
                className={`${input} ${!refPriceCheck.valid ? "!border-risk text-risk" : ""}`}
              />
              {!refPriceCheck.valid && (
                <p className="mt-1 text-[11px] font-medium text-risk">
                  {lang === "th"
                    ? "⚠️ ข้อมูลไม่ถูกต้อง: ต้องเป็นตัวเลขเท่านั้น (เช่น 1,500,000 หรือ 1500000)"
                    : "⚠️ Invalid format: numbers only (e.g. 1,500,000)"}
                </p>
              )}
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <Label htmlFor="field-budget">{lang === "th" ? "งบประมาณ (Approved Budget THB)" : "Budget (THB)"}</Label>
                <FieldConfidenceBadge confidence={getFieldScore("Budget")} lang={lang} />
              </div>
              <input
                id="field-budget"
                type="text"
                value={budgetTHB}
                onChange={(e) => setBudgetTHB(e.target.value)}
                placeholder="เช่น 1,800,000"
                className={`${input} ${!budgetCheck.valid ? "!border-risk text-risk" : ""}`}
              />
              {!budgetCheck.valid && (
                <p className="mt-1 text-[11px] font-medium text-risk">
                  {lang === "th"
                    ? "⚠️ ข้อมูลไม่ถูกต้อง: ต้องเป็นตัวเลขเท่านั้น (เช่น 1,800,000 หรือ 1800000)"
                    : "⚠️ Invalid format: numbers only (e.g. 1,800,000)"}
                </p>
              )}
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <Label htmlFor="field-deadline">{lang === "th" ? "กำหนดวันยื่นข้อเสนอ (Submission Deadline)" : "Submission Deadline"}</Label>
                <FieldConfidenceBadge confidence={getFieldScore("Deadline", 0.75)} lang={lang} />
              </div>
              <input
                id="field-deadline"
                type="date"
                value={submissionDeadline}
                onChange={(e) => setSubmissionDeadline(e.target.value)}
                className={input}
              />
            </div>
          </div>
        </Panel>

        {/* Section 2: Scope & System Architecture */}
        <Panel className="p-5">
          <SectionHeading
            sub={
              lang === "th"
                ? "วัตถุประสงค์ ประเภทสถาปัตยกรรม และระดับความซับซ้อนของระบบ"
                : "Objective, system archetype, and structural tier"
            }
          >
            {lang === "th" ? "2. ขอบเขตงานและสถาปัตยกรรม (Scope & System Architecture)" : "2. Scope & Architecture"}
          </SectionHeading>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <div className="mb-1 flex items-center justify-between">
                <Label htmlFor="field-objective">{lang === "th" ? "วัตถุประสงค์โครงการ (Project Objective)" : "Objective"}</Label>
                <FieldConfidenceBadge confidence={getFieldScore("Objective")} lang={lang} />
              </div>
              <textarea
                id="field-objective"
                rows={3}
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                placeholder={lang === "th" ? "สรุปเป้าหมายหลักและขอบเขตงาน..." : "Brief project objective..."}
                className={input}
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <Label htmlFor="field-archetype">{lang === "th" ? "หมวดหมู่สถาปัตยกรรมระบบ (System Archetype)" : "System Archetype"}</Label>
                <FieldConfidenceBadge confidence={getFieldScore("Archetype")} lang={lang} />
              </div>
              <input
                id="field-archetype"
                type="text"
                value={systemArchetype}
                onChange={(e) => setSystemArchetype(e.target.value)}
                placeholder="เช่น Web Application, Data Warehouse, Infrastructure"
                className={input}
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <Label htmlFor="field-tier">{lang === "th" ? "ระดับความซับซ้อน (Complexity Tier)" : "Complexity Tier"}</Label>
                <FieldConfidenceBadge confidence={getFieldScore("Tier")} lang={lang} />
              </div>
              <input
                id="field-tier"
                type="text"
                value={complexityTier}
                onChange={(e) => setComplexityTier(e.target.value)}
                placeholder="เช่น Low, Medium, High, Enterprise Tier 2"
                className={input}
              />
            </div>
          </div>
        </Panel>

        {/* Section 3: Contract & Commercial Conditions */}
        <Panel className="p-5">
          <SectionHeading
            sub={
              lang === "th"
                ? "ระยะเวลาส่งมอบ รับประกัน อัตราค่าปรับ และเงื่อนไขการจ่ายเงิน"
                : "Duration, warranty, penalty clauses, and milestones"
            }
          >
            {lang === "th" ? "3. เงื่อนไขสัญญาและพาณิชย์ (Contract & Commercial Conditions)" : "3. Contract & Commercial"}
          </SectionHeading>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-1 flex items-center justify-between">
                <Label htmlFor="field-duration">{lang === "th" ? "ระยะเวลาสัญญา (วัน / Contract Duration Days)" : "Contract Duration (Days)"}</Label>
                <FieldConfidenceBadge confidence={getFieldScore("Duration", 0.80)} lang={lang} />
              </div>
              <input
                id="field-duration"
                type="text"
                value={contractDurationDays}
                onChange={(e) => setContractDurationDays(e.target.value)}
                placeholder="เช่น 180"
                className={`${input} ${!durationCheck.valid ? "!border-risk text-risk" : ""}`}
              />
              {!durationCheck.valid && (
                <p className="mt-1 text-[11px] font-medium text-risk">
                  {lang === "th"
                    ? "⚠️ ต้องระบุเป็นจำนวนวัน (ตัวเลขจำนวนเต็มบวก)"
                    : "⚠️ Must be positive integer days"}
                </p>
              )}
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <Label htmlFor="field-warranty">{lang === "th" ? "ระยะเวลารับประกัน (ปี / Warranty Years)" : "Warranty (Years)"}</Label>
                <FieldConfidenceBadge confidence={getFieldScore("Warranty", 0.80)} lang={lang} />
              </div>
              <input
                id="field-warranty"
                type="text"
                value={warrantyYears}
                onChange={(e) => setWarrantyYears(e.target.value)}
                placeholder="เช่น 1 หรือ 2"
                className={`${input} ${!warrantyCheck.valid ? "!border-risk text-risk" : ""}`}
              />
              {!warrantyCheck.valid && (
                <p className="mt-1 text-[11px] font-medium text-risk">
                  {lang === "th"
                    ? "⚠️ ต้องระบุเป็นตัวเลขจำนวนปี"
                    : "⚠️ Must be a valid number of years"}
                </p>
              )}
            </div>

            <div className="sm:col-span-2">
              <div className="mb-1 flex items-center justify-between">
                <Label htmlFor="field-penalty">{lang === "th" ? "เงื่อนไขค่าปรับ (Penalty Clause)" : "Penalty Clause"}</Label>
                <FieldConfidenceBadge confidence={getFieldScore("Penalty", 0.80)} lang={lang} />
              </div>
              <input
                id="field-penalty"
                type="text"
                value={penaltyClause}
                onChange={(e) => setPenaltyClause(e.target.value)}
                placeholder="เช่น ร้อยละ 0.20 ต่อวันของมูลค่าสัญญา"
                className={input}
              />
            </div>

            <div className="sm:col-span-2">
              <div className="mb-1 flex items-center justify-between">
                <Label htmlFor="field-payment">{lang === "th" ? "เงื่อนไขและงวดการจ่ายเงิน (Payment Terms)" : "Payment Terms"}</Label>
                <FieldConfidenceBadge confidence={getFieldScore("Payment")} lang={lang} />
              </div>
              <textarea
                id="field-payment"
                rows={2}
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                placeholder="เช่น แบ่งจ่าย 4 งวดตามผลงาน..."
                className={input}
              />
            </div>
          </div>
        </Panel>

        {/* Section 4: Vendor Eligibility */}
        <Panel className="p-5">
          <SectionHeading
            sub={
              lang === "th"
                ? "เกณฑ์คุณสมบัตินิติบุคคล ผลงาน และมูลค่าผลงานขั้นต่ำที่กำหนดใน TOR"
                : "Legal qualifications, experience, and required baseline revenue"
            }
          >
            {lang === "th" ? "4. คุณสมบัติผู้ยื่นข้อเสนอ (Vendor Eligibility Criteria)" : "4. Vendor Eligibility"}
          </SectionHeading>

          <div className="mt-4 flex flex-col gap-4">
            <div>
              <div className="mb-1 flex items-center justify-between">
                <Label htmlFor="field-comp-req">
                  {lang === "th" ? "คุณสมบัติบริษัท (Company Requirements - บรรทัดละ 1 ข้อ)" : "Company Requirements (One per line)"}
                </Label>
                <FieldConfidenceBadge confidence={getFieldScore("Company")} lang={lang} />
              </div>
              <textarea
                id="field-comp-req"
                rows={4}
                value={companyRequirements}
                onChange={(e) => setCompanyRequirements(e.target.value)}
                placeholder={"- นิติบุคคลจดทะเบียนในประเทศไทย\n- ทุนจดทะเบียนไม่น้อยกว่า 5,000,000 บาท\n- มีมาตรฐาน ISO/IEC 29110"}
                className={input}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <div className="mb-1 flex items-center justify-between">
                  <Label htmlFor="field-prev-exp">{lang === "th" ? "ผลงานและประสบการณ์ที่ต้องมี (Previous Experience)" : "Required Experience"}</Label>
                  <FieldConfidenceBadge confidence={getFieldScore("Experience")} lang={lang} />
                </div>
                <input
                  id="field-prev-exp"
                  type="text"
                  value={previousExperience}
                  onChange={(e) => setPreviousExperience(e.target.value)}
                  placeholder="เช่น มีผลงานพัฒนาระบบคลาวด์ภาครัฐ..."
                  className={input}
                />
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <Label htmlFor="field-min-exp">{lang === "th" ? "มูลค่าผลงานขั้นต่ำ (THB)" : "Min Experience Value (THB)"}</Label>
                  <FieldConfidenceBadge confidence={getFieldScore("MinExp")} lang={lang} />
                </div>
                <input
                  id="field-min-exp"
                  type="text"
                  value={previousExperienceMinTHB}
                  onChange={(e) => setPreviousExperienceMinTHB(e.target.value)}
                  placeholder="เช่น 2,500,000"
                  className={`${input} ${!minExpCheck.valid ? "!border-risk text-risk" : ""}`}
                />
                {!minExpCheck.valid && (
                  <p className="mt-1 text-[11px] font-medium text-risk">
                    {lang === "th"
                      ? "⚠️ ข้อมูลไม่ถูกต้อง: ต้องเป็นตัวเลขเท่านั้น"
                      : "⚠️ Invalid format: numbers only"}
                  </p>
                )}
              </div>
            </div>
          </div>
        </Panel>

        {/* Section 5: Technical Stack */}
        <Panel className="p-5">
          <SectionHeading
            sub={
              lang === "th"
                ? "เลือก ค้นหา หรือเพิ่มเทคโนโลยี สแต็ก ภาษา ฐานข้อมูล และเครื่องมือที่กำหนดใน TOR"
                : "Select, search, or add technologies, frameworks, and databases required in the TOR"
            }
          >
            {lang === "th" ? "5. สเปกเทคโนโลยีและเครื่องมือ (Required Technologies)" : "5. Required Tech Stack"}
          </SectionHeading>

          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between">
              <Label htmlFor="tech-search-input">
                {lang === "th" ? "เทคโนโลยีที่กำหนด (Required Technologies)" : "Required Technologies"}
              </Label>
              <FieldConfidenceBadge confidence={getFieldScore("Technologies")} lang={lang} />
            </div>

            {/* Selected tech chips */}
            {selectedTechs.length > 0 ? (
              <div className="mb-3.5 rounded-[4px] border border-line bg-surface-2/40 p-3 shadow-[inset_0_1px_1px_rgba(0,0,0,0.02)]">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-ink">
                    {lang === "th"
                      ? `เทคโนโลยีที่ระบุแล้ว (${selectedTechs.length})`
                      : `Selected Technologies (${selectedTechs.length})`}
                  </span>
                  <span className="text-[11px] text-ink-3">
                    {lang === "th" ? "คลิก ✕ เพื่อนำออก" : "Click ✕ to remove"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedTechs.map((tech) => (
                    <span
                      key={tech}
                      className="group inline-flex items-center gap-1.5 rounded-[3px] border border-ink/80 bg-ink px-2.5 py-1 font-mono text-[11px] font-medium text-surface transition-colors"
                    >
                      <span>{tech}</span>
                      <button
                        type="button"
                        onClick={() => removeTech(tech)}
                        title={lang === "th" ? `ลบ ${tech}` : `Remove ${tech}`}
                        className="cursor-pointer text-[11px] opacity-70 hover:opacity-100 hover:text-red-400"
                        aria-label={`Remove ${tech}`}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <p className="mb-3 text-[12px] text-ink-3 italic">
                {lang === "th"
                  ? "ยังไม่ได้ระบุเทคโนโลยี (สามารถค้นหาเพื่อเลือก หรือพิมพ์เพิ่มด้านล่าง)"
                  : "No technologies specified yet (search or type to add below)"}
              </p>
            )}

            {/* Search and Autocomplete Input */}
            <div className="relative max-w-lg">
              <div className="relative flex items-center">
                <span className="pointer-events-none absolute left-3 text-ink-3">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </span>
                <input
                  id="tech-search-input"
                  type="text"
                  value={searchTech}
                  onChange={(e) => setSearchTech(e.target.value)}
                  onFocus={() => setIsTechSearchFocused(true)}
                  onBlur={() => setTimeout(() => setIsTechSearchFocused(false), 220)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (filteredSuggestions.length > 0) {
                        toggleTech(filteredSuggestions[0].name);
                        setSearchTech("");
                      } else if (searchTech.trim()) {
                        addCustomTech(searchTech.trim());
                        setSearchTech("");
                      }
                    } else if (e.key === "Escape") {
                      setIsTechSearchFocused(false);
                    }
                  }}
                  placeholder={
                    lang === "th"
                      ? "ค้นหาเทคโนโลยี (เช่น Docker, PostgreSQL, React, Windows)... หรือพิมพ์แล้วกด Enter"
                      : "Search technologies (e.g. Docker, PostgreSQL, React)... or type and press Enter"
                  }
                  className={`${input} pl-8.5 pr-8 text-[12px]`}
                />
                {searchTech && (
                  <button
                    type="button"
                    onClick={() => setSearchTech("")}
                    className="absolute right-2.5 text-[14px] text-ink-3 hover:text-ink cursor-pointer"
                    aria-label="Clear"
                  >
                    &times;
                  </button>
                )}
              </div>

              {/* Suggestions dropdown */}
              {isTechSearchFocused && (
                <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-60 overflow-y-auto rounded-[3px] border border-line bg-surface shadow-xl">
                  {filteredSuggestions.length > 0 ? (
                    <ul className="py-1">
                      {filteredSuggestions.map((item) => {
                        const isSelected = selectedTechs.includes(item.name);
                        return (
                          <li key={item.name}>
                            <button
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                toggleTech(item.name);
                                setSearchTech("");
                              }}
                              className="flex w-full items-center justify-between px-3 py-1.5 text-left text-[12px] font-mono hover:bg-surface-2 transition-colors cursor-pointer"
                            >
                              <span className="flex items-center gap-2">
                                <span className={isSelected ? "font-semibold text-ink" : "text-ink-2"}>
                                  {item.name}
                                </span>
                                {item.category && (
                                  <span className="rounded bg-surface-3 px-1.5 py-0.2 text-[10px] text-ink-3">
                                    {item.category}
                                  </span>
                                )}
                              </span>
                              <span
                                className={`text-[11px] ${
                                  isSelected ? "font-bold text-open" : "text-ink-3"
                                }`}
                              >
                                {isSelected
                                  ? lang === "th"
                                    ? "✓ เลือกแล้ว"
                                    : "✓ Selected"
                                  : lang === "th"
                                  ? "+ เพิ่ม"
                                  : "+ Add"}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : searchTech.trim() ? (
                    <div className="p-3">
                      <p className="text-[12px] text-ink-3 mb-2">
                        {lang === "th"
                          ? `ไม่พบ "${searchTech.trim()}" ในฐานข้อมูลระบบ`
                          : `"${searchTech.trim()}" not found in database vocabulary`}
                      </p>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          addCustomTech(searchTech.trim());
                          setSearchTech("");
                        }}
                        className="flex w-full items-center justify-between rounded-[2px] bg-surface-2 px-2.5 py-1.5 text-left text-[12px] text-ink transition-colors hover:bg-surface-3 cursor-pointer"
                      >
                        <span className="font-mono text-ink">
                          + {lang === "th" ? `เพิ่ม "${searchTech.trim()}"` : `Add "${searchTech.trim()}"`}
                        </span>
                        <span className="text-[10px] text-ink-3">
                          {lang === "th" ? "กำหนดเป็นเทคโนโลยีใหม่" : "New tech entry"}
                        </span>
                      </button>
                    </div>
                  ) : null}

                  {searchTech.trim() &&
                    filteredSuggestions.length > 0 &&
                    !filteredSuggestions.some(
                      (s) => s.name.toLowerCase() === searchTech.trim().toLowerCase()
                    ) && (
                      <div className="border-t border-line/60 p-2">
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            addCustomTech(searchTech.trim());
                            setSearchTech("");
                          }}
                          className="flex w-full items-center justify-between rounded-[2px] bg-surface-2 px-2.5 py-1 text-left text-[11px] text-ink transition-colors hover:bg-surface-3 cursor-pointer"
                        >
                          <span className="font-mono text-ink">
                            + {lang === "th" ? `เพิ่ม "${searchTech.trim()}" (กำหนดเอง)` : `Add "${searchTech.trim()}" (custom)`}
                          </span>
                        </button>
                      </div>
                    )}
                </div>
              )}
            </div>

            {/* Common quick tags */}
            <div className="mt-3">
              <span className="text-[11px] text-ink-3 block mb-1.5">
                {lang === "th" ? "เทคโนโลยีที่พบบ่อย (คลิกเพื่อเลือกทันที):" : "Frequently used technologies:"}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {[
                  "Node.js",
                  "Python",
                  "Java",
                  "Go",
                  "React",
                  "Vue.js",
                  "PostgreSQL",
                  "MySQL",
                  "Oracle",
                  "Docker",
                  "Kubernetes",
                  "NGINX Plus",
                  "Redis",
                  "Linux",
                  "Windows Server",
                ].map((name) => {
                  const on = selectedTechs.includes(name);
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => toggleTech(name)}
                      className={`cursor-pointer rounded-[2px] border px-2 py-0.5 text-[11px] font-mono transition-colors ${
                        on
                          ? "border-open-line bg-open-bg text-open font-semibold"
                          : "border-line bg-surface-2 text-ink-2 hover:border-line-2 hover:text-ink"
                      }`}
                    >
                      {on ? "✓ " : "+ "}
                      {name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </Panel>

        {/* Sticky Action Footer */}
        <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-line bg-surface/95 backdrop-blur-sm p-4 shadow-lg">
          <div className="mx-auto flex max-w-[1100px] items-center justify-between gap-4">
            <div>
              <button
                type="button"
                onClick={() => setShowReclassifyModal(true)}
                className="text-[12px] font-medium text-risk hover:underline"
              >
                ✕ {lang === "th" ? "ระบุว่าไม่ใช่ IT (Reclassify Non-IT)" : "Reclassify as Non-IT"}
              </button>
            </div>

            <div className="flex items-center gap-3">
              <Link href="/admin?job=review" className={btn.secondary}>
                {lang === "th" ? "ยกเลิก / กลับ" : "Cancel"}
              </Link>

              <button
                type="submit"
                disabled={isSaving || hasValidationErrors}
                className={`${btn.primary} min-w-[160px]`}
              >
                {isSaving
                  ? lang === "th"
                    ? "กำลังบันทึก..."
                    : "Saving..."
                  : saveSuccess
                  ? lang === "th"
                    ? "✓ เผยแพร่แล้ว"
                    : "✓ Published"
                  : lang === "th"
                  ? "💾 บันทึกและเผยแพร่"
                  : "Save & Publish"}
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Reclassify Modal */}
      {showReclassifyModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        >
          <div className="w-full max-w-[480px] rounded-[4px] border border-line bg-surface p-5 shadow-2xl">
            <h3 className="text-[15px] font-semibold text-risk">
              {lang === "th" ? "ยืนยันการระบุว่าไม่ใช่ IT" : "Confirm Reclassification as Non-IT"}
            </h3>
            <p className="mt-1.5 text-[12px] leading-thai text-ink-3">
              {lang === "th"
                ? "โครงการนี้จะถูกทำเครื่องหมายเป็นงานนอกขอบเขต (Excluded) และไม่แสดงบนหน้าค้นหาสาธารณะ"
                : "This document will be marked as out of scope and hidden from public catalog."}
            </p>

            <form onSubmit={handleReclassify} className="mt-4">
              <Label htmlFor="reclassify-reason">
                {lang === "th" ? "ระบุเหตุผล (Reason)" : "Reason"} *
              </Label>
              <input
                id="reclassify-reason"
                type="text"
                required
                autoFocus
                value={reclassifyReason}
                onChange={(e) => setReclassifyReason(e.target.value)}
                placeholder="เช่น งานก่อสร้างปรับปรุงอาคาร, งานจัดสวน ไม่เกี่ยวกับซอฟต์แวร์"
                className={input}
              />

              <div className="mt-5 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  disabled={isReclassifying}
                  onClick={() => setShowReclassifyModal(false)}
                  className={btn.ghost}
                >
                  {lang === "th" ? "ยกเลิก" : "Cancel"}
                </button>
                <button
                  type="submit"
                  disabled={isReclassifying || !reclassifyReason.trim()}
                  className="rounded-[2px] bg-risk px-3.5 py-1.5 text-[12px] font-medium text-white hover:bg-risk/90 disabled:opacity-50"
                >
                  {isReclassifying
                    ? lang === "th"
                      ? "กำลังบันทึก..."
                      : "Processing..."
                    : lang === "th"
                    ? "ยืนยันนำออก"
                    : "Confirm Exclude"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
