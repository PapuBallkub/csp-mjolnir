import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateMedian,
  calculateAverage,
  calculatePriceBenchmarks,
  computeTorPriceBenchmarks,
} from '#features/reality-check/index.js';

test('calculateMedian: handles odd, even, single, and empty arrays correctly', () => {
  assert.equal(calculateMedian([1000000, 2000000, 5000000]), 2000000); // odd (N=3)
  assert.equal(calculateMedian([1000000, 3000000]), 2000000); // even (N=2, avg of 1M & 3M)
  assert.equal(calculateMedian([1000000, 2000000, 4000000, 6000000]), 3000000); // even (N=4, avg of 2M & 4M)
  assert.equal(calculateMedian([7500000]), 7500000); // single (N=1)
  assert.equal(calculateMedian([]), 0); // empty
});

test('calculateAverage: computes mean with integer rounding', () => {
  assert.equal(calculateAverage([1000000, 2000000, 6000000]), 3000000);
  assert.equal(calculateAverage([1000000, 2000000]), 1500000);
  assert.equal(calculateAverage([1000001, 1000002]), 1000002); // rounds Math.round(1000001.5)
  assert.equal(calculateAverage([]), 0);
});

test('calculatePriceBenchmarks: returns appropriate result when insufficient historical data (N=0)', () => {
  const targetTor = {
    projectId: 'TARGET_001',
    facts: { referencePriceTHB: 5000000 },
  };

  const result = calculatePriceBenchmarks(targetTor, []);

  assert.equal(result.sampleSize, 0);
  assert.equal(result.reliability, 'none');
  assert.equal(result.historicalMedianTHB, null);
  assert.equal(result.historicalAverageTHB, null);
  assert.equal(result.diffPercentage, null);
  assert.equal(result.referencePriceTHB, 5000000);
  assert.equal(result.interpretation, 'ไม่พบโครงการเปรียบเทียบในหมวดหมู่และช่วงงบประมาณเดียวกัน');
  assert.deepEqual(result.comparableProjects, []);
});

test('calculatePriceBenchmarks: filters out invalid, zero, or negative prices from comparables', () => {
  const targetTor = {
    projectId: 'TARGET_001',
    facts: { referencePriceTHB: 5000000 },
  };

  const pool = [
    { title: 'Project Zero', referencePriceTHB: 0 },
    { title: 'Project Negative', referencePriceTHB: -100000 },
    { title: 'Project Null', referencePriceTHB: null },
    { title: 'Project NaN', referencePriceTHB: 'invalid' },
    { title: 'Valid 1', referencePriceTHB: 4000000, year: 2567 },
    { title: 'Valid 2', referencePriceTHB: 6000000, year: 2568 },
  ];

  const result = calculatePriceBenchmarks(targetTor, pool);

  assert.equal(result.sampleSize, 2);
  assert.equal(result.historicalAverageTHB, 5000000);
  assert.equal(result.historicalMedianTHB, 5000000);
  assert.equal(result.diffPercentage, 0);
  assert.equal(result.reliability, 'low'); // N=2 is < 3
  assert.equal(result.comparableProjects.length, 2);
});

test('calculatePriceBenchmarks: handles target TOR without price gracefully', () => {
  const targetTor = {
    projectId: 'TARGET_NO_PRICE',
    facts: { referencePriceTHB: null, budgetTHB: 0 },
  };

  const comparables = [
    { title: 'P1', referencePriceTHB: 3000000, year: 2567 },
    { title: 'P2', referencePriceTHB: 4000000, year: 2567 },
    { title: 'P3', referencePriceTHB: 5000000, year: 2568 },
  ];

  const result = calculatePriceBenchmarks(targetTor, comparables);

  assert.equal(result.sampleSize, 3);
  assert.equal(result.referencePriceTHB, null);
  assert.equal(result.historicalMedianTHB, 4000000);
  assert.equal(result.historicalAverageTHB, 4000000);
  assert.equal(result.diffPercentage, null);
  assert.ok(result.interpretation.includes('ไม่ได้ระบุราคากลาง'));
});

