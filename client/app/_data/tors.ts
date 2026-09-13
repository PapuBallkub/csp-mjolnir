/**
 * Fixture data for the mockups.
 *
 * Shaped against the normalized TOR schema in FR05 — every field here is one a
 * real record would carry after the OCR/LLM pass, so a mockup screen can never
 * quietly depend on data the pipeline won't produce. Content is drawn from the
 * proposal's own examples (NGINX Plus, Windows Server 2019, ราคากลาง, the
 * 0.20%/day delay penalty) rather than placeholder copy, to keep the layouts
 * honest about real density and Thai/English mixing.
 */

export type Lang = "th" | "en";

/** A bilingual string. Source content is Thai; English is the plain-language gloss. */
export type Bi = { th: string; en: string };

export function pick(value: Bi, lang: Lang): string {
  return lang === "th" ? value.th : value.en;
}

export type Status = "open" | "amended" | "closed";
export type RiskLevel = "low" | "medium" | "high";
export type PriceVerdict = "under" | "fair" | "over";
/** How big a team the scope realistically needs — drives the US11 filter. */
export type ScopeSize = "solo" | "small-team" | "firm";
export type SourceFormat = "scanned-pdf" | "html" | "json" | "image";

export type LockSpecReason = {
  /** What kind of problem this is, so a reader can sort findings at a glance. */
  tag: Bi;
  /** The verdict, in plain language. Stated first, before the evidence. */
  verdict: Bi;
  /** The clause as it appears in the source document. */
  clauseTh: string;
  /** Where it came from, so the claim stays checkable. */
  source: string;
  /** What comparable TORs ask for instead. */
  baseline: Bi;
};

export type Comparable = {
  id: string;
  title: Bi;
  agency: Bi;
  year: number;
  budget: number;
  note?: Bi;
};

export type AmendmentChange = {
  kind: "added" | "removed" | "changed";
  field: Bi;
  before?: string;
  after?: string;
};

export type Amendment = {
  round: Bi;
  date: string;
  headline: Bi;
  /** Empty for the original posting. */
  changes: AmendmentChange[];
};

export type Tor = {
  id: string;
  egpRef: string;
  title: Bi;
  agency: Bi;
  /** Sub-unit or district, where the source names one. */
  unit?: Bi;
  /** ราคากลาง — the reference/maximum price. */
  budget: number;
  deadline: string;
  postedAt: string;
  techStack: string[];
  penalty: Bi;
  status: Status;
  awardedTo?: Bi;
  awardedAmount?: number;
  scopeSize: ScopeSize;
  /** Eligible for the government's SME set-aside advantage. */
  smeAdvantage: boolean;
  summary: Bi[];
  deliverables: Bi[];
  lockSpec: {
    level: RiskLevel;
    /** 0–100. Higher means more unusual versus comparable TORs. */
    score: number;
    reasons: LockSpecReason[];
  };
  price: {
    verdict: PriceVerdict;
    /** Historical median for comparable scopes (FR12). */
    median: number;
    sampleSize: number;
    comparables: Comparable[];
    note: Bi;
  };
  amendments: Amendment[];
  /** Admin-only (FR15). */
  confidence: { ocr: number; extraction: number; lowFields: string[] };
  source: { format: SourceFormat; pages: number; portal: string; url: string };
};

/**
 * Fixed "today" so every relative date in the mockups is deterministic —
 * server and client render the same string, and screenshots stay stable.
 */
export const TODAY = "2026-08-12";

