import type { RiskLevel, Status } from "./tors";

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
  title: string;
  agency: string;
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
  peerMedianTHB?: number;
  /** ค่าเฉลี่ยของกลุ่มเปรียบเทียบ (THB) */
  peerAverageTHB?: number;
  /** ราคาตามสัญญาที่ชนะ (THB) — มีเฉพาะโครงการที่ประกาศผู้ชนะแล้ว */
  agreedPriceTHB?: number;
  /** คะแนนความเสี่ยงล็อกสเปก 0–100 (ADR 0030) */
  lockSpecScore: number;
  lockSpecLevel: RiskLevel;
  /** หมวดความเสี่ยงที่ตรวจพบตาม ว 214 */
  triggers: {
    category: LockSpecTriggerId;
    summary: string;
    clauseExcerpt: string;
  }[];
};

export const CATEGORY_OPTIONS: { id: ProjectCategory | "all"; label: string }[] = [
  { id: "all", label: "ทุกหมวดหมู่งาน IT" },
  {
    id: "software-development",
    label: "พัฒนาระบบซอฟต์แวร์ / แอปพลิเคชัน",
  },
  {
    id: "systems-integration",
    label: "บูรณาการระบบงาน (System Integration)",
  },
  {
    id: "data-and-ai",
    label: "คลังข้อมูล / วิเคราะห์ข้อมูล / AI",
  },
  {
    id: "network-and-security",
    label: "เครือข่ายและความมั่นคงปลอดภัยไซเบอร์",
  },
  {
    id: "maintenance-and-support",
    label: "ดูแลบำรุงรักษาระบบ (MA)",
  },
  {
    id: "software-licenses",
    label: "เช่าใช้ / จัดซื้อลิขสิทธิ์ซอฟต์แวร์",
  },
  {
    id: "other-it",
    label: "งานด้านเทคโนโลยีสารสนเทศอื่น ๆ",
  },
];

export const ARCHETYPE_OPTIONS: {
  id: SystemArchetype | "all";
  label: string;
  categories?: ProjectCategory[];
}[] = [
  { id: "all", label: "ทุกรูปแบบระบบ (Archetype)" },
  {
    id: "web-portal",
    label: "เว็บพอร์ทัล / ระบบบริการประชาชน (e-Service)",
  },
  {
    id: "mobile-app",
    label: "แอปพลิเคชันมือถือ (Mobile App)",
  },
  {
    id: "enterprise-erp",
    label: "ระบบบริหารงานองค์กร (ERP / HR / การเงิน)",
  },
  {
    id: "edoc-workflow",
    label: "สารบรรณอิเล็กทรอนิกส์ / งานอนุมัติ (e-Document)",
  },
  {
    id: "data-analytics",
    label: "คลังข้อมูลกลาง / แดชบอร์ด / AI",
  },
  {
    id: "gis-mapping",
    label: "ระบบแผนที่ภูมิสารสนเทศ (GIS)",
  },
  {
    id: "cybersecurity",
    label: "เฝ้าระวังภัยคุกคาม (SOC / SIEM / Security)",
  },
  {
    id: "iot-telemetry",
    label: "เซนเซอร์ตรวจวัด / IoT / Smart City",
  },
  {
    id: "infra-networking",
    label: "คลาวด์ / แม่ข่าย / โครงสร้างพื้นฐาน",
  },
  {
    id: "other",
    label: "ระบบสารสนเทศทั่วไป / อื่น ๆ",
  },
];

export const COMPLEXITY_OPTIONS: { id: ComplexityTier | "all"; label: string; hint: string }[] = [
  {
    id: "all",
    label: "ทุกขนาดขอบเขตงาน",
    hint: "รวมทุกขนาดโครงการ",
  },
  {
    id: "basic",
    label: "ระดับพื้นฐาน (Basic)",
    hint: "ระบบระดับกอง/สำนัก ขอบเขตไม่ซับซ้อน",
  },
  {
    id: "standard",
    label: "ระดับมาตรฐาน (Standard)",
    hint: "ระบบใช้งานระดับกรม/หน่วยงาน เชื่อมต่อหลายส่วน",
  },
  {
    id: "enterprise",
    label: "ระดับองค์กรขนาดใหญ่ (Enterprise)",
    hint: "ระบบระดับประเทศ/ภารกิจสำคัญ รองรับผู้ใช้จำนวนมาก",
  },
];

