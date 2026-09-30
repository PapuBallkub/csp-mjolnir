/**
 * server/src/pipeline/shared/egp-links.js
 *
 * The one place e-GP page URLs are built. If e-GP changes its URL format, only
 * this function changes, and a re-run brings every stored link up to date.
 */

/**
 * The public e-GP page for a project: what "Open on e-GP" links to.
 * @param {string} projectId - 11-digit e-GP project ID
 * @returns {string}
 */
export function egpAnnouncementUrl(projectId) {
  return (
    'https://process5.gprocurement.go.th/egp-agpc01-web/announcement?keywordSearch=' +
    encodeURIComponent(String(projectId).trim())
  );
}
