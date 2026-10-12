import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkExperienceRatio,
  checkManufacturerAuthorizations,
  checkDisproportionateCertifications,
  checkTechnologyVersionLock,
  checkExcessivePenalty,
  analyzeRequirementDeviations,
} from '#features/reality-check/index.js';

test('checkExperienceRatio: flags ratio > 80% as high and > 50% as medium', () => {
  // Case 1: High severity (> 80%)
  const torHigh = {
    facts: { referencePriceTHB: 10000000 },
    eligibility: { previousExperienceMinTHB: 8500000 },
    evidence: { previousExperienceMinTHB: { page: 5, quote: 'ผลงานไม่น้อยกว่า 8,500,000 บาท' } },
  };
  const resHigh = checkExperienceRatio(torHigh);
  assert.ok(resHigh);
  assert.equal(resHigh.severity, 'high');
  assert.equal(resHigh.category, 'Qualification Barrier');
  assert.ok(resHigh.requirementText.includes('85%'));
  assert.equal(resHigh.sourceLocation, 'หน้า 5');

  // Case 2: Medium severity (> 50% and <= 80%)
  const torMed = {
    facts: { referencePriceTHB: 10000000 },
    eligibility: { previousExperienceMinTHB: 6000000 },
  };
  const resMed = checkExperienceRatio(torMed);
  assert.ok(resMed);
  assert.equal(resMed.severity, 'medium');

  // Case 3: Normal ratio (<= 50%)
  const torNormal = {
    facts: { referencePriceTHB: 10000000 },
    eligibility: { previousExperienceMinTHB: 4000000 },
  };
  assert.equal(checkExperienceRatio(torNormal), null);

  // Case 4: Missing or invalid price/experience
  assert.equal(checkExperienceRatio({ facts: {}, eligibility: {} }), null);
});

test('checkManufacturerAuthorizations: flags MAF in software development or excessive MAFs', () => {
  // Case 1: Software development requiring MAF -> High severity
  const torSoft = {
    identification: { category: 'software-development' },
    eligibility: { manufacturerAuthorizations: ['หนังสือแต่งตั้งตัวแทนจำหน่ายจากผู้ผลิต'] },
  };
  const resSoft = checkManufacturerAuthorizations(torSoft);
  assert.ok(resSoft);
  assert.equal(resSoft.severity, 'high');
  assert.equal(resSoft.category, 'Vendor Lock-in');

  // Case 2: Hardware contract with 1 standard MAF -> Normal (null)
  const torHwNormal = {
    identification: { category: 'network-and-security' },
    procurementKind: 'purchase',
    eligibility: { manufacturerAuthorizations: ['หนังสือแต่งตั้งตัวแทนจำหน่ายอุปกรณ์ Switch'] },
  };
  assert.equal(checkManufacturerAuthorizations(torHwNormal), null);

  // Case 3: Hardware contract with 3+ MAFs -> Medium severity (excessive)
  const torHwExcess = {
    identification: { category: 'network-and-security' },
    eligibility: { manufacturerAuthorizations: ['MAF Switch', 'MAF Router', 'MAF Firewall'] },
  };
  const resHwExcess = checkManufacturerAuthorizations(torHwExcess);
  assert.ok(resHwExcess);
  assert.equal(resHwExcess.severity, 'medium');
});

test('checkDisproportionateCertifications: flags CMMI / ISO 27001 on budget < 5M', () => {
  // Case 1: Small budget (< 5M) demanding CMMI -> Medium severity
  const torSmallCMMI = {
    facts: { referencePriceTHB: 3500000 },
    eligibility: { requiredCertifications: ['CMMI Level 3', 'ISO 9001'] },
  };
  const resSmall = checkDisproportionateCertifications(torSmallCMMI);
  assert.ok(resSmall);
  assert.equal(resSmall.severity, 'medium');
  assert.equal(resSmall.category, 'Qualification Barrier');

  // Case 2: Large budget (>= 5M) demanding CMMI -> Normal (null)
  const torLarge = {
    facts: { referencePriceTHB: 50000000 },
    eligibility: { requiredCertifications: ['CMMI Level 3'] },
  };
  assert.equal(checkDisproportionateCertifications(torLarge), null);

  // Case 3: Small budget with ordinary ISO 9001 -> Normal (null)
  const torOrdinary = {
    facts: { referencePriceTHB: 2000000 },
    eligibility: { requiredCertifications: ['ISO 9001:2015'] },
  };
  assert.equal(checkDisproportionateCertifications(torOrdinary), null);
});

