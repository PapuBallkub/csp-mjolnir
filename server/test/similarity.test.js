import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateScaleProximity,
  calculateTechSimilarity,
  calculateScopeSimilarity,
  calculateCompositeSimilarity,
  getFiscalYear,
  getProjectPrice,
  getProjectArchetype,
  SYSTEM_ARCHETYPES,
  findComparableProjects,
} from '#features/reality-check/index.js';

test('getProjectPrice: picks referencePriceTHB first, then budgetTHB, handles missing', () => {
  assert.equal(getProjectPrice({ facts: { referencePriceTHB: 5000000, budgetTHB: 6000000 } }), 5000000);
  assert.equal(getProjectPrice({ facts: { referencePriceTHB: null, budgetTHB: 6000000 } }), 6000000);
  assert.equal(getProjectPrice({ facts: { referencePriceTHB: 0, budgetTHB: 0 } }), null);
  assert.equal(getProjectPrice({}), null);
});

test('getFiscalYear: calculates Thai Buddhist fiscal year correctly', () => {
  // October 2024 -> FY 2568 (since Oct starts next FY: 2024+1+543 = 2568)
  assert.equal(getFiscalYear('2024-10-15T00:00:00.000Z', '68010000000'), 2568);
  // May 2024 -> FY 2567 (same year: 2024+543 = 2567)
  assert.equal(getFiscalYear('2024-05-10T00:00:00.000Z', '67050000000'), 2567);
  // No valid date -> falls back to projectId prefix
  assert.equal(getFiscalYear(null, '67091234567'), 2567);
  assert.equal(getFiscalYear(null, '68039469567'), 2568);
});

test('calculateScaleProximity: calculates ratio of smaller to larger price', () => {
  assert.equal(calculateScaleProximity(10000000, 10000000), 1.0);
  assert.equal(calculateScaleProximity(5000000, 10000000), 0.5);
  assert.equal(calculateScaleProximity(10000000, 5000000), 0.5);
  assert.equal(calculateScaleProximity(null, 5000000), 0.5); // neutral fallback
});

test('calculateTechSimilarity: Jaccard overlap on technology names', () => {
  const stackA = [{ name: 'PostgreSQL' }, { name: 'Node.js' }, { name: 'Docker' }];
  const stackB = [{ name: 'postgresql' }, { name: 'Docker' }];
  // intersection: 2 ('postgresql', 'docker'), union: 3 -> 2/3 = 0.6667
  const score = calculateTechSimilarity(stackA, stackB);
  assert.ok(Math.abs(score - 0.6667) < 0.001);

  // Both empty -> neutral 0.5
  assert.equal(calculateTechSimilarity([], []), 0.5);
  // One empty -> slight penalty 0.2
  assert.equal(calculateTechSimilarity(stackA, []), 0.2);
});

test('calculateScopeSimilarity: extracts keywords and calculates overlap', () => {
  const torA = {
    identification: { titleTh: 'จ้างพัฒนาระบบ Portal บริการประชาชน (e-Service)' },
    overview: { majorComponents: ['ระบบยืนยันตัวตน', 'ระบบฐานข้อมูลกลาง'] },
  };
  const torB = {
    identification: { titleTh: 'โครงการพัฒนาระบบ e-Service และ Portal ภาครัฐ' },
    overview: { majorComponents: ['ฐานข้อมูลประชากร', 'โมบายแอปพลิเคชัน'] },
  };

  const score = calculateScopeSimilarity(torA, torB);
  assert.ok(score > 0.4, 'Should identify overlapping domain tokens');
});

