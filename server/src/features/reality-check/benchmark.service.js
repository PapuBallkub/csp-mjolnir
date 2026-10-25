/**
 * server/src/features/reality-check/benchmark.service.js
 *
 * Implements FR-20: Historical price benchmarking and price deviation calculations
 * for a TOR against comparable projects identified by FR-19.
 *
 * Conforms to ADR 0014, ADR 0022, ADR 0024, and
 * docs/features/price-benchmark-calculations.md.
 */

import { getProjectPrice } from './similarity.service.js';

/**
 * Calculates the historical median price from an array of numeric prices.
 *
 * Median is the primary benchmark because government procurement budgets
 * exhibit positive skewness from large infrastructure packages.
 *
 * @param {number[]} prices - Array of prices in THB
 * @returns {number|null} Rounded median integer THB, or null if empty
 */
export function calculateHistoricalMedian(prices = []) {
  const list = Array.isArray(prices) ? prices : [];
  const valid = list
    .filter((p) => typeof p === 'number' && !Number.isNaN(p) && Number.isFinite(p) && p > 0)
    .sort((a, b) => a - b);

  const n = valid.length;
  if (n === 0) return null;

  const mid = Math.floor(n / 2);
  if (n % 2 !== 0) {
    return valid[mid];
  }
  return Math.round((valid[mid - 1] + valid[mid]) / 2);
}

/**
 * Calculates the historical arithmetic average (mean) price from an array of prices.
 *
 * @param {number[]} prices - Array of prices in THB
 * @returns {number|null} Rounded average integer THB, or null if empty
 */
export function calculateHistoricalAverage(prices = []) {
  const list = Array.isArray(prices) ? prices : [];
  const valid = list.filter(
    (p) => typeof p === 'number' && !Number.isNaN(p) && Number.isFinite(p) && p > 0,
  );

  const n = valid.length;
  if (n === 0) return null;

  const sum = valid.reduce((acc, val) => acc + val, 0);
  return Math.round(sum / n);
}

/**
 * Calculates both absolute and percentage differences between a target price
 * and a benchmark price.
 *
 * Safely handles missing, negative, or zero benchmark values without division by zero.
 *
 * @param {number|null} targetPrice - Current TOR budget or reference price
 * @param {number|null} benchmarkPrice - Historical median or average benchmark
 * @returns {{ diffAmountTHB: number|null, diffPercentage: number|null }}
 */
export function calculatePriceDeviations(targetPrice, benchmarkPrice) {
  if (
    typeof targetPrice !== 'number' ||
    Number.isNaN(targetPrice) ||
    targetPrice <= 0 ||
    typeof benchmarkPrice !== 'number' ||
    Number.isNaN(benchmarkPrice) ||
    benchmarkPrice <= 0
  ) {
    return {
      diffAmountTHB: null,
      diffPercentage: null,
    };
  }

  // Absolute difference (T - Benchmark)
  const diffAmountTHB = Math.round(targetPrice - benchmarkPrice);

  // Percentage difference ((T - Benchmark) / Benchmark * 100)
  const diffPercentage = Number((((targetPrice - benchmarkPrice) / benchmarkPrice) * 100).toFixed(1));

  return {
    diffAmountTHB,
    diffPercentage,
  };
}

/**
 * Evaluates the statistical reliability tier based on sample size (ADR 0024).
 *
 * - N = 0: 'none'
 * - 1 <= N < 3: 'low' (fails statutory 3-vendor quorum, advisory note required)
 * - N >= 3: 'sufficient' (satisfies statutory quorum)
 *
 * @param {number} sampleSize
 * @returns {'none'|'low'|'sufficient'}
 */
export function assessPriceReliability(sampleSize) {
  if (!sampleSize || sampleSize <= 0) return 'none';
  if (sampleSize < 3) return 'low';
  return 'sufficient';
}

/**
 * Generates descriptive, non-accusatory Thai explanation copy (AGENTS.md Section 7).
 *
 * @param {object} params
 * @param {number|null} params.targetPrice
 * @param {number|null} params.median
 * @param {number|null} params.diffPercentage
 * @param {number} params.sampleSize
 * @param {'none'|'low'|'sufficient'} params.reliability
 * @returns {string}
 */
