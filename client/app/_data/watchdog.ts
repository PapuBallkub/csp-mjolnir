import type { Bi, Lang, RiskLevel, Status } from "./tors";

/**
 * Canonical project categories from `server/src/pipeline/extraction/schema.js` (FR-19).
 */
export type ProjectCategory =
  | "software-development"
  | "systems-integration"
  | "data-and-ai"
  | "network-and-security"
  | "maintenance-and-support"
  | "software-licenses"
  | "other-it";

/**
 * Canonical system archetypes from `server/src/pipeline/extraction/schema.js` (FR-19, ADR 0021).
 */
export type SystemArchetype =
  | "web-portal"
  | "mobile-app"
  | "enterprise-erp"
  | "edoc-workflow"
  | "data-analytics"
  | "gis-mapping"
  | "cybersecurity"
  | "iot-telemetry"
  | "infra-networking"
  | "other";

/**
 * Canonical engineering complexity tiers from `server/src/pipeline/extraction/schema.js` (ADR 0021).
 */
export type ComplexityTier = "basic" | "standard" | "enterprise";

/**
 * The 3 objective lock-spec categories grounded in Circular ว 214 (ADR 0030).
 */
export type LockSpecTriggerId =
  | "Specification Tailoring"
  | "Qualification Barrier"
  | "Vendor Lock-in";

export type WatchdogProjectRecord = {
  id: string;
  egpRef: string;
  title: Bi;
  agency: Bi;
  category: ProjectCategory;
  archetype: SystemArchetype;
  complexity: ComplexityTier;
  /** YYYY-MM bucket for time-series aggregation */
  month: string;
  postedAt: string;
  status: Status;
  /** ราคากลาง (THB) */
  referencePriceTHB: number;
  /** ค่ามัธยฐานของกลุ่มเปรียบเทียบ (THB) */
  peerMedianTHB: number;
  /** ค่าเฉลี่ยของกลุ่มเปรียบเทียบ (THB) */
  peerAverageTHB: number;
  /** ราคาตามสัญญาที่ชนะ (THB) — มีเฉพาะโครงการที่ประกาศผู้ชนะแล้ว */
  agreedPriceTHB?: number;
  /** คะแนนความเสี่ยงล็อกสเปก 0–100 (ADR 0030) */
  lockSpecScore: number;
  lockSpecLevel: RiskLevel;
  /** หมวดความเสี่ยงที่ตรวจพบตาม ว 214 */
  triggers: {
    category: LockSpecTriggerId;
    summary: Bi;
    clauseExcerpt: string;
  }[];
};

export const CATEGORY_OPTIONS: { id: ProjectCategory | "all"; label: Bi }[] = [
  { id: "all", label: { th: "ทุกหมวดหมู่งาน IT", en: "All IT categories" } },
  {
    id: "software-development",
    label: { th: "พัฒนาระบบซอฟต์แวร์ / แอปพลิเคชัน", en: "Software development" },
  },
  {
    id: "systems-integration",
    label: { th: "บูรณาการระบบงาน (System Integration)", en: "Systems integration" },
  },
  {
    id: "data-and-ai",
    label: { th: "คลังข้อมูล / วิเคราะห์ข้อมูล / AI", en: "Data platforms & AI" },
  },
  {
    id: "network-and-security",
    label: { th: "เครือข่ายและความมั่นคงปลอดภัยไซเบอร์", en: "Network & security" },
  },
  {
    id: "maintenance-and-support",
    label: { th: "ดูแลบำรุงรักษาระบบ (MA)", en: "Maintenance & support" },
  },
  {
    id: "software-licenses",
    label: { th: "เช่าใช้ / จัดซื้อลิขสิทธิ์ซอฟต์แวร์", en: "Software licenses" },
  },
  {
    id: "other-it",
    label: { th: "งานด้านเทคโนโลยีสารสนเทศอื่น ๆ", en: "Other IT services" },
  },
];