test('findComparableProjects: filters and ranks candidate projects properly', async () => {
  const targetTor = {
    projectId: 'TARGET_001',
    identification: {
      category: 'software-development',
      titleTh: 'จ้างพัฒนาระบบบริการ e-Service สำหรับประชาชน',
    },
    facts: {
      referencePriceTHB: 10000000, // 10M THB
      postedDate: '2026-05-01',
    },
    overview: {
      majorComponents: ['ระบบ e-Service', 'ระบบฐานข้อมูล'],
    },
    technicalRequirements: {
      requiredTechnologies: [{ name: 'PostgreSQL' }, { name: 'React' }],
    },
  };

  const pool = [
    // Candidate 1: Same category, identical price, high scope/tech match -> Best match
    {
      projectId: 'CAND_BEST',
      identification: {
        category: 'software-development',
        titleTh: 'จ้างพัฒนาระบบ e-Service และเว็บพอร์ทัล',
      },
      facts: {
        referencePriceTHB: 10000000,
        postedDate: '2025-06-01',
      },
      overview: { majorComponents: ['ระบบ e-Service', 'ฐานข้อมูล'] },
      technicalRequirements: {
        requiredTechnologies: [{ name: 'PostgreSQL' }, { name: 'React' }],
      },
    },
    // Candidate 2: Same category, 15M THB (within 0.3x - 3.0x), partial tech match
    {
      projectId: 'CAND_GOOD',
      identification: {
        category: 'software-development',
        titleTh: 'โครงการพัฒนาระบบบริหารจัดการข้อมูล e-Service',
      },
      facts: {
        referencePriceTHB: 15000000,
        postedDate: '2024-03-01',
      },
      overview: { majorComponents: ['ระบบ e-Service'] },
      technicalRequirements: {
        requiredTechnologies: [{ name: 'PostgreSQL' }],
      },
    },
    // Candidate 3: Same category, but price is 100M (outside 0.3x - 3.0x of 10M) -> Should be filtered out
    {
      projectId: 'CAND_OUT_OF_SCALE',
      identification: {
        category: 'software-development',
        titleTh: 'พัฒนาระบบแกนหลักขนาดใหญ่',
      },
      facts: {
        referencePriceTHB: 100000000, // 100M
      },
    },
    // Candidate 4: Different category (network-and-security) -> Should be filtered out
    {
      projectId: 'CAND_WRONG_CAT',
      identification: {
        category: 'network-and-security',
        titleTh: 'จัดซื้อระบบเครือข่ายความปลอดภัย',
      },
      facts: {
        referencePriceTHB: 10000000,
      },
    },
    // Candidate 5: Target itself -> Should be filtered out
    {
      projectId: 'TARGET_001',
      identification: {
        category: 'software-development',
      },
      facts: {
        referencePriceTHB: 10000000,
      },
    },
  ];

  const results = await findComparableProjects(targetTor, { candidatesPool: pool });

  assert.equal(results.length, 2, 'Should only return the 2 valid candidates');
  assert.equal(results[0].projectId, 'CAND_BEST', 'Highest scoring candidate must rank first');
  assert.equal(results[1].projectId, 'CAND_GOOD');

  // Verify structure conforms to comparableProjectSchema
  const topMatch = results[0];
  assert.equal(typeof topMatch.title, 'string');
  assert.equal(typeof topMatch.year, 'number');
  assert.equal(topMatch.referencePriceTHB, 10000000);
  assert.ok(topMatch.score > results[1].score);
});

test('findComparableProjects: matches realistic project 69109062251 (maintenance-and-support)', async () => {
  const { TEST_HISTORICAL_PROJECTS } = await import('../scripts/seed-comparable-test.js');

  const realProject = {
    projectId: '69109062251',
    identification: {
      titleTh: 'จ้างบำรุงรักษาเครื่องคอมพิวเตอร์แม่ข่าย (Server) เครื่องคอมพิวเตอร์ และ LAN Cable',
      category: 'maintenance-and-support',
    },
    facts: {
      budgetTHB: 1194600,
      referencePriceTHB: 1290420,
    },
    overview: {
      majorComponents: [
        'Preventive Maintenance ของเครื่องคอมพิวเตอร์แม่ข่าย คอมพิวเตอร์ และระบบ LAN',
        'การซ่อมแซมแก้ไขเมื่อเกิดปัญหาขัดข้อง',
        'โปรแกรมป้องกันไวรัส',
      ],
    },
    technicalRequirements: {
      requiredTechnologies: [
        { name: 'Windows Server', version: '2022' },
        { name: 'Windows', version: '11' },
      ],
    },
  };

  const results = await findComparableProjects(realProject, {
    candidatesPool: TEST_HISTORICAL_PROJECTS,
  });

  assert.equal(results.length, 2, 'Should find both maintenance-and-support projects');
  assert.ok(results[0].score > 0.8, 'Top score should be high (>80%)');
  assert.ok(results[1].score > 0.7, 'Second score should also be high');
});

test('findComparableProjects: full extractions only, not title-level or waiting records (ADR 0028)', async () => {
  const target = {
    projectId: 'TARGET_002',
    identification: { category: 'software-licenses', titleTh: 'เช่าใช้บริการ Microsoft 365' },
    facts: { referencePriceTHB: 1000000 },
  };
  const candidate = (projectId, metadata) => ({
    projectId,
    identification: { category: 'software-licenses', titleTh: 'เช่าใช้บริการ Microsoft 365 รายปี' },
    facts: { referencePriceTHB: 1100000 },
    metadata,
  });
  const pool = [
    candidate('FULL', {}),
    candidate('TITLE_LEVEL', { titleOnly: true }),
    candidate('WAITING', { awaitingFullText: true }),
    candidate('NOT_IT', { excluded: { reason: 'ไม่ใช่งานไอที' } }),
  ];

  const results = await findComparableProjects(target, { candidatesPool: pool });

  assert.deepEqual(results.map((r) => r.projectId), ['FULL']);
});

