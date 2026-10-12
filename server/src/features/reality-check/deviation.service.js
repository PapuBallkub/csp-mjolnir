/**
 * server/src/features/reality-check/deviation.service.js
 *
 * Implements FR-20 (Requirement Deviation Analysis) and FR-21 (Lock-Spec Risk Scoring).
 * Compares qualification conditions, technical specs, and commercial clauses against
 * historical and statutory procurement norms to produce structured findings.
 *
 * Conforms to docs/features/reality-check-and-benchmarking.md & ADR 0021/0022.
 */

import { TorInsight } from '#models/index.js';
import { getProjectPrice } from './similarity.service.js';

export const SEVERITY_POINTS = {
  high: 30,
  medium: 15,
  low: 5,
};

/**
 * 1. Checks if prior experience exceeds standard statutory proportions.
 * Standard benchmark: <= 50% of reference price.
 *
 * @param {object} targetTor
 * @returns {object|null} Finding or null
 */
export function checkExperienceRatio(targetTor) {
  const targetPrice = getProjectPrice(targetTor);
  const minExp = targetTor?.eligibility?.previousExperienceMinTHB;

  if (typeof targetPrice !== 'number' || targetPrice <= 0) return null;
  if (typeof minExp !== 'number' || minExp <= 0) return null;

  const ratio = minExp / targetPrice;
  const pct = Math.round(ratio * 100);

  if (ratio > 0.8) {
    return {
      title: 'กำหนดมูลค่าผลงานขั้นต่ำสูงผิดปกติ (เกิน 80% ของราคากลาง)',
      category: 'Qualification Barrier',
      requirementText: `กำหนดมูลค่าผลงานเดิมขั้นต่ำ ฿${minExp.toLocaleString('en-US')} (${pct}% ของราคากลาง)`,
      normalBenchmark: 'แนวทางจัดซื้อจัดจ้างภาครัฐกำหนดผลงานขั้นต่ำไม่เกิน 50% ของราคากลาง',
      sourceExcerpt: targetTor?.evidence?.previousExperienceMinTHB?.quote || targetTor?.eligibility?.previousExperience || '',
      sourceLocation: targetTor?.evidence?.previousExperienceMinTHB?.page ? `หน้า ${targetTor.evidence.previousExperienceMinTHB.page}` : '',
      severity: 'high',
    };
  }

  if (ratio > 0.5) {
    return {
      title: 'กำหนดมูลค่าผลงานขั้นต่ำสูงกว่าเกณฑ์ปกติ (เกิน 50% ของราคากลาง)',
      category: 'Qualification Barrier',
      requirementText: `กำหนดมูลค่าผลงานเดิมขั้นต่ำ ฿${minExp.toLocaleString('en-US')} (${pct}% ของราคากลาง)`,
      normalBenchmark: 'แนวทางจัดซื้อจัดจ้างภาครัฐกำหนดผลงานขั้นต่ำไม่เกิน 50% ของราคากลาง',
      sourceExcerpt: targetTor?.evidence?.previousExperienceMinTHB?.quote || targetTor?.eligibility?.previousExperience || '',
      sourceLocation: targetTor?.evidence?.previousExperienceMinTHB?.page ? `หน้า ${targetTor.evidence.previousExperienceMinTHB.page}` : '',
      severity: 'medium',
    };
  }

  return null;
}

/**
 * 2. Checks for Manufacturer Authorization Form (MAF) in service or software development.
 *
 * @param {object} targetTor
 * @returns {object|null} Finding or null
 */
export function checkManufacturerAuthorizations(targetTor) {
  const mafs = targetTor?.eligibility?.manufacturerAuthorizations || [];
  if (!Array.isArray(mafs) || mafs.length === 0) return null;

  const category = targetTor?.identification?.category;
  const isSoftwareDev = category === 'software-development';
  const isHire = targetTor?.procurementKind === 'hire';

  if (isSoftwareDev || isHire) {
    return {
      title: 'กำหนดหนังสือแต่งตั้งตัวแทนจำหน่าย (MAF) ในงานจ้างบริการหรือพัฒนาซอฟต์แวร์',
      category: 'Vendor Lock-in',
      requirementText: mafs.join('; '),
      normalBenchmark: 'งานจ้างบริการและพัฒนาซอฟต์แวร์ทั่วไปไม่กำหนดหนังสือแต่งตั้งจากผู้ผลิต (MAF)',
      sourceExcerpt: mafs[0] || '',
      sourceLocation: '',
      severity: 'high',
    };
  }

  if (mafs.length >= 3) {
    return {
      title: 'กำหนดหนังสือแต่งตั้งตัวแทนจำหน่าย (MAF) ซ้ำซ้อนหลายรายการ',
      category: 'Vendor Lock-in',
      requirementText: mafs.join('; '),
      normalBenchmark: 'ไม่ควรกำหนดหนังสือแต่งตั้งตัวแทนจำหน่ายในรายการอุปกรณ์หรือซอฟต์แวร์ทั่วไป',
      sourceExcerpt: mafs[0] || '',
      sourceLocation: '',
      severity: 'medium',
    };
  }

  return null;
}