export function formatPriceInterpretation({
  targetPrice,
  median,
  diffPercentage,
  sampleSize,
  reliability,
}) {
  if (targetPrice == null) {
    return 'ไม่สามารถเปรียบเทียบส่วนต่างราคาได้เนื่องจากเอกสาร TOR ไม่ได้ระบุราคากลางหรืองบประมาณ';
  }

  if (sampleSize === 0 || median == null) {
    return 'ไม่พบโครงการเปรียบเทียบในหมวดหมู่และลักษณะงานเดียวกันในฐานข้อมูล';
  }

  const sign = diffPercentage > 0 ? '+' : '';

  if (reliability === 'low') {
    return `คำนวณจากโครงการเปรียบเทียบจำนวน ${sampleSize} โครงการ ข้อมูลอาจยังไม่สะท้อนแนวโน้มตลาดทั้งหมด (เบี่ยงเบน ${sign}${diffPercentage}%)`;
  }

  if (diffPercentage > 15.0) {
    return `ราคากลางสูงกว่าค่ามัธยฐานในอดีตประมาณ +${diffPercentage}% สำหรับโครงการขนาดใกล้เคียงกัน`;
  }

  if (diffPercentage < -15.0) {
    return `ราคากลางต่ำกว่าค่ามัธยฐานในอดีตประมาณ ${diffPercentage}% อาจมีความเสี่ยงเรื่องงบประมาณจำกัดเกินไปเมื่อเทียบกับขอบเขตงาน`;
  }

  return `ราคากลางอยู่ในเกณฑ์ปกติเมื่อเทียบกับโครงการใกล้เคียงในอดีต (เบี่ยงเบน ${sign}${diffPercentage}%)`;
}

/**
 * End-to-end historical price benchmarking for a TOR against comparable projects (FR-20).
 *
 * @param {object} targetTor - Target TorInsight document or plain object
 * @param {Array<object>} comparableProjects - Peer projects found by FR-19
 * @returns {object} Full priceAnalysis object ready for TorInsight.analytics.priceAnalysis
 */
export function calculatePriceBenchmarks(targetTor, comparableProjects = []) {
  const targetPrice = getProjectPrice(targetTor);

  // Extract and sanitize peer prices
  const validPeers = (comparableProjects || [])
    .map((peer) => {
      const price = peer.referencePriceTHB ?? getProjectPrice(peer.candidate ?? peer);
      const title =
        peer.title ||
        peer.identification?.titleTh ||
        peer.candidate?.identification?.titleTh ||
        `โครงการรหัส ${peer.projectId}`;
      const year = peer.year || peer.candidate?.facts?.fiscalYear || 2567;

      return {
        projectId: peer.projectId,
        title,
        year,
        referencePriceTHB: price,
        agreedPriceTHB: peer.agreedPriceTHB ?? peer.contract?.agreedPriceTHB ?? null,
      };
    })
    .filter(
      (p) =>
        typeof p.referencePriceTHB === 'number' &&
        !Number.isNaN(p.referencePriceTHB) &&
        Number.isFinite(p.referencePriceTHB) &&
        p.referencePriceTHB > 0,
    )
    .sort((a, b) => a.referencePriceTHB - b.referencePriceTHB);

  const peerPrices = validPeers.map((p) => p.referencePriceTHB);
  const sampleSize = peerPrices.length;

  // 1. Benchmarks
  const historicalMedianTHB = calculateHistoricalMedian(peerPrices);
  const historicalAverageTHB = calculateHistoricalAverage(peerPrices);

  // 2. Deviations vs Median (Primary)
  const medianDev = calculatePriceDeviations(targetPrice, historicalMedianTHB);
  const diffAmountTHB = medianDev.diffAmountTHB;
  const diffPercentage = medianDev.diffPercentage;

  // 3. Deviations vs Average (Secondary)
  const avgDev = calculatePriceDeviations(targetPrice, historicalAverageTHB);
  const diffAverageAmountTHB = avgDev.diffAmountTHB;
  const diffAveragePercentage = avgDev.diffPercentage;

  // 4. Reliability Tier
  const reliability = targetPrice == null ? 'none' : assessPriceReliability(sampleSize);

  // 5. Interpretation
  const interpretation = formatPriceInterpretation({
    targetPrice,
    median: historicalMedianTHB,
    diffPercentage,
    sampleSize,
    reliability,
  });

  return {
    referencePriceTHB: targetPrice,
    historicalMedianTHB,
    historicalAverageTHB,
    diffAmountTHB,
    diffPercentage,
    diffAverageAmountTHB,
    diffAveragePercentage,
    sampleSize,
    reliability,
    interpretation,
    comparableProjects: validPeers.map((p) => ({
      title: p.title,
      year: p.year,
      referencePriceTHB: p.referencePriceTHB,
      agreedPriceTHB: p.agreedPriceTHB ?? null,
    })),
  };
}
