/**
 * server/src/features/reality-check/similarity.service.js
 *
 * Implements FR-19: Grouping and identifying comparable historical IT
 * procurement projects for a given TOR without calling an external LLM.
 *
 * Conforms to ADR 0021 & docs/features/reality-check-and-benchmarking.md
 */

import { TorInsight } from '#models/index.js';

/** Domain keywords commonly found in Thai government IT procurement */
export const DOMAIN_KEYWORDS = [
  'erp',
  'crm',
  'gis',
  'e-service',
  'portal',
  'mobile',
  'app',
  'แอปพลิเคชัน',
  'เว็บไซต์',
  'ฐานข้อมูล',
  'database',
  'cloud',
  'คลาวด์',
  'data center',
  'ศูนย์ข้อมูล',
  'security',
  'ความมั่นคงปลอดภัย',
  'cybersecurity',
  'ai',
  'analytics',
  'iot',
  'network',
  'เครือข่าย',
  'cctv',
  'สารสนเทศ',
  'บริหารจัดการ',
  'บำรุงรักษา',
  'คอมพิวเตอร์',
  'แม่ข่าย',
  'server',
  'lan',
];

/**
 * Calculates Thai fiscal year in Buddhist Era (พ.ศ.).
 * October 1 onward belongs to the next calendar year's budget.
 * Falls back to 2-digit projectId prefix (e.g. "68..." -> 2568).
 *
 * @param {Date|string|null} dateVal
 * @param {string|null} projectId
 * @returns {number}
 */
export function getFiscalYear(dateVal, projectId) {
  if (dateVal) {
    const d = new Date(dateVal);
    if (!Number.isNaN(d.getTime())) {
      const year = d.getFullYear();
      const month = d.getMonth(); // 0 = Jan, 8 = Sep, 9 = Oct
      const fyGregorian = month >= 9 ? year + 1 : year;
      return fyGregorian + 543;
    }
  }
  if (projectId && /^\d{2}/.test(projectId)) {
    return 2500 + parseInt(projectId.slice(0, 2), 10);
  }
  return 2567; // sensible fallback
}

/**
 * Resolves the primary reference price for a TOR document.
 * Checks facts.referencePriceTHB first, then facts.budgetTHB.
 *
 * @param {object} tor
 * @returns {number|null}
 */
export function getProjectPrice(tor) {
  const ref = tor?.facts?.referencePriceTHB;
  if (typeof ref === 'number' && ref > 0) return ref;
  const budget = tor?.facts?.budgetTHB;
  if (typeof budget === 'number' && budget > 0) return budget;
  return null;
}

/**
 * Calculates budget scale proximity between two projects.
 * S_scale = min(PriceA, PriceB) / max(PriceA, PriceB) in [0, 1].
 *
 * @param {number|null} priceA
 * @param {number|null} priceB
 * @returns {number}
 */
export function calculateScaleProximity(priceA, priceB) {
  if (!priceA || !priceB || priceA <= 0 || priceB <= 0) return 0.5;
  return Math.min(priceA, priceB) / Math.max(priceA, priceB);
}

/**
 * Calculates Jaccard similarity between two technology stacks.
 * S_tech = |TechA ∩ TechB| / |TechA ∪ TechB| in [0, 1].
 *
 * @param {Array<{ name: string }>} [techsA]
 * @param {Array<{ name: string }>} [techsB]
 * @returns {number}
 */
export function calculateTechSimilarity(techsA = [], techsB = []) {
  const setA = new Set(
    (techsA ?? [])
      .map((t) => String(t?.name ?? '').trim().toLowerCase())
      .filter(Boolean),
  );
  const setB = new Set(
    (techsB ?? [])
      .map((t) => String(t?.name ?? '').trim().toLowerCase())
      .filter(Boolean),
  );

  // Both empty -> neutral score (0.5), neither penalized
  if (setA.size === 0 && setB.size === 0) return 0.5;
  // One specified, one not -> slight penalty (0.2)
  if (setA.size === 0 || setB.size === 0) return 0.2;

  let intersection = 0;
  for (const name of setA) {
    if (setB.has(name)) intersection += 1;
  }
  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? intersection / union : 0.5;
}

/**
 * Extracts normalized domain keyword tokens from title and major components.
 *
 * @param {object} tor
 * @returns {Set<string>}
 */
export function extractScopeTokens(tor) {
  const title = String(tor?.identification?.titleTh ?? '').toLowerCase();
  const components = (tor?.overview?.majorComponents ?? [])
    .map((c) => String(c ?? '').toLowerCase())
    .join(' ');
  const combined = `${title} ${components}`;

  const tokens = new Set();
  for (const kw of DOMAIN_KEYWORDS) {
    if (combined.includes(kw)) {
      tokens.add(kw);
    }
  }
  return tokens;
}

/**
 * Calculates Jaccard overlap of domain scope keywords.
 * S_scope = |ScopeA ∩ ScopeB| / |ScopeA ∪ ScopeB| in [0, 1].
 *
 * @param {object} torA
 * @param {object} torB
 * @returns {number}
 */
