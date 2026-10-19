/**
 * server/src/features/reality-check/similarity.service.js
 *
 * Implements FR-19: Grouping and identifying comparable historical IT
 * procurement projects for a given TOR without calling an external LLM.
 *
 * Conforms to ADR 0021 & docs/features/reality-check-and-benchmarking.md
 */

import { TorInsight } from '#models/index.js';
import { COMPLEXITY_TIERS, SYSTEM_ARCHETYPES } from '#pipeline/extraction/index.js';

export { COMPLEXITY_TIERS, SYSTEM_ARCHETYPES };

/**
 * Resolves the system archetypes of a project directly from AI extraction (ADR 0021).
 *
 * @param {object} tor
 * @returns {Set<string>}
 */
export function getProjectArchetypes(tor) {
  const archetypes = new Set();

  const direct = tor?.overview?.systemArchetype || tor?.identification?.archetype;
  if (Array.isArray(direct)) {
    for (const a of direct) {
      if (SYSTEM_ARCHETYPES.includes(a)) archetypes.add(a);
    }
  } else if (typeof direct === 'string' && SYSTEM_ARCHETYPES.includes(direct)) {
    archetypes.add(direct);
  }

  if (archetypes.size === 0) {
    archetypes.add('other');
  }

  return archetypes;
}

/**
 * Resolves the primary system archetype of a project.
 *
 * @param {object} tor
 * @returns {string}
 */
export function getProjectArchetype(tor) {
  const set = getProjectArchetypes(tor);
  for (const a of set) {
    if (a !== 'other') return a;
  }
  return 'other';
}

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
 * Detailed comparisons use fully extracted projects only, which have
 * technologies and scope (ADR 0028). Not a title-level record of a past
 * project (built from its title and data.go.th row), nor a preview waiting for
 * its full text (ADR 0018), nor a project found not IT.
 */
export const FULL_EXTRACTION = {
  'metadata.titleOnly': { $ne: true },
  'metadata.awaitingFullText': { $ne: true },
  'metadata.excluded': null,
};

/** The same, for a record already in hand. */
export const isFullExtraction = (tor) =>
  !tor?.metadata?.titleOnly && !tor?.metadata?.awaitingFullText && !tor?.metadata?.excluded;

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
 * Extracts normalized domain keyword tokens from major components and high-level scope.
 * (titleTh is excluded from scoring to prevent administrative phrase noise)
 *
/**
 * Calculates similarity between two projects based on system archetype (ADR 0021).
 * Matches the canonical system archetypes extracted by Gemini:
 * - Same archetype: 1.00
 * - Different archetypes: 0.15
 * - Unspecified / 'other': neutral 0.50
 *
 * @param {object} torA
 * @param {object} torB
 * @returns {number}
 */
export function calculateScopeSimilarity(torA, torB) {
  const archsA = getProjectArchetypes(torA);
  const archsB = getProjectArchetypes(torB);

  const nonOtherA = [...archsA].filter((a) => a !== 'other');
  const nonOtherB = [...archsB].filter((a) => a !== 'other');

  if (nonOtherA.length > 0 && nonOtherB.length > 0) {
    let intersection = 0;
    for (const a of nonOtherA) {
      if (archsB.has(a)) intersection += 1;
    }
    const union = new Set([...nonOtherA, ...nonOtherB]).size;
    if (intersection > 0) {
      return Number((intersection / union).toFixed(4));
    }
    return 0.15; // Different archetypes in same category
  }

  // If either or both have no specific archetype ('other'), return neutral 0.50
  return 0.5;
}

/**
 * Resolves the complexity tier of a project (FR-19 & ADR 0021).
 *
 * @param {object} tor
 * @returns {string|null}
 */
export function getProjectComplexityTier(tor) {
  const tier = tor?.overview?.complexityTier;
  if (typeof tier === 'string' && COMPLEXITY_TIERS.includes(tier)) {
    return tier;
  }
  return null;
}

/**
 * Calculates complexity tier similarity between two projects (ADR 0021 & docs).
 * - Same tier (e.g. standard & standard): 1.00
 * - 1 tier apart (adjacent, e.g. basic & standard, or standard & enterprise): 0.50
 * - 2 tiers apart (distant, e.g. basic & enterprise): 0.10
 * - Unspecified / null (legacy fallback): neutral 0.50
 *
 * @param {object} torA
 * @param {object} torB
 * @returns {number}
 */