const CATALOG: Tor[] = [
  {
    id: "BMA-2569-0142",
    egpRef: "69069041234",
    title: {
      th: "จ้างพัฒนาระบบบริหารจัดการข้อมูลน้ำท่วมและระบบเตือนภัยล่วงหน้า ระยะที่ 2",
      en: "Flood data management and early-warning system, phase 2",
    },
    agency: { th: "สำนักการระบายน้ำ", en: "Department of Drainage and Sewerage" },
    unit: { th: "กองสารสนเทศระบายน้ำ", en: "Drainage Information Division" },
    budget: 12_400_000,
    deadline: "2026-09-04",
    postedAt: "2026-06-30",
    techStack: [
      "NGINX Plus",
      "Windows Server 2019",
      "Oracle Database 19c",
      ".NET 6",
      "Power BI",
    ],
    penalty: { th: "ค่าปรับร้อยละ 0.20 ต่อวัน", en: "0.20% of contract value per day late" },
    status: "amended",
    scopeSize: "firm",
    smeAdvantage: false,
    summary: [
      {
        th: "ต่อยอดระบบเดิมจากระยะที่ 1 โดยเพิ่มการพยากรณ์ระดับน้ำรายชั่วโมงจากสถานีตรวจวัด 214 จุด",
        en: "Extends the phase-1 system with hourly water-level forecasting from 214 sensor stations.",
      },
      {
        th: "ต้องเชื่อมต่อกับระบบเดิมของสำนักการระบายน้ำที่ใช้ Oracle 19c บน Windows Server",
        en: "Must integrate with the department's existing Oracle 19c / Windows Server stack.",
      },
      {
        th: "ระยะเวลาดำเนินการ 300 วัน นับถัดจากวันลงนามในสัญญา",
        en: "300 days from contract signing.",
      },
    ],
    deliverables: [
      { th: "ระบบพยากรณ์และแดชบอร์ดติดตามสถานการณ์น้ำ", en: "Forecasting engine and situation dashboard" },
      { th: "แอปพลิเคชันแจ้งเตือนสำหรับเจ้าหน้าที่ภาคสนาม", en: "Field-officer alerting app" },
      { th: "การฝึกอบรมเจ้าหน้าที่ 3 รุ่น และรับประกันผลงาน 2 ปี", en: "Three training cohorts plus a 2-year warranty" },
    ],
    lockSpec: {
      level: "high",
      score: 87,
      reasons: [
        {
          tag: { th: "คุณสมบัติผู้เสนอราคา", en: "Bidder qualification" },
          verdict: {
            th: "ขอประสบการณ์ 10 ปี กับผลิตภัณฑ์ที่เพิ่งมีใช้ในราชการไทยราว 3 ปี",
            en: "Requires 10 years of experience with a product Thai agencies have only used for about 3.",
          },
          clauseTh:
            "ผู้เสนอราคาต้องมีประสบการณ์ติดตั้งและดูแลระบบ NGINX Plus ให้แก่หน่วยงานราชการไทย ไม่น้อยกว่า 10 ปี",
          source: "หน้า 14 · ข้อ 3.2.4",
          baseline: {
            th: "TOR ที่เทียบเคียงได้ 11 ฉบับ ขอประสบการณ์เฉลี่ย 3 ปี และไม่มีฉบับใดเกิน 5 ปี",
            en: "Across 11 comparable TORs the average ask is 3 years, and none exceeds 5.",
          },
        },
        {
          tag: { th: "สเปกผูกยี่ห้อ", en: "Brand-locked spec" },
          verdict: {
            th: "ตัดคำว่า “หรือเทียบเท่า” ออก ทำให้เหลือผู้ผลิตรายเดียวที่เสนอได้",
            en: "The “or equivalent” wording was removed, leaving exactly one qualifying vendor.",
          },
          clauseTh:
            "ต้องมีหนังสือรับรองการเป็นตัวแทนจำหน่ายอย่างเป็นทางการจากผู้ผลิต NGINX Plus ในประเทศไทย",
          source: "หน้า 15 · ข้อ 3.3.1",
          baseline: {
            th: "8 ใน 11 ฉบับที่เทียบเคียงได้ ยังคงข้อความ “หรือเทียบเท่า” ไว้",
            en: "8 of 11 comparable TORs keep an “or equivalent” clause.",
          },
        },
        {
          tag: { th: "ข้อกำหนดทางการเงิน", en: "Financial threshold" },
          verdict: {
            th: "ทุนจดทะเบียนที่กำหนดสูงกว่าค่างานเกือบ 2.5 เท่า",
            en: "The registered-capital floor is nearly 2.5× the project's own budget.",
          },
          clauseTh: "ผู้เสนอราคาต้องมีทุนจดทะเบียนชำระแล้วไม่น้อยกว่า 30,000,000 บาท",
          source: "หน้า 9 · ข้อ 2.1.3",
          baseline: {
            th: "งานช่วงงบ 10–15 ล้านบาท ปกติกำหนดทุนจดทะเบียนราว 5 ล้านบาท",
            en: "Projects in the ฿10–15M band typically ask for about ฿5M.",
          },
        },
      ],
    },
    price: {
      verdict: "over",
      median: 8_900_000,
      sampleSize: 11,
      note: {
        th: "สูงกว่าค่ากลางของงานลักษณะเดียวกัน 39% โดยขอบเขตงานใกล้เคียงกับระยะที่ 1 ซึ่งทำที่ 7.6 ล้านบาท",
        en: "39% above the median for comparable scopes — and the scope closely mirrors phase 1, which was delivered for ฿7.6M.",
      },
      comparables: [
        {
          id: "BMA-2567-0311",
          title: { th: "ระบบบริหารจัดการข้อมูลน้ำท่วม ระยะที่ 1", en: "Flood data management system, phase 1" },
          agency: { th: "สำนักการระบายน้ำ", en: "Drainage and Sewerage" },
          year: 2024,
          budget: 7_600_000,
          note: { th: "ขอบเขตงานใกล้เคียงที่สุด", en: "Closest comparable scope" },
        },
        {
          id: "BMA-2568-0077",
          title: { th: "ระบบเฝ้าระวังคุณภาพน้ำคลอง", en: "Canal water-quality monitoring system" },
          agency: { th: "สำนักการระบายน้ำ", en: "Drainage and Sewerage" },
          year: 2025,
          budget: 9_200_000,
        },
        {
          id: "BMA-2568-0154",
          title: { th: "ระบบเตือนภัยพิบัติเมือง", en: "Urban disaster warning system" },
          agency: { th: "สำนักป้องกันและบรรเทาสาธารณภัย", en: "Fire and Rescue" },
          year: 2025,
          budget: 10_100_000,
        },
        {
          id: "BMA-2569-0019",
          title: { th: "ระบบพยากรณ์ปริมาณน้ำฝนรายพื้นที่", en: "Localised rainfall forecasting system" },
          agency: { th: "สำนักการระบายน้ำ", en: "Drainage and Sewerage" },
          year: 2026,
          budget: 8_400_000,
        },
      ],
    },
    amendments: [
      {
        round: { th: "ประกาศร่าง TOR ครั้งที่ 2", en: "Draft TOR, round 2" },
        date: "2026-07-28",
        headline: {
          th: "คุณสมบัติผู้เสนอราคาถูกยกระดับขึ้นมาก และตัดทางเลือกสินค้าเทียบเท่าออก",
          en: "Bidder qualifications were raised sharply and the equivalent-product option was removed.",
        },
        changes: [
          {
            kind: "changed",
            field: { th: "ประสบการณ์ระบบ NGINX Plus", en: "NGINX Plus experience" },
            before: "ไม่น้อยกว่า 3 ปี",
            after: "ไม่น้อยกว่า 10 ปี",
          },
          {
            kind: "changed",
            field: { th: "ทุนจดทะเบียนชำระแล้ว", en: "Paid-up registered capital" },
            before: "ไม่น้อยกว่า 10,000,000 บาท",
            after: "ไม่น้อยกว่า 30,000,000 บาท",
          },
          {
            kind: "removed",
            field: { th: "ข้อความ “หรือเทียบเท่า” ในข้อกำหนดซอฟต์แวร์", en: "“or equivalent” in the software spec" },
            before: "NGINX Plus หรือเทียบเท่า",
          },
          {
            kind: "added",
            field: { th: "หนังสือรับรองตัวแทนจำหน่าย", en: "Authorised-reseller certificate" },
            after: "ต้องมีหนังสือรับรองการเป็นตัวแทนจำหน่ายอย่างเป็นทางการจากผู้ผลิต",
          },
          {
            kind: "changed",
            field: { th: "กำหนดยื่นข้อเสนอ", en: "Submission deadline" },
            before: "20 สิงหาคม 2569",
            after: "4 กันยายน 2569",
          },
        ],
      },
      {
        round: { th: "ประกาศร่าง TOR ครั้งที่ 1", en: "Draft TOR, round 1" },
        date: "2026-06-30",
        headline: { th: "ประกาศฉบับแรก", en: "First posting" },
        changes: [],
      },
    ],
    confidence: { ocr: 0.71, extraction: 0.64, lowFields: ["ราคากลาง", "Required Tech Stack"] },
    source: {
      format: "scanned-pdf",
      pages: 47,
      portal: "e-GP (กรมบัญชีกลาง)",
      url: "https://process3.gprocurement.go.th/",
    },
  },

  {
    id: "BMA-2569-0217",
    egpRef: "69079052210",
    title: {
      th: "จ้างพัฒนาเว็บไซต์ศูนย์ข้อมูลเปิดภาครัฐกรุงเทพมหานคร (Open Data Portal)",
      en: "Bangkok open-data portal",
    },
    agency: { th: "สำนักยุทธศาสตร์และประเมินผล", en: "Strategy and Evaluation Department" },
    unit: { th: "กองสารสนเทศภูมิศาสตร์", en: "Geographic Information Division" },
    budget: 1_850_000,
    deadline: "2026-08-18",
    postedAt: "2026-07-21",
    techStack: ["React", "Node.js", "PostgreSQL", "CKAN", "Docker"],
    penalty: { th: "ค่าปรับร้อยละ 0.20 ต่อวัน", en: "0.20% of contract value per day late" },
    status: "open",
    scopeSize: "small-team",
    smeAdvantage: true,
    summary: [
      {
        th: "พัฒนาเว็บไซต์เปิดเผยชุดข้อมูลของ กทม. พร้อมระบบค้นหาและ API สำหรับนักพัฒนา",
        en: "Build a public dataset portal with search and a developer API.",
      },
      {
        th: "รองรับชุดข้อมูลเริ่มต้น 120 ชุด และต้องนำเข้าข้อมูลจากระบบเดิมได้",
        en: "Ships with 120 datasets and must import from the current system.",
      },
      { th: "ระยะเวลาดำเนินการ 180 วัน", en: "180 days." },
    ],
    deliverables: [
      { th: "เว็บไซต์พร้อมระบบจัดการชุดข้อมูล", en: "Portal with dataset management" },
      { th: "REST API และเอกสารประกอบสำหรับนักพัฒนา", en: "REST API with developer docs" },
      { th: "คู่มือและอบรมผู้ดูแลระบบ 1 รุ่น", en: "Admin manual and one training cohort" },
    ],
    lockSpec: {
      level: "low",
      score: 18,
      reasons: [
        {
          tag: { th: "ผลงานย้อนหลัง", en: "Past-work threshold" },
          verdict: {
            th: "ข้อกำหนดอยู่ในเกณฑ์ปกติ มีเพียงการขอผลงานย้อนหลังที่สูงกว่าค่ากลางเล็กน้อย",
            en: "Requirements are unremarkable; only the past-work threshold sits slightly above the norm.",
          },
          clauseTh: "ต้องมีผลงานพัฒนาเว็บไซต์ให้หน่วยงานภาครัฐ วงเงินไม่น้อยกว่า 900,000 บาท",
          source: "หน้า 7 · ข้อ 2.2.1",
          baseline: {
            th: "งานช่วงงบเดียวกันมักกำหนดผลงานย้อนหลังราว 700,000 บาท",
            en: "Comparable projects usually ask for about ฿700,000.",
          },
        },
      ],
    },
    price: {
      verdict: "fair",
      median: 1_700_000,
      sampleSize: 9,
      note: {
        th: "สูงกว่าค่ากลาง 9% ซึ่งอยู่ในช่วงปกติของงานลักษณะนี้",
        en: "9% above median — within the normal band for this kind of work.",
      },
      comparables: [
        {
          id: "BMA-2568-0402",
          title: { th: "เว็บไซต์ศูนย์ข้อมูลสำนักอนามัย", en: "Health Department data portal" },
          agency: { th: "สำนักอนามัย", en: "Health Department" },
          year: 2025,
          budget: 1_620_000,
        },
        {
          id: "BMA-2568-0288",
          title: { th: "ปรับปรุงเว็บไซต์หลักกรุงเทพมหานคร", en: "Main BMA website refresh" },
          agency: { th: "สำนักงานประชาสัมพันธ์", en: "Public Relations Office" },
          year: 2025,
          budget: 1_780_000,
        },
        {
          id: "BMA-2567-0175",
          title: { th: "ระบบเผยแพร่ข้อมูลสถิติเมือง", en: "City statistics publishing system" },
          agency: { th: "สำนักยุทธศาสตร์และประเมินผล", en: "Strategy and Evaluation" },
          year: 2024,
          budget: 1_450_000,
        },
      ],
    },
    amendments: [
      {
        round: { th: "ประกาศร่าง TOR ครั้งที่ 1", en: "Draft TOR, round 1" },
        date: "2026-07-21",
        headline: { th: "ประกาศฉบับแรก", en: "First posting" },
        changes: [],
      },
    ],
    confidence: { ocr: 0.96, extraction: 0.93, lowFields: [] },
    source: {
      format: "json",
      pages: 18,
      portal: "e-GP API",
      url: "https://process3.gprocurement.go.th/",
    },
  },

  {
    id: "BMA-2569-0233",
    egpRef: "69079053901",
    title: {
      th: "จ้างพัฒนาระบบจองคิวออนไลน์สำหรับงานทะเบียนราษฎร สำนักงานเขตบางรัก",
      en: "Online queue booking for civil-registration services, Bang Rak district",
    },
    agency: { th: "สำนักงานเขตบางรัก", en: "Bang Rak District Office" },
    budget: 890_000,
    deadline: "2026-08-24",
    postedAt: "2026-07-25",
    techStack: ["Next.js", "Node.js", "MySQL", "LINE Messaging API"],
    penalty: { th: "ค่าปรับร้อยละ 0.20 ต่อวัน", en: "0.20% of contract value per day late" },
    status: "open",
    scopeSize: "solo",
    smeAdvantage: true,
    summary: [
      {
        th: "ระบบจองคิวล่วงหน้าผ่านเว็บและ LINE พร้อมหน้าจอเรียกคิวที่สำนักงานเขต",
        en: "Web and LINE queue booking, plus an in-office calling display.",
      },
      {
        th: "ขอบเขตงานเล็ก เหมาะกับนักพัฒนาอิสระหรือทีมขนาด 1–2 คน",
        en: "Small scope — realistic for a freelancer or a one-to-two person team.",
      },
      { th: "ระยะเวลาดำเนินการ 120 วัน", en: "120 days." },
    ],
    deliverables: [
      { th: "เว็บจองคิวและ LINE Official Account", en: "Booking site and LINE official account" },
      { th: "จอแสดงคิวและระบบหลังบ้านสำหรับเจ้าหน้าที่", en: "Queue display and staff back office" },
    ],
    lockSpec: {
      level: "low",
      score: 12,
      reasons: [
        {
          tag: { th: "ผลงานย้อนหลัง", en: "Past-work threshold" },
          verdict: {
            th: "ไม่พบข้อกำหนดที่ผิดปกติ เปิดกว้างสำหรับผู้เสนอราคารายใหม่",
            en: "Nothing unusual — the requirements are open to first-time bidders.",
          },
          clauseTh: "ผู้เสนอราคาต้องมีผลงานพัฒนาระบบสารสนเทศ ไม่น้อยกว่า 1 ผลงาน",
          source: "หน้า 5 · ข้อ 2.1.2",
          baseline: {
            th: "ตรงกับค่ากลางของงานช่วงงบต่ำกว่า 1 ล้านบาท",
            en: "Matches the norm for sub-฿1M projects.",
          },
        },
      ],
    },
    price: {
      verdict: "fair",
      median: 760_000,
      sampleSize: 7,
      note: {
        th: "สูงกว่าค่ากลาง 17% ส่วนต่างอธิบายได้จากการเชื่อมต่อ LINE ที่งานอื่นไม่มี",
        en: "17% above median, explained by the LINE integration the comparables don't include.",
      },
      comparables: [
        {
          id: "BMA-2568-0356",
          title: { th: "ระบบจองคิวสำนักงานเขตห้วยขวาง", en: "Huai Khwang queue system" },
          agency: { th: "สำนักงานเขตห้วยขวาง", en: "Huai Khwang District" },
          year: 2025,
          budget: 720_000,
        },
        {
          id: "BMA-2568-0399",
          title: { th: "ระบบนัดหมายออนไลน์ศูนย์บริการสาธารณสุข", en: "Health-centre appointment system" },
          agency: { th: "สำนักอนามัย", en: "Health Department" },
          year: 2025,
          budget: 810_000,
        },
        {
          id: "BMA-2567-0244",
          title: { th: "ระบบคิวงานทะเบียนเขตสาทร", en: "Sathon registration queue system" },
          agency: { th: "สำนักงานเขตสาทร", en: "Sathon District" },
          year: 2024,
          budget: 640_000,
        },
      ],
    },
    amendments: [
      {
        round: { th: "ประกาศร่าง TOR ครั้งที่ 1", en: "Draft TOR, round 1" },
        date: "2026-07-25",
        headline: { th: "ประกาศฉบับแรก", en: "First posting" },
        changes: [],
      },
    ],
    confidence: { ocr: 0.94, extraction: 0.9, lowFields: [] },
    source: {
      format: "html",
      pages: 12,
      portal: "eGP BMA2",
      url: "https://bmaegp.bangkok.go.th/",
    },
  },

  {
    id: "BMA-2569-0245",
    egpRef: "69089061077",
    title: {
      th: "จ้างพัฒนาแอปพลิเคชันรับแจ้งปัญหาเมือง เชื่อมต่อระบบ Traffy Fondue",
      en: "City-issue reporting app with Traffy Fondue integration",
    },
    agency: { th: "สำนักการโยธา", en: "Public Works Department" },
    budget: 3_200_000,
    deadline: "2026-08-14",
    postedAt: "2026-07-09",
    techStack: ["Flutter", "Firebase", "REST API", "PostgreSQL"],
    penalty: { th: "ค่าปรับร้อยละ 0.20 ต่อวัน", en: "0.20% of contract value per day late" },
    status: "amended",
    scopeSize: "small-team",
    smeAdvantage: true,
    summary: [
      {
        th: "แอปมือถือสำหรับประชาชนแจ้งปัญหา พร้อมส่งต่อเรื่องเข้าระบบ Traffy Fondue เดิม",
        en: "A citizen reporting app that forwards cases into the existing Traffy Fondue system.",
      },
      {
        th: "ต้องรองรับทั้ง iOS และ Android และใช้งานได้ในพื้นที่สัญญาณต่ำ",
        en: "iOS and Android, and must work on weak connections.",
      },
      { th: "ระยะเวลาดำเนินการ 210 วัน", en: "210 days." },
    ],
    deliverables: [
      { th: "แอปพลิเคชัน iOS และ Android", en: "iOS and Android apps" },
      { th: "ระบบหลังบ้านและการเชื่อมต่อ API กับ Traffy Fondue", en: "Back office and Traffy Fondue API integration" },
    ],
    lockSpec: {
      level: "medium",
      score: 54,
      reasons: [
        {
          tag: { th: "ผลงานเฉพาะทาง", en: "Niche experience" },
          verdict: {
            th: "ขอผลงานที่ต้องเคยเชื่อมต่อ Traffy Fondue มาก่อน ซึ่งมีผู้ผ่านเกณฑ์ไม่กี่ราย",
            en: "Demands prior Traffy Fondue integration work — a bar only a handful of vendors clear.",
          },
          clauseTh:
            "ผู้เสนอราคาต้องมีผลงานเชื่อมต่อระบบ Traffy Fondue กับหน่วยงานภาครัฐ ไม่น้อยกว่า 1 ผลงาน",
          source: "หน้า 8 · ข้อ 2.3.1",
          baseline: {
            th: "งานเชื่อมต่อ API ลักษณะเดียวกันมักระบุเพียง “ผลงานเชื่อมต่อ API กับระบบภายนอก”",
            en: "Comparable integrations usually just ask for “experience integrating an external API”.",
          },
        },
        {
          tag: { th: "ขอบเขตกับเวลา", en: "Scope vs schedule" },
          verdict: {
            th: "กำหนดส่งมอบภายใน 210 วัน แต่เพิ่มขอบเขตงานในการแก้ไขครั้งที่ 2 โดยไม่ขยายเวลา",
            en: "Round 2 added scope without moving the 210-day delivery date.",
          },
          clauseTh: "เพิ่มข้อกำหนดการรองรับภาษาอังกฤษและภาษาจีน โดยคงระยะเวลาดำเนินการเดิม",
          source: "หน้า 11 · ข้อ 4.1",
          baseline: {
            th: "การเพิ่มสองภาษาในงานลักษณะนี้มักขยายเวลาอย่างน้อย 30 วัน",
            en: "Adding two languages typically extends the schedule by at least 30 days.",
          },
        },
      ],
    },
    price: {
      verdict: "fair",
      median: 3_050_000,
      sampleSize: 6,
      note: {
        th: "ใกล้เคียงค่ากลาง แต่ควรคิดต้นทุนงานสองภาษาที่เพิ่มเข้ามาในการแก้ไขครั้งที่ 2",
        en: "Close to median — but price in the bilingual scope added in round 2.",
      },
      comparables: [
        {
          id: "BMA-2568-0201",
          title: { th: "แอปแจ้งเหตุสาธารณภัย", en: "Emergency reporting app" },
          agency: { th: "สำนักป้องกันและบรรเทาสาธารณภัย", en: "Fire and Rescue" },
          year: 2025,
          budget: 2_950_000,
        },
        {
          id: "BMA-2568-0117",
          title: { th: "แอปบริการประชาชนสำนักงานเขต", en: "District services app" },
          agency: { th: "สำนักงานเขตจตุจักร", en: "Chatuchak District" },
          year: 2025,
          budget: 3_150_000,
        },
      ],
    },
    amendments: [
      {
        round: { th: "ประกาศร่าง TOR ครั้งที่ 2", en: "Draft TOR, round 2" },
        date: "2026-08-01",
        headline: {
          th: "เพิ่มขอบเขตงานรองรับสองภาษา โดยไม่ขยายระยะเวลาดำเนินการ",
          en: "Bilingual support added to the scope, with no extra time granted.",
        },
        changes: [
          {
            kind: "added",
            field: { th: "ภาษาที่รองรับ", en: "Supported languages" },
            after: "เพิ่มภาษาอังกฤษและภาษาจีน",
          },
          {
            kind: "changed",
            field: { th: "จำนวนผู้ใช้งานพร้อมกัน", en: "Concurrent users" },
            before: "รองรับ 5,000 ราย",
            after: "รองรับ 12,000 ราย",
          },
        ],
      },
      {
        round: { th: "ประกาศร่าง TOR ครั้งที่ 1", en: "Draft TOR, round 1" },
        date: "2026-07-09",
        headline: { th: "ประกาศฉบับแรก", en: "First posting" },
        changes: [],
      },
    ],
    confidence: { ocr: 0.88, extraction: 0.82, lowFields: ["Submission Deadline"] },
    source: {
      format: "scanned-pdf",
      pages: 31,
      portal: "eGP BMA2",
      url: "https://bmaegp.bangkok.go.th/",
    },
  },

  {
    id: "BMA-2569-0121",
    egpRef: "69069038812",
    title: {
      th: "จัดหาระบบกล้องโทรทัศน์วงจรปิดพร้อมระบบวิเคราะห์ภาพด้วยปัญญาประดิษฐ์ 12 แยกหลัก",
      en: "CCTV system with AI video analytics across 12 major junctions",
    },
    agency: { th: "สำนักการจราจรและขนส่ง", en: "Traffic and Transportation Department" },
    budget: 48_000_000,
    deadline: "2026-09-15",
    postedAt: "2026-06-12",
    techStack: ["NVIDIA DeepStream", "Milestone XProtect", "Ubuntu Server 22.04", "Kubernetes"],
    penalty: { th: "ค่าปรับร้อยละ 0.20 ต่อวัน", en: "0.20% of contract value per day late" },
    status: "open",
    scopeSize: "firm",
    smeAdvantage: false,
    summary: [
      {
        th: "ติดตั้งกล้อง 240 ตัว พร้อมระบบวิเคราะห์ภาพนับปริมาณรถและตรวจจับอุบัติเหตุ",
        en: "240 cameras plus analytics for vehicle counting and incident detection.",
      },
      {
        th: "งานมีองค์ประกอบฮาร์ดแวร์และงานติดตั้งภาคสนามเป็นสัดส่วนหลัก",
        en: "Mostly hardware supply and field installation.",
      },
      { th: "ระยะเวลาดำเนินการ 365 วัน", en: "365 days." },
    ],
    deliverables: [
      { th: "กล้องและอุปกรณ์เครือข่ายพร้อมติดตั้ง", en: "Cameras and network equipment, installed" },
      { th: "ศูนย์ควบคุมและระบบวิเคราะห์ภาพ", en: "Control centre and analytics platform" },
    ],
    lockSpec: {
      level: "high",
      score: 79,
      reasons: [
        {
          tag: { th: "สเปกผูกยี่ห้อ", en: "Brand-locked spec" },
          verdict: {
            th: "ระบุยี่ห้อซอฟต์แวร์บริหารกล้องโดยตรง ไม่เปิดทางเลือกเทียบเท่า",
            en: "Names a specific video-management product with no equivalent option.",
          },
          clauseTh: "ระบบบริหารจัดการกล้องต้องเป็น Milestone XProtect Corporate เท่านั้น",
          source: "หน้า 22 · ข้อ 5.1.1",
          baseline: {
            th: "งาน CCTV ภาครัฐส่วนใหญ่ระบุคุณสมบัติเชิงเทคนิคแทนการระบุยี่ห้อ",
            en: "Most public CCTV TORs specify capabilities rather than a brand.",
          },
        },
        {
          tag: { th: "ผลงานย้อนหลัง", en: "Past-work threshold" },
          verdict: {
            th: "ขอผลงานติดตั้งกล้องขนาด 200 ตัวขึ้นไปในกรุงเทพฯ ซึ่งมีผู้ผ่านเกณฑ์เพียง 2–3 ราย",
            en: "Requires a 200+ camera Bangkok deployment — only two or three vendors qualify.",
          },
          clauseTh:
            "ต้องมีผลงานติดตั้งระบบกล้องโทรทัศน์วงจรปิดไม่น้อยกว่า 200 ตัว ในพื้นที่กรุงเทพมหานคร",
          source: "หน้า 10 · ข้อ 2.4.2",
          baseline: {
            th: "งบประมาณระดับเดียวกันมักกำหนดผลงาน 80–100 ตัว และไม่จำกัดพื้นที่",
            en: "Similar budgets usually ask for 80–100 cameras with no location restriction.",
          },
        },
      ],
    },
    price: {
      verdict: "over",
      median: 31_000_000,
      sampleSize: 8,
      note: {
        th: "สูงกว่าค่ากลาง 55% ต่อจำนวนกล้องเท่ากัน ราคาต่อจุดสูงกว่างานปี 2568 ราว 1.6 เท่า",
        en: "55% above median for the same camera count — about 1.6× the per-camera price of 2025 awards.",
      },
      comparables: [
        {
          id: "BMA-2568-0043",
          title: { th: "ระบบกล้อง CCTV 15 แยก พร้อมศูนย์ควบคุม", en: "CCTV for 15 junctions with control centre" },
          agency: { th: "สำนักการจราจรและขนส่ง", en: "Traffic and Transportation" },
          year: 2025,
          budget: 33_500_000,
        },
        {
          id: "BMA-2567-0092",
          title: { th: "ระบบกล้องตรวจจับการฝ่าฝืนสัญญาณไฟ", en: "Red-light violation camera system" },
          agency: { th: "สำนักการจราจรและขนส่ง", en: "Traffic and Transportation" },
          year: 2024,
          budget: 28_700_000,
        },
        {
          id: "BMA-2568-0261",
          title: { th: "ระบบกล้องความปลอดภัยสวนสาธารณะ", en: "Public-park security camera system" },
          agency: { th: "สำนักสิ่งแวดล้อม", en: "Environment Department" },
          year: 2025,
          budget: 24_900_000,
        },
      ],
    },
    amendments: [
      {
        round: { th: "ประกาศร่าง TOR ครั้งที่ 1", en: "Draft TOR, round 1" },
        date: "2026-06-12",
        headline: { th: "ประกาศฉบับแรก", en: "First posting" },
        changes: [],
      },
    ],
    confidence: { ocr: 0.79, extraction: 0.74, lowFields: ["Required Tech Stack"] },
    source: {
      format: "scanned-pdf",
      pages: 62,
      portal: "e-GP (กรมบัญชีกลาง)",
      url: "https://process3.gprocurement.go.th/",
    },
  },

  {
    id: "BMA-2569-0088",
    egpRef: "69059031140",
    title: {
      th: "จ้างพัฒนาระบบสารสนเทศโรงพยาบาลในสังกัดกรุงเทพมหานคร ระยะที่ 1",
      en: "Hospital information system for BMA hospitals, phase 1",
    },
    agency: { th: "สำนักการแพทย์", en: "Medical Service Department" },
    budget: 22_000_000,
    deadline: "2026-08-28",
    postedAt: "2026-05-19",
    techStack: ["HL7 FHIR", "Java Spring Boot", "PostgreSQL", "Kubernetes", "Keycloak"],
    penalty: { th: "ค่าปรับร้อยละ 0.20 ต่อวัน", en: "0.20% of contract value per day late" },
    status: "open",
    scopeSize: "firm",
    smeAdvantage: false,
    summary: [
      {
        th: "พัฒนาระบบสารสนเทศโรงพยาบาลสำหรับ 4 โรงพยาบาลในสังกัด พร้อมย้ายข้อมูลผู้ป่วยเดิม",
        en: "Hospital information system for four hospitals, including patient-data migration.",
      },
      {
        th: "ต้องผ่านมาตรฐาน HL7 FHIR และเชื่อมต่อระบบประกันสุขภาพแห่งชาติ",
        en: "Must meet HL7 FHIR and connect to the national health-insurance system.",
      },
      { th: "ระยะเวลาดำเนินการ 540 วัน", en: "540 days." },
    ],
    deliverables: [
      { th: "ระบบ HIS พร้อมโมดูลผู้ป่วยนอกและผู้ป่วยใน", en: "HIS with outpatient and inpatient modules" },
      { th: "การย้ายข้อมูลผู้ป่วยเดิม 1.2 ล้านราย", en: "Migration of 1.2M existing patient records" },
    ],
    lockSpec: {
      level: "high",
      score: 71,
      reasons: [
        {
          tag: { th: "ขอบเขตกับงบประมาณ", en: "Scope vs budget" },
          verdict: {
            th: "ขอบเขตงานใหญ่กว่างบประมาณอย่างมีนัยสำคัญ เสี่ยงขาดทุนตั้งแต่เซ็นสัญญา",
            en: "The scope materially outruns the budget — a losing contract from the day it is signed.",
          },
          clauseTh:
            "ครอบคลุมโรงพยาบาล 4 แห่ง ผู้ใช้งาน 2,800 ราย และย้ายข้อมูลผู้ป่วยเดิม 1,200,000 ราย ภายในวงเงิน 22,000,000 บาท",
          source: "หน้า 6 · ข้อ 1.4",
          baseline: {
            th: "งาน HIS ขนาดใกล้เคียงกันในปี 2567–2568 อยู่ที่ 32–38 ล้านบาท",
            en: "Comparable HIS projects in 2024–2025 landed between ฿32M and ฿38M.",
          },
        },
        {
          tag: { th: "บุคลากรที่กำหนด", en: "Required staffing" },
          verdict: {
            th: "กำหนดให้ต้องมีบุคลากรที่ได้รับใบรับรองเฉพาะทาง 6 คน ตลอดสัญญา",
            en: "Requires six specifically certified staff on the contract throughout.",
          },
          clauseTh:
            "ต้องมีบุคลากรที่ได้รับการรับรอง HL7 FHIR Implementer ไม่น้อยกว่า 6 คน ประจำโครงการเต็มเวลา",
          source: "หน้า 13 · ข้อ 3.1.5",
          baseline: {
            th: "งานที่เทียบเคียงได้กำหนด 2 คน และไม่ระบุว่าต้องประจำเต็มเวลา",
            en: "Comparable TORs ask for two, and do not require them full-time.",
          },
        },
      ],
    },
    price: {
      verdict: "under",
      median: 34_500_000,
      sampleSize: 5,
      note: {
        th: "ต่ำกว่าค่ากลาง 36% ทั้งที่ขอบเขตงานใหญ่กว่า เป็นสัญญาณว่างบไม่พอกับงานที่ระบุ",
        en: "36% below median despite a larger scope — a sign the budget does not cover the stated work.",
      },
      comparables: [
        {
          id: "BMA-2568-0012",
          title: { th: "ระบบ HIS โรงพยาบาลกลาง", en: "Central Hospital HIS" },
          agency: { th: "สำนักการแพทย์", en: "Medical Service" },
          year: 2025,
          budget: 32_400_000,
        },
        {
          id: "BMA-2567-0130",
          title: { th: "ระบบสารสนเทศศูนย์บริการสาธารณสุข 69 แห่ง", en: "Information system for 69 health centres" },
          agency: { th: "สำนักอนามัย", en: "Health Department" },
          year: 2024,
          budget: 37_800_000,
        },
        {
          id: "BMA-2568-0225",
          title: { th: "ระบบเวชระเบียนอิเล็กทรอนิกส์", en: "Electronic medical records system" },
          agency: { th: "สำนักการแพทย์", en: "Medical Service" },
          year: 2025,
          budget: 34_500_000,
        },
      ],
    },
    amendments: [
      {
        round: { th: "ประกาศร่าง TOR ครั้งที่ 1", en: "Draft TOR, round 1" },
        date: "2026-05-19",
        headline: { th: "ประกาศฉบับแรก", en: "First posting" },
        changes: [],
      },
    ],
    confidence: { ocr: 0.83, extraction: 0.77, lowFields: ["Maximum Budget"] },
    source: {
      format: "image",
      pages: 54,
      portal: "สำนักการแพทย์ (เว็บไซต์หน่วยงาน)",
      url: "https://msdbangkok.go.th/",
    },
  },

  {
    id: "BMA-2569-0176",
    egpRef: "69079048330",
    title: {
      th: "จ้างพัฒนาระบบแดชบอร์ดติดตามการใช้จ่ายงบประมาณกรุงเทพมหานคร",
      en: "Budget-spending tracking dashboard",
    },
    agency: { th: "สำนักงบประมาณกรุงเทพมหานคร", en: "Bangkok Budget Office" },
    budget: 2_750_000,
    deadline: "2026-09-01",
    postedAt: "2026-07-14",
    techStack: ["Power BI", ".NET 8", "SQL Server 2022", "Azure AD"],
    penalty: { th: "ค่าปรับร้อยละ 0.20 ต่อวัน", en: "0.20% of contract value per day late" },
    status: "open",
    scopeSize: "small-team",
    smeAdvantage: true,
    summary: [
      {
        th: "แดชบอร์ดติดตามการเบิกจ่ายรายสำนัก พร้อมรายงานอัตโนมัติรายเดือน",
        en: "Per-department disbursement dashboard with automated monthly reporting.",
      },
      {
        th: "ต้องดึงข้อมูลจากระบบ MIS เดิมผ่านฐานข้อมูล SQL Server",
        en: "Pulls from the existing MIS via SQL Server.",
      },
      { th: "ระยะเวลาดำเนินการ 150 วัน", en: "150 days." },
    ],
    deliverables: [
      { th: "แดชบอร์ดผู้บริหารและรายงานรายเดือน", en: "Executive dashboard and monthly reports" },
      { th: "ระบบสิทธิ์การเข้าถึงตามสำนัก", en: "Per-department access control" },
    ],
    lockSpec: {
      level: "medium",
      score: 48,
      reasons: [
        {
          tag: { th: "สเปกผูกยี่ห้อ", en: "Brand-locked spec" },
          verdict: {
            th: "ผูกกับเครื่องมือของผู้ผลิตรายเดียว ทำให้ผู้เสนอราคาที่ถนัดเครื่องมืออื่นเสียเปรียบ",
            en: "Tied to one vendor's toolchain, which puts teams skilled in anything else at a disadvantage.",
          },
          clauseTh: "ต้องพัฒนาบนแพลตฟอร์ม Microsoft Power BI Premium เท่านั้น",
          source: "หน้า 9 · ข้อ 3.1.1",
          baseline: {
            th: "งานแดชบอร์ดภาครัฐราวครึ่งหนึ่งเปิดให้เสนอเครื่องมือเทียบเท่าได้",
            en: "About half of comparable dashboard TORs allow an equivalent tool.",
          },
        },
      ],
    },
    price: {
      verdict: "fair",
      median: 2_900_000,
      sampleSize: 6,
      note: {
        th: "ต่ำกว่าค่ากลาง 5% ถือว่าอยู่ในเกณฑ์ปกติ",
        en: "5% below median — normal.",
      },
      comparables: [
        {
          id: "BMA-2568-0180",
          title: { th: "แดชบอร์ดติดตามโครงการลงทุน", en: "Capital project tracking dashboard" },
          agency: { th: "สำนักยุทธศาสตร์และประเมินผล", en: "Strategy and Evaluation" },
          year: 2025,
          budget: 2_880_000,
        },
        {
          id: "BMA-2567-0305",
          title: { th: "ระบบรายงานผลการเบิกจ่ายรายไตรมาส", en: "Quarterly disbursement reporting" },
          agency: { th: "สำนักการคลัง", en: "Finance Department" },
          year: 2024,
          budget: 2_640_000,
        },
      ],
    },
    amendments: [
      {
        round: { th: "ประกาศร่าง TOR ครั้งที่ 1", en: "Draft TOR, round 1" },
        date: "2026-07-14",
        headline: { th: "ประกาศฉบับแรก", en: "First posting" },
        changes: [],
      },
    ],
    confidence: { ocr: 0.91, extraction: 0.86, lowFields: [] },
    source: {
      format: "html",
      pages: 21,
      portal: "eGP BMA2",
      url: "https://bmaegp.bangkok.go.th/",
    },
  },

  {
    id: "BMA-2569-0260",
    egpRef: "69089062455",
    title: {
      th: "จ้างที่ปรึกษาจัดทำแผนแม่บทเทคโนโลยีสารสนเทศกรุงเทพมหานคร พ.ศ. 2570–2574",
      en: "IT master plan consultancy, 2027–2031",
    },
    agency: { th: "สำนักยุทธศาสตร์และประเมินผล", en: "Strategy and Evaluation Department" },
    budget: 1_200_000,
    deadline: "2026-09-09",
    postedAt: "2026-08-04",
    techStack: ["IT Strategy", "Enterprise Architecture", "TOGAF"],
    penalty: { th: "ค่าปรับร้อยละ 0.20 ต่อวัน", en: "0.20% of contract value per day late" },
    status: "open",
    scopeSize: "solo",
    smeAdvantage: true,
    summary: [
      {
        th: "งานที่ปรึกษา จัดทำแผนแม่บท IT 5 ปี พร้อมสำรวจความพร้อมของ 16 สำนัก",
        en: "Consultancy: a five-year IT master plan plus a readiness survey across 16 departments.",
      },
      { th: "ไม่มีงานพัฒนาซอฟต์แวร์ เป็นงานวิเคราะห์และจัดทำเอกสาร", en: "No build work — analysis and documentation only." },
      { th: "ระยะเวลาดำเนินการ 240 วัน", en: "240 days." },
    ],
    deliverables: [
      { th: "รายงานแผนแม่บทและแผนปฏิบัติการรายปี", en: "Master plan and annual action plans" },
      { th: "การประชุมรับฟังความคิดเห็น 3 ครั้ง", en: "Three stakeholder consultation sessions" },
    ],
    lockSpec: {
      level: "low",
      score: 21,
      reasons: [
        {
          tag: { th: "ผลงานย้อนหลัง", en: "Past-work threshold" },
          verdict: {
            th: "ข้อกำหนดทั่วไป เปิดให้ที่ปรึกษาอิสระเสนอราคาได้",
            en: "Standard requirements — independent consultants can bid.",
          },
          clauseTh: "ผู้เสนอราคาต้องมีผลงานจัดทำแผนแม่บทหรือแผนยุทธศาสตร์ ไม่น้อยกว่า 1 ผลงาน",
          source: "หน้า 6 · ข้อ 2.1.1",
          baseline: { th: "ตรงกับค่ากลางของงานที่ปรึกษาช่วงงบเดียวกัน", en: "Matches the norm for consultancies at this budget." },
        },
      ],
    },
    price: {
      verdict: "fair",
      median: 1_150_000,
      sampleSize: 4,
      note: { th: "ใกล้เคียงค่ากลาง", en: "In line with the median." },
      comparables: [
        {
          id: "BMA-2567-0201",
          title: { th: "ที่ปรึกษาแผนดิจิทัลสำนักอนามัย", en: "Health Department digital plan consultancy" },
          agency: { th: "สำนักอนามัย", en: "Health Department" },
          year: 2024,
          budget: 1_080_000,
        },
        {
          id: "BMA-2568-0163",
          title: { th: "ที่ปรึกษาจัดทำสถาปัตยกรรมองค์กร", en: "Enterprise architecture consultancy" },
          agency: { th: "สำนักยุทธศาสตร์และประเมินผล", en: "Strategy and Evaluation" },
          year: 2025,
          budget: 1_220_000,
        },
      ],
    },
    amendments: [
      {
        round: { th: "ประกาศร่าง TOR ครั้งที่ 1", en: "Draft TOR, round 1" },
        date: "2026-08-04",
        headline: { th: "ประกาศฉบับแรก", en: "First posting" },
        changes: [],
      },
    ],
    confidence: { ocr: 0.95, extraction: 0.92, lowFields: [] },
    source: {
      format: "json",
      pages: 14,
      portal: "e-GP API",
      url: "https://process3.gprocurement.go.th/",
    },
  },

  {
    id: "BMA-2569-0198",
    egpRef: "69049022018",
    title: {
      th: "จ้างเหมาบำรุงรักษาระบบสารบรรณอิเล็กทรอนิกส์ ประจำปีงบประมาณ 2569",
      en: "Annual maintenance of the electronic document system, FY2026",
    },
    agency: {
      th: "สำนักงานเลขานุการปลัดกรุงเทพมหานคร",
      en: "Office of the Permanent Secretary",
    },
    budget: 640_000,
    deadline: "2026-05-30",
    postedAt: "2026-04-28",
    techStack: ["PHP", "MySQL", "Apache", "Linux"],
    penalty: { th: "ค่าปรับร้อยละ 0.20 ต่อวัน", en: "0.20% of contract value per day late" },
    status: "closed",
    awardedTo: { th: "บริษัท ไทยด็อคคิวเมนต์ ซิสเต็มส์ จำกัด", en: "Thai Document Systems Co., Ltd." },
    awardedAmount: 612_000,
    scopeSize: "solo",
    smeAdvantage: true,
    summary: [
      { th: "บำรุงรักษาระบบสารบรรณเดิมรายปี พร้อมบริการ on-site 8x5", en: "Annual maintenance with 8x5 on-site support." },
      { th: "ผู้ชนะเสนอราคาต่ำกว่าราคากลาง 4.4%", en: "Winning bid came in 4.4% under the reference price." },
    ],
    deliverables: [
      { th: "บริการบำรุงรักษาและแก้ไขปัญหา 12 เดือน", en: "12 months of maintenance and incident response" },
    ],
    lockSpec: {
      level: "medium",
      score: 44,
      reasons: [
        {
          tag: { th: "ได้เปรียบรายเดิม", en: "Incumbent advantage" },
          verdict: {
            th: "ขอผลงานบำรุงรักษาระบบเดิมของหน่วยงานนี้โดยเฉพาะ ซึ่งผู้ให้บริการรายเดิมได้เปรียบ",
            en: "Asks for maintenance history on this agency's own system, which favours the incumbent.",
          },
          clauseTh: "ต้องมีผลงานบำรุงรักษาระบบสารบรรณอิเล็กทรอนิกส์ของกรุงเทพมหานคร ไม่น้อยกว่า 1 ปี",
          source: "หน้า 4 · ข้อ 2.1.4",
          baseline: {
            th: "งานบำรุงรักษาทั่วไปมักขอเพียงผลงานดูแลระบบสารสนเทศภาครัฐ",
            en: "Comparable maintenance TORs only ask for public-sector systems experience in general.",
          },
        },
      ],
    },
    price: {
      verdict: "fair",
      median: 620_000,
      sampleSize: 5,
      note: { th: "ใกล้เคียงค่ากลางของงานบำรุงรักษารายปี", en: "In line with annual maintenance norms." },
      comparables: [
        {
          id: "BMA-2568-0190",
          title: { th: "บำรุงรักษาระบบสารบรรณ ปี 2568", en: "Document system maintenance, FY2025" },
          agency: { th: "สำนักงานเลขานุการปลัดกรุงเทพมหานคร", en: "Office of the Permanent Secretary" },
          year: 2025,
          budget: 600_000,
        },
        {
          id: "BMA-2567-0166",
          title: { th: "บำรุงรักษาระบบงานบุคคล", en: "HR system maintenance" },
          agency: { th: "สำนักงานการเจ้าหน้าที่", en: "Personnel Office" },
          year: 2024,
          budget: 580_000,
        },
      ],
    },
    amendments: [
      {
        round: { th: "ประกาศผู้ชนะการเสนอราคา", en: "Award notice" },
        date: "2026-06-11",
        headline: {
          th: "ประกาศผู้ชนะการเสนอราคา ปิดรับข้อเสนอแล้ว",
          en: "Winner announced; the project is closed.",
        },
        changes: [
          {
            kind: "changed",
            field: { th: "สถานะ", en: "Status" },
            before: "เปิดรับข้อเสนอ",
            after: "ประกาศผู้ชนะแล้ว",
          },
        ],
      },
      {
        round: { th: "ประกาศร่าง TOR ครั้งที่ 1", en: "Draft TOR, round 1" },
        date: "2026-04-28",
        headline: { th: "ประกาศฉบับแรก", en: "First posting" },
        changes: [],
      },
    ],
    confidence: { ocr: 0.93, extraction: 0.89, lowFields: [] },
    source: {
      format: "html",
      pages: 9,
      portal: "eGP BMA2",
      url: "https://bmaegp.bangkok.go.th/",
    },
  },

  {
    id: "BMA-2569-0203",
    egpRef: "69059029077",
    title: {
      th: "จ้างบำรุงรักษาและซ่อมแซมระบบเครือข่ายศาลาว่าการกรุงเทพมหานคร 2 (ดินแดง)",
      en: "Network maintenance for City Hall 2 (Din Daeng)",
    },
    agency: { th: "สำนักยุทธศาสตร์และประเมินผล", en: "Strategy and Evaluation Department" },
    unit: { th: "กองบริการระบบคอมพิวเตอร์", en: "Computer Systems Service Division" },
    budget: 4_600_000,
    deadline: "2026-06-26",
    postedAt: "2026-05-22",
    techStack: ["Cisco IOS", "Windows Server 2019", "VMware vSphere", "Fortinet"],
    penalty: { th: "ค่าปรับร้อยละ 0.20 ต่อวัน", en: "0.20% of contract value per day late" },
    status: "closed",
    awardedTo: { th: "บริษัท เน็ตเวิร์ค โซลูชั่นส์ (ประเทศไทย) จำกัด", en: "Network Solutions (Thailand) Co., Ltd." },
    awardedAmount: 4_555_000,
    scopeSize: "firm",
    smeAdvantage: false,
    summary: [
      { th: "ดูแลระบบเครือข่ายและเซิร์ฟเวอร์ของศาลาว่าการ 2 ตลอด 12 เดือน", en: "12 months of network and server support for City Hall 2." },
      { th: "ผู้ชนะเสนอราคาต่ำกว่าราคากลางเพียง 1%", en: "Winning bid was just 1% under the reference price." },
    ],
    deliverables: [{ th: "บริการดูแลระบบ 24x7 และอะไหล่สำรอง", en: "24x7 support and spare parts" }],
    lockSpec: {
      level: "medium",
      score: 51,
      reasons: [
        {
          tag: { th: "รูปแบบการประมูล", en: "Bidding pattern" },
          verdict: {
            th: "มีผู้เสนอราคารายเดียวติดต่อกัน 3 ปี และราคาชนะต่ำกว่าราคากลางไม่ถึง 2% ทุกครั้ง",
            en: "One bidder three years running, each time winning within 2% of the reference price.",
          },
          clauseTh: "ต้องมีวิศวกรที่ได้รับการรับรองจากผู้ผลิตอุปกรณ์เดิมประจำโครงการ ไม่น้อยกว่า 4 คน",
          source: "หน้า 8 · ข้อ 2.3.2",
          baseline: {
            th: "งานบำรุงรักษาเครือข่ายที่เทียบเคียงได้กำหนดวิศวกร 2 คน",
            en: "Comparable network maintenance TORs ask for two engineers.",
          },
        },
      ],
    },
    price: {
      verdict: "fair",
      median: 4_400_000,
      sampleSize: 6,
      note: { th: "สูงกว่าค่ากลาง 5%", en: "5% above median." },
      comparables: [
        {
          id: "BMA-2568-0111",
          title: { th: "บำรุงรักษาเครือข่ายศาลาว่าการ 1", en: "City Hall 1 network maintenance" },
          agency: { th: "สำนักยุทธศาสตร์และประเมินผล", en: "Strategy and Evaluation" },
          year: 2025,
          budget: 4_350_000,
        },
        {
          id: "BMA-2567-0148",
          title: { th: "บำรุงรักษาระบบเครือข่ายสำนักการคลัง", en: "Finance Department network maintenance" },
          agency: { th: "สำนักการคลัง", en: "Finance Department" },
          year: 2024,
          budget: 4_120_000,
        },
      ],
    },
    amendments: [
      {
        round: { th: "ประกาศผู้ชนะการเสนอราคา", en: "Award notice" },
        date: "2026-07-03",
        headline: { th: "ประกาศผู้ชนะการเสนอราคา", en: "Winner announced." },
        changes: [
          {
            kind: "changed",
            field: { th: "สถานะ", en: "Status" },
            before: "เปิดรับข้อเสนอ",
            after: "ประกาศผู้ชนะแล้ว",
          },
        ],
      },
      {
        round: { th: "ประกาศร่าง TOR ครั้งที่ 1", en: "Draft TOR, round 1" },
        date: "2026-05-22",
        headline: { th: "ประกาศฉบับแรก", en: "First posting" },
        changes: [],
      },
    ],
    confidence: { ocr: 0.9, extraction: 0.85, lowFields: [] },
    source: {
      format: "scanned-pdf",
      pages: 26,
      portal: "eGP BMA2",
      url: "https://bmaegp.bangkok.go.th/",
    },
  },
];