export function calculateScopeSimilarity(torA, torB) {
  const tokensA = extractScopeTokens(torA);
  const tokensB = extractScopeTokens(torB);

  if (tokensA.size === 0 && tokensB.size === 0) return 0.5;
  if (tokensA.size === 0 || tokensB.size === 0) return 0.3;

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection += 1;
  }
  const union = new Set([...tokensA, ...tokensB]).size;
  return union > 0 ? intersection / union : 0.5;
}

/**
 * Computes composite similarity score between target TOR and a candidate TOR.
 * S = 0.45 * Scale + 0.35 * Scope + 0.20 * Tech
 *
 * @param {object} targetTor
 * @param {object} candidateTor
 * @returns {{ score: number, breakdown: { scaleSim: number, scopeSim: number, techSim: number } }}
 */
export function calculateCompositeSimilarity(targetTor, candidateTor) {
  const targetPrice = getProjectPrice(targetTor);
  const candPrice = getProjectPrice(candidateTor);

  const scaleSim = calculateScaleProximity(targetPrice, candPrice);
  const scopeSim = calculateScopeSimilarity(targetTor, candidateTor);
  const techSim = calculateTechSimilarity(
    targetTor?.technicalRequirements?.requiredTechnologies,
    candidateTor?.technicalRequirements?.requiredTechnologies,
  );

  const score = Number((scaleSim * 0.45 + scopeSim * 0.35 + techSim * 0.2).toFixed(4));

  return {
    score,
    breakdown: {
      scaleSim: Number(scaleSim.toFixed(4)),
      scopeSim: Number(scopeSim.toFixed(4)),
      techSim: Number(techSim.toFixed(4)),
    },
  };
}

/**
 * FR-19: Finds and ranks comparable historical projects for a target TOR.
 *
 * @param {object} targetTor - A TorInsight document or plain object
 * @param {object} [options]
 * @param {number} [options.limit=5] - Number of comparable projects to return
 * @param {number} [options.minPriceFactor=0.3] - Lower bound bracket multiplier
 * @param {number} [options.maxPriceFactor=3.0] - Upper bound bracket multiplier
 * @param {Array<object>} [options.candidatesPool=null] - Optional in-memory candidates
 *   pool (used for unit tests or offline runs)
 * @returns {Promise<Array<{
 *   projectId: string,
 *   title: string,
 *   year: number,
 *   referencePriceTHB: number,
 *   score: number,
 *   breakdown: object,
 *   candidate: object
 * }>>}
 */
export async function findComparableProjects(targetTor, options = {}) {
  const {
    limit = 5,
    minPriceFactor = 0.3,
    maxPriceFactor = 3.0,
    candidatesPool = null,
  } = options;

  const targetCategory = targetTor?.identification?.category;
  const targetPrice = getProjectPrice(targetTor);

  // Without a category or valid price, reliable benchmarking cannot be established
  if (!targetCategory || !targetPrice || targetPrice <= 0) {
    return [];
  }

  const minPrice = targetPrice * minPriceFactor;
  const maxPrice = targetPrice * maxPriceFactor;

  let candidates = [];

  if (Array.isArray(candidatesPool)) {
    // In-memory pool filtering
    candidates = candidatesPool.filter((cand) => {
      if (cand.projectId === targetTor.projectId) return false;
      if (cand.identification?.category !== targetCategory) return false;
      const price = getProjectPrice(cand);
      return price !== null && price >= minPrice && price <= maxPrice;
    });
  } else {
    // Stage 1: Query MongoDB using the compound index
    candidates = await TorInsight.find({
      projectId: { $ne: targetTor.projectId },
      'identification.category': targetCategory,
      $or: [
        { 'facts.referencePriceTHB': { $gte: minPrice, $lte: maxPrice } },
        { 'facts.budgetTHB': { $gte: minPrice, $lte: maxPrice } },
      ],
    })
      .select({
        projectId: 1,
        identification: 1,
        facts: 1,
        overview: 1,
        technicalRequirements: 1,
      })
      .lean();
  }

  if (candidates.length === 0) {
    return [];
  }

  // Stage 2: In-memory composite similarity scoring
  const ranked = candidates.map((candidate) => {
    const { score, breakdown } = calculateCompositeSimilarity(targetTor, candidate);
    const candPrice = getProjectPrice(candidate) ?? 0;
    const year = getFiscalYear(candidate.facts?.postedDate, candidate.projectId);
    const title =
      candidate.identification?.titleTh ||
      candidate.title ||
      `โครงการรหัส ${candidate.projectId}`;

    return {
      projectId: candidate.projectId,
      title,
      year,
      referencePriceTHB: candPrice,
      score,
      breakdown,
      candidate,
    };
  });

  // Sort descending by score, tie-break by proximity of reference price
  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const diffA = Math.abs(a.referencePriceTHB - targetPrice);
    const diffB = Math.abs(b.referencePriceTHB - targetPrice);
    return diffA - diffB;
  });

  return ranked.slice(0, limit);
}
