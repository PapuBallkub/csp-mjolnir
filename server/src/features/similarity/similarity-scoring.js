/**
 * server/src/features/similarity/similarity-scoring.js
 *
 * Implements FR-19 similarity scoring formulas: Jaccard tech stack overlap,
 * system archetype alignment, complexity step distance, and category order weighting.
 *
 * Pure, deterministic functions with zero database dependencies.
 * Conforms to ADR 0021, ADR 0034 & docs/features/comparable-projects-matching.md.
 */

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
      const bkk = new Date(d.getTime() + 7 * 60 * 60 * 1000);
      const year = bkk.getUTCFullYear();
      const month = bkk.getUTCMonth(); // 0 = Jan, 8 = Sep, 9 = Oct
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
 * Minimum scale proximity required for peer benchmarking (ADR 0044).
 * Projects differing by more than one order of magnitude (10x, scale ratio < 0.10)
 * represent categorically mismatched operational scopes and cannot legitimately
 * baseline each other's market rates.
 */
export const MIN_SCALE_RATIO = 0.10;

/**
 * Checks whether two project prices fall within the order-of-magnitude scale guardrail (ADR 0044).
 *
 * @param {number|null} priceA
 * @param {number|null} priceB
 * @returns {boolean}
 */
export function isScaleCompatible(priceA, priceB) {
  if (!priceA || !priceB || priceA <= 0 || priceB <= 0) return false;
  return calculateScaleProximity(priceA, priceB) >= MIN_SCALE_RATIO;
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
 * Determines whether two complexity tiers can legitimately benchmark against each other.
 * Enterprise tier represents high-concurrency / mission-critical infrastructure
 * and is strictly segregated: enterprise projects cannot be benchmarked against
 * standard or basic tiers to prevent astronomical false-positive price anomalies.
 *
 * @param {string|null} tierA
 * @param {string|null} tierB
 * @returns {boolean}
 */
export function isComplexityCompatible(tierA, tierB) {
  if (!tierA || !tierB) return true;
  if (tierA === 'enterprise' || tierB === 'enterprise') {
    return tierA === tierB;
  }
  return true;
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
 * A project's categories, the main one first (ADR 0034).
 *
 * @param {object} tor
 * @returns {string[]}
 */
export const getProjectCategories = (tor) => tor?.identification?.categories ?? [];

/**
 * Whether two projects share at least one category: the comparison's domain
 * filter (ADR 0021 & 0034).
 *
 * @param {object} torA
 * @param {object} torB
 * @returns {boolean}
 */
export function sharesCategory(torA, torB) {
  const categoriesB = getProjectCategories(torB);
  return getProjectCategories(torA).some((category) => categoriesB.includes(category));
}

/**
 * Calculates category similarity between two projects (ADR 0034).
 * S_category = overlap * order in [0, 1].
 * - overlap: |A ∩ B| / |A ∪ B|, as for the tech stack, so sharing more scores more
 * - order: the average, over shared categories, of how close their positions
 *   are: same position 1.00, one apart 0.75, two apart 0.50
 * - Unspecified: neutral 0.50
 *
 * @param {object} torA
 * @param {object} torB
 * @returns {number}
 */
export function calculateCategorySimilarity(torA, torB) {
  const categoriesA = getProjectCategories(torA);
  const categoriesB = getProjectCategories(torB);
  if (categoriesA.length === 0 || categoriesB.length === 0) return 0.5;

  const shared = categoriesA.filter((category) => categoriesB.includes(category));
  if (shared.length === 0) return 0;

  const overlap = shared.length / new Set([...categoriesA, ...categoriesB]).size;
  const closeness = shared.map((category) => 1 - Math.abs(categoriesA.indexOf(category) - categoriesB.indexOf(category)) / 4);
  const order = closeness.reduce((sum, value) => sum + value, 0) / shared.length;
  return Number((overlap * order).toFixed(4));
}

/**
 * Computes composite similarity score between target TOR and a candidate TOR.
 * S = 0.35 * Archetype + 0.30 * Complexity + 0.20 * Tech + 0.15 * Category
 *
 * Peers are selected 100% on technical specifications without inspecting price.
 *
 * @param {object} targetTor
 * @param {object} candidateTor
 * @returns {{ score: number, breakdown: { archetypeSim: number, complexitySim: number, techSim: number, categorySim: number, scopeSim: number, scaleSim: number } }}
 */
export function calculateCompositeSimilarity(targetTor, candidateTor) {
  const archetypeSim = calculateScopeSimilarity(targetTor, candidateTor);
  const complexitySim = calculateComplexitySimilarity(targetTor, candidateTor);
  const techSim = calculateTechSimilarity(
    targetTor?.technicalRequirements?.requiredTechnologies,
    candidateTor?.technicalRequirements?.requiredTechnologies,
  );
  const categorySim = calculateCategorySimilarity(targetTor, candidateTor);

  const score = Number((archetypeSim * 0.35 + complexitySim * 0.30 + techSim * 0.20 + categorySim * 0.15).toFixed(4));

  return {
    score,
    breakdown: {
      archetypeSim: Number(archetypeSim.toFixed(4)),
      complexitySim: Number(complexitySim.toFixed(4)),
      techSim: Number(techSim.toFixed(4)),
      categorySim,
      // Backwards-compatibility aliases:
      scopeSim: Number(archetypeSim.toFixed(4)),
      scaleSim: Number(complexitySim.toFixed(4)),
    },
  };
}