test('getProjectArchetype: prioritizes AI-extracted systemArchetype over heuristic detection', () => {
  // Direct AI extraction sets 'mobile-app'
  const aiExtractedTor = {
    overview: { systemArchetype: 'mobile-app' },
    identification: { titleTh: 'โครงการพัฒนาระบบคลังข้อมูลกลาง' }, // title mentions data warehouse
  };
  assert.equal(getProjectArchetype(aiExtractedTor), 'mobile-app');

  // titleTh is excluded from scoring: only having ERP in title returns 'other'
  const titleOnlyTor = {
    identification: { titleTh: 'จ้างพัฒนาระบบ ERP บริหารจัดการพัสดุและคลังสินค้า' },
  };
  assert.equal(getProjectArchetype(titleOnlyTor), 'other');

  // Fallback heuristic: detects 'enterprise-erp' from majorComponents
  const heuristicTor = {
    overview: { majorComponents: ['ระบบ ERP บริหารจัดการพัสดุและคลังสินค้า'] },
  };
  assert.equal(getProjectArchetype(heuristicTor), 'enterprise-erp');

  // Unknown components fall back to 'other'
  const unknownTor = {
    overview: { majorComponents: ['โครงการตามข้อตกลงพิเศษหน่วยงาน'] },
  };
  assert.equal(getProjectArchetype(unknownTor), 'other');
});

test('calculateScopeSimilarity: matches identical system archetypes with high score, penalizes mismatches', () => {
  const mobileTorA = { overview: { systemArchetype: 'mobile-app' } };
  const mobileTorB = { overview: { systemArchetype: 'mobile-app' } };
  const erpTor = { overview: { systemArchetype: 'enterprise-erp' } };

  // Identical archetypes -> 1.0 (100% architecture match)
  assert.equal(calculateScopeSimilarity(mobileTorA, mobileTorB), 1.0);

  // Different archetypes -> 0.15 (penalized mismatch)
  assert.equal(calculateScopeSimilarity(mobileTorA, erpTor), 0.15);
});

test('findComparableProjects: adaptive bracket widens when candidates < 3', async () => {
  const target = {
    projectId: 'TARGET_EXPAND',
    identification: { category: 'data-and-ai', titleTh: 'ระบบประมวลผลข้อมูล AI' },
    facts: { referencePriceTHB: 10000000 }, // 10M
    overview: { systemArchetype: 'data-analytics' },
  };

  const pool = [
    // 1 candidate within [0.3x, 3.0x] (3M - 30M)
    {
      projectId: 'CAND_1',
      identification: { category: 'data-and-ai', titleTh: 'ระบบวิเคราะห์ข้อมูล 1' },
      facts: { referencePriceTHB: 12000000 },
      overview: { systemArchetype: 'data-analytics' },
    },
    // 2 candidates outside [0.3x, 3.0x], but within adaptive [0.15x, 6.0x] (1.5M - 60M)
    {
      projectId: 'CAND_2',
      identification: { category: 'data-and-ai', titleTh: 'ระบบวิเคราะห์ข้อมูล 2' },
      facts: { referencePriceTHB: 2000000 }, // 2M (0.2x)
      overview: { systemArchetype: 'data-analytics' },
    },
    {
      projectId: 'CAND_3',
      identification: { category: 'data-and-ai', titleTh: 'ระบบวิเคราะห์ข้อมูล 3' },
      facts: { referencePriceTHB: 40000000 }, // 40M (4.0x)
      overview: { systemArchetype: 'data-analytics' },
    },
    // 1 candidate way out of scale (80M > 6.0x)
    {
      projectId: 'CAND_WAY_OUT',
      identification: { category: 'data-and-ai', titleTh: 'ระบบวิเคราะห์ข้อมูล 4' },
      facts: { referencePriceTHB: 80000000 },
    },
  ];

  // With adaptive: false, only CAND_1 matches
  const strictResults = await findComparableProjects(target, {
    candidatesPool: pool,
    adaptive: false,
  });
  assert.equal(strictResults.length, 1);
  assert.equal(strictResults[0].projectId, 'CAND_1');

  // With default adaptive: true, count < 3 expands bracket to include CAND_2 and CAND_3
  const adaptiveResults = await findComparableProjects(target, {
    candidatesPool: pool,
    adaptive: true,
  });
  assert.equal(adaptiveResults.length, 3);
  assert.deepEqual(
    adaptiveResults.map((r) => r.projectId).sort(),
    ['CAND_1', 'CAND_2', 'CAND_3'],
  );
});
