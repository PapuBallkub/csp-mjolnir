import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateScaleProximity,
  calculateTechSimilarity,
  calculateScopeSimilarity,
  calculateComplexitySimilarity,
  calculateCompositeSimilarity,
  calculateCategorySimilarity,
  sharesCategory,
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
      categories: ['software-development'],
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
        categories: ['software-development'],
        titleTh: 'จ้างพัฒนาระบบ e-Service และเว็บพอร์ทัล',
        status: 'Awarded',
      },
      metadata: { confidenceScore: 90 },
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
        categories: ['software-development'],
        titleTh: 'โครงการพัฒนาระบบบริหารจัดการข้อมูล e-Service',
        status: 'Closed',
      },
      metadata: { confidenceScore: 85 },
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
        categories: ['network-and-security'],
        titleTh: 'จัดซื้อระบบเครือข่ายความปลอดภัย',
        status: 'Awarded',
      },
      metadata: { confidenceScore: 90 },
      facts: {
        referencePriceTHB: 10000000,
      },
    },
    // Candidate 4: Target itself -> Should be filtered out
    {
      projectId: 'TARGET_001',
      identification: {
        categories: ['software-development'],
        status: 'Awarded',
      },
      metadata: { confidenceScore: 90 },
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
      categories: ['maintenance-and-support'],
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
    identification: { categories: ['software-licenses'], titleTh: 'เช่าใช้บริการ Microsoft 365' },
    facts: { referencePriceTHB: 1000000 },
  };
  const candidate = (projectId, metadata, status = 'Awarded') => ({
    projectId,
    identification: { categories: ['software-licenses'], titleTh: 'เช่าใช้บริการ Microsoft 365 รายปี', status },
    facts: { referencePriceTHB: 1100000 },
    metadata: { confidenceScore: 90, ...metadata },
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
    identification: { categories: ['software-development'], titleTh: 'ระบบจองคิวออนไลน์ประชาชน' },
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
      identification: { categories: ['software-development'], titleTh: 'ระบบจองคิวออนไลน์หน่วยงานพิเศษ', status: 'Awarded' },
      facts: { referencePriceTHB: 5000000 }, // 10x higher price!
      metadata: { confidenceScore: 90 },
      overview: { systemArchetype: 'web-portal', complexityTier: 'basic' },
      technicalRequirements: { requiredTechnologies: [{ name: 'React' }, { name: 'Node.js' }] },
    },
    // Candidate 2: Different archetype (enterprise-erp), distant tier (enterprise), ฿500k price.
    // Under old circular logic, price match made this comparable. Under ADR 0021, technical specs reject it.
    {
      projectId: 'CAND_WRONG_SPECS',
      identification: { categories: ['software-development'], titleTh: 'ระบบ ERP องค์กร', status: 'Closed' },
      facts: { referencePriceTHB: 500000 },
      metadata: { confidenceScore: 90 },
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
    identification: { categories: ['software-development'], titleTh: 'ระบบบริการข้อมูล' },
    facts: { referencePriceTHB: 5000000 }, // 5M
    overview: { systemArchetype: 'web-portal', complexityTier: 'standard' },
    technicalRequirements: { requiredTechnologies: [{ name: 'PostgreSQL' }] },
  };

  const pool = [
    // Candidate A: 5.2M (diff = 0.2M)
    {
      projectId: 'CAND_CLOSER_PRICE',
      identification: { categories: ['software-development'], titleTh: 'ระบบบริการ ก', status: 'Awarded' },
      facts: { referencePriceTHB: 5200000 },
      metadata: { confidenceScore: 90 },
      overview: { systemArchetype: 'web-portal', complexityTier: 'standard' },
      technicalRequirements: { requiredTechnologies: [{ name: 'PostgreSQL' }] },
    },
    // Candidate B: 7.0M (diff = 2.0M)
    {
      projectId: 'CAND_FARTHER_PRICE',
      identification: { categories: ['software-development'], titleTh: 'ระบบบริการ ข', status: 'Closed' },
      facts: { referencePriceTHB: 7000000 },
      metadata: { confidenceScore: 90 },
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

test('findComparableProjects: accepts only Closed and Awarded statuses (rejects Draft, Open, Cancelled)', async () => {
  const target = {
    projectId: 'TARGET_STATUS',
    identification: { categories: ['software-development'], titleTh: 'ระบบทดสอบสถานะ' },
    facts: { referencePriceTHB: 2000000 },
    overview: { systemArchetype: 'web-portal', complexityTier: 'standard' },
  };

  const pool = [
    {
      projectId: 'CAND_AWARDED',
      identification: { categories: ['software-development'], status: 'Awarded' },
      facts: { referencePriceTHB: 2000000 },
      metadata: { confidenceScore: 90 },
    },
    {
      projectId: 'CAND_CLOSED',
      identification: { categories: ['software-development'], status: 'Closed' },
      facts: { referencePriceTHB: 2000000 },
      metadata: { confidenceScore: 85 },
    },
    {
      projectId: 'CAND_OPEN',
      identification: { categories: ['software-development'], status: 'Open' },
      facts: { referencePriceTHB: 2000000 },
      metadata: { confidenceScore: 90 },
    },
    {
      projectId: 'CAND_DRAFT',
      identification: { categories: ['software-development'], status: 'Draft' },
      facts: { referencePriceTHB: 2000000 },
      metadata: { confidenceScore: 90 },
    },
    {
      projectId: 'CAND_CANCELLED',
      identification: { categories: ['software-development'], status: 'Cancelled' },
      facts: { referencePriceTHB: 2000000 },
      metadata: { confidenceScore: 90 },
    },
  ];

  const results = await findComparableProjects(target, { candidatesPool: pool });
  assert.equal(results.length, 2, 'Should accept only Closed and Awarded');
  const ids = results.map((r) => r.projectId).sort();
  assert.deepEqual(ids, ['CAND_AWARDED', 'CAND_CLOSED']);
});

test('findComparableProjects: filters out candidates below 80% confidence score (NFR-17)', async () => {
  const target = {
    projectId: 'TARGET_CONF',
    identification: { categories: ['software-development'], titleTh: 'ระบบทดสอบความเชื่อมั่น' },
    facts: { referencePriceTHB: 3000000 },
    overview: { systemArchetype: 'web-portal', complexityTier: 'standard' },
  };

  const pool = [
    {
      projectId: 'CAND_CONF_80',
      identification: { categories: ['software-development'], status: 'Awarded' },
      facts: { referencePriceTHB: 3000000 },
      metadata: { confidenceScore: 80 },
    },
    {
      projectId: 'CAND_CONF_95',
      identification: { categories: ['software-development'], status: 'Awarded' },
      facts: { referencePriceTHB: 3000000 },
      metadata: { confidenceScore: 95 },
    },
    {
      projectId: 'CAND_CONF_79',
      identification: { categories: ['software-development'], status: 'Awarded' },
      facts: { referencePriceTHB: 3000000 },
      metadata: { confidenceScore: 79 },
    },
    {
      projectId: 'CAND_CONF_NULL',
      identification: { categories: ['software-development'], status: 'Awarded' },
      facts: { referencePriceTHB: 3000000 },
      metadata: {},
    },
  ];

  const results = await findComparableProjects(target, { candidatesPool: pool });
  assert.equal(results.length, 2, 'Should only accept confidence >= 80%');
  const ids = results.map((r) => r.projectId).sort();
  assert.deepEqual(ids, ['CAND_CONF_80', 'CAND_CONF_95']);
});

const withCategories = (...categories) => ({ identification: { categories } });

test('calculateCategorySimilarity: sharing more scores more, and the same order scores most (ADR 0034)', () => {
  const target = withCategories('software-development', 'maintenance-and-support');
  const score = (...categories) => calculateCategorySimilarity(target, withCategories(...categories));

  assert.equal(score('software-development', 'maintenance-and-support'), 1);
  assert.equal(score('maintenance-and-support', 'software-development'), 0.75, 'both shared, in the other order');
  assert.equal(score('software-development'), 0.5, 'one of two shared, in the same place');
  assert.equal(score('maintenance-and-support'), 0.375, 'one of two shared, one place apart');
  assert.equal(score('network-and-security'), 0);
});

test('calculateCategorySimilarity: a shared category scores less the further apart it sits', () => {
  const target = withCategories('software-development');
  const first = withCategories('software-development', 'maintenance-and-support', 'network-and-security');
  const last = withCategories('maintenance-and-support', 'network-and-security', 'software-development');

  assert.equal(calculateCategorySimilarity(target, first), 0.3333);
  assert.equal(calculateCategorySimilarity(target, last), 0.1667);
});

test('calculateCategorySimilarity: the same both ways, and neutral when one is unknown', () => {
  const a = withCategories('software-development', 'data-and-ai');
  const b = withCategories('data-and-ai', 'other-it');

  assert.equal(calculateCategorySimilarity(a, b), calculateCategorySimilarity(b, a));
  assert.equal(calculateCategorySimilarity(a, withCategories()), 0.5);
  assert.equal(calculateCategorySimilarity({}, a), 0.5);
});

test('sharesCategory: any shared category counts, in any position', () => {
  const target = withCategories('software-development', 'maintenance-and-support');

  assert.equal(sharesCategory(target, withCategories('other-it', 'network-and-security', 'maintenance-and-support')), true);
  assert.equal(sharesCategory(target, withCategories('network-and-security')), false);
  assert.equal(sharesCategory(target, withCategories()), false);
  assert.equal(sharesCategory({}, target), false);
});

test('calculateCompositeSimilarity: archetype 35%, complexity 30%, tech 20%, category 15%', () => {
  const project = (archetype, tier, tech, ...categories) => ({
    ...withCategories(...categories),
    overview: { systemArchetype: archetype, complexityTier: tier },
    technicalRequirements: { requiredTechnologies: [{ name: tech }] },
  });
  const target = project('web-portal', 'standard', 'React', 'software-development');
  const score = (candidate) => calculateCompositeSimilarity(target, candidate).score;

  assert.equal(score(project('web-portal', 'standard', 'React', 'software-development')), 1);
  // Each part alone falls; the rest stay full
  assert.equal(score(project('mobile-app', 'standard', 'React', 'software-development')), 0.7025); // archetype at 0.15
  assert.equal(score(project('web-portal', 'enterprise', 'React', 'software-development')), 0.85); // complexity at 0.50
  assert.equal(score(project('web-portal', 'standard', 'Vue', 'software-development')), 0.8); // tech at 0
  assert.equal(score(project('web-portal', 'standard', 'React', 'software-development', 'other-it')), 0.925); // category at 0.50

  const { breakdown } = calculateCompositeSimilarity(target, project('web-portal', 'standard', 'React', 'software-development', 'other-it'));
  assert.equal(breakdown.categorySim, 0.5);
});

test('calculateCompositeSimilarity: a matching category cannot lift a project past the right archetype', () => {
  const project = (archetype, ...categories) => ({ ...withCategories(...categories), overview: { systemArchetype: archetype } });
  const target = project('web-portal', 'software-development', 'maintenance-and-support', 'other-it');

  const sameArchetype = project('web-portal', 'other-it', 'network-and-security', 'data-and-ai');
  const sameCategories = project('mobile-app', 'software-development', 'maintenance-and-support', 'other-it');

  assert.ok(calculateCompositeSimilarity(target, sameArchetype).score > calculateCompositeSimilarity(target, sameCategories).score);
});

test('findComparableProjects: shares at least one category, the closest lists first (ADR 0034)', async () => {
  const project = (projectId, ...categories) => ({
    projectId,
    identification: { categories, titleTh: projectId, status: 'Awarded' },
    facts: { referencePriceTHB: 1_000_000 },
    metadata: { confidenceScore: 90 },
  });
  const target = project('TARGET', 'software-development', 'maintenance-and-support');
  const candidatesPool = [
    project('C', 'maintenance-and-support'),
    project('D', 'network-and-security'),
    project('A', 'software-development'),
    project('B', 'maintenance-and-support', 'software-development'),
    project('E', 'software-development', 'maintenance-and-support'),
  ];

  const results = await findComparableProjects(target, { candidatesPool });

  assert.deepEqual(results.map((result) => result.projectId), ['E', 'B', 'A', 'C']);
});

test('findComparableProjects: no categories, no comparison', async () => {
  const target = { projectId: 'T', identification: { categories: [] }, facts: { referencePriceTHB: 1_000_000 } };
  assert.deepEqual(await findComparableProjects(target, { candidatesPool: [] }), []);
});
