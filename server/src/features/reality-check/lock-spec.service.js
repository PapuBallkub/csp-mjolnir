/**
 * server/src/features/reality-check/lock-spec.service.js
 *
 * Implements FR-21: Automated detection of lock-specification risk criteria,
 * qualification barriers, and non-accusatory evidence generation.
 *
 * Grounded in Comptroller General's Circular ว 214 and Act B.E. 2560 Section 9.
 * Conforms to ADR 0014, ADR 0021, ADR 0030, and docs/features/lock-spec-risk-detection.md.
 */

import { getProjectPrice } from './similarity.service.js';

/**
 * Severity point weights (ADR 0030)
 * With 3 statutory categories from Circular ว 214:
 * 1 violation (35 pts) => Medium Risk
 * 2+ violations (>= 70 pts) => High Risk
 */
export const SEVERITY_POINTS = {
  high: 35,
  medium: 15,
  low: 5,
};

/**
 * Lock-spec risk thresholds (ADR 0030)
 */
export const RISK_THRESHOLDS = {
  HIGH: 70,
  MEDIUM: 35,
};

/**
 * Formats a numeric Baht amount into Thai locale string.
 * @param {number} num
 * @returns {string}
 */
function formatTHB(num) {
  if (typeof num !== 'number' || Number.isNaN(num)) return '0';
  return num.toLocaleString('th-TH');
}

/**
 * Detects Category 1: Vendor Lock-in & Reseller Letters.
 * Checks for Manufacturer Authorization Form (MAF) in software development tenders.
 * Grounded in Circular ว 214 Clause 1.1 & 1.3.
 *
 * @param {object} tor
 * @returns {object|null}
 */
export function detectVendorLockin(tor) {
  const category = tor?.identification?.category;
  const isSoftwareHire =
    category === 'software-development' ||
    category === 'systems-integration' ||
    tor?.procurementKind === 'hire' ||
    tor?.facts?.procurementKind === 'hire';

  const mafs = tor?.eligibility?.manufacturerAuthorizations;
  const hasMAF = Array.isArray(mafs) && mafs.length > 0;

  if (isSoftwareHire && hasMAF) {
    const rawQuote = mafs[0] || 'ต้องแนบหนังสือแต่งตั้งตัวแทนจำหน่ายจากผู้ผลิต';
    const evidence = tor?.evidence?.['eligibility.manufacturerAuthorizations'];

    return {
      id: `FIND-${tor?.projectId || 'TOR'}-01`,
      title: 'กำหนดหนังสือแต่งตั้งตัวแทนจำหน่าย (MAF) ในงานจ้างพัฒนาซอฟต์แวร์',
      category: 'Vendor Lock-in',
      requirementText: 'ผู้ยื่นข้อเสนอต้องแนบหนังสือแต่งตั้งตัวแทนจำหน่าย (Manufacturer Authorization) จากเจ้าของลิขสิทธิ์ซอฟต์แวร์',
      normalBenchmark: 'งานจ้างพัฒนาซอฟต์แวร์ทั่วไปประเมินจากทักษะและผลงานของทีมพัฒนา ไม่กำหนดหนังสือตัวแทนจำหน่าย (ว 214 ข้อ 1.3)',
      sourceExcerpt: evidence?.quote || rawQuote,
      sourceLocation: evidence?.page != null ? `หน้า ${evidence.page}` : 'หมวดคุณสมบัติเฉพาะของผู้ยื่นข้อเสนอ',
      severity: 'high',
    };
  }

  return null;
}

/**
 * Detects Category 2: Disproportionate Past Contract Experience.
 * Checks if minimum previous experience exceeds the statutory ceiling (50%).
 * Grounded in Circular ว 214 Clause 2.
 *
 * @param {object} tor
 * @param {number|null} targetPrice
 * @returns {object|null}
 */
export function detectQualificationBarriers(tor, targetPrice) {
  const minExp = tor?.eligibility?.previousExperienceMinTHB;

  if (
    typeof minExp === 'number' &&
    minExp > 0 &&
    typeof targetPrice === 'number' &&
    targetPrice > 0
  ) {
    const ratio = minExp / targetPrice;
    const ratioPct = (ratio * 100).toFixed(1);
    const evidence = tor?.evidence?.['eligibility.previousExperienceMinTHB'];

    if (ratio > 0.5) {
      return {
        id: `FIND-${tor?.projectId || 'TOR'}-02`,
        title: 'กำหนดมูลค่าผลงานขั้นต่ำเกินเกณฑ์ 50% ของราคากลาง',
        category: 'Qualification Barrier',
        requirementText: `มีผลงานประเภทเดียวกันในสัญญาเดียวไม่น้อยกว่า ${formatTHB(minExp)} บาท (คิดเป็น ${ratioPct}% ของราคากลาง ${formatTHB(targetPrice)} บาท)`,
        normalBenchmark: 'ตามแนวทางมาตรฐานของกรมบัญชีกลาง (หนังสือเวียน ว 214 ข้อ 2) ผลงานขั้นต่ำต้องไม่เกิน 50% ของวงเงินงบประมาณหรือราคากลาง',
        sourceExcerpt:
          evidence?.quote ||
          `มีผลงานประเภทเดียวกันในสัญญาเดียว วงเงินไม่น้อยกว่า ${formatTHB(minExp)} บาท`,
        sourceLocation: evidence?.page != null ? `หน้า ${evidence.page}` : 'หมวดคุณสมบัติเฉพาะของผู้ยื่นข้อเสนอ',
        severity: 'high',
      };
    }
  }

  return null;
}

