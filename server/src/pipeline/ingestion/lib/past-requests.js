/**
 * server/src/pipeline/ingestion/lib/past-requests.js
 *
 * Which past projects to read in full, a few a night (ADR 0028). A past
 * project from data.go.th is known by its title until its documents are read;
 * reading them makes it a full extraction, which comparisons can use.
 *
 * Chosen for the open IT TORs, soonest deadline first: each gets past
 * projects until it has ENOUGH_RELATED related ones, and only then does the
 * next TOR's turn come. Once every open TOR has that many, the soonest look
 * for more, ENOUGH_RELATED at a time. Related: a project read in full that its
 * comparison would list (same category, within its price band), past or new,
 * or a past one already chosen for it and not read yet. Candidates are ranked
 * by the comparison's own score (technologies are unknown until read). Those
 * the title screen found IT come first; unsure ones, mostly hardware, only
 * after them. A night no open TOR has a candidate left for goes to the
 * newest, IT first.
 */

import { FULL_EXTRACTION, calculateCompositeSimilarity, getProjectPrice } from '#features/reality-check/index.js';
import { TitleScreen, Tor, TorInsight } from '#models/index.js';
import { feedAmount, feedDate } from '../../extraction/convert.js';
import { loadGivenUp } from '../../shared/failures.js';

const fromEnv = (name, fallback) => {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return parsed >= 0 ? parsed : fallback;
};
export const HISTORY_PER_NIGHT = fromEnv('HISTORY_PER_NIGHT', 20);
// Related projects an open TOR gets before the next one's turn, and the step
// it takes once all have them: the comparison lists 5
export const ENOUGH_RELATED = Math.max(1, fromEnv('HISTORY_ENOUGH_RELATED', 5));

// The comparison's own price band (findComparableProjects: 0.3× to 3×)
const PRICE_BAND = [0.3, 3];

const time = (date) => (date ? new Date(date).getTime() : null);
const isOpen = (tor, now) =>
  ['Draft', 'Open'].includes(tor.status) && (!tor.submissionDeadline || new Date(tor.submissionDeadline) >= now);

/** Whether `other` is in `target`'s comparison: the same category, within its price band. */
function comparable(target, other) {
  const price = getProjectPrice(target);
  const otherPrice = getProjectPrice(other);
  return (
    Boolean(price && otherPrice) &&
    other.identification?.category === target.identification?.category &&
    otherPrice >= price * PRICE_BAND[0] &&
    otherPrice <= price * PRICE_BAND[1]
  );
}

/** Past projects asked for and not downloaded yet, leaving out those that gave up. */
export async function pendingRequests() {
  const pending = await Tor.find({ historyRequestedAt: { $ne: null }, pipelineStatus: 'fetched' }, { projectId: 1 }).lean();
  const gaveUp = await loadGivenUp('download');
  return pending.filter((tor) => !gaveUp(tor.projectId, null));
}

/**
 * For each open TOR, how many past projects chosen for it aren't settled yet:
 * not read in full, not found not IT, not given up.
 */
async function unsettledFor() {
  const chosen = await Tor.find({ historyRequestedFor: { $ne: null } }, { projectId: 1, historyRequestedFor: 1 }).lean();
  if (chosen.length === 0) return new Map();
  const settled = new Set(
    await TorInsight.distinct('projectId', {
      projectId: { $in: chosen.map((tor) => tor.projectId) },
      $or: [FULL_EXTRACTION, { 'metadata.excluded': { $ne: null } }],
    }),
  );
  const gaveUp = await loadGivenUp('download');
  const counts = new Map();
  for (const tor of chosen) {
    if (settled.has(tor.projectId) || gaveUp(tor.projectId, null)) continue;
    counts.set(tor.historyRequestedFor, (counts.get(tor.historyRequestedFor) ?? 0) + 1);
  }
  return counts;
}

/**
 * The past projects that can be chosen: not asked for before. IT ones by
 * their title-level record; unsure ones, which have none, by the same fields
 * from their project and screen.
 */
async function candidates() {
  const asked = new Set(await Tor.distinct('projectId', { historyRequestedAt: { $ne: null } }));
  const it = (await TorInsight.find({ 'metadata.titleOnly': true }, { projectId: 1, identification: 1, facts: 1 }).lean())
    .filter((candidate) => !asked.has(candidate.projectId));

  const unsureScreens = await TitleScreen.find({ verdict: 'unsure' }, { projectId: 1, category: 1 }).lean();
  const ids = unsureScreens.map((screen) => screen.projectId);
  const withRecord = new Set(await TorInsight.distinct('projectId', { projectId: { $in: ids } }));
  const category = new Map(unsureScreens.map((screen) => [screen.projectId, screen.category ?? null]));
  const unsure = (
    await Tor.find(
      { projectId: { $in: ids }, source: 'datago', historyRequestedAt: null },
      { projectId: 1, title: 1, referencePriceTHB: 1, budgetTHB: 1, announceDate: 1 },
    ).lean()
  )
    .filter((tor) => !withRecord.has(tor.projectId))
    .map((tor) => ({
      projectId: tor.projectId,
      identification: { titleTh: tor.title, category: category.get(tor.projectId) },
      facts: {
        referencePriceTHB: feedAmount(tor.referencePriceTHB),
        budgetTHB: feedAmount(tor.budgetTHB),
        postedDate: feedDate(tor.announceDate),
      },
    }));

  return { it, unsure };
}

