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
  ARCHETYPE_KEYWORDS,
  DOMAIN_KEYWORDS,
} from './similarity.service.js';

export {
  calculatePriceBenchmarks,
  calculateMedian,
  calculateAverage,
  computeTorPriceBenchmarks,
} from './benchmark.service.js';

export {
  analyzeRequirementDeviations,
  computeTorLockSpecAnalysis,
  checkExperienceRatio,
  checkManufacturerAuthorizations,
  checkDisproportionateCertifications,
  checkTechnologyVersionLock,
  checkExcessivePenalty,
  SEVERITY_POINTS,
} from './deviation.service.js';
