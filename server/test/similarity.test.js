import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateScaleProximity,
  calculateTechSimilarity,
  calculateScopeSimilarity,
  calculateComplexitySimilarity,
  calculateCompositeSimilarity,
  getFiscalYear,
  getProjectPrice,
  getProjectArchetype,
  getProjectComplexityTier,
  SYSTEM_ARCHETYPES,
  COMPLEXITY_TIERS,
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

test('calculateScopeSimilarity: matches canonical system archetypes directly', () => {
  const torA = { overview: { systemArchetype: 'web-portal' } };
  const torB = { overview: { systemArchetype: 'web-portal' } };
  const torC = { overview: { systemArchetype: 'mobile-app' } };
  const torNull = { overview: { systemArchetype: null } };

  assert.equal(calculateScopeSimilarity(torA, torB), 1.0); // same archetype
  assert.equal(calculateScopeSimilarity(torA, torC), 0.15); // different archetype
  assert.equal(calculateScopeSimilarity(torA, torNull), 0.5); // neutral fallback
});

test('calculateComplexitySimilarity: computes step distances between tiers correctly', () => {
  const torBasic = { overview: { complexityTier: 'basic' } };
  const torStandard = { overview: { complexityTier: 'standard' } };
  const torEnterprise = { overview: { complexityTier: 'enterprise' } };
  const torNull = { overview: { complexityTier: null } };

  // Identical -> 1.0
  assert.equal(calculateComplexitySimilarity(torBasic, torBasic), 1.0);
  assert.equal(calculateComplexitySimilarity(torStandard, torStandard), 1.0);
  assert.equal(calculateComplexitySimilarity(torEnterprise, torEnterprise), 1.0);

  // Adjacent (1 step apart) -> 0.5
  assert.equal(calculateComplexitySimilarity(torBasic, torStandard), 0.5);
  assert.equal(calculateComplexitySimilarity(torStandard, torEnterprise), 0.5);

  // Distant (2 steps apart) -> 0.1
  assert.equal(calculateComplexitySimilarity(torBasic, torEnterprise), 0.1);

  // Null fallback -> neutral 0.5
  assert.equal(calculateComplexitySimilarity(torBasic, torNull), 0.5);
  assert.equal(calculateComplexitySimilarity(torNull, torEnterprise), 0.5);
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
      systemArchetype: 'web-portal',
      complexityTier: 'standard',
    },
    technicalRequirements: {
      requiredTechnologies: [{ name: 'PostgreSQL' }, { name: 'React' }],
    },
  };

  const pool = [
    // Candidate 1: Same category, identical archetype & tier, full tech match -> Best match
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
      overview: {
        majorComponents: ['ระบบ e-Service', 'ฐานข้อมูล'],
        systemArchetype: 'web-portal',
        complexityTier: 'standard',
      },
      technicalRequirements: {
        requiredTechnologies: [{ name: 'PostgreSQL' }, { name: 'React' }],
      },
    },
    // Candidate 2: Same category & archetype, adjacent tier (basic), partial tech match
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
      overview: {
        majorComponents: ['ระบบ e-Service'],
        systemArchetype: 'web-portal',
        complexityTier: 'basic',
      },
      technicalRequirements: {
        requiredTechnologies: [{ name: 'PostgreSQL' }],
      },
    },
    // Candidate 3: Different category (network-and-security) -> Should be filtered out
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
    // Candidate 4: Target itself -> Should be filtered out
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

  assert.equal(results.length, 2, 'Should only return the 2 valid candidates in category');
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
      systemArchetype: 'infra-networking',
      complexityTier: 'standard',
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
  assert.ok(results[1].score > 0.7, 'Second score should also be high (>70%)');
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