export function calculateComplexitySimilarity(torA, torB) {
  const tierA = getProjectComplexityTier(torA);
  const tierB = getProjectComplexityTier(torB);

  if (!tierA || !tierB) {
    return 0.5; // neutral fallback for legacy records
  }

  const idxA = COMPLEXITY_TIERS.indexOf(tierA);
  const idxB = COMPLEXITY_TIERS.indexOf(tierB);
  const distance = Math.abs(idxA - idxB);

  if (distance === 0) return 1.0;
  if (distance === 1) return 0.5;
  return 0.1;
}

/**
 * Computes composite similarity score between target TOR and a candidate TOR.
 * S = 0.40 * Archetype + 0.35 * Complexity + 0.25 * Tech
 *
 * Peers are selected 100% on technical specifications without inspecting price.
 *
 * @param {object} targetTor
 * @param {object} candidateTor
 * @returns {{ score: number, breakdown: { archetypeSim: number, complexitySim: number, techSim: number, scopeSim: number, scaleSim: number } }}
 */
export function calculateCompositeSimilarity(targetTor, candidateTor) {
  const archetypeSim = calculateScopeSimilarity(targetTor, candidateTor);
  const complexitySim = calculateComplexitySimilarity(targetTor, candidateTor);
  const techSim = calculateTechSimilarity(
    targetTor?.technicalRequirements?.requiredTechnologies,
    candidateTor?.technicalRequirements?.requiredTechnologies,
  );

  const score = Number((archetypeSim * 0.40 + complexitySim * 0.35 + techSim * 0.25).toFixed(4));

  return {
    score,
    breakdown: {
      archetypeSim: Number(archetypeSim.toFixed(4)),
      complexitySim: Number(complexitySim.toFixed(4)),
      techSim: Number(techSim.toFixed(4)),
      // Backwards-compatibility aliases:
      scopeSim: Number(archetypeSim.toFixed(4)),
      scaleSim: Number(complexitySim.toFixed(4)),
    },
  };
}

/**
 * FR-19: Finds and ranks comparable historical projects for a target TOR.
 *
 * Non-circular matching: Candidates are chosen strictly from technical specifications
 * (Category -> Archetype -> Complexity Tier -> Tech Stack). The circular budget bracket
 * filter is eliminated so price anomalies remain detectable without peer corruption.
 *
 * @param {object} targetTor - A TorInsight document or plain object
 * @param {object} [options]
 * @param {number} [options.limit=5] - Number of comparable projects to return
 * @param {Array<object>} [options.candidatesPool=null] - Optional in-memory candidates pool
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
    candidatesPool = null,
  } = options;

  const targetCategory = targetTor?.identification?.category;
  const targetPrice = getProjectPrice(targetTor);

  // Without a category or valid price, reliable benchmarking cannot be established
  if (!targetCategory || !targetPrice || targetPrice <= 0) {
    return [];
  }

  let candidates = [];

  if (Array.isArray(candidatesPool)) {
    candidates = candidatesPool.filter((cand) => {
      if (cand.projectId === targetTor.projectId) return false;
      if (!isFullExtraction(cand)) return false;
      if (cand.identification?.category !== targetCategory) return false;
      const price = getProjectPrice(cand);
      return price !== null && price > 0;
    });
  } else {
    candidates = await TorInsight.find({
      projectId: { $ne: targetTor.projectId },
      ...FULL_EXTRACTION,
      'identification.category': targetCategory,
      $or: [
        { 'facts.referencePriceTHB': { $gt: 0 } },
        { 'facts.budgetTHB': { $gt: 0 } },
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

  // In-memory composite similarity scoring based 100% on technical specifications
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

  // Sort descending by technical specification score, tie-break by proximity of reference price
  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const diffA = Math.abs(a.referencePriceTHB - targetPrice);
    const diffB = Math.abs(b.referencePriceTHB - targetPrice);
    return diffA - diffB;
  });

  return ranked.slice(0, limit);
}
