/**
 * server/src/pipeline/ingestion/lib/past-requests.js
 *
 * Which past projects to read in full, a few a night (ADR 0028). A past
 * project from data.go.th starts as a title-level record; reading its
 * documents makes it a full extraction, which detailed comparisons can use.
 *
 * Chosen first by what current IT TORs need: for each open one, soonest
 * deadline first, the past projects its comparison would rank highest, scored
 * the same way (same category, the same price band, then price and title
 * words; technologies are unknown until read). Every open TOR gets its best
 * one before any gets a second. The rest of the night's budget goes to the
 * newest past projects.
 */

import { FULL_EXTRACTION, calculateCompositeSimilarity, getProjectPrice } from '#features/reality-check/index.js';
import { Tor, TorInsight } from '#models/index.js';
import { loadGivenUp } from '../../shared/failures.js';

const parsedPerNight = Number.parseInt(process.env.HISTORY_PER_NIGHT ?? '', 10);
export const HISTORY_PER_NIGHT = parsedPerNight >= 0 ? parsedPerNight : 20;

// How many past projects each open TOR may claim
export const PER_OPEN_TOR = 3;

// The comparison's own price band (findComparableProjects: 0.3× to 3×)
const PRICE_BAND = [0.3, 3];

/** Past projects asked for and not downloaded yet, leaving out those that gave up. */
export async function pendingRequests() {
  const pending = await Tor.find({ historyRequestedAt: { $ne: null }, pipelineStatus: 'fetched' }, { projectId: 1 }).lean();
  const gaveUp = await loadGivenUp('download');
  return pending.filter((tor) => !gaveUp(tor.projectId, null));
}

const time = (date) => (date ? new Date(date).getTime() : null);

/**
 * Chooses tonight's past projects, without asking for them yet.
 *
 * @returns {Promise<{ pending: number, chosen: { projectId: string, title: string, why: string }[] }>}
 *   `pending` is how many earlier choices are still waiting: they count
 *   against the budget, so a night that couldn't download doesn't pile up
 */
export async function selectPastProjects({ perNight = HISTORY_PER_NIGHT, perOpenTor = PER_OPEN_TOR, now = new Date() } = {}) {
  const pending = (await pendingRequests()).length;
  const room = Math.max(0, perNight - pending);
  const result = { pending, chosen: [] };
  if (room === 0) return result;

  // Title-level past projects not asked for before
  const asked = new Set(await Tor.distinct('projectId', { historyRequestedAt: { $ne: null } }));
  const candidates = (
    await TorInsight.find({ 'metadata.titleOnly': true }, { projectId: 1, identification: 1, facts: 1 }).lean()
  ).filter((candidate) => !asked.has(candidate.projectId));
  if (candidates.length === 0) return result;

  // Open IT projects, fully extracted, soonest deadline first: they need
  // comparables before bids close
  const open = await Tor.find(
    { status: { $in: ['Draft', 'Open'] }, $or: [{ submissionDeadline: null }, { submissionDeadline: { $gte: now } }] },
    { projectId: 1, submissionDeadline: 1 },
  ).lean();
  const deadline = new Map(open.map((tor) => [tor.projectId, time(tor.submissionDeadline) ?? Infinity]));
  const targets = (
    await TorInsight.find(
      { ...FULL_EXTRACTION, projectId: { $in: [...deadline.keys()] }, 'identification.category': { $ne: null } },
      { projectId: 1, identification: 1, facts: 1, overview: 1, technicalRequirements: 1 },
    ).lean()
  ).sort((a, b) => deadline.get(a.projectId) - deadline.get(b.projectId));

  // Each open TOR's closest past projects, by the comparison's own score
  const ranked = targets.map((target) => {
    const price = getProjectPrice(target);
    if (!price) return { target, picks: [] };
    const picks = candidates
      .filter((candidate) => candidate.identification?.category === target.identification.category)
      .filter((candidate) => {
        const candidatePrice = getProjectPrice(candidate);
        return candidatePrice && candidatePrice >= price * PRICE_BAND[0] && candidatePrice <= price * PRICE_BAND[1];
      })
      .map((candidate) => ({ candidate, score: calculateCompositeSimilarity(target, candidate).score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, perOpenTor);
    return { target, picks };
  });

  const chosen = new Map();
  const choose = (candidate, why) => {
    if (chosen.size < room && !chosen.has(candidate.projectId)) {
      chosen.set(candidate.projectId, { projectId: candidate.projectId, title: candidate.identification?.titleTh ?? '', why });
    }
  };
  // Round by round: every open TOR's best, then every second best
  for (let round = 0; round < perOpenTor; round++) {
    for (const { target, picks } of ranked) if (picks[round]) choose(picks[round].candidate, `like ${target.projectId}`);
  }
  // The rest of the budget: the newest
  const newest = [...candidates].sort((a, b) => (time(b.facts?.postedDate) ?? 0) - (time(a.facts?.postedDate) ?? 0));
  for (const candidate of newest) choose(candidate, 'newest');

  result.chosen = [...chosen.values()];
  return result;
}

/** Asks for the chosen past projects: download and OCR take them next. */
export async function requestPastProjects(chosen, { now = new Date() } = {}) {
  if (chosen.length === 0) return 0;
  const { modifiedCount } = await Tor.updateMany(
    { projectId: { $in: chosen.map((pick) => pick.projectId) }, historyRequestedAt: null },
    { $set: { historyRequestedAt: now } },
  );
  return modifiedCount;
}