/**
 * Chooses tonight's past projects, without asking for them yet.
 *
 * @returns {Promise<{ pending: number, chosen: { projectId: string, title: string, why: string, for: string|null, verdict: string }[] }>}
 *   `pending` is how many earlier choices are still waiting for their
 *   download: they count against the night, so a night that couldn't
 *   download doesn't pile up
 */
export async function selectPastProjects({ perNight = HISTORY_PER_NIGHT, enough = ENOUGH_RELATED, now = new Date() } = {}) {
  const pending = (await pendingRequests()).length;
  const room = Math.max(0, perNight - pending);
  const result = { pending, chosen: [] };
  if (room === 0) return result;

  const { it, unsure } = await candidates();
  if (it.length + unsure.length === 0) return result;

  // Open IT projects, fully extracted, soonest deadline first: they need
  // related past projects before bids close
  const openTors = (await Tor.find({ status: { $in: ['Draft', 'Open'] } }, { projectId: 1, status: 1, submissionDeadline: 1 }).lean())
    .filter((tor) => isOpen(tor, now));
  const deadline = new Map(openTors.map((tor) => [tor.projectId, time(tor.submissionDeadline) ?? Infinity]));
  const targets = (
    await TorInsight.find(
      { ...FULL_EXTRACTION, projectId: { $in: [...deadline.keys()] }, 'identification.category': { $ne: null } },
      { projectId: 1, identification: 1, facts: 1, overview: 1, technicalRequirements: 1 },
    ).lean()
  ).sort((a, b) => deadline.get(a.projectId) - deadline.get(b.projectId) || a.projectId.localeCompare(b.projectId));

  // What each open TOR has now: projects read in full in its comparison,
  // past or new, and past ones chosen for it and not read yet
  const extracted = await TorInsight.find(
    { ...FULL_EXTRACTION, 'identification.category': { $ne: null } },
    { projectId: 1, identification: 1, facts: 1 },
  ).lean();
  const unsettled = await unsettledFor();
  const related = new Map(
    targets.map((target) => [
      target.projectId,
      extracted.filter((other) => other.projectId !== target.projectId && comparable(target, other)).length +
        (unsettled.get(target.projectId) ?? 0),
    ]),
  );

  const chosen = new Map();
  const choose = (candidate, verdict, why, forTor) => {
    if (chosen.size < room && !chosen.has(candidate.projectId)) {
      chosen.set(candidate.projectId, {
        projectId: candidate.projectId,
        title: candidate.identification?.titleTh ?? '',
        why,
        for: forTor,
        verdict,
      });
    }
  };

  // Each TOR's candidates, closest first and IT before unsure, worked out once
  const queues = new Map();
  const ranked = (target, pool, verdict) =>
    pool
      .filter((candidate) => comparable(target, candidate))
      .map((candidate) => ({ candidate, verdict, score: calculateCompositeSimilarity(target, candidate).score }))
      .sort((a, b) => b.score - a.score);
  const nextFor = (target) => {
    if (!queues.has(target.projectId)) {
      queues.set(target.projectId, [...ranked(target, it, 'it'), ...ranked(target, unsure, 'unsure')]);
    }
    const queue = queues.get(target.projectId);
    while (queue.length && chosen.has(queue[0].candidate.projectId)) queue.shift();
    return queue.shift() ?? null;
  };

  // One pick at a time, to the TOR with the fewest steps of `enough` related,
  // soonest deadline first among equals: every TOR reaches `enough` before the
  // soonest goes on to twice that
  const step = (target) => Math.floor(related.get(target.projectId) / enough);
  let active = [...targets];
  while (chosen.size < room && active.length) {
    const target = active.reduce((best, other) => (step(other) < step(best) ? other : best));
    const next = nextFor(target);
    if (!next) {
      active = active.filter((other) => other !== target);
      continue;
    }
    choose(next.candidate, next.verdict, `like ${target.projectId}`, target.projectId);
    related.set(target.projectId, related.get(target.projectId) + 1);
  }

  // A night no open TOR has a candidate left for: the newest, IT first
  const newest = (pool) => [...pool].sort((a, b) => (time(b.facts?.postedDate) ?? 0) - (time(a.facts?.postedDate) ?? 0));
  for (const candidate of newest(it)) choose(candidate, 'it', 'newest', null);
  for (const candidate of newest(unsure)) choose(candidate, 'unsure', 'newest', null);

  result.chosen = [...chosen.values()];
  return result;
}

/** Asks for the chosen past projects: download and OCR take them next. */
export async function requestPastProjects(chosen, { now = new Date() } = {}) {
  if (chosen.length === 0) return 0;
  const { modifiedCount } = await Tor.bulkWrite(
    chosen.map((pick) => ({
      updateOne: {
        filter: { projectId: pick.projectId, historyRequestedAt: null },
        update: { $set: { historyRequestedAt: now, historyRequestedFor: pick.for ?? null } },
      },
    })),
  );
  return modifiedCount;
}
