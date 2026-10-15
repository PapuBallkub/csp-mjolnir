import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateScaleProximity,
  calculateTechSimilarity,
  calculateScopeSimilarity,
  calculateCompositeSimilarity,
  getFiscalYear,
  getProjectPrice,
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