export const tors = CATALOG;

export function getTor(id: string): Tor | undefined {
  return CATALOG.find((t) => t.id === id);
}

/** Every agency present in the catalog, for the filter rail. */
export const agencies: Bi[] = Array.from(
  new Map(CATALOG.map((t) => [t.agency.th, t.agency])).values(),
);

/** Every tech term present in the catalog, most common first. */
export const techTerms: string[] = Array.from(
  CATALOG.reduce((counts, tor) => {
    for (const term of tor.techStack) counts.set(term, (counts.get(term) ?? 0) + 1);
    return counts;
  }, new Map<string, number>()),
)
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  .map(([term]) => term);

/**
 * What the user tells us about themselves. Edited on the profile screen and
 * read by the catalog's matched mode, so the two screens are the same feature
 * seen from two ends.
 */
export type Profile = {
  name: string;
  role: Bi;
  email: string;
  skills: string[];
  budgetMin: number;
  budgetMax: number;
  scopeSizes: ScopeSize[];
  smeRegistered: boolean;
  watchlist: string[];
};

export const demoProfile: Profile = {
  name: "สุชาติ ว.",
  role: { th: "นักพัฒนาอิสระ · กรุงเทพฯ", en: "Freelance developer · Bangkok" },
  email: "suchart.w@example.co.th",
  skills: ["Next.js", "React", "Node.js", "PostgreSQL", "MySQL", "LINE Messaging API"],
  budgetMin: 300_000,
  budgetMax: 5_000_000,
  scopeSizes: ["solo", "small-team"],
  smeRegistered: true,
  watchlist: ["BMA-2569-0142", "BMA-2569-0217", "BMA-2569-0245"],
};

