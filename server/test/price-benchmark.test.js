/**
 * server/test/price-benchmark.test.js
 *
 * Tests for FR-20: Historical price benchmarking, median & average calculation,
 * and price deviation calculations.
 * Conforms to ADR 0014, ADR 0022, ADR 0024.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateHistoricalMedian,
  calculateHistoricalAverage,
  calculatePriceDeviations,
  assessPriceReliability,
  formatPriceInterpretation,
  calculatePriceBenchmarks,
} from '#features/reality-check/index.js';

test('calculateHistoricalMedian: calculates correct median for odd sample size', () => {
  // Odd: 5 items
  const prices = [1_200_000, 3_000_000, 1_800_000, 2_500_000, 1_500_000];
  // Sorted: 1.2M, 1.5M, 1.8M, 2.5M, 3.0M -> Middle is 1.8M
  const median = calculateHistoricalMedian(prices);
  assert.equal(median, 1_800_000);
});

test('calculateHistoricalMedian: calculates average of two middle values for even sample size', () => {
  // Even: 4 items
  const prices = [1_000_000, 4_000_000, 2_000_000, 3_000_000];
  // Sorted: 1.0M, 2.0M, 3.0M, 4.0M -> (2.0M + 3.0M) / 2 = 2.5M
  const median = calculateHistoricalMedian(prices);
  assert.equal(median, 2_500_000);
});

test('calculateHistoricalMedian: handles single item, empty array, and non-numeric/negative values', () => {
  assert.equal(calculateHistoricalMedian([4_500_000]), 4_500_000);
  assert.equal(calculateHistoricalMedian([]), null);
  assert.equal(calculateHistoricalMedian(null), null);
  assert.equal(calculateHistoricalMedian([0, -100, null, undefined, 'text', NaN]), null);
  // Ignores invalid items and uses only valid numbers
  assert.equal(calculateHistoricalMedian([0, 2_000_000, -500, 4_000_000]), 3_000_000);
});

test('calculateHistoricalAverage: calculates arithmetic mean with integer rounding', () => {
  const prices = [1_000_000, 2_000_000, 3_500_000];
  // (1.0M + 2.0M + 3.5M) / 3 = 6.5M / 3 = 2,166,666.666... -> 2,166,667
  const avg = calculateHistoricalAverage(prices);
  assert.equal(avg, 2_166_667);
});

test('calculateHistoricalAverage: handles empty or invalid values safely', () => {
  assert.equal(calculateHistoricalAverage([]), null);
  assert.equal(calculateHistoricalAverage(null), null);
  assert.equal(calculateHistoricalAverage([0, -50, NaN]), null);
  assert.equal(calculateHistoricalAverage([1_000_000, 0, 3_000_000]), 2_000_000);
});

test('calculatePriceDeviations: computes absolute and percentage differences correctly', () => {
  const targetPrice = 2_300_000;
  const benchmarkPrice = 2_000_000;

  const result = calculatePriceDeviations(targetPrice, benchmarkPrice);

  // Absolute difference: 2,300,000 - 2,000,000 = +300,000
  assert.equal(result.diffAmountTHB, 300_000);
  // Percentage difference: (300,000 / 2,000,000) * 100 = +15.0%
  assert.equal(result.diffPercentage, 15.0);
});

test('calculatePriceDeviations: computes negative deviations when target is below benchmark', () => {
  const targetPrice = 1_700_000;
  const benchmarkPrice = 2_000_000;

  const result = calculatePriceDeviations(targetPrice, benchmarkPrice);

  // Absolute: 1.7M - 2.0M = -300,000
  assert.equal(result.diffAmountTHB, -300_000);
  // Percentage: -300k / 2.0M * 100 = -15.0%
  assert.equal(result.diffPercentage, -15.0);
});

test('calculatePriceDeviations: returns nulls safely for zero or missing benchmark without division by zero', () => {
  assert.deepEqual(calculatePriceDeviations(2_000_000, 0), { diffAmountTHB: null, diffPercentage: null });
  assert.deepEqual(calculatePriceDeviations(2_000_000, null), { diffAmountTHB: null, diffPercentage: null });
  assert.deepEqual(calculatePriceDeviations(2_000_000, -100), { diffAmountTHB: null, diffPercentage: null });
  assert.deepEqual(calculatePriceDeviations(0, 2_000_000), { diffAmountTHB: null, diffPercentage: null });
  assert.deepEqual(calculatePriceDeviations(null, 2_000_000), { diffAmountTHB: null, diffPercentage: null });
  assert.deepEqual(calculatePriceDeviations(undefined, undefined), { diffAmountTHB: null, diffPercentage: null });
});

test('assessPriceReliability: correctly assigns reliability based on sample size thresholds (ADR 0024)', () => {
  assert.equal(assessPriceReliability(0), 'none');
  assert.equal(assessPriceReliability(1), 'low');
  assert.equal(assessPriceReliability(2), 'low');
  assert.equal(assessPriceReliability(3), 'sufficient');
  assert.equal(assessPriceReliability(5), 'sufficient');
  assert.equal(assessPriceReliability(10), 'sufficient');
});

test('formatPriceInterpretation: generates appropriate non-accusatory Thai copy', () => {
  // 1. Missing target price
  assert.match(
    formatPriceInterpretation({ targetPrice: null, median: 2_000_000, diffPercentage: null, sampleSize: 3, reliability: 'sufficient' }),
    /ไม่ได้ระบุราคากลางหรืองบประมาณ/,
  );

  // 2. Zero sample size
  assert.match(
    formatPriceInterpretation({ targetPrice: 2_000_000, median: null, diffPercentage: null, sampleSize: 0, reliability: 'none' }),
    /ไม่พบโครงการเปรียบเทียบ/,
  );

  // 3. Low sample size (< 3)
  const lowCopy = formatPriceInterpretation({
    targetPrice: 2_100_000,
    median: 2_000_000,
    diffPercentage: 5.0,
    sampleSize: 2,
    reliability: 'low',
  });
  assert.match(lowCopy, /คำนวณจากโครงการเปรียบเทียบจำนวน 2 โครงการ/);
  assert.match(lowCopy, /ข้อมูลอาจยังไม่สะท้อนแนวโน้มตลาดทั้งหมด/);
  assert.match(lowCopy, /\+5%/);

  // 4. Normal band (-15% to +15%)
  const normalCopy = formatPriceInterpretation({
    targetPrice: 2_100_000,
    median: 2_000_000,
    diffPercentage: 5.0,
    sampleSize: 4,
    reliability: 'sufficient',
  });
  assert.match(normalCopy, /ราคากลางอยู่ในเกณฑ์ปกติ/);
  assert.match(normalCopy, /\+5%/);

  // 5. Premium (> +15%)
  const premiumCopy = formatPriceInterpretation({
    targetPrice: 2_500_000,
    median: 2_000_000,
    diffPercentage: 25.0,
    sampleSize: 3,
    reliability: 'sufficient',
  });
  assert.match(premiumCopy, /ราคากลางสูงกว่าค่ามัธยฐานในอดีตประมาณ \+25%/);

  // 6. Underfunded (< -15%)
  const underfundedCopy = formatPriceInterpretation({
    targetPrice: 1_600_000,
    median: 2_000_000,
    diffPercentage: -20.0,
    sampleSize: 4,
    reliability: 'sufficient',
  });
  assert.match(underfundedCopy, /ราคากลางต่ำกว่าค่ามัธยฐานในอดีตประมาณ -20%/);
  assert.match(underfundedCopy, /งบประมาณจำกัดเกินไป/);
});

test('calculatePriceBenchmarks: integrates target price resolution, peers, deviations, and reliability', () => {
  const targetTor = {
    projectId: '68039469567',
    identification: { titleTh: 'โครงการพัฒนาระบบ Portal', category: 'software-development' },
    facts: { referencePriceTHB: 2_400_000, budgetTHB: 2_500_000 },
  };

  const comparableProjects = [
    { projectId: 'P1', title: 'โครงการ 1', year: 2567, referencePriceTHB: 1_800_000, agreedPriceTHB: 1_500_000 },
    { projectId: 'P2', title: 'โครงการ 2', year: 2567, referencePriceTHB: 2_000_000 },
    { projectId: 'P3', title: 'โครงการ 3', year: 2566, referencePriceTHB: 2_200_000 },
  ];

  const analysis = calculatePriceBenchmarks(targetTor, comparableProjects);

  // Primary benchmark is calculated from peer reference prices (1.8M, 2.0M, 2.2M) -> Median = 2.0M
  assert.equal(analysis.referencePriceTHB, 2_400_000);
  assert.equal(analysis.historicalMedianTHB, 2_000_000);
  assert.equal(analysis.historicalAverageTHB, 2_000_000);
  assert.equal(analysis.diffAmountTHB, 400_000);
  assert.equal(analysis.diffPercentage, 20.0);
  assert.equal(analysis.diffAverageAmountTHB, 400_000);
  assert.equal(analysis.diffAveragePercentage, 20.0);
  assert.equal(analysis.sampleSize, 3);
  assert.equal(analysis.reliability, 'sufficient');
  assert.match(analysis.interpretation, /ราคากลางสูงกว่าค่ามัธยฐาน/);
  assert.equal(analysis.comparableProjects.length, 3);
  // Contract price preserved as context for bidders without distorting the median
  assert.equal(analysis.comparableProjects[0].agreedPriceTHB, 1_500_000);
  assert.equal(analysis.comparableProjects[1].agreedPriceTHB, null);
});

test('calculatePriceBenchmarks: falls back to facts.budgetTHB when referencePriceTHB is missing', () => {
  const targetTor = {
    projectId: '68039469568',
    facts: { referencePriceTHB: null, budgetTHB: 3_000_000 },
  };

  const comparableProjects = [
    { title: 'โครงการ A', year: 2567, referencePriceTHB: 3_000_000 },
  ];

  const analysis = calculatePriceBenchmarks(targetTor, comparableProjects);

  assert.equal(analysis.referencePriceTHB, 3_000_000);
  assert.equal(analysis.historicalMedianTHB, 3_000_000);
  assert.equal(analysis.diffAmountTHB, 0);
  assert.equal(analysis.diffPercentage, 0.0);
  assert.equal(analysis.sampleSize, 1);
  assert.equal(analysis.reliability, 'low');
});

test('calculatePriceBenchmarks: handles zero comparable projects gracefully', () => {
  const targetTor = {
    projectId: '68039469569',
    facts: { referencePriceTHB: 1_500_000 },
  };

  const analysis = calculatePriceBenchmarks(targetTor, []);

  assert.equal(analysis.referencePriceTHB, 1_500_000);
  assert.equal(analysis.historicalMedianTHB, null);
  assert.equal(analysis.historicalAverageTHB, null);
  assert.equal(analysis.diffAmountTHB, null);
  assert.equal(analysis.diffPercentage, null);
  assert.equal(analysis.sampleSize, 0);
  assert.equal(analysis.reliability, 'none');
  assert.match(analysis.interpretation, /ไม่พบโครงการเปรียบเทียบ/);
  assert.deepEqual(analysis.comparableProjects, []);
});

test('calculatePriceBenchmarks: handles missing target price gracefully', () => {
  const targetTor = {
    projectId: '68039469570',
    facts: { referencePriceTHB: null, budgetTHB: null },
  };

  const comparableProjects = [
    { title: 'โครงการ A', year: 2567, referencePriceTHB: 2_000_000 },
    { title: 'โครงการ B', year: 2567, referencePriceTHB: 2_500_000 },
  ];

  const analysis = calculatePriceBenchmarks(targetTor, comparableProjects);

  assert.equal(analysis.referencePriceTHB, null);
  assert.equal(analysis.diffAmountTHB, null);
  assert.equal(analysis.diffPercentage, null);
  assert.equal(analysis.reliability, 'none');
  assert.match(analysis.interpretation, /ไม่ได้ระบุราคากลางหรืองบประมาณ/);
});
