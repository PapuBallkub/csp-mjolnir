/**
 * server/src/features/reality-check/benchmark.service.js
 *
 * Implements FR-20: Historical price benchmarking for IT procurement projects.
 * Calculates historical median and average prices, budget deviations, and
 * sample size metrics using comparable projects identified in FR-19.
 *
 * Conforms to ADR 0021, ADR 0022 & docs/features/reality-check-and-benchmarking.md
 */

import { TorInsight } from '#models/index.js';
import { getProjectPrice, findComparableProjects } from './similarity.service.js';

/**
 * Calculates the median of an array of numbers.
 * The numbers array must be sorted in ascending order.
 *
 * @param {number[]} numbers - Sorted array of positive numbers
 * @returns {number}
 */
export function calculateMedian(numbers) {
  if (!Array.isArray(numbers) || numbers.length === 0) return 0;
  const count = numbers.length;
  const mid = Math.floor(count / 2);

  if (count % 2 !== 0) {
    return numbers[mid];
  }
  return Math.round((numbers[mid - 1] + numbers[mid]) / 2);
}

/**
 * Calculates the arithmetic mean (average) of an array of numbers.
 *
 * @param {number[]} numbers - Array of positive numbers
 * @returns {number}
 */
export function calculateAverage(numbers) {
  if (!Array.isArray(numbers) || numbers.length === 0) return 0;
  const sum = numbers.reduce((acc, val) => acc + val, 0);
  return Math.round(sum / numbers.length);
}

/**
 * Calculates price benchmark metrics from comparable projects for a target TOR.
 *
 * @param {object} targetTor - Target TOR object or TorInsight document
 * @param {Array<object>} [comparableProjects=[]] - Comparable projects from findComparableProjects
 * @returns {object} Full price analysis payload
 */
