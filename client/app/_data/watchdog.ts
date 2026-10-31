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

/**
 * Representative dataset combining fully extracted TORs and historical benchmark pools
 * across the 12 months of FY2569 so every filter slice produces meaningful trends and findings.
 */
export const WATCHDOG_PROJECTS: WatchdogProjectRecord[] = [
  // --- 2025-10 ---
  {
    id: "DGA-2569-0012",
    egpRef: "68109011201",
    title: {
      th: "จ้างพัฒนาระบบพอร์ทัลกลางเพื่อประชาชน (Citizen Portal) ระยะที่ 3",
      en: "Citizen Portal platform development, phase 3",
    },
    agency: { th: "สำนักงานพัฒนารัฐบาลดิจิทัล (องค์การมหาชน)", en: "Digital Government Development Agency (DGA)" },
    category: "software-development",
    archetype: "web-portal",
    complexity: "enterprise",
    month: "2025-10",
    postedAt: "2025-10-14",
    status: "Awarded",
    referencePriceTHB: 14_800_000,
    peerMedianTHB: 14_200_000,
    peerAverageTHB: 15_100_000,
    agreedPriceTHB: 13_950_000,
    lockSpecScore: 0,
    lockSpecLevel: "low",
    triggers: [],
  },
  {
    id: "MOPH-2569-0034",
    egpRef: "68109029811",
    title: {
      th: "จ้างเหมาดูแลบำรุงรักษาระบบสารสนเทศโรงพยาบาลและฐานข้อมูลผู้ป่วยนอก",
      en: "Hospital information system and outpatient database maintenance",
    },
    agency: { th: "สำนักงานปลัดกระทรวงสาธารณสุข", en: "Office of the Permanent Secretary, MOPH" },
    category: "maintenance-and-support",
    archetype: "enterprise-erp",
    complexity: "standard",
    month: "2025-10",
    postedAt: "2025-10-21",
    status: "Awarded",
    referencePriceTHB: 4_600_000,
    peerMedianTHB: 4_200_000,
    peerAverageTHB: 4_550_000,
    agreedPriceTHB: 4_480_000,
    lockSpecScore: 35,
    lockSpecLevel: "medium",
    triggers: [
      {
        category: "Qualification Barrier",
        summary: {
          th: "กำหนดผลงานขั้นต่ำ 3.0 ล้านบาท (65.2% ของราคากลาง)",
          en: "Requires single past contract ≥ ฿3.0M (65.2% of reference price)",
        },
        clauseExcerpt: "ต้องมีผลงานดูแลรักษาระบบสารสนเทศทางการแพทย์ในสัญญาเดียวไม่น้อยกว่า 3,000,000 บาท",
      },
    ],
  },

  // --- 2025-11 ---
  {
    id: "DOPA-2569-0089",
    egpRef: "68119044102",
    title: {
      th: "โครงการบูรณาการระบบพิสูจน์และยืนยันตัวตนทางดิจิทัลเชื่อมโยงฐานข้อมูลทะเบียนราษฎร",
      en: "Digital identity verification system integration with civil registry",
    },
    agency: { th: "กรมการปกครอง", en: "Department of Provincial Administration" },
    category: "systems-integration",
    archetype: "cybersecurity",
    complexity: "enterprise",
    month: "2025-11",
    postedAt: "2025-11-09",
    status: "Awarded",
    referencePriceTHB: 24_500_000,
    peerMedianTHB: 18_400_000,
    peerAverageTHB: 19_900_000,
    agreedPriceTHB: 24_350_000,
    lockSpecScore: 70,
    lockSpecLevel: "high",
    triggers: [
      {
        category: "Vendor Lock-in",
        summary: {
          th: "กำหนดใบแต่งตั้งตัวแทนจำหน่าย (MAF) ในงานจ้างพัฒนาระบบเชื่อมต่อ",
          en: "Requires OEM MAF certificate on systems integration hire",
        },
        clauseExcerpt: "ผู้ยื่นข้อเสนอต้องมีหนังสือแต่งตั้งตัวแทนจำหน่ายโดยตรงจากผู้ผลิตซอฟต์แวร์จัดการกุญแจเข้ารหัส",
      },
      {
        category: "Qualification Barrier",
        summary: {
          th: "กำหนดผลงานสัญญาเดี่ยว 18 ล้านบาท (73.5% ของราคากลาง)",
          en: "Requires past single contract of ฿18M (73.5% of reference price)",
        },
        clauseExcerpt: "มีผลงานประเภทเดียวกันกับหน่วยงานภาครัฐในสัญญาเดียว วงเงินไม่น้อยกว่า 18,000,000 บาท",
      },
    ],
  },
  {
    id: "BMA-2569-0041",
    egpRef: "68119051090",
    title: {
      th: "จ้างพัฒนาเว็บแอปพลิเคชันติดตามเรื่องร้องเรียนระดับเขตและรายงานผลแบบเปิด",
      en: "District complaint tracking web portal and open dashboard",
    },
    agency: { th: "กรุงเทพมหานคร", en: "Bangkok Metropolitan Administration" },
    category: "software-development",
    archetype: "web-portal",
    complexity: "basic",
    month: "2025-11",
    postedAt: "2025-11-18",
    status: "Awarded",
    referencePriceTHB: 2_850_000,
    peerMedianTHB: 3_100_000,
    peerAverageTHB: 3_350_000,
    agreedPriceTHB: 2_690_000,
    lockSpecScore: 0,
    lockSpecLevel: "low",
    triggers: [],
  },

  // --- 2025-12 ---
  {
    id: "MEA-2569-0105",
    egpRef: "68129018832",
    title: {
      th: "จ้างพัฒนาระบบวิเคราะห์ข้อมูลการใช้พลังงานไฟฟ้าอัจฉริยะจากมิเตอร์ IoT",
      en: "Smart grid IoT meter telemetry and analytics platform",
    },
    agency: { th: "การไฟฟ้านครหลวง", en: "Metropolitan Electricity Authority (MEA)" },
    category: "data-and-ai",
    archetype: "iot-telemetry",
    complexity: "enterprise",
    month: "2025-12",
    postedAt: "2025-12-05",
    status: "Awarded",
    referencePriceTHB: 16_200_000,
    peerMedianTHB: 15_000_000,
    peerAverageTHB: 16_400_000,
    agreedPriceTHB: 15_600_000,
    lockSpecScore: 35,
    lockSpecLevel: "medium",
    triggers: [
      {
        category: "Specification Tailoring",
        summary: {
          th: "ระบุฐานข้อมูล Oracle Database 19c โดยไม่มีคำว่า “หรือเทียบเท่า”",
          en: "Mandates Oracle Database 19c without “or equivalent” clause",
        },
        clauseExcerpt: "ระบบจัดการฐานข้อมูลกลางต้องทำงานบน Oracle Database 19c Enterprise Edition เท่านั้น",
      },
    ],
  },
  {
    id: "MOE-2569-0072",
    egpRef: "68129067214",
    title: {
      th: "เช่าใช้ลิขสิทธิ์ซอฟต์แวร์ระบบการเรียนการสอนออนไลน์และจัดการห้องเรียนดิจิทัล",
      en: "Digital classroom and e-learning software license subscription",
    },
    agency: { th: "สำนักงานคณะกรรมการการศึกษาขั้นพื้นฐาน (สพฐ.)", en: "Office of the Basic Education Commission" },
    category: "software-licenses",
    archetype: "web-portal",
    complexity: "standard",
    month: "2025-12",
    postedAt: "2025-12-19",
    status: "Awarded",
    referencePriceTHB: 6_400_000,
    peerMedianTHB: 5_800_000,
    peerAverageTHB: 6_200_000,
    agreedPriceTHB: 6_320_000,
    lockSpecScore: 0,
    lockSpecLevel: "low",
    triggers: [],
  },

  // --- 2026-01 ---
  {
    id: "ONDE-2569-0118",
    egpRef: "69019033120",
    title: {
      th: "จ้างพัฒนาระบบสารบรรณอิเล็กทรอนิกส์และลงนามดิจิทัลสำหรับศูนย์ดิจิทัลชุมชน",
      en: "e-Document workflow and digital signature system for community centers",
    },
    agency: { th: "สำนักงานคณะกรรมการดิจิทัลเพื่อเศรษฐกิจและสังคมแห่งชาติ", en: "Office of the National Digital Economy and Society Commission" },
    category: "software-development",
    archetype: "edoc-workflow",
    complexity: "standard",
    month: "2026-01",
    postedAt: "2026-01-12",
    status: "Awarded",
    referencePriceTHB: 5_200_000,
    peerMedianTHB: 6_400_000,
    peerAverageTHB: 6_800_000,
    agreedPriceTHB: 4_950_000,
    lockSpecScore: 0,
    lockSpecLevel: "low",
    triggers: [],
  },
  {
    id: "DOL-2569-0149",
    egpRef: "69019089201",
    title: {
      th: "จ้างพัฒนาระบบภูมิสารสนเทศแปลงที่ดินและประเมินราคาที่ดินรายแปลงออนไลน์",
      en: "Parcel GIS mapping and online land valuation platform",
    },
    agency: { th: "กรมที่ดิน", en: "Department of Lands" },
    category: "data-and-ai",
    archetype: "gis-mapping",
    complexity: "enterprise",
    month: "2026-01",
    postedAt: "2026-01-24",
    status: "Awarded",
    referencePriceTHB: 19_800_000,
    peerMedianTHB: 15_500_000,
    peerAverageTHB: 16_900_000,
    agreedPriceTHB: 19_650_000,
    lockSpecScore: 70,
    lockSpecLevel: "high",
    triggers: [
      {
        category: "Specification Tailoring",
        summary: {
          th: "ระบุซอฟต์แวร์แผนที่เฉพาะยี่ห้อและล็อกรุ่น Windows Server 2019",
          en: "Locks proprietary GIS engine and Windows Server 2019 without equivalents",
        },
        clauseExcerpt: "ต้องติดตั้งบนระบบปฏิบัติการ Windows Server 2019 Datacenter Edition โดยไม่เปิดให้ใช้ระบบเทียบเท่า",
      },
      {
        category: "Vendor Lock-in",
        summary: {
          th: "กำหนดให้แนบหนังสือรับรองการเป็นตัวแทนจำหน่ายอย่างเป็นทางการในงานจ้างพัฒนา",
          en: "Requires exclusive local distributor authorization letter",
        },
        clauseExcerpt: "ต้องมีหนังสือแต่งตั้งตัวแทนจำหน่ายสำหรับการเสนอราคาโครงการนี้โดยเฉพาะจากผู้ผลิต",
      },
    ],
  },

  // --- 2026-02 ---
  {
    id: "MOF-2569-0182",
    egpRef: "69029014512",
    title: {
      th: "จ้างพัฒนาระบบเฝ้าระวังและป้องกันภัยคุกคามทางไซเบอร์ (SOC) ตลอด 24 ชั่วโมง",
      en: "24x7 Security Operations Center (SOC) monitoring and incident response",
    },
    agency: { th: "สำนักงานปลัดกระทรวงการคลัง", en: "Office of the Permanent Secretary, Ministry of Finance" },
    category: "network-and-security",
    archetype: "cybersecurity",
    complexity: "enterprise",
    month: "2026-02",
    postedAt: "2026-02-08",
    status: "Awarded",
    referencePriceTHB: 13_500_000,
    peerMedianTHB: 12_800_000,
    peerAverageTHB: 13_600_000,
    agreedPriceTHB: 12_900_000,
    lockSpecScore: 35,
    lockSpecLevel: "medium",
    triggers: [
      {
        category: "Qualification Barrier",
        summary: {
          th: "กำหนดผลงานขั้นต่ำ 8.5 ล้านบาท (63.0% ของราคากลาง)",
          en: "Requires single prior contract ≥ ฿8.5M (63.0% of reference price)",
        },
        clauseExcerpt: "ต้องมีผลงานจัดตั้งศูนย์เฝ้าระวังความปลอดภัยไซเบอร์กับหน่วยงานรัฐไม่น้อยกว่า 8,500,000 บาท",
      },
    ],
  },
  {
    id: "BMA-2569-0190",
    egpRef: "69029055210",
    title: {
      th: "จ้างพัฒนาแอปพลิเคชันจองคิวรับบริการศูนย์บริการสาธารณสุขกรุงเทพมหานคร",
      en: "BMA public health center queue booking mobile application",
    },
    agency: { th: "สำนักอนามัย กรุงเทพมหานคร", en: "Health Department, BMA" },
    category: "software-development",
    archetype: "mobile-app",
    complexity: "standard",
    month: "2026-02",
    postedAt: "2026-02-19",
    status: "Awarded",
    referencePriceTHB: 3_400_000,
    peerMedianTHB: 4_300_000,
    peerAverageTHB: 4_600_000,
    agreedPriceTHB: 3_250_000,
    lockSpecScore: 0,
    lockSpecLevel: "low",
    triggers: [],
  },

  // --- 2026-03 ---
  {
    id: "NHSO-2569-0204",
    egpRef: "69039021908",
    title: {
      th: "จ้างพัฒนาระบบตรวจสอบสิทธิและเบิกจ่ายค่ารักษาพยาบาลอิเล็กทรอนิกส์ด้วย AI",
      en: "AI-assisted medical claim verification and e-reimbursement platform",
    },
    agency: { th: "สำนักงานหลักประกันสุขภาพแห่งชาติ (สปสช.)", en: "National Health Security Office (NHSO)" },
    category: "data-and-ai",
    archetype: "data-analytics",
    complexity: "enterprise",
    month: "2026-03",
    postedAt: "2026-03-11",
    status: "Awarded",
    referencePriceTHB: 17_500_000,
    peerMedianTHB: 16_200_000,
    peerAverageTHB: 17_800_000,
    agreedPriceTHB: 16_450_000,
    lockSpecScore: 0,
    lockSpecLevel: "low",
    triggers: [],
  },
  {
    id: "RID-2569-0219",
    egpRef: "69039077412",
    title: {
      th: "จ้างบูรณาการระบบโทรมาตรตรวจวัดระดับน้ำเขื่อนและระบบโครงข่ายสื่อสารสำรอง",
      en: "Dam water-level telemetry integration and redundant network link",
    },
    agency: { th: "กรมชลประทาน", en: "Royal Irrigation Department" },
    category: "systems-integration",
    archetype: "iot-telemetry",
    complexity: "enterprise",
    month: "2026-03",
    postedAt: "2026-03-25",
    status: "Awarded",
    referencePriceTHB: 22_000_000,
    peerMedianTHB: 16_800_000,
    peerAverageTHB: 18_100_000,
    agreedPriceTHB: 21_820_000,
    lockSpecScore: 70,
    lockSpecLevel: "high",
    triggers: [
      {
        category: "Vendor Lock-in",
        summary: {
          th: "เรียกใบแต่งตั้งตัวแทนจำหน่าย (MAF) ในงานจ้างบูรณาการซอฟต์แวร์โทรมาตร",
          en: "Requires OEM authorization letter on telemetry software integration",
        },
        clauseExcerpt: "ผู้เสนอราคาต้องแนบหนังสือรับรองการเป็นตัวแทนจำหน่ายจากเจ้าของผลิตภัณฑ์ระบบ SCADA/Telemetry",
      },
      {
        category: "Qualification Barrier",
        summary: {
          th: "กำหนดผลงานขั้นต่ำ 15 ล้านบาท (68.2% ของราคากลาง)",
          en: "Requires single prior contract ≥ ฿15M (68.2% of reference price)",
        },
        clauseExcerpt: "ต้องมีผลงานติดตั้งและพัฒนาระบบโทรมาตรในสัญญาเดียววงเงินไม่น้อยกว่า 15,000,000 บาท",
      },
    ],
  },

  // --- 2026-04 ---
  {
    id: "DBD-2569-0233",
    egpRef: "69049019300",
    title: {
      th: "จ้างปรับปรุงระบบจดทะเบียนนิติบุคคลทางอิเล็กทรอนิกส์และเชื่อมโยง API หน่วยงานรัฐ",
      en: "Electronic corporate registration modernization and inter-agency API gateway",
    },
    agency: { th: "กรมพัฒนาธุรกิจการค้า", en: "Department of Business Development" },
    category: "software-development",
    archetype: "web-portal",
    complexity: "enterprise",
    month: "2026-04",
    postedAt: "2026-04-07",
    status: "Awarded",
    referencePriceTHB: 11_200_000,
    peerMedianTHB: 11_800_000,
    peerAverageTHB: 12_500_000,
    agreedPriceTHB: 10_650_000,
    lockSpecScore: 0,
    lockSpecLevel: "low",
    triggers: [],
  },
  {
    id: "BMA-2569-0240",
    egpRef: "69049061209",
    title: {
      th: "จ้างบำรุงรักษาระบบบริหารงานบุคคลและระบบบัญชีการเงินสำนักการคลัง",
      en: "HR and financial ERP maintenance for BMA Finance Department",
    },
    agency: { th: "สำนักการคลัง กรุงเทพมหานคร", en: "Department of Finance, BMA" },
    category: "maintenance-and-support",
    archetype: "enterprise-erp",
    complexity: "standard",
    month: "2026-04",
    postedAt: "2026-04-22",
    status: "Awarded",
    referencePriceTHB: 6_800_000,
    peerMedianTHB: 5_400_000,
    peerAverageTHB: 5_750_000,
    agreedPriceTHB: 6_740_000,
    lockSpecScore: 35,
    lockSpecLevel: "medium",
    triggers: [
      {
        category: "Specification Tailoring",
        summary: {
          th: "ล็อกระบบ Red Hat Enterprise Linux 8.4 โดยไม่มีคำว่า “หรือเทียบเท่า”",
          en: "Mandates exact RHEL 8.4 version without “or equivalent”",
        },
        clauseExcerpt: "ต้องดูแลระบบที่ทำงานบน Red Hat Enterprise Linux Server 8.4 เท่านั้น",
      },
    ],
  },

  // --- 2026-05 ---
  {
    id: "DGA-2569-0261",
    egpRef: "69059038115",
    title: {
      th: "จ้างพัฒนาระบบคลาวด์กลางภาครัฐ (GDCC) ระบบบริหารจัดการคอนเทนเนอร์และไมโครเซอร์วิส",
      en: "Government cloud container orchestration and microservice management",
    },
    agency: { th: "สำนักงานพัฒนารัฐบาลดิจิทัล (องค์การมหาชน)", en: "Digital Government Development Agency (DGA)" },
    category: "network-and-security",
    archetype: "infra-networking",
    complexity: "enterprise",
    month: "2026-05",
    postedAt: "2026-05-10",
    status: "Awarded",
    referencePriceTHB: 15_900_000,
    peerMedianTHB: 15_200_000,
    peerAverageTHB: 16_100_000,
    agreedPriceTHB: 15_100_000,
    lockSpecScore: 0,
    lockSpecLevel: "low",
    triggers: [],
  },
  {
    id: "DLT-2569-0278",
    egpRef: "69059074901",
    title: {
      th: "จ้างพัฒนาแอปพลิเคชันต่อภาษีรถประจำปีและตรวจสอบใบสั่งจราจรแบบเรียลไทม์",
      en: "Annual vehicle tax renewal and real-time traffic ticket mobile app",
    },
    agency: { th: "กรมการขนส่งทางบก", en: "Department of Land Transport" },
    category: "software-development",
    archetype: "mobile-app",
    complexity: "standard",
    month: "2026-05",
    postedAt: "2026-05-23",
    status: "Awarded",
    referencePriceTHB: 4_850_000,
    peerMedianTHB: 4_700_000,
    peerAverageTHB: 5_100_000,
    agreedPriceTHB: 4_520_000,
    lockSpecScore: 0,
    lockSpecLevel: "low",
    triggers: [],
  },

  // --- 2026-06 ---
  {
    id: "BMA-2569-0142",
    egpRef: "69069041234",
    title: {
      th: "จ้างพัฒนาระบบบริหารจัดการข้อมูลน้ำท่วมและระบบเตือนภัยล่วงหน้า ระยะที่ 2",
      en: "Flood data management and early-warning system, phase 2",
    },
    agency: { th: "สำนักการระบายน้ำ กรุงเทพมหานคร", en: "Department of Drainage and Sewerage, BMA" },
    category: "data-and-ai",
    archetype: "iot-telemetry",
    complexity: "enterprise",
    month: "2026-06",
    postedAt: "2026-06-30",
    status: "Open",
    referencePriceTHB: 12_400_000,
    peerMedianTHB: 8_900_000,
    peerAverageTHB: 9_650_000,
    lockSpecScore: 100,
    lockSpecLevel: "high",
    triggers: [
      {
        category: "Specification Tailoring",
        summary: {
          th: "ระบุ NGINX Plus และ Windows Server 2019 โดยตัดคำว่า “หรือเทียบเท่า” ออก",
          en: "Mandates NGINX Plus and Windows Server 2019 with “or equivalent” removed",
        },
        clauseExcerpt: "ระบบต้องทำงานบน Windows Server 2019 และใช้ NGINX Plus โดยไม่อนุญาตซอฟต์แวร์เทียบเท่า",
      },
      {
        category: "Vendor Lock-in",
        summary: {
          th: "บังคับหนังสือรับรองตัวแทนจำหน่ายอย่างเป็นทางการจากผู้ผลิตในงานจ้างพัฒนา",
          en: "Requires official distributor certificate (MAF) on software development hire",
        },
        clauseExcerpt: "ต้องมีหนังสือรับรองการเป็นตัวแทนจำหน่ายอย่างเป็นทางการจากผู้ผลิต NGINX Plus ในประเทศไทย",
      },
      {
        category: "Qualification Barrier",
        summary: {
          th: "กำหนดผลงานสัญญาเดี่ยวไม่น้อยกว่า 8.0 ล้านบาท (64.5% ของราคากลาง)",
          en: "Requires single prior contract ≥ ฿8.0M (64.5% of reference price)",
        },
        clauseExcerpt: "ผู้เสนอราคาต้องมีผลงานพัฒนาระบบสารสนเทศด้านน้ำในสัญญาเดียวไม่น้อยกว่า 8,000,000 บาท",
      },
    ],
  },
  {
    id: "BMA-2569-0290",
    egpRef: "69069051882",
    title: {
      th: "จ้างพัฒนาระบบคลังข้อมูลกลางและแดชบอร์ดติดตามงบประมาณรายเขต",
      en: "Central data warehouse and district budget monitoring dashboard",
    },
    agency: { th: "สำนักยุทธศาสตร์และประเมินผล กรุงเทพมหานคร", en: "Strategy and Evaluation Department, BMA" },
    category: "data-and-ai",
    archetype: "data-analytics",
    complexity: "standard",
    month: "2026-06",
    postedAt: "2026-06-14",
    status: "Closed",
    referencePriceTHB: 6_200_000,
    peerMedianTHB: 6_100_000,
    peerAverageTHB: 6_650_000,
    lockSpecScore: 0,
    lockSpecLevel: "low",
    triggers: [],
  },

  // --- 2026-07 ---
  {
    id: "BMA-2569-0217",
    egpRef: "69079019801",
    title: {
      th: "จ้างพัฒนาระบบยื่นคำขออนุญาตก่อสร้างอาคารออนไลน์และตรวจสอบผังเมืองอัตโนมัติ",
      en: "Online building permit application and automated zoning check portal",
    },
    agency: { th: "สำนักการโยธา กรุงเทพมหานคร", en: "Public Works Department, BMA" },
    category: "software-development",
    archetype: "gis-mapping",
    complexity: "standard",
    month: "2026-07",
    postedAt: "2026-07-15",
    status: "Open",
    referencePriceTHB: 4_800_000,
    peerMedianTHB: 4_500_000,
    peerAverageTHB: 4_900_000,
    lockSpecScore: 0,
    lockSpecLevel: "low",
    triggers: [],
  },
  {
    id: "MOPH-2569-0312",
    egpRef: "69079062411",
    title: {
      th: "จ้างพัฒนาระบบเชื่อมโยงประวัติสุขภาพอิเล็กทรอนิกส์ส่วนบุคคลระดับเขตสุขภาพ",
      en: "Regional personal electronic health record (EHR) exchange system",
    },
    agency: { th: "สำนักงานปลัดกระทรวงสาธารณสุข", en: "Office of the Permanent Secretary, MOPH" },
    category: "systems-integration",
    archetype: "enterprise-erp",
    complexity: "enterprise",
    month: "2026-07",
    postedAt: "2026-07-26",
    status: "Open",
    referencePriceTHB: 9_100_000,
    peerMedianTHB: 12_600_000,
    peerAverageTHB: 13_400_000,
    lockSpecScore: 35,
    lockSpecLevel: "medium",
    triggers: [
      {
        category: "Specification Tailoring",
        summary: {
          th: "ล็อกระบบปฏิบัติการ Windows Server 2019 โดยไม่มีคำว่า “หรือเทียบเท่า”",
          en: "Mandates Windows Server 2019 without “or equivalent”",
        },
        clauseExcerpt: "เครื่องแม่ข่ายประมวลผลต้องติดตั้งระบบปฏิบัติการ Windows Server 2019 Standard Edition",
      },
    ],
  },

  // --- 2026-08 ---
  {
    id: "BMA-2569-0245",
    egpRef: "69089011402",
    title: {
      th: "จ้างพัฒนาระบบสารบรรณอิเล็กทรอนิกส์และระบบอนุมัติเอกสารผ่านอุปกรณ์พกพา",
      en: "e-Saraban document workflow and mobile approval system",
    },
    agency: { th: "สำนักงานปกครองและทะเบียน กรุงเทพมหานคร", en: "Administration and Registration Office, BMA" },
    category: "software-development",
    archetype: "edoc-workflow",
    complexity: "basic",
    month: "2026-08",
    postedAt: "2026-08-03",
    status: "Open",
    referencePriceTHB: 1_950_000,
    peerMedianTHB: 3_100_000,
    peerAverageTHB: 3_400_000,
    lockSpecScore: 35,
    lockSpecLevel: "medium",
    triggers: [
      {
        category: "Qualification Barrier",
        summary: {
          th: "กำหนดผลงานสัญญาเดี่ยวไม่น้อยกว่า 1.5 ล้านบาท (76.9% ของราคากลาง)",
          en: "Requires single prior contract ≥ ฿1.5M (76.9% of reference price)",
        },
        clauseExcerpt: "ต้องมีผลงานพัฒนาระบบสารบรรณอิเล็กทรอนิกส์ให้หน่วยงานภาครัฐไม่น้อยกว่า 1,500,000 บาท",
      },
    ],
  },
  {
    id: "MEA-2569-0344",
    egpRef: "69089078190",
    title: {
      th: "จ้างปรับปรุงระบบความมั่นคงปลอดภัยเครือข่ายและระบบตรวจจับการบุกรุกศูนย์ข้อมูลหลัก",
      en: "Core data center network security and intrusion detection upgrade",
    },
    agency: { th: "การไฟฟ้านครหลวง", en: "Metropolitan Electricity Authority (MEA)" },
    category: "network-and-security",
    archetype: "cybersecurity",
    complexity: "enterprise",
    month: "2026-08",
    postedAt: "2026-08-17",
    status: "Open",
    referencePriceTHB: 18_900_000,
    peerMedianTHB: 14_500_000,
    peerAverageTHB: 15_800_000,
    lockSpecScore: 70,
    lockSpecLevel: "high",
    triggers: [
      {
        category: "Vendor Lock-in",
        summary: {
          th: "กำหนดใบรับรองตัวแทนจำหน่ายระดับสูงสุด (Platinum Partner MAF) ในงานจ้างบริการ",
          en: "Demands OEM Platinum Partner MAF letter on security service contract",
        },
        clauseExcerpt: "ผู้เสนอราคาต้องมีหนังสือแต่งตั้งตัวแทนจำหน่ายระดับสูงสุดจากผู้ผลิตโดยตรง",
      },
      {
        category: "Specification Tailoring",
        summary: {
          th: "ระบุรุ่นซอฟต์แวร์จัดการล็อกเฉพาะยี่ห้อโดยไม่มีคำว่า “หรือเทียบเท่า”",
          en: "Specifies proprietary SIEM log appliance without “or equivalent”",
        },
        clauseExcerpt: "ต้องเชื่อมต่อกับระบบจัดการ Log รุ่นเฉพาะที่กำหนดโดยไม่รับพิจารณาผลิตภัณฑ์เทียบเท่า",
      },
    ],
  },

  // --- 2026-09 ---
  {
    id: "DGA-2569-0388",
    egpRef: "69099012390",
    title: {
      th: "จ้างพัฒนาระบบแลกเปลี่ยนข้อมูลกลางภาครัฐ (Government Data Exchange) ระยะที่ 2",
      en: "Government Data Exchange (GDX) API and catalog platform, phase 2",
    },
    agency: { th: "สำนักงานพัฒนารัฐบาลดิจิทัล (องค์การมหาชน)", en: "Digital Government Development Agency (DGA)" },
    category: "systems-integration",
    archetype: "data-analytics",
    complexity: "enterprise",
    month: "2026-09",
    postedAt: "2026-09-05",
    status: "Open",
    referencePriceTHB: 13_200_000,
    peerMedianTHB: 13_000_000,
    peerAverageTHB: 14_100_000,
    lockSpecScore: 0,
    lockSpecLevel: "low",
    triggers: [],
  },
  {
    id: "DOPA-2569-0401",
    egpRef: "69099044912",
    title: {
      th: "จ้างพัฒนาระบบบริการนัดหมายและยื่นคำร้องงานทะเบียนออนไลน์ระดับอำเภอ",
      en: "District-level civil registration online appointment and filing system",
    },
    agency: { th: "กรมการปกครอง", en: "Department of Provincial Administration" },
    category: "software-development",
    archetype: "web-portal",
    complexity: "standard",
    month: "2026-09",
    postedAt: "2026-09-18",
    status: "Draft",
    referencePriceTHB: 7_900_000,
    peerMedianTHB: 5_900_000,
    peerAverageTHB: 6_350_000,
    lockSpecScore: 70,
    lockSpecLevel: "high",
    triggers: [
      {
        category: "Qualification Barrier",
        summary: {
          th: "กำหนดผลงานสัญญาเดี่ยวไม่น้อยกว่า 5.5 ล้านบาท (69.6% ของราคากลาง)",
          en: "Requires single prior contract ≥ ฿5.5M (69.6% of reference price)",
        },
        clauseExcerpt: "ต้องมีผลงานพัฒนาระบบบริการประชาชนให้ส่วนราชการในสัญญาเดียวไม่น้อยกว่า 5,500,000 บาท",
      },
      {
        category: "Specification Tailoring",
        summary: {
          th: "ล็อกเวอร์ชัน Oracle Database 19c และ Windows Server 2019 โดยไม่มี “หรือเทียบเท่า”",
          en: "Locks Oracle Database 19c and Windows Server 2019 without “or equivalent”",
        },
        clauseExcerpt: "ต้องพัฒนาให้ทำงานบน Oracle Database 19c และ Windows Server 2019 เท่านั้น",
      },
    ],
  },
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

