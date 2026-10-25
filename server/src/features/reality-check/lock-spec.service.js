/**
 * server/src/features/reality-check/lock-spec.service.js
 *
 * Implements FR-21: Automated detection of lock-specification risk criteria,
 * qualification barriers, and non-accusatory evidence generation.
 *
 * Conforms to ADR 0014, ADR 0021, ADR 0030, and
 * docs/features/lock-spec-risk-detection.md.
 */

import { getProjectPrice } from './similarity.service.js';

/**
 * Severity point weights (ADR 0030)
 */
export const SEVERITY_POINTS = {
  high: 30,
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
      normalBenchmark: 'งานจ้างพัฒนาซอฟต์แวร์ทั่วไปประเมินจากทักษะและผลงานของทีมพัฒนา ไม่กำหนดหนังสือตัวแทนจำหน่าย',
      sourceExcerpt: evidence?.quote || rawQuote,
      sourceLocation: evidence?.page != null ? `หน้า ${evidence.page}` : 'ข้อกำหนดคุณสมบัติผู้ยื่นข้อเสนอ',
      severity: 'high',
    };
  }

  return null;
}

/**
 * Detects Category 2: Disproportionate Past Contract Experience.
 * Checks if minimum previous experience exceeds standard government ratios (50% / 80%).
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

    if (ratio > 0.8) {
      return {
        id: `FIND-${tor?.projectId || 'TOR'}-02`,
        title: 'กำหนดมูลค่าผลงานขั้นต่ำเกิน 80% ของราคากลาง',
        category: 'Qualification Barrier',
        requirementText: `มีผลงานประเภทเดียวกันในสัญญาเดียวไม่น้อยกว่า ${formatTHB(minExp)} บาท (คิดเป็น ${ratioPct}% ของราคากลาง ${formatTHB(targetPrice)} บาท)`,
        normalBenchmark: 'ตามระเบียบกระทรวงการคลังและแนวทางมาตรฐาน ผลงานขั้นต่ำไม่ควรเกิน 50% ของราคากลาง',
        sourceExcerpt:
          evidence?.quote ||
          `มีผลงานประเภทเดียวกันในสัญญาเดียว วงเงินไม่น้อยกว่า ${formatTHB(minExp)} บาท`,
        sourceLocation: evidence?.page != null ? `หน้า ${evidence.page}` : 'คุณสมบัติเฉพาะของผู้ยื่นข้อเสนอ',
        severity: 'high',
      };
    }

    if (ratio > 0.5) {
      return {
        id: `FIND-${tor?.projectId || 'TOR'}-02`,
        title: 'กำหนดมูลค่าผลงานขั้นต่ำสูงกว่าเกณฑ์มาตรฐาน 50% ของราคากลาง',
        category: 'Qualification Barrier',
        requirementText: `มีผลงานประเภทเดียวกันในสัญญาเดียวไม่น้อยกว่า ${formatTHB(minExp)} บาท (คิดเป็น ${ratioPct}% ของราคากลาง ${formatTHB(targetPrice)} บาท)`,
        normalBenchmark: 'ตามแนวทางมาตรฐานของกรมบัญชีกลาง ควรกำหนดผลงานขั้นต่ำไม่เกิน 50% ของวงเงินงบประมาณหรือราคากลาง',
        sourceExcerpt:
          evidence?.quote ||
          `มีผลงานประเภทเดียวกันในสัญญาเดียว วงเงินไม่น้อยกว่า ${formatTHB(minExp)} บาท`,
        sourceLocation: evidence?.page != null ? `หน้า ${evidence.page}` : 'คุณสมบัติเฉพาะของผู้ยื่นข้อเสนอ',
        severity: 'medium',
      };
    }
  }

  return null;
}

/**
 * Detects Category 3: Disproportionate Certifications & Team Sizing.
 * Checks for heavy organizational frameworks (CMMI, ISO 27001) on small tenders (<= 5M THB).
 *
 * @param {object} tor
 * @param {number|null} targetPrice
 * @returns {object|null}
 */