/**
 * Detects Category 3: Specification Tailoring & Outdated Platform Lock.
 * Checks for exact locked proprietary runtime or legacy platform restrictions without "or equivalent".
 * Grounded in Circular ว 214 Clause 3 and Act B.E. 2560 Section 9.
 *
 * @param {object} tor
 * @returns {object|null}
 */
export function detectSpecificationTailoring(tor) {
  const technologies = tor?.technicalRequirements?.requiredTechnologies || [];
  const evidence = tor?.evidence?.['technicalRequirements.requiredTechnologies'];
  const quote = evidence?.quote || '';

  // Verbatim quote check: did the document explicitly state "หรือเทียบเท่า" / "or equivalent"?
  const quoteAllowsEquivalent = /เทียบเท่า|equivalent/i.test(quote);

  for (const tech of technologies) {
    const name = (tech?.name || '').toLowerCase();
    const version = (tech?.version || '').toLowerCase();

    // If equivalent is explicitly allowed by Vertex AI or the verbatim text quote,
    // the agency complied with Circular ว 214 Clause 3!
    const allowsEquivalent = tech?.allowsEquivalent ?? (quoteAllowsEquivalent ? true : null);
    if (allowsEquivalent === true) {
      continue;
    }

    // Specific locked proprietary or legacy platform versions without "หรือเทียบเท่า"
    const isLockedPlatform =
      (name.includes('windows server') ||
        name.includes('red hat') ||
        name.includes('rhel') ||
        name.includes('oracle')) &&
      Boolean(version);

    if (isLockedPlatform) {
      return {
        id: `FIND-${tor?.projectId || 'TOR'}-03`,
        title: `ระบุเวอร์ชันระบบปฏิบัติการเฉพาะเจาะจง (${tech.name} ${tech.version}) โดยไม่มีคำว่า "หรือเทียบเท่า"`,
        category: 'Specification Tailoring',
        requirementText: `ระบบต้องทำงานเฉพาะบน ${tech.name} ${tech.version} โดยไม่ระบุข้อความ "หรือเทียบเท่า" ตามระเบียบ`,
        normalBenchmark: 'ตามหนังสือเวียน ว 214 ข้อ 3 หากมีความจำเป็นต้องระบุยี่ห้อหรือรุ่น จะต้องระบุคำว่า "หรือเทียบเท่า" ไว้ด้วยเสมอ',
        sourceExcerpt: evidence?.quote || `ระบบต้องติดตั้งบน ${tech.name} ${tech.version}`,
        sourceLocation: evidence?.page != null ? `หน้า ${evidence.page}` : 'หมวดข้อกำหนดทางเทคนิค',
        severity: 'high',
      };
    }
  }

  return null;
}

/**
 * Computes composite lock-spec risk score from findings (capped at 100).
 *
 * @param {Array<object>} findings
 * @returns {number}
 */
export function calculateLockSpecScore(findings = []) {
  if (!Array.isArray(findings) || findings.length === 0) return 0;

  const totalPoints = findings.reduce((sum, f) => {
    const pts = SEVERITY_POINTS[f?.severity] || 0;
    return sum + pts;
  }, 0);

  return Math.min(100, totalPoints);
}

/**
 * Formats non-accusatory Thai summary verdict copy based on risk score (AGENTS.md Section 7).
 *
 * @param {number} riskScore
 * @param {Array<object>} findings
 * @returns {string}
 */
export function formatLockSpecVerdict(riskScore, findings = []) {
  if (riskScore >= RISK_THRESHOLDS.HIGH) {
    return 'ความเสี่ยงสูง: พบเงื่อนไขที่อาจจำกัดการแข่งขันเฉพาะราย';
  }

  if (riskScore >= RISK_THRESHOLDS.MEDIUM) {
    return 'ความเสี่ยงปานกลาง: มีเงื่อนไขบางข้อที่อาจจำกัดการแข่งขัน';
  }

  return 'ความเสี่ยงต่ำ: ข้อกำหนดเปิดกว้างตามมาตรฐาน';
}

/**
 * Evaluates the lock-spec risk profile for a given TOR (FR-21).
 *
 * @param {object} tor - Normalized TorInsight document or plain object
 * @returns {{ riskScore: number, verdictText: string, findings: Array<object> }}
 */
export function analyzeLockSpec(tor) {
  if (!tor) {
    return {
      riskScore: 0,
      verdictText: 'ความเสี่ยงต่ำ: ข้อกำหนดเปิดกว้างตามมาตรฐาน',
      findings: [],
    };
  }

  const targetPrice = getProjectPrice(tor);
  const findings = [];

  // Run the 3 statutory rule detectors based on Circular ว 214
  const f1 = detectVendorLockin(tor);
  if (f1) findings.push(f1);

  const f2 = detectQualificationBarriers(tor, targetPrice);
  if (f2) findings.push(f2);

  const f3 = detectSpecificationTailoring(tor);
  if (f3) findings.push(f3);

  const riskScore = calculateLockSpecScore(findings);
  const verdictText = formatLockSpecVerdict(riskScore, findings);

  return {
    riskScore,
    verdictText,
    findings,
  };
}