/** One reason the score came out where it did — shown, never left implicit. */
export type MatchFactor = { met: boolean; label: Bi };

/**
 * FR07. Kept legible rather than magic: the score is a weighted sum of three
 * things the user can see and change on the profile screen, and every surface
 * that shows a score can also show which of the three actually fired.
 */
export function matchFactors(tor: Tor, profile: Profile): MatchFactor[] {
  const matched = tor.techStack.filter((t) => profile.skills.includes(t));
  const budgetFits = tor.budget >= profile.budgetMin && tor.budget <= profile.budgetMax;
  const scopeFits = profile.scopeSizes.includes(tor.scopeSize);

  return [
    {
      met: matched.length > 0,
      label: {
        th: `ทักษะตรง ${matched.length} จาก ${tor.techStack.length} รายการ`,
        en: `${matched.length} of ${tor.techStack.length} technologies match your skills`,
      },
    },
    {
      met: budgetFits,
      label: budgetFits
        ? { th: "งบอยู่ในช่วงที่คุณรับงาน", en: "Budget sits inside your stated range" }
        : { th: "งบอยู่นอกช่วงที่คุณตั้งไว้", en: "Budget is outside your stated range" },
    },
    {
      met: scopeFits,
      label: scopeFits
        ? { th: "ขนาดงานอยู่ในกำลังของคุณ", en: "Scope is within the team size you set" }
        : { th: "ขนาดงานใหญ่เกินกำลังที่คุณตั้งไว้", en: "Scope needs a bigger team than you set" },
    },
  ];
}

