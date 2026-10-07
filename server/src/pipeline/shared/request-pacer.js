/**
 * server/src/pipeline/shared/request-pacer.js
 *
 * Keeps every request to a government site at least one second apart
 * (NFR-03). Fetch and download share one pacer, so a run that does both still
 * sends e-GP no more than one request a second, whichever code sends it.
 *
 * Paced per site, not per hostname: process3.gprocurement.go.th and
 * process5.gprocurement.go.th are one operator, and both count against e-GP.
 */

const MIN_INTERVAL_MS = 1000;

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The site a hostname belongs to: the last three labels under .th, where
 * names sit below go.th, co.th and the like, and the last two elsewhere.
 *
 *   process5.gprocurement.go.th → gprocurement.go.th
 *   data.go.th                  → data.go.th
 */
export function siteOf(hostname) {
  const labels = hostname.toLowerCase().split('.');
  return labels.slice(hostname.endsWith('.th') ? -3 : -2).join('.');
}

/**
 * Makes a pacer: an async function to await before each request. Each caller
 * reserves the next free slot for its site before it sleeps, so callers that
 * arrive together still go out one interval apart.
 */
export function createPacer({ intervalMs = MIN_INTERVAL_MS, now = Date.now, sleep = defaultSleep } = {}) {
  const nextSlot = new Map();

  return async function pace(url) {
    const site = siteOf(new URL(url).hostname);
    const current = now();
    const slot = Math.max(current, nextSlot.get(site) ?? 0);
    nextSlot.set(site, slot + intervalMs);
    if (slot > current) await sleep(slot - current);
  };
}

/** The one pacer every source and the downloader use. */
export const paceRequest = createPacer();