test('calculatePriceBenchmarks: flags low sample size (1 <= N < 3) with advisory tone', () => {
  const targetTor = {
    projectId: 'TARGET_001',
    facts: { referencePriceTHB: 6000000 },
  };

  const comparables = [
    { title: 'P1', referencePriceTHB: 5000000, year: 2567 },
  ];

  const result = calculatePriceBenchmarks(targetTor, comparables);

  assert.equal(result.sampleSize, 1);
  assert.equal(result.reliability, 'low');
  assert.equal(result.historicalMedianTHB, 5000000);
  assert.equal(result.historicalAverageTHB, 5000000);
  assert.equal(result.diffPercentage, 20.0);
  assert.ok(result.interpretation.includes('ข้อมูลเปรียบเทียบมีจำนวนน้อย') || result.interpretation.includes('จำนวน 1 โครงการ'));
});

test('calculatePriceBenchmarks: correctly evaluates market normal, premium, and underfunded tiers (N >= 3)', () => {
  const baseComparables = [
    { title: 'P1', referencePriceTHB: 4500000, year: 2566 },
    { title: 'P2', referencePriceTHB: 5000000, year: 2567 },
    { title: 'P3', referencePriceTHB: 5500000, year: 2568 },
  ];
  // Median = 5,000,000, Average = 5,000,000

  // Case 1: Market Normal (-15% <= diff <= 15%)
  const torNormal = { facts: { referencePriceTHB: 5200000 } };
  const resNormal = calculatePriceBenchmarks(torNormal, baseComparables);
  assert.equal(resNormal.diffPercentage, 4.0);
  assert.equal(resNormal.reliability, 'sufficient');
  assert.ok(resNormal.interpretation.includes('อยู่ในเกณฑ์ปกติ'));

  // Case 2: Premium (> +15%)
  const torPremium = { facts: { referencePriceTHB: 6500000 } }; // +30%
  const resPremium = calculatePriceBenchmarks(torPremium, baseComparables);
  assert.equal(resPremium.diffPercentage, 30.0);
  assert.ok(resPremium.interpretation.includes('สูงกว่าค่ามัธยฐานในอดีตประมาณ +30%'));

  // Case 3: Underfunded (< -15%)
  const torUnderfunded = { facts: { referencePriceTHB: 3500000 } }; // -30%
  const resUnderfunded = calculatePriceBenchmarks(torUnderfunded, baseComparables);
  assert.equal(resUnderfunded.diffPercentage, -30.0);
  assert.ok(resUnderfunded.interpretation.includes('ต่ำกว่าค่ามัธยฐานในอดีตประมาณ -30%'));
});

test('computeTorPriceBenchmarks: runs end-to-end using similarity candidate pool', async () => {
  const { TEST_HISTORICAL_PROJECTS } = await import('../scripts/seed-comparable-test.js');

  const target = {
    projectId: 'TARGET_MAINT_01',
    identification: {
      category: 'maintenance-and-support',
      titleTh: 'จ้างบำรุงรักษาเครื่องคอมพิวเตอร์และระบบเครือข่าย',
    },
    facts: {
      referencePriceTHB: 1200000,
      postedDate: '2026-05-01',
    },
    overview: {
      majorComponents: ['บำรุงรักษา Server', 'ระบบ LAN'],
    },
  };

  const benchmark = await computeTorPriceBenchmarks(target, {
    candidatesPool: TEST_HISTORICAL_PROJECTS,
  });

  assert.ok(benchmark.sampleSize >= 2, 'Should find at least 2 comparable maintenance projects');
  assert.ok(benchmark.historicalMedianTHB > 0, 'Median should be a positive number');
  assert.ok(benchmark.historicalAverageTHB > 0, 'Average should be a positive number');
  assert.equal(typeof benchmark.diffPercentage, 'number');
  assert.ok(benchmark.comparableProjects.length >= 2);
});
