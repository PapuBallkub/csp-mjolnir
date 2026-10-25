/**
 * server/src/features/reality-check/index.js
 *
 * Public interface for the reality-check and benchmarking feature.
 * Conforms to ADR 0003.
 */

export {
  findComparableProjects,
  calculateCompositeSimilarity,
  calculateScaleProximity,
  calculateTechSimilarity,
  calculateScopeSimilarity,
  getFiscalYear,
  getProjectPrice,
  getProjectArchetype,
  FULL_EXTRACTION,
  isFullExtraction,
  SYSTEM_ARCHETYPES,
  COMPLEXITY_TIERS,
  calculateComplexitySimilarity,
  getProjectComplexityTier,
} from './similarity.service.js';

export {
  calculateHistoricalMedian,
  calculateHistoricalAverage,
  calculatePriceDeviations,
  assessPriceReliability,
  formatPriceInterpretation,
  calculatePriceBenchmarks,
} from './benchmark.service.js';
