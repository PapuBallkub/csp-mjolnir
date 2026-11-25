/**
 * server/src/features/similarity/candidate-search.js
 *
 * Implements FR-19 historical candidate pooling, database querying,
 * eligibility criteria, and Top-K comparable project ranking.
 *
 * Conforms to ADR 0021, ADR 0028, NFR-17 & docs/features/comparable-projects-matching.md.
 */

import { TorInsight } from '#models/index.js';
import {
  calculateCompositeSimilarity,
  getFiscalYear,
  getProjectCategories,
  getProjectComplexityTier,
  getProjectPrice,
  isComplexityCompatible,
  isScaleCompatible,
  MIN_SCALE_RATIO,
  sharesCategory,
} from './similarity-scoring.js';

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
 * Concluded procurement statuses considered stable for historical peer benchmarking.
 * Excludes Draft (still in hearing), Open (active tender subject to change/amendments),
 * and Cancelled (failed procurements).
 */
export const STABLE_STATUSES = ['Closed', 'Awarded'];

/** Minimum OCR/LLM confidence score required for candidate peers (NFR-17). */
export const MIN_CONFIDENCE_SCORE = 80;

/** Query filters for candidate peer selection in MongoDB (ADR 0021 & NFR-17). */
export const candidateFilters = (now = new Date()) => ({
  ...FULL_EXTRACTION,
  'metadata.confidenceScore': { $gte: MIN_CONFIDENCE_SCORE },
  $or: [
    { 'identification.status': { $in: STABLE_STATUSES } },
    { 'identification.status': 'Open', 'facts.submissionDeadline': { $lt: now } },
  ],
});

export const CANDIDATE_FILTERS = candidateFilters();

/**
 * Checks whether an in-memory project candidate meets stability and quality criteria:
 * 1. Full extraction (ADR 0028)
 * 2. Concluded status: 'Closed' or 'Awarded', or 'Open' past its deadline (FR-19)
 * 3. Confidence score >= 80% (NFR-17)
 *
 * @param {object} tor
 * @param {Date} [now=new Date()]
 * @returns {boolean}
 */
export const isEligibleCandidate = (tor, now = new Date()) => {
  if (!isFullExtraction(tor)) return false;
  const status = tor?.identification?.status;
  const deadline = tor?.facts?.submissionDeadline;
  const isConcluded =
    STABLE_STATUSES.includes(status) ||
    (status === 'Open' && deadline && new Date(deadline) < now);
  if (!isConcluded) return false;
  const score = tor?.metadata?.confidenceScore;
  if (typeof score !== 'number' || score < MIN_CONFIDENCE_SCORE) return false;
  return true;
};

/**
 * FR-19: Finds and ranks comparable historical projects for a target TOR.
 *
 * Non-circular matching: Candidates are chosen strictly from technical specifications
 * (a shared Category -> Archetype -> Complexity Tier -> Tech Stack -> Category order). The circular budget bracket
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
    now = new Date(),
  } = options;

  const targetCategories = getProjectCategories(targetTor);
  const targetPrice = getProjectPrice(targetTor);
  const targetTier = getProjectComplexityTier(targetTor);

  // Without a category or valid price, reliable benchmarking cannot be established
  if (targetCategories.length === 0 || !targetPrice || targetPrice <= 0) {
    return [];
  }

  let candidates = [];

  const minScalePrice = Math.round(targetPrice * MIN_SCALE_RATIO);
  const maxScalePrice = Math.round(targetPrice / MIN_SCALE_RATIO);

  if (Array.isArray(candidatesPool)) {
    candidates = candidatesPool.filter((cand) => {
      if (cand.projectId === targetTor.projectId) return false;
      if (!isEligibleCandidate(cand, now)) return false;
      if (!sharesCategory(targetTor, cand)) return false;
      // Enterprise targets strictly isolate to enterprise peers to prevent steep percentage distortion
      if (targetTier === 'enterprise' && getProjectComplexityTier(cand) !== 'enterprise') {
        return false;
      }
      const price = getProjectPrice(cand);
      if (price === null || price <= 0) return false;
      // Order-of-magnitude scale sanity guardrail (ADR 0044)
      if (!isScaleCompatible(targetPrice, price)) return false;
      return true;
    });
  } else {
    candidates = await TorInsight.find({
      projectId: { $ne: targetTor.projectId },
      $and: [
        FULL_EXTRACTION,
        { 'metadata.confidenceScore': { $gte: MIN_CONFIDENCE_SCORE } },
        {
          $or: [
            { 'identification.status': { $in: STABLE_STATUSES } },
            { 'identification.status': 'Open', 'facts.submissionDeadline': { $lt: now } },
          ],
        },
        { 'identification.categories': { $in: targetCategories } },
        ...(targetTier === 'enterprise' ? [{ 'overview.complexityTier': 'enterprise' }] : []),
        // Order-of-magnitude scale guardrail in MongoDB query (ADR 0044)
        {
          $or: [
            { 'facts.referencePriceTHB': { $gte: minScalePrice, $lte: maxScalePrice } },
            { 'facts.budgetTHB': { $gte: minScalePrice, $lte: maxScalePrice } },
          ],
        },
      ],
    })
      .select({
        projectId: 1,
        identification: 1,
        facts: 1,
        overview: 1,
        technicalRequirements: 1,
        metadata: 1,
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