/**
 * 3. Checks for disproportionate enterprise certifications on small budget projects (< 5M THB).
 *
 * @param {object} targetTor
 * @returns {object|null} Finding or null
 */
export function checkDisproportionateCertifications(targetTor) {
  const targetPrice = getProjectPrice(targetTor);
  const certs = targetTor?.eligibility?.requiredCertifications || [];

  if (!Array.isArray(certs) || certs.length === 0) return null;
  if (typeof targetPrice !== 'number' || targetPrice <= 0 || targetPrice >= 5000000) return null;

  const heavyPattern = /(cmmi|iso\s*27001|iso\s*20000|iso\s*22301)/i;
  const heavyMatches = certs.filter((c) => heavyPattern.test(String(c || '')));

  if (heavyMatches.length > 0) {
    return {
      title: 'กำหนดมาตรฐานขั้นสูง (CMMI / ISO 27001) ในโครงการวงเงินไม่เกิน 5 ล้านบาท',
      category: 'Qualification Barrier',
      requirementText: heavyMatches.join(', '),
      normalBenchmark: 'โครงการขนาดเล็กวงเงินไม่เกิน 5 ล้านบาทมักไม่กำหนดมาตรฐานระดับองค์กรขนาดใหญ่ เพื่อเปิดโอกาสการแข่งขันแก่ SME',
      sourceExcerpt: heavyMatches[0] || '',
      sourceLocation: '',
      severity: 'medium',
    };
  }

  return null;
}

/**
 * 4. Checks for exact outdated or end-of-life technology versions locked in specs.
 *
 * @param {object} targetTor
 * @returns {Array<object>} Findings
 */
export function checkTechnologyVersionLock(targetTor) {
  const techs = targetTor?.technicalRequirements?.requiredTechnologies || [];
  if (!Array.isArray(techs) || techs.length === 0) return [];

  const findings = [];
  const eolPattern = /(?:windows\s*server\s*(?:2003|2008|2012)|windows\s*(?:xp|vista|7|8)|python\s*2|php\s*5|oracle\s*(?:9|10|11)g)/i;

  for (const t of techs) {
    const fullName = `${t?.name || ''} ${t?.version || ''}`.trim();
    if (eolPattern.test(fullName)) {
      findings.push({
        title: `กำหนดเทคโนโลยีรุ่นเก่าที่หมดระยะสนับสนุนความปลอดภัย (${fullName})`,
        category: 'Specification Tailoring',
        requirementText: fullName,
        normalBenchmark: 'ควรกำหนดเทคโนโลยีเวอร์ชันปัจจุบันที่ยังได้รับการสนับสนุนความปลอดภัย (LTS)',
        sourceExcerpt: fullName,
        sourceLocation: '',
        severity: 'high',
      });
    }
  }

  return findings;
}

/**
 * 5. Checks for excessive daily penalty rates (> 0.20% per day).
 * Standard government procurement rate: 0.10% - 0.20% per day.
 *
 * @param {object} targetTor
 * @returns {object|null} Finding or null
 */