export function calculatePriceBenchmarks(targetTor, comparableProjects = []) {
  const targetPrice = getProjectPrice(targetTor);

  // Filter and extract valid, positive prices
  const validPrices = (comparableProjects || [])
    .map((p) => {
      if (typeof p?.referencePriceTHB === 'number') return p.referencePriceTHB;
      if (p?.candidate) return getProjectPrice(p.candidate);
      if (typeof p === 'number') return p;
      return null;
    })
    .filter((price) => typeof price === 'number' && !Number.isNaN(price) && price > 0)
    .sort((a, b) => a - b);

  const sampleSize = validPrices.length;

  // Format comparable projects summary list
  const formattedComparables = (comparableProjects || [])
    .filter((p) => {
      const price = p?.referencePriceTHB ?? (p?.candidate ? getProjectPrice(p.candidate) : null);
      return typeof price === 'number' && price > 0;
    })
    .map((p) => ({
      title: p.title || p.candidate?.identification?.titleTh || `โครงการรหัส ${p.projectId || p.candidate?.projectId || 'N/A'}`,
      year: p.year ?? (p.candidate ? (p.candidate.facts?.postedDate ? new Date(p.candidate.facts.postedDate).getFullYear() + 543 : 2567) : 2567),
      referencePriceTHB: p.referencePriceTHB ?? getProjectPrice(p.candidate),
    }));

  // Handle case: Insufficient historical price data (sampleSize === 0)
  if (sampleSize === 0) {
    return {
      referencePriceTHB: targetPrice ?? null,
      historicalMedianTHB: null,
      historicalAverageTHB: null,
      diffPercentage: null,
      diffAveragePercentage: null,
      sampleSize: 0,
      reliability: 'none',
      interpretation: 'ไม่พบโครงการเปรียบเทียบในหมวดหมู่และช่วงงบประมาณเดียวกัน',
      comparableProjects: [],
    };
  }

  // 1. Calculate statistical benchmarks
  const median = calculateMedian(validPrices);
  const average = calculateAverage(validPrices);

  // 2. Sample size reliability tier
  const reliability = sampleSize >= 3 ? 'sufficient' : 'low';

  // Handle case: Target TOR itself lacks a valid price
  if (!targetPrice || targetPrice <= 0) {
    let interpretation = `คำนวณจากโครงการเปรียบเทียบจำนวน ${sampleSize} โครงการ (มัธยฐาน ฿${median.toLocaleString('en-US')})`;
    if (reliability === 'low') {
      interpretation += ' [ข้อมูลเปรียบเทียบมีจำนวนน้อย]';
    }
    interpretation += ' แต่โครงการเป้าหมายไม่ได้ระบุราคากลาง จึงไม่สามารถเปรียบเทียบส่วนต่างได้';

    return {
      referencePriceTHB: null,
      historicalMedianTHB: median,
      historicalAverageTHB: average,
      diffPercentage: null,
      diffAveragePercentage: null,
      sampleSize,
      reliability,
      interpretation,
      comparableProjects: formattedComparables,
    };
  }

  // 3. Deviation percentages
  const diffPercentage = Number((((targetPrice - median) / median) * 100).toFixed(1));
  const diffAvg = Number((((targetPrice - average) / average) * 100).toFixed(1));

  // 4. Generate plain-language Thai interpretation
  let interpretation = '';
  if (reliability === 'low') {
    const diffSign = diffPercentage > 0 ? '+' : '';
    interpretation = `คำนวณจากโครงการเปรียบเทียบจำนวน ${sampleSize} โครงการ ข้อมูลอาจยังไม่สะท้อนแนวโน้มตลาดทั้งหมด (เบี่ยงเบน ${diffSign}${diffPercentage}%)`;
  } else if (diffPercentage > 15) {
    interpretation = `ราคากลางสูงกว่าค่ามัธยฐานในอดีตประมาณ +${diffPercentage}% สำหรับโครงการขนาดใกล้เคียงกัน`;
  } else if (diffPercentage < -15) {
    interpretation = `ราคากลางต่ำกว่าค่ามัธยฐานในอดีตประมาณ ${diffPercentage}% อาจมีความเสี่ยงเรื่องงบประมาณจำกัดเกินไป`;
  } else {
    const diffSign = diffPercentage > 0 ? '+' : '';
    interpretation = `ราคากลางอยู่ในเกณฑ์ปกติเมื่อเทียบกับโครงการใกล้เคียงในอดีต (เบี่ยงเบน ${diffSign}${diffPercentage}%)`;
  }

  return {
    referencePriceTHB: targetPrice,
    historicalMedianTHB: median,
    historicalAverageTHB: average,
    diffPercentage,
    diffAveragePercentage: diffAvg,
    sampleSize,
    reliability,
    interpretation,
    comparableProjects: formattedComparables,
  };
}

/**
 * End-to-end service to compute historical price benchmarks for a target TOR.
 * Finds comparable projects via FR-19 similarity engine and computes FR-20 benchmarks.
 *
 * @param {object} targetTor
 * @param {object} [options={}]
 * @param {number} [options.limit=5]
 * @param {Array<object>} [options.candidatesPool=null]
 * @param {boolean} [options.save=false] - If true, saves benchmark to MongoDB
 * @returns {Promise<object>} Price analysis result
 */
export async function computeTorPriceBenchmarks(targetTor, options = {}) {
  const {
    limit = 5,
    candidatesPool = null,
    save = false,
  } = options;

  let comparableProjects = options.comparableProjects;
  if (!Array.isArray(comparableProjects)) {
    comparableProjects = await findComparableProjects(targetTor, {
      limit,
      candidatesPool,
    });
  }

  const benchmarkResult = calculatePriceBenchmarks(targetTor, comparableProjects);

  if (save && targetTor?.projectId) {
    await TorInsight.updateOne(
      { projectId: targetTor.projectId },
      { $set: { 'analytics.priceAnalysis': benchmarkResult } },
    );
  }

  return benchmarkResult;
}
