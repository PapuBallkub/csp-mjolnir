/**
 * server/src/pipeline/shared/user-agent.js
 *
 * How the pipeline introduces itself to government sites: by name, with a
 * link to the project. e-GP accepts an honest User-Agent and rejects a bare
 * fake browser string, so nothing needs to pass for Chrome (tested
 * 2026-10-11: docs/data-sources/process5_gprocurement.md#the-firewall).
 */
export const USER_AGENT = 'GIPDP/0.1 (Kasetsart University student project; +https://github.com/PapuBallkub/csp-mjolnir)';
