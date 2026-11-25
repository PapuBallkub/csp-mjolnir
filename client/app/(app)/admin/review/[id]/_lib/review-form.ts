import type { GetReviewItemResult, UpdateReviewPayload } from "../../../../../_lib/api";
import { getBangkokDateParts } from "../../../../../_lib/format.ts";
import type { EditDiffItem } from "../ReviewEditorComponents";

export type ReviewItemData = GetReviewItemResult["item"];

export type KeyValueEntry = {
  key: string;
  value: string;
};

export interface ReviewFormState {
  // 1. Identification
  title: string;
  titleEn: string;
  agency: string;
  department: string;
  categories: string[];
  status: string;

  // 2. Key Facts
  budgetTHB: string;
  referencePriceTHB: string;
  submissionDeadline: string;
  commentDeadline: string;
  deliveryPeriodDays: string;
  procurementMethod: string;
  contractDurationDays: string;
  warrantyYears: string;
  penaltyClause: string;
  postedDate: string;

  // 3. Project Overview
  objective: string;
  systemArchetype: string;
  complexityTier: string;
  highLevelScope: string;
  majorComponents: string[];

  // 4. Contractor Deliverables
  deliverablesSystem: string[];
  deliverablesImplementation: string[];
  deliverablesValidation: string[];
  deliverablesSupportingWork: string[];

  // 5. Technical Requirements
  selectedTechs: string[];
  techVersions: Record<string, string>;
  requiredCapabilities: string[];
  infrastructureSpecs: KeyValueEntry[];
  technicalConstraints: KeyValueEntry[];

  // 6. Integration Environment
  existingSystems: string[];
  interfacesAndApis: string[];
  dataMigrationNotes: string;
  deploymentLocation: string;

  // 7. Operational Requirements
  installationAndConfig: string[];
  training: string[];
  technicalSupportAndSla: string;
  maintenance: string[];

  // 8. Bid Eligibility
  companyReqs: string[];
  requiredCertifications: string[];
  manufacturerAuthorizations: string[];
  personnelQualifications: string[];
  previousExperience: string;
  previousExperienceMinTHB: string;

  // 9. Contract Conditions
  paymentTerms: string;
  deliveryConditions: string;
  evaluationMethod: string;

  // 10. Amendment Info
  isAmended: boolean;
  amendmentSummary: string;
  changedSections: string[];
}

export const SECTIONS_LIST = [
  { id: "sec-identification", section: "1. Identification", label: "1. ข้อมูลทั่วไปและการจัดประเภท" },
  { id: "sec-keyfacts", section: "2. Key Facts", label: "2. ข้อมูลสำคัญและราคา" },
  { id: "sec-overview", section: "3. Overview", label: "3. ภาพรวมและขอบเขต" },
  { id: "sec-deliverables", section: "4. Deliverables", label: "4. ขอบเขตงานส่งมอบ" },
  { id: "sec-tech", section: "5. Tech Stack", label: "5. ข้อกำหนดเทคโนโลยี" },
  { id: "sec-integration", section: "6. Integration", label: "6. ระบบเดิมและสภาพแวดล้อม" },
  { id: "sec-ops", section: "7. Operations", label: "7. การติดตั้งและบำรุงรักษา" },
  { id: "sec-eligibility", section: "8. Eligibility", label: "8. คุณสมบัติผู้ยื่นข้อเสนอ" },
  { id: "sec-contract", section: "9. Contract", label: "9. เงื่อนไขสัญญา" },
  { id: "sec-amendments", section: "10. Amendments", label: "10. ประวัติการแก้ไข" },
] as const;

export type NumericParseResult = {
  valid: boolean;
  value: number | null;
};

export function parseNumberInput(val: string): NumericParseResult {
  const trimmed = val.replace(/,/g, "").trim();
  if (!trimmed) return { valid: true, value: null };
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return { valid: false, value: null };
  const num = Number(trimmed);
  if (!Number.isFinite(num) || num < 0) return { valid: false, value: null };
  return { valid: true, value: num };
}

export function parseIntegerInput(val: string): NumericParseResult {
  const trimmed = val.replace(/,/g, "").trim();
  if (!trimmed) return { valid: true, value: null };
  if (!/^\d+$/.test(trimmed)) return { valid: false, value: null };
  const num = Number(trimmed);
  if (!Number.isSafeInteger(num) || num < 0) return { valid: false, value: null };
  return { valid: true, value: num };
}