export function matchScore(tor: Tor, profile: Profile): number {
  const matched = tor.techStack.filter((t) => profile.skills.includes(t)).length;
  const skillFit = tor.techStack.length ? matched / tor.techStack.length : 0;
  const budgetFit =
    tor.budget >= profile.budgetMin && tor.budget <= profile.budgetMax ? 1 : 0.15;
  const scopeFit = profile.scopeSizes.includes(tor.scopeSize) ? 1 : 0.2;
  const smeBonus = profile.smeRegistered && tor.smeAdvantage ? 6 : 0;

  return Math.min(100, Math.round(skillFit * 55 + budgetFit * 25 + scopeFit * 20 + smeBonus));
}

/* ---------------------------------- utils --------------------------------- */

export function formatTHB(amount: number): string {
  return `฿${amount.toLocaleString("en-US")}`;
}

/** Compact form for dense rows: ฿12.4M, ฿890K. */
export function formatTHBCompact(amount: number): string {
  if (amount >= 1_000_000) {
    const millions = amount / 1_000_000;
    return `฿${millions % 1 === 0 ? millions : millions.toFixed(1)}M`;
  }
  return `฿${Math.round(amount / 1000)}K`;
}

function toUTC(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Days from the fixed TODAY to `iso`. Negative once the date has passed. */
export function daysUntil(iso: string): number {
  return Math.round((toUTC(iso) - toUTC(TODAY)) / 86_400_000);
}

const THAI_MONTHS = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];
const EN_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Thai dates carry the Buddhist year (พ.ศ. = ค.ศ. + 543). */
export function formatDate(iso: string, lang: Lang): string {
  const [y, m, d] = iso.split("-").map(Number);
  return lang === "th"
    ? `${d} ${THAI_MONTHS[m - 1]} ${y + 543}`
    : `${d} ${EN_MONTHS[m - 1]} ${y}`;
}

/** Percentage difference from the historical median, rounded. */
export function priceDeltaPct(tor: Tor): number {
  return Math.round(((tor.budget - tor.price.median) / tor.price.median) * 100);
}
