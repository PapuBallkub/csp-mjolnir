/**
 * server/test/lock-spec.test.js
 *
 * Tests for FR-21: Automated lock-spec risk detection, qualification barriers,
 * and non-accusatory evidence generation.
 * Conforms to ADR 0014, ADR 0021, ADR 0030.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectVendorLockin,
  detectQualificationBarriers,
  detectPersonnelBarriers,
  detectSpecificationTailoring,
  calculateLockSpecScore,
  formatLockSpecVerdict,
  analyzeLockSpec,
} from '#features/reality-check/index.js';

test('detectVendorLockin: flags MAF on software-development as high severity', () => {
  const tor = {
    projectId: '68039469567',
    identification: { category: 'software-development' },
    eligibility: {
      manufacturerAuthorizations: ['หนังสือแต่งตั้งตัวแทนจำหน่ายจากผู้ผลิตซอฟต์แวร์'],
    },
    evidence: {
      'eligibility.manufacturerAuthorizations': {
        quote: 'ผู้ยื่นข้อเสนอต้องแนบหนังสือแต่งตั้งตัวแทนจำหน่าย (MAF)',
        page: 8,
      },
    },
  };

  const finding = detectVendorLockin(tor);
  assert.ok(finding);
  assert.equal(finding.category, 'Vendor Lock-in');
  assert.equal(finding.severity, 'high');
  assert.match(finding.title, /หนังสือแต่งตั้งตัวแทนจำหน่าย \(MAF\)/);
  assert.equal(finding.sourceLocation, 'หน้า 8');
});

test('detectVendorLockin: returns null when no MAF or when category is non-software', () => {
  // Software without MAF
  assert.equal(
    detectVendorLockin({
      identification: { category: 'software-development' },
      eligibility: { manufacturerAuthorizations: [] },
    }),
    null,
  );

  // Hardware purchase with MAF is standard practice
  assert.equal(
    detectVendorLockin({
      identification: { category: 'hardware-purchase' },
      eligibility: { manufacturerAuthorizations: ['MAF from Cisco'] },
    }),
    null,
  );
});

test('detectQualificationBarriers: flags high severity when prior experience > 80% of reference price', () => {
  const tor = {
    projectId: '68039469568',
    facts: { referencePriceTHB: 3_000_000 },
    eligibility: { previousExperienceMinTHB: 2_600_000 }, // 86.7%
    evidence: {
      'eligibility.previousExperienceMinTHB': {
        quote: 'มีผลงานไม่น้อยกว่า 2.6 ล้านบาท',
        page: 4,
      },
    },
  };

  const finding = detectQualificationBarriers(tor, 3_000_000);
  assert.ok(finding);
  assert.equal(finding.category, 'Qualification Barrier');
  assert.equal(finding.severity, 'high');
  assert.match(finding.title, /เกิน 80% ของราคากลาง/);
  assert.match(finding.requirementText, /86.7%/);
  assert.equal(finding.sourceLocation, 'หน้า 4');
});

test('detectQualificationBarriers: flags medium severity when prior experience is 50% - 80% of reference price', () => {
  const tor = {
    projectId: '68039469569',
    facts: { referencePriceTHB: 4_000_000 },
    eligibility: { previousExperienceMinTHB: 2_400_000 }, // 60.0%
  };

  const finding = detectQualificationBarriers(tor, 4_000_000);
  assert.ok(finding);
  assert.equal(finding.category, 'Qualification Barrier');
  assert.equal(finding.severity, 'medium');
  assert.match(finding.title, /สูงกว่าเกณฑ์มาตรฐาน 50%/);
});

test('detectQualificationBarriers: returns null when prior experience is <= 50% of reference price', () => {
  const tor = {
    facts: { referencePriceTHB: 4_000_000 },
    eligibility: { previousExperienceMinTHB: 1_500_000 }, // 37.5% (normal)
  };

  assert.equal(detectQualificationBarriers(tor, 4_000_000), null);
});

test('detectPersonnelBarriers: flags medium severity when CMMI / ISO required on small budget (<= 5M)', () => {
  const tor = {
    projectId: '68039469570',
    facts: { referencePriceTHB: 3_500_000 },
    eligibility: { requiredCertifications: ['CMMI Level 3', 'ISO 29110'] },
    evidence: {
      'eligibility.requiredCertifications': {
        quote: 'ต้องได้รับการรับรองมาตรฐาน CMMI Level 3',
        page: 5,
      },
    },
  };

  const finding = detectPersonnelBarriers(tor, 3_500_000);
  assert.ok(finding);
  assert.equal(finding.category, 'Personnel Barrier');
  assert.equal(finding.severity, 'medium');
  assert.match(finding.title, /CMMI/);
  assert.equal(finding.sourceLocation, 'หน้า 5');
});

test('detectPersonnelBarriers: returns null on large enterprise budget projects (> 5M)', () => {
  const tor = {
    facts: { referencePriceTHB: 20_000_000 },
    eligibility: { requiredCertifications: ['CMMI Level 3'] },
  };

  // CMMI is expected and normal on 20M enterprise platforms
  assert.equal(detectPersonnelBarriers(tor, 20_000_000), null);
});

test('detectSpecificationTailoring: flags exact outdated proprietary platform requirement', () => {
  const tor = {
    projectId: '68039469571',
    technicalRequirements: {
      requiredTechnologies: [
        { name: 'Windows Server', version: '2019' },
        { name: 'PostgreSQL', version: '15' },
      ],
    },
    evidence: {
      'technicalRequirements.requiredTechnologies': {
        quote: 'ระบบต้องติดตั้งบน Windows Server 2019',
        page: 12,
      },
    },
  };

  const finding = detectSpecificationTailoring(tor);
  assert.ok(finding);
  assert.equal(finding.category, 'Specification Tailoring');
  assert.equal(finding.severity, 'high');
  assert.match(finding.title, /Windows Server 2019/);
});

test('calculateLockSpecScore: correctly aggregates points with 100 cap', () => {
  assert.equal(calculateLockSpecScore([]), 0);
  assert.equal(calculateLockSpecScore([{ severity: 'low' }]), 5);
  assert.equal(calculateLockSpecScore([{ severity: 'high' }, { severity: 'medium' }]), 45);
  // Cap test: 4 high findings = 120 -> capped at 100
  const multipleHighs = [
    { severity: 'high' },
    { severity: 'high' },
    { severity: 'high' },
    { severity: 'high' },
  ];
  assert.equal(calculateLockSpecScore(multipleHighs), 100);
});

test('formatLockSpecVerdict: produces non-accusatory Thai copy matching risk thresholds', () => {
  assert.equal(formatLockSpecVerdict(85), 'ความเสี่ยงสูง: พบเงื่อนไขที่อาจจำกัดการแข่งขันเฉพาะราย');
  assert.equal(formatLockSpecVerdict(45), 'ความเสี่ยงปานกลาง: มีเงื่อนไขบางข้อที่อาจจำกัดการแข่งขัน');
  assert.equal(formatLockSpecVerdict(15), 'ความเสี่ยงต่ำ: ข้อกำหนดเปิดกว้างตามมาตรฐาน');
  assert.equal(formatLockSpecVerdict(0), 'ความเสี่ยงต่ำ: ข้อกำหนดเปิดกว้างตามมาตรฐาน');
});

test('analyzeLockSpec: end-to-end analysis on clean open tender produces low risk', () => {
  const cleanTor = {
    projectId: '68039469580',
    identification: { category: 'software-development' },
    facts: { referencePriceTHB: 4_000_000 },
    eligibility: {
      manufacturerAuthorizations: [],
      previousExperienceMinTHB: 1_200_000, // 30% (fair)
      requiredCertifications: [],
    },
    technicalRequirements: {
      requiredTechnologies: [{ name: 'React' }, { name: 'Node.js' }],
    },
  };

  const result = analyzeLockSpec(cleanTor);
  assert.equal(result.riskScore, 0);
  assert.equal(result.verdictText, 'ความเสี่ยงต่ำ: ข้อกำหนดเปิดกว้างตามมาตรฐาน');
  assert.deepEqual(result.findings, []);
});

test('analyzeLockSpec: end-to-end analysis on multi-barrier tender produces high risk', () => {
  const biasedTor = {
    projectId: '68039469581',
    identification: { category: 'software-development' },
    facts: { referencePriceTHB: 3_000_000 },
    eligibility: {
      manufacturerAuthorizations: ['Official MAF certificate required'],
      previousExperienceMinTHB: 2_600_000, // 86.7% (high: 30 pts)
      requiredCertifications: ['CMMI Level 3'], // medium: 15 pts
    },
    technicalRequirements: {
      requiredTechnologies: [{ name: 'PostgreSQL' }],
    },
  };

  const result = analyzeLockSpec(biasedTor);
  // 30 (MAF) + 30 (86.7% Exp) + 15 (CMMI on 3M) = 75 points (High Risk >= 70)
  assert.equal(result.riskScore, 75);
  assert.equal(result.verdictText, 'ความเสี่ยงสูง: พบเงื่อนไขที่อาจจำกัดการแข่งขันเฉพาะราย');
  assert.equal(result.findings.length, 3);
  assert.equal(result.findings[0].category, 'Vendor Lock-in');
  assert.equal(result.findings[1].category, 'Qualification Barrier');
  assert.equal(result.findings[2].category, 'Personnel Barrier');
});
