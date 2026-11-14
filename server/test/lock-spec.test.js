/**
 * server/test/lock-spec.test.js
 *
 * Tests for FR-21: Automated lock-spec risk detection, qualification barriers,
 * and non-accusatory evidence generation.
 * Conforms to ADR 0014, ADR 0021, ADR 0035, and Circular ว 214.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectVendorLockin,
  detectQualificationBarriers,
  detectSpecificationTailoring,
  calculateLockSpecScore,
  formatLockSpecVerdict,
  analyzeLockSpec,
} from '#features/reality-check/index.js';

test('detectVendorLockin: flags MAF on software-development as high severity', () => {
  const tor = {
    projectId: '68039469567',
    identification: { categories: ['software-development'] },
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
      identification: { categories: ['software-development'] },
      eligibility: { manufacturerAuthorizations: [] },
    }),
    null,
  );

  // Hardware purchase with MAF is standard practice under Circular ว 214 Clause 1.1
  assert.equal(
    detectVendorLockin({
      identification: { categories: ['network-and-security'] },
      eligibility: { manufacturerAuthorizations: ['MAF from Cisco'] },
    }),
    null,
  );
});

test('detectQualificationBarriers: flags high severity when prior experience > 50% of reference price', () => {
  const tor = {
    projectId: '68039469568',
    facts: { referencePriceTHB: 3_000_000 },
    eligibility: { previousExperienceMinTHB: 1_800_000 }, // 60.0%
    evidence: {
      'eligibility.previousExperienceMinTHB': {
        quote: 'มีผลงานไม่น้อยกว่า 1.8 ล้านบาท',
        page: 4,
      },
    },
  };

  const finding = detectQualificationBarriers(tor, 3_000_000);
  assert.ok(finding);
  assert.equal(finding.category, 'Qualification Barrier');
  assert.equal(finding.severity, 'high');
  assert.match(finding.title, /เกินเกณฑ์ 50% ของราคากลาง/);
  assert.match(finding.requirementText, /60.0%/);
  assert.equal(finding.sourceLocation, 'หน้า 4');
});

test('detectQualificationBarriers: returns null when prior experience is <= 50% of reference price', () => {
  const tor = {
    facts: { referencePriceTHB: 4_000_000 },
    eligibility: { previousExperienceMinTHB: 1_500_000 }, // 37.5% (normal)
  };

  assert.equal(detectQualificationBarriers(tor, 4_000_000), null);
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

test('detectSpecificationTailoring: returns null when "or equivalent" is stated (allowsEquivalent: true or in quote)', () => {
  // Case A: allowsEquivalent is true from Vertex AI extraction
  const torA = {
    technicalRequirements: {
      requiredTechnologies: [
        { name: 'Windows Server', version: '2019', allowsEquivalent: true },
      ],
    },
    evidence: {
      'technicalRequirements.requiredTechnologies': {
        quote: 'ระบบต้องติดตั้งบน Windows Server 2019 หรือเทียบเท่า',
      },
    },
  };
  assert.equal(detectSpecificationTailoring(torA), null);

  // Case B: quote explicitly contains "หรือเทียบเท่า" even if tech boolean is null
  const torB = {
    technicalRequirements: {
      requiredTechnologies: [
        { name: 'Windows Server', version: '2019', allowsEquivalent: null },
      ],
    },
    evidence: {
      'technicalRequirements.requiredTechnologies': {
        quote: 'ระบบต้องทำงานบน Windows Server 2019 หรือระบบปฏิบัติการอื่นที่เทียบเท่า',
      },
    },
  };
  assert.equal(detectSpecificationTailoring(torB), null);
});

test('calculateLockSpecScore: correctly aggregates points with 100 cap', () => {
  assert.equal(calculateLockSpecScore([]), 0);
  assert.equal(calculateLockSpecScore([{ severity: 'low' }]), 5);
  assert.equal(calculateLockSpecScore([{ severity: 'high' }]), 35);
  assert.equal(calculateLockSpecScore([{ severity: 'high' }, { severity: 'high' }]), 70);
  // Cap test: 4 high findings = 140 -> capped at 100
  const multipleHighs = [
    { severity: 'high' },
    { severity: 'high' },
    { severity: 'high' },
    { severity: 'high' },
  ];
  assert.equal(calculateLockSpecScore(multipleHighs), 100);
});

test('formatLockSpecVerdict: produces non-accusatory Thai copy matching risk thresholds', () => {
  assert.equal(formatLockSpecVerdict(70), 'ความเสี่ยงสูง: พบเงื่อนไขที่อาจจำกัดการแข่งขันเฉพาะราย');
  assert.equal(formatLockSpecVerdict(35), 'ความเสี่ยงปานกลาง: มีเงื่อนไขบางข้อที่อาจจำกัดการแข่งขัน');
  assert.equal(formatLockSpecVerdict(15), 'ความเสี่ยงต่ำ: ข้อกำหนดเปิดกว้างตามมาตรฐาน');
  assert.equal(formatLockSpecVerdict(0), 'ความเสี่ยงต่ำ: ข้อกำหนดเปิดกว้างตามมาตรฐาน');
});

test('analyzeLockSpec: end-to-end analysis on clean open tender produces low risk', () => {
  const cleanTor = {
    projectId: '68039469580',
    identification: { categories: ['software-development'] },
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
    identification: { categories: ['software-development'] },
    facts: { referencePriceTHB: 3_000_000 },
    eligibility: {
      manufacturerAuthorizations: ['Official MAF certificate required'],
      previousExperienceMinTHB: 2_600_000, // 86.7% > 50% (high: 35 pts)
    },
    technicalRequirements: {
      requiredTechnologies: [{ name: 'PostgreSQL' }],
    },
  };

  const result = analyzeLockSpec(biasedTor);
  // 35 (MAF) + 35 (>50% Exp) = 70 points (High Risk >= 70)
  assert.equal(result.riskScore, 70);
  assert.equal(result.verdictText, 'ความเสี่ยงสูง: พบเงื่อนไขที่อาจจำกัดการแข่งขันเฉพาะราย');
  assert.equal(result.findings.length, 2);
  assert.equal(result.findings[0].category, 'Vendor Lock-in');
  assert.equal(result.findings[1].category, 'Qualification Barrier');
});

const askingForALetter = (categories, procurementKind = null) => ({
  projectId: '69000000001',
  identification: { categories },
  facts: { procurementKind },
  eligibility: { manufacturerAuthorizations: ['หนังสือแต่งตั้งตัวแทนจำหน่ายจากผู้ผลิต'] },
});

test('detectVendorLockin: the main category decides, not the rest of the list (ADR 0034)', () => {
  const fires = (categories, kind) => detectVendorLockin(askingForALetter(categories, kind)) !== null;

  // Licenses as the main scope: not flagged, whatever else the project holds
  assert.equal(fires(['software-licenses']), false);
  assert.equal(fires(['software-licenses', 'software-development']), false);
  assert.equal(fires(['software-licenses', 'systems-integration'], 'hire'), false, 'checked before the contract kind');

  // Building as the main scope: flagged, even with licenses further down
  assert.equal(fires(['software-development']), true);
  assert.equal(fires(['systems-integration']), true);
  assert.equal(fires(['software-development', 'software-licenses']), true);
  assert.equal(fires(['systems-integration', 'maintenance-and-support', 'software-licenses']), true);

  // Any other main scope: only a hire contract is flagged
  assert.equal(fires(['maintenance-and-support'], 'hire'), true);
  assert.equal(fires(['maintenance-and-support'], 'buy'), false);
  assert.equal(fires(['maintenance-and-support']), false);
  assert.equal(fires(['data-and-ai', 'software-development'], 'buy'), false);
  assert.equal(fires([], 'hire'), true);
  assert.equal(fires([]), false);
});

test('detectVendorLockin: says why a letter still matters when licenses are only part of the project', () => {
  const mixed = detectVendorLockin(askingForALetter(['software-development', 'software-licenses']));
  assert.match(mixed.normalBenchmark, /ซื้อสิทธิ์ใช้งานซอฟต์แวร์/);
  assert.match(mixed.normalBenchmark, /ว 214 ข้อ 1\.3/);

  const plain = detectVendorLockin(askingForALetter(['software-development']));
  assert.doesNotMatch(plain.normalBenchmark, /สิทธิ์ใช้งาน/);
});

test('detectVendorLockin: a hire contract that builds nothing is not called software development', () => {
  const finding = detectVendorLockin(askingForALetter(['maintenance-and-support'], 'hire'));
  assert.doesNotMatch(finding.title, /พัฒนาซอฟต์แวร์/);
  assert.doesNotMatch(finding.normalBenchmark, /พัฒนาซอฟต์แวร์/);
});