test('checkTechnologyVersionLock: detects outdated and EOL operating systems', () => {
  const torEOL = {
    technicalRequirements: {
      requiredTechnologies: [
        { name: 'Windows Server', version: '2012' },
        { name: 'Node.js', version: '20' },
      ],
    },
  };
  const findings = checkTechnologyVersionLock(torEOL);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, 'high');
  assert.equal(findings[0].category, 'Specification Tailoring');
  assert.ok(findings[0].requirementText.includes('Windows Server 2012'));

  // Modern stack -> 0 findings
  const torModern = {
    technicalRequirements: {
      requiredTechnologies: [
        { name: 'Windows Server', version: '2022' },
        { name: 'PostgreSQL', version: '16' },
      ],
    },
  };
  assert.equal(checkTechnologyVersionLock(torModern).length, 0);
});

test('checkExcessivePenalty: detects daily penalty rate > 0.20%', () => {
  const torHighPenalty = {
    facts: { penaltyClause: 'ปรับเป็นรายวันในอัตราร้อยละ 0.50 ของราคาพัสดุ' },
  };
  const resHigh = checkExcessivePenalty(torHighPenalty);
  assert.ok(resHigh);
  assert.equal(resHigh.severity, 'medium');
  assert.equal(resHigh.category, 'Contractual Barrier');

  // Standard penalty (0.20% or 0.10%)
  const torStandard = {
    facts: { penaltyClause: 'อัตราร้อยละ 0.20 ต่อวัน' },
  };
  assert.equal(checkExcessivePenalty(torStandard), null);
});

test('analyzeRequirementDeviations: aggregates findings, computes score, and assigns verdict', () => {
  // Project with multiple lock-spec red flags
  const riggedProject = {
    projectId: '68099999999',
    identification: { category: 'software-development' },
    facts: { referencePriceTHB: 4000000, penaltyClause: 'อัตรา 0.50% ต่อวัน' },
    eligibility: {
      previousExperienceMinTHB: 3500000, // 87.5% -> High (30 pts)
      manufacturerAuthorizations: ['MAF Letter from vendor'], // Soft dev MAF -> High (30 pts)
      requiredCertifications: ['CMMI Level 5'], // < 5M budget with CMMI -> Med (15 pts)
    },
    technicalRequirements: {
      requiredTechnologies: [{ name: 'Windows Server', version: '2008' }], // EOL -> High (30 pts)
    },
  };

  const analysis = analyzeRequirementDeviations(riggedProject);

  // Total points = 30 + 30 + 15 + 30 + 15 = 120 -> capped at 100
  assert.equal(analysis.riskScore, 100);
  assert.ok(analysis.verdictText.includes('ความเสี่ยงสูง'));
  assert.ok(analysis.findings.length >= 4);

  // Check finding structure
  const firstFinding = analysis.findings[0];
  assert.ok(firstFinding.id.startsWith('FIND-68099999999-'));
  assert.ok(firstFinding.title);
  assert.ok(firstFinding.category);
  assert.ok(firstFinding.requirementText);
  assert.ok(firstFinding.normalBenchmark);
});

test('analyzeRequirementDeviations: clean project yields 0 riskScore and clean verdict', () => {
  const cleanProject = {
    projectId: '68011111111',
    identification: { category: 'software-development' },
    facts: { referencePriceTHB: 10000000, penaltyClause: 'ร้อยละ 0.10 ต่อวัน' },
    eligibility: {
      previousExperienceMinTHB: 3000000, // 30% -> Normal
      manufacturerAuthorizations: [],
      requiredCertifications: ['ISO 9001:2015'],
    },
    technicalRequirements: {
      requiredTechnologies: [{ name: 'React', version: null }, { name: 'PostgreSQL', version: null }],
    },
  };

  const analysis = analyzeRequirementDeviations(cleanProject);
  assert.equal(analysis.riskScore, 0);
  assert.equal(analysis.findings.length, 0);
  assert.equal(analysis.verdictText, 'ไม่พบข้อกำหนดที่ส่อถึงการล็อกสเปก');
});