export const ARCHETYPE_OPTIONS: {
  id: SystemArchetype | "all";
  label: Bi;
  categories?: ProjectCategory[];
}[] = [
  { id: "all", label: { th: "ทุกรูปแบบระบบ (Archetype)", en: "All system archetypes" } },
  {
    id: "web-portal",
    label: { th: "เว็บพอร์ทัล / ระบบบริการประชาชน (e-Service)", en: "Web portal / e-Service" },
  },
  {
    id: "mobile-app",
    label: { th: "แอปพลิเคชันมือถือ (Mobile App)", en: "Mobile application" },
  },
  {
    id: "enterprise-erp",
    label: { th: "ระบบบริหารงานองค์กร (ERP / HR / การเงิน)", en: "Enterprise ERP / back-office" },
  },
  {
    id: "edoc-workflow",
    label: { th: "สารบรรณอิเล็กทรอนิกส์ / งานอนุมัติ (e-Document)", en: "e-Document & workflow" },
  },
  {
    id: "data-analytics",
    label: { th: "คลังข้อมูลกลาง / แดชบอร์ด / AI", en: "Data warehouse & analytics" },
  },
  {
    id: "gis-mapping",
    label: { th: "ระบบแผนที่ภูมิสารสนเทศ (GIS)", en: "GIS & spatial mapping" },
  },
  {
    id: "cybersecurity",
    label: { th: "เฝ้าระวังภัยคุกคาม (SOC / SIEM / Security)", en: "Cybersecurity & SOC" },
  },
  {
    id: "iot-telemetry",
    label: { th: "เซนเซอร์ตรวจวัด / IoT / Smart City", en: "IoT & telemetry" },
  },
  {
    id: "infra-networking",
    label: { th: "คลาวด์ / แม่ข่าย / โครงสร้างพื้นฐาน", en: "Cloud & infrastructure" },
  },
  {
    id: "other",
    label: { th: "ระบบสารสนเทศทั่วไป / อื่น ๆ", en: "General IT / other" },
  },
];

export const COMPLEXITY_OPTIONS: { id: ComplexityTier | "all"; label: Bi; hint: Bi }[] = [
  {
    id: "all",
    label: { th: "ทุกขนาดขอบเขตงาน", en: "All complexity tiers" },
    hint: { th: "รวมทุกขนาดโครงการ", en: "All project scales" },
  },
  {
    id: "basic",
    label: { th: "ระดับพื้นฐาน (Basic)", en: "Basic (Departmental)" },
    hint: { th: "ระบบระดับกอง/สำนัก ขอบเขตไม่ซับซ้อน", en: "Single-unit or workgroup scope" },
  },
  {
    id: "standard",
    label: { th: "ระดับมาตรฐาน (Standard)", en: "Standard (Agency-wide)" },
    hint: { th: "ระบบใช้งานระดับกรม/หน่วยงาน เชื่อมต่อหลายส่วน", en: "Agency-wide operational system" },
  },
  {
    id: "enterprise",
    label: { th: "ระดับองค์กรขนาดใหญ่ (Enterprise)", en: "Enterprise (Mission-critical)" },
    hint: { th: "ระบบระดับประเทศ/ภารกิจสำคัญ รองรับผู้ใช้จำนวนมาก", en: "High-concurrency or inter-agency platform" },
  },
];