export function detectPersonnelBarriers(tor, targetPrice) {
  const certs = tor?.eligibility?.requiredCertifications || [];
  const certStr = certs.join(' ').toLowerCase();

  const isSmallBudget = typeof targetPrice === 'number' && targetPrice <= 5_000_000;
  const requiresHeavyCert =
    certStr.includes('cmmi') ||
    certStr.includes('iso 27001') ||
    certStr.includes('iso27001') ||
    certStr.includes('iso/iec 27001');

  if (isSmallBudget && requiresHeavyCert) {
    const matchedCert = certStr.includes('cmmi') ? 'CMMI' : 'ISO 27001';
    const evidence = tor?.evidence?.['eligibility.requiredCertifications'];

    return {
      id: `FIND-${tor?.projectId || 'TOR'}-03`,
      title: `กำหนดมาตรฐาน ${matchedCert} สำหรับโครงการงบประมาณไม่เกิน 5 ล้านบาท`,
      category: 'Personnel Barrier',
      requirementText: `ผู้ยื่นข้อเสนอต้องผ่านการรับรองมาตรฐาน ${matchedCert} สำหรับโครงการขนาดเล็ก`,
      normalBenchmark: 'มาตรฐานระดับองค์กรนิยมกำหนดเฉพาะในโครงการขนาดใหญ่หรืองานโครงสร้างพื้นฐานสำคัญ (> 10 ล้านบาท)',
      sourceExcerpt: evidence?.quote || `ผู้ยื่นข้อเสนอต้องได้รับรองมาตรฐาน ${matchedCert}`,
      sourceLocation: evidence?.page != null ? `หน้า ${evidence.page}` : 'ข้อกำหนดด้านมาตรฐานและบุคลากร',
      severity: 'medium',
    };
  }

  return null;
}

/**
 * Detects Category 4: Specification Tailoring & Outdated Platform Lock.
 * Checks for exact locked proprietary runtime or legacy platform restrictions.
 *
 * @param {object} tor
 * @returns {object|null}
 */
export function detectSpecificationTailoring(tor) {
  const technologies = tor?.technicalRequirements?.requiredTechnologies || [];

  for (const tech of technologies) {
    const name = (tech?.name || '').toLowerCase();
    const version = (tech?.version || '').toLowerCase();

    // Specific locked legacy/outdated server versions (e.g. Windows Server 2019 without alternative)
    if (name.includes('windows server') && version && version.includes('2019')) {
      const evidence = tor?.evidence?.['technicalRequirements.requiredTechnologies'];
      return {
        id: `FIND-${tor?.projectId || 'TOR'}-04`,
        title: `ระบุเวอร์ชันระบบปฏิบัติการเฉพาะเจาะจง (${tech.name} ${tech.version})`,
        category: 'Specification Tailoring',
        requirementText: `ระบบต้องทำงานเฉพาะบน ${tech.name} ${tech.version} โดยไม่เปิดให้ใช้เวอร์ชันปัจจุบันหรือระบบปฏิบัติการทางเลือก`,
        normalBenchmark: 'ข้อกำหนดที่ดีควรกำหนดคุณสมบัติเชิงฟังก์ชัน และรองรับระบบปฏิบัติการมาตรฐานเปิดที่ยังไม่สิ้นสุดระยะสนับสนุน (End-of-Life)',
        sourceExcerpt: evidence?.quote || `ระบบต้องติดตั้งบน ${tech.name} ${tech.version}`,
        sourceLocation: evidence?.page != null ? `หน้า ${evidence.page}` : 'ข้อกำหนดทางเทคนิค',
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

  // Run all 4 rule detectors
  const f1 = detectVendorLockin(tor);
  if (f1) findings.push(f1);

  const f2 = detectQualificationBarriers(tor, targetPrice);
  if (f2) findings.push(f2);

  const f3 = detectPersonnelBarriers(tor, targetPrice);
  if (f3) findings.push(f3);

  const f4 = detectSpecificationTailoring(tor);
  if (f4) findings.push(f4);

  const riskScore = calculateLockSpecScore(findings);
  const verdictText = formatLockSpecVerdict(riskScore, findings);

  return {
    riskScore,
    verdictText,
    findings,
  };
}
