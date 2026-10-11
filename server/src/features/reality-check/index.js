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
  DOMAIN_KEYWORDS,
} from './similarity.service.js';