test('getProjectArchetype: resolves canonical systemArchetype from overview', () => {
  for (const arch of SYSTEM_ARCHETYPES) {
    assert.equal(getProjectArchetype({ overview: { systemArchetype: arch } }), arch);
  }
  // Unknown or missing falls back to 'other'
  assert.equal(getProjectArchetype({ overview: { systemArchetype: 'unknown-thing' } }), 'other');
  assert.equal(getProjectArchetype({ overview: {} }), 'other');
  assert.equal(getProjectArchetype({}), 'other');
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

test('findComparableProjects: matches peers on technical specifications without circular price filtering (ADR 0021)', async () => {
  const target = {
    projectId: 'TARGET_NORMAL',
    identification: { category: 'software-development', titleTh: 'ระบบจองคิวออนไลน์ประชาชน' },
    facts: { referencePriceTHB: 500000 }, // ฿500k normal baseline
    overview: { systemArchetype: 'web-portal', complexityTier: 'basic' },
    technicalRequirements: { requiredTechnologies: [{ name: 'React' }, { name: 'Node.js' }] },
  };

  const pool = [
    // Candidate 1: Same archetype (web-portal), same complexityTier (basic), same tech (React, Node.js),
    // but ฿5,000,000 (10x price!). Under old circular logic, [0.3x, 3.0x] hid this.
    // Under ADR 0021 non-circular logic, it is matched as comparable peer so the price outlier is detected!
    {
      projectId: 'CAND_10X_ANOMALY',
      identification: { category: 'software-development', titleTh: 'ระบบจองคิวออนไลน์หน่วยงานพิเศษ' },
      facts: { referencePriceTHB: 5000000 }, // 10x higher price!
      overview: { systemArchetype: 'web-portal', complexityTier: 'basic' },
      technicalRequirements: { requiredTechnologies: [{ name: 'React' }, { name: 'Node.js' }] },
    },
    // Candidate 2: Different archetype (enterprise-erp), distant tier (enterprise), ฿500k price.
    // Under old circular logic, price match made this comparable. Under ADR 0021, technical specs reject it.
    {
      projectId: 'CAND_WRONG_SPECS',
      identification: { category: 'software-development', titleTh: 'ระบบ ERP องค์กร' },
      facts: { referencePriceTHB: 500000 },
      overview: { systemArchetype: 'enterprise-erp', complexityTier: 'enterprise' },
      technicalRequirements: { requiredTechnologies: [{ name: 'SAP' }] },
    },
  ];

  const results = await findComparableProjects(target, { candidatesPool: pool });

  assert.equal(results.length, 2);
  // Candidate 1 ranks first because technical specs match (100% archetype, 100% complexity, 100% tech -> score 1.0)
  assert.equal(results[0].projectId, 'CAND_10X_ANOMALY');
  assert.equal(results[0].score, 1.0);
  // Candidate 2 ranks second with low technical score
  assert.equal(results[1].projectId, 'CAND_WRONG_SPECS');
  assert.ok(results[1].score < 0.35);
});

test('findComparableProjects: tie-breaks by price distance when technical scores are identical', async () => {
  const target = {
    projectId: 'TARGET_TIE',
    identification: { category: 'software-development', titleTh: 'ระบบบริการข้อมูล' },
    facts: { referencePriceTHB: 5000000 }, // 5M
    overview: { systemArchetype: 'web-portal', complexityTier: 'standard' },
    technicalRequirements: { requiredTechnologies: [{ name: 'PostgreSQL' }] },
  };

  const pool = [
    // Candidate A: 5.2M (diff = 0.2M)
    {
      projectId: 'CAND_CLOSER_PRICE',
      identification: { category: 'software-development', titleTh: 'ระบบบริการ ก' },
      facts: { referencePriceTHB: 5200000 },
      overview: { systemArchetype: 'web-portal', complexityTier: 'standard' },
      technicalRequirements: { requiredTechnologies: [{ name: 'PostgreSQL' }] },
    },
    // Candidate B: 7.0M (diff = 2.0M)
    {
      projectId: 'CAND_FARTHER_PRICE',
      identification: { category: 'software-development', titleTh: 'ระบบบริการ ข' },
      facts: { referencePriceTHB: 7000000 },
      overview: { systemArchetype: 'web-portal', complexityTier: 'standard' },
      technicalRequirements: { requiredTechnologies: [{ name: 'PostgreSQL' }] },
    },
  ];

  const results = await findComparableProjects(target, { candidatesPool: pool });

  assert.equal(results.length, 2);
  // Both have identical score (1.0), so closer price (5.2M vs 5.0M) must rank first
  assert.equal(results[0].projectId, 'CAND_CLOSER_PRICE');
  assert.equal(results[1].projectId, 'CAND_FARTHER_PRICE');
});