export function toDateInputValue(val: string | null | undefined): string {
  if (!val) return "";
  const parts = getBangkokDateParts(val);
  if (parts) {
    return `${parts.year}-${String(parts.month + 1).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
  }
  return val.slice(0, 10);
}

export function createEmptyReviewFormState(): ReviewFormState {
  return {
    title: "",
    titleEn: "",
    agency: "",
    department: "",
    categories: [],
    status: "Open",
    budgetTHB: "",
    referencePriceTHB: "",
    submissionDeadline: "",
    commentDeadline: "",
    deliveryPeriodDays: "",
    procurementMethod: "",
    contractDurationDays: "",
    warrantyYears: "",
    penaltyClause: "",
    postedDate: "",
    objective: "",
    systemArchetype: "",
    complexityTier: "",
    highLevelScope: "",
    majorComponents: [],
    deliverablesSystem: [],
    deliverablesImplementation: [],
    deliverablesValidation: [],
    deliverablesSupportingWork: [],
    selectedTechs: [],
    techVersions: {},
    requiredCapabilities: [],
    infrastructureSpecs: [],
    technicalConstraints: [],
    existingSystems: [],
    interfacesAndApis: [],
    dataMigrationNotes: "",
    deploymentLocation: "",
    installationAndConfig: [],
    training: [],
    technicalSupportAndSla: "",
    maintenance: [],
    companyReqs: [],
    requiredCertifications: [],
    manufacturerAuthorizations: [],
    personnelQualifications: [],
    previousExperience: "",
    previousExperienceMinTHB: "",
    paymentTerms: "",
    deliveryConditions: "",
    evaluationMethod: "",
    isAmended: false,
    amendmentSummary: "",
    changedSections: [],
  };
}

export function itemToReviewFormState(item: ReviewItemData): ReviewFormState {
  const det = item.details || {};

  const techVersions: Record<string, string> = {};
  const selectedTechs: string[] = [];
  if (det.technologiesList && Array.isArray(det.technologiesList)) {
    det.technologiesList.forEach((t) => {
      if (t?.name) {
        selectedTechs.push(t.name);
        if (t.version) techVersions[t.name] = t.version;
      }
    });
  } else if (det.requiredTechnologies) {
    det.requiredTechnologies
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((t) => selectedTechs.push(t));
  }

  let companyReqs: string[] = [];
  if (Array.isArray(det.companyRequirements)) {
    companyReqs = [...det.companyRequirements];
  } else if (det.companyRequirements) {
    companyReqs = String(det.companyRequirements)
      .split("\n")
      .map((s) => s.trim().replace(/^[-*•\d.]+\s*/, ""))
      .filter(Boolean);
  }

  return {
    title: item.title || "",
    titleEn: det.titleEn || "",
    agency: item.agency || "",
    department: det.department || "",
    categories: [...(det.categories ?? [])],
    status: det.status || "Open",
    budgetTHB: item.budgetTHB != null ? String(item.budgetTHB) : "",
    referencePriceTHB: item.referencePriceTHB != null ? String(item.referencePriceTHB) : "",
    submissionDeadline: toDateInputValue(item.submissionDeadline),
    commentDeadline: toDateInputValue(det.commentDeadline),
    deliveryPeriodDays: det.deliveryPeriodDays != null ? String(det.deliveryPeriodDays) : "",
    procurementMethod: det.procurementMethod || "",
    contractDurationDays:
      det.contractDurationDays != null ? String(det.contractDurationDays) : "",
    warrantyYears: det.warrantyYears != null ? String(det.warrantyYears) : "",
    penaltyClause: det.penaltyClause || "",
    postedDate: toDateInputValue(det.postedDate),
    objective: det.objective || "",
    systemArchetype: det.systemArchetype || "",
    complexityTier: det.complexityTier || "",
    highLevelScope: det.highLevelScope || "",
    majorComponents: [...(det.majorComponents || [])],
    deliverablesSystem: [...(det.deliverables?.system || [])],
    deliverablesImplementation: [...(det.deliverables?.implementation || [])],
    deliverablesValidation: [...(det.deliverables?.validation || [])],
    deliverablesSupportingWork: [...(det.deliverables?.supportingWork || [])],
    selectedTechs,
    techVersions,
    requiredCapabilities: [...(det.requiredCapabilities || [])],
    infrastructureSpecs: (det.infrastructureSpecifications || []).map((s) => ({
      key: s.item,
      value: s.specification,
    })),
    technicalConstraints: (det.technicalConstraints || []).map((c) => ({
      key: c.metric,
      value: c.value,
    })),
    existingSystems: [...(det.integrationEnvironment?.existingSystems || [])],
    interfacesAndApis: [...(det.integrationEnvironment?.interfacesAndApis || [])],
    dataMigrationNotes: det.integrationEnvironment?.dataMigrationNotes || "",
    deploymentLocation: det.integrationEnvironment?.deploymentLocation || "",
    installationAndConfig: [...(det.operationalRequirements?.installationAndConfig || [])],
    training: [...(det.operationalRequirements?.training || [])],
    technicalSupportAndSla: det.operationalRequirements?.technicalSupportAndSla || "",
    maintenance: [...(det.operationalRequirements?.maintenance || [])],
    companyReqs,
    requiredCertifications: [...(det.requiredCertifications || [])],
    manufacturerAuthorizations: [...(det.manufacturerAuthorizations || [])],
    personnelQualifications: [...(det.personnelQualifications || [])],
    previousExperience: det.previousExperience || "",
    previousExperienceMinTHB:
      det.previousExperienceMinTHB != null ? String(det.previousExperienceMinTHB) : "",
    paymentTerms: det.paymentTerms || "",
    deliveryConditions: det.deliveryConditions || "",
    evaluationMethod: det.evaluationMethod || "",
    isAmended: Boolean(det.amendmentInfo?.isAmended),
    amendmentSummary: det.amendmentInfo?.amendmentSummary || "",
    changedSections: [...(det.amendmentInfo?.changedSections || [])],
  };
}

export interface ReviewValidationResult {
  refPriceCheck: NumericParseResult;
  budgetCheck: NumericParseResult;
  durationCheck: NumericParseResult;
  deliveryPeriodCheck: NumericParseResult;
  warrantyCheck: NumericParseResult;
  minExpCheck: NumericParseResult;
  hasErrors: boolean;
  firstErrorMessage: string | null;
}

export function validateReviewForm(form: ReviewFormState): ReviewValidationResult {
  const refPriceCheck = parseNumberInput(form.referencePriceTHB);
  const budgetCheck = parseNumberInput(form.budgetTHB);
  const durationCheck = parseIntegerInput(form.contractDurationDays);
  const deliveryPeriodCheck = parseIntegerInput(form.deliveryPeriodDays);
  const warrantyCheck = parseNumberInput(form.warrantyYears);
  const minExpCheck = parseNumberInput(form.previousExperienceMinTHB);

  let firstErrorMessage: string | null = null;
  if (!refPriceCheck.valid) {
    firstErrorMessage =
      "ราคากลาง (Reference Price) ไม่ถูกต้อง: ต้องระบุเป็นตัวเลขเท่านั้น เช่น 1,500,000 หรือ 1500000";
  } else if (!budgetCheck.valid) {
    firstErrorMessage =
      "งบประมาณ (Approved Budget) ไม่ถูกต้อง: ต้องระบุเป็นตัวเลขเท่านั้น เช่น 1,800,000 หรือ 1800000";
  } else if (!durationCheck.valid) {
    firstErrorMessage =
      "ระยะเวลาสัญญา (Contract Duration) ไม่ถูกต้อง: ต้องระบุเป็นจำนวนวัน (ตัวเลขจำนวนเต็มบวก)";
  } else if (!deliveryPeriodCheck.valid) {
    firstErrorMessage =
      "ระยะเวลาส่งมอบ (Delivery Period) ไม่ถูกต้อง: ต้องระบุเป็นจำนวนวัน (ตัวเลขจำนวนเต็มบวก)";
  } else if (!warrantyCheck.valid) {
    firstErrorMessage =
      "ระยะเวลารับประกัน (Warranty Period) ไม่ถูกต้อง: ต้องระบุเป็นตัวเลขปี เช่น 1 หรือ 2";
  } else if (!minExpCheck.valid) {
    firstErrorMessage =
      "มูลค่าผลงานขั้นต่ำ (Minimum Experience Value) ไม่ถูกต้อง: ต้องระบุเป็นตัวเลข เช่น 5,000,000";
  }

  return {
    refPriceCheck,
    budgetCheck,
    durationCheck,
    deliveryPeriodCheck,
    warrantyCheck,
    minExpCheck,
    hasErrors: firstErrorMessage !== null,
    firstErrorMessage,
  };
}

function joinKv(list: KeyValueEntry[]): string {
  return list.map((s) => `${s.key}: ${s.value}`).join("; ");
}

export function computeReviewDiffs(
  initial: ReviewFormState,
  current: ReviewFormState,
  validation?: ReviewValidationResult
): EditDiffItem[] {
  const v = validation ?? validateReviewForm(current);
  const result: EditDiffItem[] = [];

  const check = (
    section: string,
    field: string,
    label: string,
    before: string | number | null | undefined,
    after: string | number | null | undefined
  ) => {
    const b = before == null ? "" : String(before).trim();
    const a = after == null ? "" : String(after).trim();
    if (b !== a) {
      result.push({ section, field, label, from: b, to: a });
    }
  };

  // 1. Identification
  check("1. Identification", "title", "ชื่อโครงการ (TH)", initial.title, current.title);
  check("1. Identification", "titleEn", "ชื่อโครงการ (EN)", initial.titleEn, current.titleEn);
  check("1. Identification", "agency", "หน่วยงานจัดจ้าง", initial.agency, current.agency);
  check("1. Identification", "department", "สำนัก/กอง/ส่วนงาน", initial.department, current.department);
  check("1. Identification", "categories", "หมวดหมู่โครงการ", initial.categories.join(", "), current.categories.join(", "));
  check("1. Identification", "status", "สถานะโครงการ", initial.status, current.status);

  // 2. Key Facts
  check("2. Key Facts", "budgetTHB", "งบประมาณ (บาท)", parseNumberInput(initial.budgetTHB).value, v.budgetCheck.value);
  check("2. Key Facts", "referencePriceTHB", "ราคากลาง (บาท)", parseNumberInput(initial.referencePriceTHB).value, v.refPriceCheck.value);
  check("2. Key Facts", "submissionDeadline", "วันสิ้นสุดรับซอง", initial.submissionDeadline, current.submissionDeadline);
  check("2. Key Facts", "commentDeadline", "วันสิ้นสุดรับฟังคำวิจารณ์", initial.commentDeadline, current.commentDeadline);
  check("2. Key Facts", "deliveryPeriodDays", "ระยะเวลาส่งมอบ (วัน)", parseIntegerInput(initial.deliveryPeriodDays).value, v.deliveryPeriodCheck.value);
  check("2. Key Facts", "procurementMethod", "วิธีการจัดซื้อจัดจ้าง", initial.procurementMethod, current.procurementMethod);
  check("2. Key Facts", "contractDurationDays", "ระยะเวลาสัญญา (วัน)", parseIntegerInput(initial.contractDurationDays).value, v.durationCheck.value);
  check("2. Key Facts", "warrantyYears", "ระยะเวลารับประกัน (ปี)", parseNumberInput(initial.warrantyYears).value, v.warrantyCheck.value);
  check("2. Key Facts", "penaltyClause", "เงื่อนไขค่าปรับ", initial.penaltyClause, current.penaltyClause);
  check("2. Key Facts", "postedDate", "วันที่ประกาศ", initial.postedDate, current.postedDate);

  // 3. Project Overview
  check("3. Overview", "objective", "วัตถุประสงค์", initial.objective, current.objective);
  check("3. Overview", "systemArchetype", "ประเภทระบบ", initial.systemArchetype, current.systemArchetype);
  check("3. Overview", "complexityTier", "ระดับความซับซ้อน", initial.complexityTier, current.complexityTier);
  check("3. Overview", "highLevelScope", "ขอบเขตงานภาพรวม", initial.highLevelScope, current.highLevelScope);
  check("3. Overview", "majorComponents", "องค์ประกอบสำคัญ", initial.majorComponents.filter(Boolean).join(", "), current.majorComponents.filter(Boolean).join(", "));

  // 4. Deliverables
  check("4. Deliverables", "deliverables.system", "งานส่งมอบระบบหลัก", initial.deliverablesSystem.filter(Boolean).join("; "), current.deliverablesSystem.filter(Boolean).join("; "));
  check("4. Deliverables", "deliverables.implementation", "งานติดตั้งและบริการ", initial.deliverablesImplementation.filter(Boolean).join("; "), current.deliverablesImplementation.filter(Boolean).join("; "));
  check("4. Deliverables", "deliverables.validation", "งานทดสอบและตรวจรับ", initial.deliverablesValidation.filter(Boolean).join("; "), current.deliverablesValidation.filter(Boolean).join("; "));
  check("4. Deliverables", "deliverables.supportingWork", "งานสนับสนุนและอบรม", initial.deliverablesSupportingWork.filter(Boolean).join("; "), current.deliverablesSupportingWork.filter(Boolean).join("; "));

  // 5. Technical Requirements
  check("5. Tech Stack", "requiredTechnologies", "เทคโนโลยีที่กำหนด", initial.selectedTechs.join(", "), current.selectedTechs.join(", "));
  check("5. Tech Stack", "requiredCapabilities", "ความสามารถทางเทคนิค", initial.requiredCapabilities.filter(Boolean).join("; "), current.requiredCapabilities.filter(Boolean).join("; "));
  check("5. Tech Stack", "infrastructureSpecifications", "คุณลักษณะฮาร์ดแวร์/อุปกรณ์", joinKv(initial.infrastructureSpecs), joinKv(current.infrastructureSpecs));
  check("5. Tech Stack", "technicalConstraints", "ข้อจำกัดทางเทคนิค", joinKv(initial.technicalConstraints), joinKv(current.technicalConstraints));

  // 6. Integration Environment
  check("6. Integration", "existingSystems", "ระบบเดิมที่เชื่อมต่อ", initial.existingSystems.filter(Boolean).join("; "), current.existingSystems.filter(Boolean).join("; "));
  check("6. Integration", "interfacesAndApis", "อินเทอร์เฟซและ API", initial.interfacesAndApis.filter(Boolean).join("; "), current.interfacesAndApis.filter(Boolean).join("; "));
  check("6. Integration", "deploymentLocation", "สถานที่ติดตั้ง/ระบบคลาวด์", initial.deploymentLocation, current.deploymentLocation);
  check("6. Integration", "dataMigrationNotes", "การโอนย้ายข้อมูล", initial.dataMigrationNotes, current.dataMigrationNotes);

  // 7. Operational Requirements
  check("7. Operations", "installationAndConfig", "ข้อกำหนดการติดตั้ง", initial.installationAndConfig.filter(Boolean).join("; "), current.installationAndConfig.filter(Boolean).join("; "));
  check("7. Operations", "training", "การฝึกอบรม", initial.training.filter(Boolean).join("; "), current.training.filter(Boolean).join("; "));
  check("7. Operations", "technicalSupportAndSla", "การซัพพอร์ตและ SLA", initial.technicalSupportAndSla, current.technicalSupportAndSla);
  check("7. Operations", "maintenance", "การบำรุงรักษา", initial.maintenance.filter(Boolean).join("; "), current.maintenance.filter(Boolean).join("; "));

  // 8. Eligibility
  check("8. Eligibility", "companyRequirements", "คุณสมบัติบริษัท", initial.companyReqs.filter(Boolean).join("; "), current.companyReqs.filter(Boolean).join("; "));
  check("8. Eligibility", "requiredCertifications", "มาตรฐานและใบรับรอง", initial.requiredCertifications.filter(Boolean).join("; "), current.requiredCertifications.filter(Boolean).join("; "));
  check("8. Eligibility", "manufacturerAuthorizations", "หนังสือแต่งตั้งตัวแทนจำหน่าย", initial.manufacturerAuthorizations.filter(Boolean).join("; "), current.manufacturerAuthorizations.filter(Boolean).join("; "));
  check("8. Eligibility", "personnelQualifications", "คุณสมบัติบุคลากร", initial.personnelQualifications.filter(Boolean).join("; "), current.personnelQualifications.filter(Boolean).join("; "));
  check("8. Eligibility", "previousExperienceMinTHB", "มูลค่าผลงานขั้นต่ำ (บาท)", parseNumberInput(initial.previousExperienceMinTHB).value, v.minExpCheck.value);
  check("8. Eligibility", "previousExperience", "เงื่อนไขผลงานที่ผ่านมา", initial.previousExperience, current.previousExperience);

  // 9. Contract Conditions
  check("9. Contract", "paymentTerms", "การจ่ายเงินและงวดงาน", initial.paymentTerms, current.paymentTerms);
  check("9. Contract", "deliveryConditions", "เงื่อนไขการส่งมอบ", initial.deliveryConditions, current.deliveryConditions);
  check("9. Contract", "evaluationMethod", "เกณฑ์การพิจารณา", initial.evaluationMethod, current.evaluationMethod);

  // 10. Amendment Info
  check("10. Amendments", "isAmended", "สถานะการแก้ไข (Amended)", initial.isAmended ? "Yes" : "No", current.isAmended ? "Yes" : "No");
  check("10. Amendments", "amendmentSummary", "สรุปประเด็นการแก้ไข", initial.amendmentSummary, current.amendmentSummary);
  check("10. Amendments", "changedSections", "ส่วนที่แก้ไข", initial.changedSections.filter(Boolean).join("; "), current.changedSections.filter(Boolean).join("; "));

  return result;
}

const SCALAR_DIFF_TO_STATE_KEY: Partial<Record<string, keyof ReviewFormState>> = {
  title: "title",
  titleEn: "titleEn",
  agency: "agency",
  department: "department",
  status: "status",
  budgetTHB: "budgetTHB",
  referencePriceTHB: "referencePriceTHB",
  submissionDeadline: "submissionDeadline",
  commentDeadline: "commentDeadline",
  deliveryPeriodDays: "deliveryPeriodDays",
  procurementMethod: "procurementMethod",
  contractDurationDays: "contractDurationDays",
  warrantyYears: "warrantyYears",
  penaltyClause: "penaltyClause",
  postedDate: "postedDate",
  objective: "objective",
  systemArchetype: "systemArchetype",
  complexityTier: "complexityTier",
  highLevelScope: "highLevelScope",
  deploymentLocation: "deploymentLocation",
  dataMigrationNotes: "dataMigrationNotes",
  technicalSupportAndSla: "technicalSupportAndSla",
  previousExperienceMinTHB: "previousExperienceMinTHB",
  previousExperience: "previousExperience",
  paymentTerms: "paymentTerms",
  deliveryConditions: "deliveryConditions",
  evaluationMethod: "evaluationMethod",
  isAmended: "isAmended",
  amendmentSummary: "amendmentSummary",
};

const LIST_DIFF_TO_STATE_KEY: Partial<Record<string, keyof ReviewFormState>> = {
  categories: "categories",
  majorComponents: "majorComponents",
  "deliverables.system": "deliverablesSystem",
  "deliverables.implementation": "deliverablesImplementation",
  "deliverables.validation": "deliverablesValidation",
  "deliverables.supportingWork": "deliverablesSupportingWork",
  requiredCapabilities: "requiredCapabilities",
  existingSystems: "existingSystems",
  interfacesAndApis: "interfacesAndApis",
  installationAndConfig: "installationAndConfig",
  training: "training",
  maintenance: "maintenance",
  companyRequirements: "companyReqs",
  requiredCertifications: "requiredCertifications",
  manufacturerAuthorizations: "manufacturerAuthorizations",
  personnelQualifications: "personnelQualifications",
  changedSections: "changedSections",
};

export function revertReviewField(
  current: ReviewFormState,
  initial: ReviewFormState,
  fieldKey: string
): ReviewFormState {
  const scalarKey = SCALAR_DIFF_TO_STATE_KEY[fieldKey];
  if (scalarKey) {
    return { ...current, [scalarKey]: initial[scalarKey] };
  }

  const listKey = LIST_DIFF_TO_STATE_KEY[fieldKey];
  if (listKey) {
    const val = initial[listKey] as string[];
    return { ...current, [listKey]: [...val] };
  }

  if (fieldKey === "requiredTechnologies") {
    return {
      ...current,
      selectedTechs: [...initial.selectedTechs],
      techVersions: { ...initial.techVersions },
    };
  }

  if (fieldKey === "infrastructureSpecifications") {
    return {
      ...current,
      infrastructureSpecs: initial.infrastructureSpecs.map((s) => ({ ...s })),
    };
  }

  if (fieldKey === "technicalConstraints") {
    return {
      ...current,
      technicalConstraints: initial.technicalConstraints.map((c) => ({ ...c })),
    };
  }

  return current;
}

export function buildApprovePayload(
  form: ReviewFormState,
  validation: ReviewValidationResult
): UpdateReviewPayload {
  return {
    action: "approve",
    fields: {
      // 1. Identification
      title: form.title.trim(),
      titleEn: form.titleEn.trim() || null,
      agency: form.agency.trim(),
      department: form.department.trim() || null,
      categories: form.categories,
      status: form.status || null,

      // 2. Key Facts
      budgetTHB: validation.budgetCheck.value,
      referencePriceTHB: validation.refPriceCheck.value,
      submissionDeadline: form.submissionDeadline.trim() || null,
      commentDeadline: form.commentDeadline.trim() || null,
      deliveryPeriodDays: validation.deliveryPeriodCheck.value,
      procurementMethod: form.procurementMethod.trim() || null,
      contractDurationDays: validation.durationCheck.value,
      warrantyYears: validation.warrantyCheck.value,
      penaltyClause: form.penaltyClause.trim() || null,
      postedDate: form.postedDate.trim() || null,

      // 3. Overview
      objective: form.objective.trim() || null,
      systemArchetype: form.systemArchetype.trim() || null,
      complexityTier: form.complexityTier.trim() || null,
      majorComponents: form.majorComponents.filter(Boolean),
      highLevelScope: form.highLevelScope.trim() || null,

      // 4. Deliverables
      deliverables: {
        system: form.deliverablesSystem.filter(Boolean),
        implementation: form.deliverablesImplementation.filter(Boolean),
        validation: form.deliverablesValidation.filter(Boolean),
        supportingWork: form.deliverablesSupportingWork.filter(Boolean),
      },

      // 5. Technical Requirements
      requiredTechnologies: form.selectedTechs.join(", "),
      technologiesList: form.selectedTechs.map((name) => ({
        name,
        version: form.techVersions[name] || undefined,
      })),
      requiredCapabilities: form.requiredCapabilities.filter(Boolean),
      infrastructureSpecifications: form.infrastructureSpecs
        .filter((it) => it.key || it.value)
        .map((it) => ({ item: it.key, specification: it.value })),
      technicalConstraints: form.technicalConstraints
        .filter((it) => it.key || it.value)
        .map((it) => ({ metric: it.key, value: it.value })),

      // 6. Integration Environment
      integrationEnvironment: {
        existingSystems: form.existingSystems.filter(Boolean),
        interfacesAndApis: form.interfacesAndApis.filter(Boolean),
        dataMigrationNotes: form.dataMigrationNotes.trim() || null,
        deploymentLocation: form.deploymentLocation.trim() || null,
      },

      // 7. Operational Requirements
      operationalRequirements: {
        installationAndConfig: form.installationAndConfig.filter(Boolean),
        training: form.training.filter(Boolean),
        technicalSupportAndSla: form.technicalSupportAndSla.trim() || null,
        maintenance: form.maintenance.filter(Boolean),
      },

      // 8. Eligibility
      companyRequirements: form.companyReqs.filter(Boolean),
      requiredCertifications: form.requiredCertifications.filter(Boolean),
      manufacturerAuthorizations: form.manufacturerAuthorizations.filter(Boolean),
      personnelQualifications: form.personnelQualifications.filter(Boolean),
      previousExperience: form.previousExperience.trim() || null,
      previousExperienceMinTHB: validation.minExpCheck.value,

      // 9. Contract Conditions
      paymentTerms: form.paymentTerms.trim() || null,
      deliveryConditions: form.deliveryConditions.trim() || null,
      evaluationMethod: form.evaluationMethod.trim() || null,

      // 10. Amendment Info
      amendmentInfo: {
        isAmended: form.isAmended,
        amendmentSummary: form.amendmentSummary.trim(),
        changedSections: form.changedSections.filter(Boolean),
      },
    },
  };
}

export function getFieldConfidenceScore(
  data: ReviewItemData | null,
  fieldName: string,
  fallback: number = 0.85
): number {
  if (!data?.lowFields?.length) return data?.extraction ?? fallback;
  const match = data.lowFields.find((f) =>
    f.field.toLowerCase().includes(fieldName.toLowerCase())
  );
  return match?.confidence ?? (data?.extraction ?? fallback);
}
