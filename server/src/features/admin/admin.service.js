import { pipelineStats, reviewQueue, scraperSources } from './ops.fixtures.js';

/**
 * What the admin dashboard reads (FR14, FR15).
 *
 * One call rather than three, because the dashboard renders all of it at once
 * and three round trips would only give it three chances to half-load.
 *
 * Still reading fixtures. When the ingestion pipeline starts recording run
 * history and extraction confidence, this is the one function that changes —
 * the route, the guard and the client stay as they are.
 */
export function getOperations() {
  return {
    sources: scraperSources,
    reviewQueue,
    stats: pipelineStats,
  };
}