export const LOCK_SPEC_TRIGGERS_META: {
  id: LockSpecTriggerId;
  code: string;
  title: Bi;
  legalRef: Bi;
  description: Bi;
}[] = [
  {
    id: "Specification Tailoring",
    code: "ว 214 ข้อ 3",
    title: {
      th: "ระบุยี่ห้อหรือเวอร์ชันเฉพาะเจาะจง โดยไม่มี “หรือเทียบเท่า”",
      en: "Locked brand/version without “or equivalent”",
    },
    legalRef: {
      th: "พ.ร.บ. จัดซื้อจัดจ้างฯ ม.9 · หนังสือเวียน ว 214 ข้อ 3",
      en: "Procurement Act §9 · Circular ว 214 Clause 3",
    },
    description: {
      th: "บังคับใช้ซอฟต์แวร์หรือระบบปฏิบัติการยี่ห้อ/รุ่นเฉพาะโดยไม่เปิดทางเลือกเทียบเท่า",
      en: "Mandates a specific proprietary product or legacy runtime without allowing equivalents.",
    },
  },
  {
    id: "Qualification Barrier",
    code: "ว 214 ข้อ 2",
    title: {
      th: "กำหนดมูลค่าผลงานในอดีตเกินเพดาน 50% ของราคากลาง",
      en: "Past contract requirement exceeds 50% of budget",
    },
    legalRef: {
      th: "พ.ร.บ. จัดซื้อจัดจ้างฯ ม.9 · หนังสือเวียน ว 214 ข้อ 2",
      en: "Procurement Act §9 · Circular ว 214 Clause 2",
    },
    description: {
      th: "ตั้งเกณฑ์ผลงานสัญญาเดี่ยวสูงเกินครึ่งหนึ่งของงบประมาณ ทำให้ผู้ประกอบการรายใหม่เข้าประมูลไม่ได้",
      en: "Sets single-contract experience floor above 50% of the reference price, excluding SMEs.",
    },
  },
  {
    id: "Vendor Lock-in",
    code: "ว 214 ข้อ 1.3",
    title: {
      th: "เรียกหนังสือแต่งตั้งตัวแทนจำหน่าย (MAF) ในงานจ้างพัฒนาระบบ",
      en: "Requires OEM reseller letter (MAF) on software hire",
    },
    legalRef: {
      th: "พ.ร.บ. จัดซื้อจัดจ้างฯ ม.8, 9 · หนังสือเวียน ว 214 ข้อ 1.1, 1.3",
      en: "Procurement Act §8–9 · Circular ว 214 Clause 1.3",
    },
    description: {
      th: "นำเงื่อนไขใบรับรองตัวแทนจำหน่ายจากเจ้าของผลิตภัณฑ์มาใช้ในงานจ้างทำของ/พัฒนาซอฟต์แวร์",
      en: "Demands manufacturer authorization letters on custom software development contracts.",
    },
  },
];

/**
 * Ordered 12-month timeline (Fiscal Year 2569: Oct 2025 – Sep 2026).
 */
export const TIMELINE_MONTHS: {
  key: string;
  labelTh: string;
  labelEn: string;
  quarter: string;
}[] = [
  { key: "2025-10", labelTh: "ต.ค. 68", labelEn: "Oct 25", quarter: "Q1/69" },
  { key: "2025-11", labelTh: "พ.ย. 68", labelEn: "Nov 25", quarter: "Q1/69" },
  { key: "2025-12", labelTh: "ธ.ค. 68", labelEn: "Dec 25", quarter: "Q1/69" },
  { key: "2026-01", labelTh: "ม.ค. 69", labelEn: "Jan 26", quarter: "Q2/69" },
  { key: "2026-02", labelTh: "ก.พ. 69", labelEn: "Feb 26", quarter: "Q2/69" },
  { key: "2026-03", labelTh: "มี.ค. 69", labelEn: "Mar 26", quarter: "Q2/69" },
  { key: "2026-04", labelTh: "เม.ย. 69", labelEn: "Apr 26", quarter: "Q3/69" },
  { key: "2026-05", labelTh: "พ.ค. 69", labelEn: "May 26", quarter: "Q3/69" },
  { key: "2026-06", labelTh: "มิ.ย. 69", labelEn: "Jun 26", quarter: "Q3/69" },
  { key: "2026-07", labelTh: "ก.ค. 69", labelEn: "Jul 26", quarter: "Q4/69" },
  { key: "2026-08", labelTh: "ส.ค. 69", labelEn: "Aug 26", quarter: "Q4/69" },
  { key: "2026-09", labelTh: "ก.ย. 69", labelEn: "Sep 26", quarter: "Q4/69" },
];

export function calcPriceDeltaPct(project: WatchdogProjectRecord): number {
  if (!project.peerMedianTHB) return 0;
  return Number(
    (
      ((project.referencePriceTHB - project.peerMedianTHB) / project.peerMedianTHB) *
      100
    ).toFixed(1),
  );
}

export function getCategoryLabel(cat: ProjectCategory, lang: Lang): string {
  const found = CATEGORY_OPTIONS.find((c) => c.id === cat);
  return found ? (lang === "th" ? found.label.th : found.label.en) : cat;
}

export function getArchetypeLabel(arch: SystemArchetype, lang: Lang): string {
  const found = ARCHETYPE_OPTIONS.find((a) => a.id === arch);
  return found ? (lang === "th" ? found.label.th : found.label.en) : arch;
}

export function getComplexityLabel(comp: ComplexityTier, lang: Lang): string {
  const found = COMPLEXITY_OPTIONS.find((c) => c.id === comp);
  return found ? (lang === "th" ? found.label.th : found.label.en) : comp;
}
