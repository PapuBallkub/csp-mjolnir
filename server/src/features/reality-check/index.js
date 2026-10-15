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
  FULL_EXTRACTION,
  isFullExtraction,
  DOMAIN_KEYWORDS,
} from './similarity.service.js';