export function checkExcessivePenalty(targetTor) {
  const penaltyText =
    targetTor?.contractConditions?.paymentTerms ||
    targetTor?.facts?.penaltyClause ||
    targetTor?.evidence?.penaltyClause?.quote ||
    '';

  if (!penaltyText || typeof penaltyText !== 'string') return null;

  // Match e.g. "0.25%", "0.5%", "1%", "ร้อยละ 0.50", "ร้อยละ 1"
  const matchPct =
    penaltyText.match(/(?:ร้อยละ|อัตรา|คิดเป็น)\s*(\d+(?:\.\d+)?)\s*(?:%|เปอร์เซ็นต์)?/i) ||
    penaltyText.match(/(\d+(?:\.\d+)?)\s*%/);

  if (matchPct && matchPct[1]) {
    const rate = parseFloat(matchPct[1]);
    if (rate > 0.20 && rate <= 10) {
      return {
        title: `อัตราค่าปรับรายวันสูงกว่าเกณฑ์มาตรฐานราชการ (${rate}% ต่อวัน)`,
        category: 'Contractual Barrier',
        requirementText: penaltyText.trim(),
        normalBenchmark: 'ระเบียบกระทรวงการคลังฯ กำหนดอัตราค่าปรับงานซื้อหรืองานจ้างไม่เกินร้อยละ 0.20 ต่อวัน',
        sourceExcerpt: penaltyText.trim(),
        sourceLocation: targetTor?.evidence?.penaltyClause?.page ? `หน้า ${targetTor.evidence.penaltyClause.page}` : '',
        severity: 'medium',
      };
    }
  }

  return null;
}

/**
 * FR-20 & FR-21: Analyzes requirement deviations and calculates lock-spec risk score.
 *
 * @param {object} targetTor - Target TOR object or TorInsight document
 * @param {object} [options={}]
 * @returns {{ riskScore: number, verdictText: string, findings: Array<object> }}
 */
export function analyzeRequirementDeviations(targetTor, options = {}) {
  const rawFindings = [];

  // Run all deviation checks
  const expFinding = checkExperienceRatio(targetTor);
  if (expFinding) rawFindings.push(expFinding);

  const mafFinding = checkManufacturerAuthorizations(targetTor);
  if (mafFinding) rawFindings.push(mafFinding);

  const certFinding = checkDisproportionateCertifications(targetTor);
  if (certFinding) rawFindings.push(certFinding);

  const techFindings = checkTechnologyVersionLock(targetTor);
  rawFindings.push(...techFindings);

  const penaltyFinding = checkExcessivePenalty(targetTor);
  if (penaltyFinding) rawFindings.push(penaltyFinding);

  // Format and assign unique finding IDs
  const projectId = targetTor?.projectId || 'TOR';
  const findings = rawFindings.map((f, idx) => ({
    id: `FIND-${projectId}-${String(idx + 1).padStart(2, '0')}`,
    title: f.title,
    category: f.category || '',
    requirementText: f.requirementText,
    normalBenchmark: f.normalBenchmark || '',
    sourceExcerpt: f.sourceExcerpt || '',
    sourceLocation: f.sourceLocation || '',
    severity: f.severity || 'medium',
  }));

  // Calculate composite risk score
  const totalPoints = findings.reduce(
    (acc, f) => acc + (SEVERITY_POINTS[f.severity] || 15),
    0
  );
  const riskScore = Math.min(100, totalPoints);

  // Verdict copy
  let verdictText = '';
  if (riskScore >= 70) {
    verdictText = 'ความเสี่ยงสูง: พบเงื่อนไขที่อาจจำกัดการแข่งขันเฉพาะราย';
  } else if (riskScore >= 35) {
    verdictText = 'ความเสี่ยงปานกลาง: พบข้อกำหนดบางประการที่ควรตรวจสอบเพิ่มเติม';
  } else if (riskScore > 0) {
    verdictText = 'ความเสี่ยงต่ำ: ข้อกำหนดส่วนใหญ่เป็นไปตามมาตรฐานตลาด';
  } else {
    verdictText = 'ไม่พบข้อกำหนดที่ส่อถึงการล็อกสเปก';
  }

  return {
    riskScore,
    verdictText,
    findings,
  };
}

/**
 * End-to-end service to compute requirement deviations and lock-spec analysis,
 * optionally persisting results to MongoDB TorInsight.analytics.lockSpec.
 *
 * @param {object} targetTor
 * @param {object} [options={}]
 * @param {boolean} [options.save=false]
 * @returns {Promise<{ riskScore: number, verdictText: string, findings: Array<object> }>}
 */
export async function computeTorLockSpecAnalysis(targetTor, options = {}) {
  const lockSpec = analyzeRequirementDeviations(targetTor, options);

  if (options.save && targetTor?.projectId) {
    await TorInsight.updateOne(
      { projectId: targetTor.projectId },
      { $set: { 'analytics.lockSpec': lockSpec } }
    );
  }

  return lockSpec;
}