export const LOCK_SPEC_TRIGGERS_META: {
  id: LockSpecTriggerId;
  code: string;
  title: string;
  legalRef: string;
  description: string;
}[] = [
  {
    id: "Specification Tailoring",
    code: "ว 214 ข้อ 3",
    title: "ระบุยี่ห้อหรือเวอร์ชันเฉพาะเจาะจง โดยไม่มี “หรือเทียบเท่า”",
    legalRef: "พ.ร.บ. จัดซื้อจัดจ้างฯ ม.9 · ว 214 ข้อ 3",
    description: "บังคับใช้ซอฟต์แวร์หรือระบบปฏิบัติการยี่ห้อ/รุ่นเฉพาะโดยไม่เปิดทางเลือกเทียบเท่า",
  },
  {
    id: "Qualification Barrier",
    code: "ว 214 ข้อ 2",
    title: "กำหนดมูลค่าผลงานในอดีตเกินเพดาน 50% ของราคากลาง",
    legalRef: "พ.ร.บ. จัดซื้อจัดจ้างฯ ม.9 · ว 214 ข้อ 2",
    description: "ตั้งเกณฑ์ผลงานสัญญาเดี่ยวสูงเกินครึ่งหนึ่งของงบประมาณ ทำให้ผู้ประกอบการรายใหม่เข้าประมูลไม่ได้",
  },
  {
    id: "Vendor Lock-in",
    code: "ว 214 ข้อ 1.3",
    title: "เรียกหนังสือแต่งตั้งตัวแทนจำหน่าย (MAF) ในงานจ้างพัฒนาระบบ",
    legalRef: "พ.ร.บ. จัดซื้อจัดจ้างฯ ม.8, 9 · ว 214 ข้อ 1.3",
    description: "นำเงื่อนไขใบรับรองตัวแทนจำหน่ายจากเจ้าของผลิตภัณฑ์มาใช้ในงานจ้างทำของ/พัฒนาซอฟต์แวร์",
  },
];

/**
 * Ordered 12-month timeline (Fiscal Year 2569: Oct 2025 – Sep 2026).
 */
export const TIMELINE_MONTHS: {
  key: string;
  label: string;
  labelTh?: string;
  quarter: string;
}[] = [
  { key: "2025-10", label: "ต.ค. 68", labelTh: "ต.ค. 68", quarter: "Q1/69" },
  { key: "2025-11", label: "พ.ย. 68", labelTh: "พ.ย. 68", quarter: "Q1/69" },
  { key: "2025-12", label: "ธ.ค. 68", labelTh: "ธ.ค. 68", quarter: "Q1/69" },
  { key: "2026-01", label: "ม.ค. 69", labelTh: "ม.ค. 69", quarter: "Q2/69" },
  { key: "2026-02", label: "ก.พ. 69", labelTh: "ก.พ. 69", quarter: "Q2/69" },
  { key: "2026-03", label: "มี.ค. 69", labelTh: "มี.ค. 69", quarter: "Q2/69" },
  { key: "2026-04", label: "เม.ย. 69", labelTh: "เม.ย. 69", quarter: "Q3/69" },
  { key: "2026-05", label: "พ.ค. 69", labelTh: "พ.ค. 69", quarter: "Q3/69" },
  { key: "2026-06", label: "มิ.ย. 69", labelTh: "มิ.ย. 69", quarter: "Q3/69" },
  { key: "2026-07", label: "ก.ค. 69", labelTh: "ก.ค. 69", quarter: "Q4/69" },
  { key: "2026-08", label: "ส.ค. 69", labelTh: "ส.ค. 69", quarter: "Q4/69" },
  { key: "2026-09", label: "ก.ย. 69", labelTh: "ก.ย. 69", quarter: "Q4/69" },
];

export function calcPriceDeltaPct(project: WatchdogProjectRecord): number | null {
  if (!project.peerMedianTHB || project.peerMedianTHB <= 0) return null;
  return Number(
    (
      ((project.referencePriceTHB - project.peerMedianTHB) / project.peerMedianTHB) *
      100
    ).toFixed(1),
  );
}

export function getCategoryLabel(cat: ProjectCategory): string {
  const found = CATEGORY_OPTIONS.find((c) => c.id === cat);
  return found ? found.label : cat;
}

export function getArchetypeLabel(arch: SystemArchetype): string {
  const found = ARCHETYPE_OPTIONS.find((a) => a.id === arch);
  return found ? found.label : arch;
}

export function getComplexityLabel(comp: ComplexityTier): string {
  const found = COMPLEXITY_OPTIONS.find((c) => c.id === comp);
  return found ? found.label : comp;
}
