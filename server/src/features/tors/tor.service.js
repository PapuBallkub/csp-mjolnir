import { env } from '#common/config/env.js';
import { Tor, TorInsight } from '#models/index.js';

/**
 * What the public may see (NFR-17). Never a non-IT TOR, and never a result a
 * person rejected. In pilot mode (this sprint's demo) unreviewed results and
 * demo data are shown too, labelled through `review`; otherwise only pipeline
 * results a person approved with a score of 80 or more.
 */
export function visibilityFilter({ showUnreviewed = env.showUnreviewedInsights } = {}) {
  const always = {
    'metadata.excluded': null,
    'metadata.reviewStatus': { $ne: 'rejected' },
    // Classified from a preview, not extracted yet: nothing to show (ADR 0018)
    'metadata.awaitingFullText': { $ne: true },
  };
  if (showUnreviewed) return always;
  return {
    ...always,
    'metadata.origin': { $ne: 'demo' },
    'metadata.reviewStatus': 'approved',
    'metadata.confidenceScore': { $gte: 80 },
  };
}

/** Open and past its deadline reads as Closed. Worked out here, never stored (ADR 0013). */
export function displayStatus(status, deadline, now = new Date()) {
  return status === 'Open' && deadline && new Date(deadline) < now ? 'Closed' : status;
}

/**
 * The status and amended flag as the feed says they are now (ADR 0013).
 * Extraction copies both into the insight once, but the feed keeps changing
 * them: a cancellation (D1) or a winner (W0) reaches the Tor, never the
 * insight. These stages replace the copies with the Tor's values before
 * anything filters, sorts or counts on them. An insight without a Tor keeps
 * its copy.
 *
 * A contract with a winner means Awarded, whatever the stored status says:
 * the same rule as the status engine (deriveStatus), so old records whose
 * status was never brought up to date can't show a signed contract as open.
 */
const HAS_WINNER = { $gt: [{ $strLenCP: { $ifNull: ['$contract.winnerName', ''] } }, 0] };
const LIVE_STATUS = [
  {
    $lookup: {
      from: Tor.collection.collectionName,
      localField: 'projectId',
      foreignField: 'projectId',
      pipeline: [
        {
          $project: {
            _id: 0,
            isAmended: 1,
            status: { $cond: [HAS_WINNER, 'Awarded', '$status'] },
            contractSigned: HAS_WINNER,
            // The stage e-GP announced last (ADR 0017), only for TORs the feed
            // actually announced: an older record's announceType is a guess
            latestAnnouncement: {
              $cond: [
                { $gt: [{ $size: { $ifNull: ['$announcementHistory', []] } }, 0] },
                { code: '$announceType', publishedAt: { $max: '$announcementHistory.publishedAt' } },
                null,
              ],
            },
          },
        },
      ],
      as: '_tor',
    },
  },
  {
    $set: {
      'identification.status': { $ifNull: [{ $first: '$_tor.status' }, '$identification.status'] },
      'amendmentInfo.isAmended': { $ifNull: [{ $first: '$_tor.isAmended' }, '$amendmentInfo.isAmended'] },
      contractSigned: { $ifNull: [{ $first: '$_tor.contractSigned' }, false] },
      latestAnnouncement: { $ifNull: [{ $first: '$_tor.latestAnnouncement' }, null] },
    },
  },
  { $unset: '_tor' },
];

/** LIVE_STATUS for one insight already in hand, with its Tor. */
function withLiveStatus(insight, tor) {
  if (!tor) return { ...insight, contractSigned: false, latestAnnouncement: null };
  const history = tor.announcementHistory ?? [];
  const times = history.map((entry) => entry.publishedAt).filter(Boolean).map((date) => new Date(date).getTime());
  return {
    ...insight,
    contractSigned: Boolean(tor.contract?.winnerName),
    latestAnnouncement: history.length
      ? { code: tor.announceType, publishedAt: times.length ? new Date(Math.max(...times)) : null }
      : null,
    identification: {
      ...insight.identification,
      status: tor.contract?.winnerName ? 'Awarded' : (tor.status ?? insight.identification?.status),
    },
    amendmentInfo: { ...insight.amendmentInfo, isAmended: tor.isAmended ?? insight.amendmentInfo?.isAmended },
  };
}

// The pipeline doesn't fill analytics yet, and its defaults are 0: shown as
// they are, a real TOR would read "lock-spec risk 0" as if measured (ADR 0014)
const lockSpecDone = (lockSpec) => Boolean(lockSpec?.verdictText || lockSpec?.findings?.length);
const priceDone = (price) => Boolean(price?.historicalMedianTHB > 0 || price?.comparableProjects?.length);

/**
 * Shapes a stored insight for the public: the status as of now, analysis that
 * wasn't done as null, and `review` in place of the internal metadata, so the
 * page can label what nobody has checked yet, and what is demo data.
 */
export function toPublic(insight, now = new Date()) {
  const { metadata = {}, analytics = {}, __v, ...record } = insight;
  const origin = metadata.origin ?? 'pipeline';
  return {
    ...record,
    identification: {
      ...record.identification,
      status: displayStatus(record.identification?.status, record.facts?.submissionDeadline, now),
    },
    // Decisive for freelancers: an individual can't bid ("เฉพาะนิติบุคคล")
    companiesOnly: (record.eligibility?.standardConditions ?? []).includes('juristic-person'),
    analytics: {
      lockSpec: lockSpecDone(analytics.lockSpec) ? analytics.lockSpec : null,
      priceAnalysis: priceDone(analytics.priceAnalysis) ? analytics.priceAnalysis : null,
    },
    review: {
      origin, // 'pipeline' | 'demo'
      status: metadata.reviewStatus ?? 'pending',
      checked: origin === 'pipeline' && metadata.reviewStatus === 'approved',
      score: metadata.confidenceScore ?? null,
      failedChecks: metadata.checks?.length ?? 0,
      processedAt: metadata.processedAt ?? null,
    },
  };
}

const DAY = 24 * 60 * 60 * 1000;
export const STATUSES = ['Draft', 'Open', 'Awarded', 'Closed', 'Cancelled'];
// The same line the detail page draws between medium and high lock-spec risk
const HIGH_RISK = 70;
// Agencies and technologies offered as filters: the most common, not every one
const FACET_LIMIT = 40;

// A query value is a string, or an array when the key repeats (?tech=A&tech=B)
function toList(value) {
  const values = Array.isArray(value) ? value : [value];
  return values.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
}

// displayStatus as an aggregation expression, for counting and sorting
const isDate = (path) => ({ $eq: [{ $type: path }, 'date'] });
const pastDeadline = (now) => ({
  $and: [{ $eq: ['$identification.status', 'Open'] }, isDate('$facts.submissionDeadline'), { $lt: ['$facts.submissionDeadline', now] }],
});
const stillOpen = (now) => ({
  $and: [{ $eq: ['$identification.status', 'Open'] }, isDate('$facts.submissionDeadline'), { $gte: ['$facts.submissionDeadline', now] }],
});

/**
 * Sort orders the catalog offers. Only the default puts real pipeline results
 * before demo data (ADR 0015): a reader who asks for "closing soonest" gets
 * exactly that.
 */
const SORTS = {
  newest: { 'metadata.origin': -1, 'facts.postedDate': -1, createdAt: -1 },
  // Still open first, soonest deadline first; dead and undated ones after
  deadline: { _open: -1, 'facts.submissionDeadline': 1, createdAt: -1 },
  // A TOR with no reference price sorts last either way, never as ฿0
  'budget-desc': { _priced: -1, 'facts.referencePriceTHB': -1, createdAt: -1 },
  'budget-asc': { _priced: -1, 'facts.referencePriceTHB': 1, createdAt: -1 },
};

// Status as the public sees it: "Closed" includes Open TORs past their deadline
function statusCondition(status, now) {
  if (status === 'Closed') {
    return {
      $or: [
        { 'identification.status': 'Closed' },
        { 'identification.status': 'Open', 'facts.submissionDeadline': { $lt: now } },
      ],
    };
  }
  if (status === 'Open') {
    return {
      'identification.status': 'Open',
      $or: [{ 'facts.submissionDeadline': null }, { 'facts.submissionDeadline': { $gte: now } }],
    };
  }
  return { 'identification.status': status };
}

/**
 * Searches and filters the TOR catalog (FR-10, FR-11). `status`, `tech` and
 * `agency` each take several values, by repeating the key; a TOR matches any
 * one of them.
 */
export async function listTors(
  {
    q,
    status,
    amended,
    minBudget,
    maxBudget,
    tech,
    agency,
    closingWithin,
    excludeHighRisk,
    sort,
    page = 1,
    limit = 20,
  } = {},
  { showUnreviewed, now = new Date() } = {},
) {
  // On the insight's own fields: matched first, so fewer Tors are looked up
  const conditions = [visibilityFilter({ showUnreviewed })];
  // On the status and the amended flag: matched once the live values are in
  const liveConditions = [];

  // Text search on title, agency, department and technology names
  if (typeof q === 'string' && q.trim()) {
    const pattern = { $regex: escapeRegex(q.trim()), $options: 'i' };
    conditions.push({
      $or: [
        { 'identification.titleTh': pattern },
        { 'identification.titleEn': pattern },
        { 'identification.agency': pattern },
        { 'identification.department': pattern },
        { 'technicalRequirements.requiredTechnologies.name': pattern },
      ],
    });
  }

  const statuses = toList(status);
  if (statuses.length) {
    liveConditions.push({ $or: statuses.map((value) => statusCondition(value, now)) });
  }

  // Amended is a flag over the status, not a status of its own (FR-15)
  if (amended === 'true') liveConditions.push({ 'amendmentInfo.isAmended': true });

  // Budget range on the reference price (ราคากลาง)
  const range = {};
  const min = Number(minBudget);
  const max = Number(maxBudget);
  if (minBudget !== undefined && minBudget !== '' && Number.isFinite(min) && min >= 0) range.$gte = min;
  if (maxBudget !== undefined && maxBudget !== '' && Number.isFinite(max) && max > 0) range.$lte = max;
  if (Object.keys(range).length > 0) conditions.push({ 'facts.referencePriceTHB': range });

  // A technology by its whole name: "React" must not match "React Native"
  const technologies = toList(tech);
  if (technologies.length) {
    conditions.push({
      'technicalRequirements.requiredTechnologies.name': {
        $in: technologies.map((name) => new RegExp(`^${escapeRegex(name)}$`, 'i')),
      },
    });
  }

  const agencies = toList(agency);
  if (agencies.length) conditions.push({ 'identification.agency': { $in: agencies } });

  // Still open, and closing within this many days
  const days = parseInt(closingWithin, 10);
  if (Number.isFinite(days) && days > 0) {
    liveConditions.push({
      'identification.status': 'Open',
      'facts.submissionDeadline': { $gte: now, $lte: new Date(now.getTime() + days * DAY) },
    });
  }

  // Analysis that wasn't run has no score, so it is never hidden as high risk
  if (excludeHighRisk === 'true') {
    conditions.push({ 'analytics.lockSpec.riskScore': { $not: { $gte: HIGH_RISK } } });
  }

  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

  // A light payload for the list
  const projection = {
    projectId: 1,
    identification: 1,
    'facts.budgetTHB': 1,
    'facts.referencePriceTHB': 1,
    'facts.submissionDeadline': 1,
    'facts.commentDeadline': 1,
    'facts.procurementMethod': 1,
    'facts.penaltyClause': 1,
    'facts.postedDate': 1,
    'facts.webUrl': 1,
    'technicalRequirements.requiredTechnologies': 1,
    'eligibility.standardConditions': 1,
    'analytics.lockSpec.riskScore': 1,
    'analytics.lockSpec.verdictText': 1,
    'analytics.priceAnalysis.diffPercentage': 1,
    'analytics.priceAnalysis.historicalMedianTHB': 1,
    'amendmentInfo.isAmended': 1,
    contractSigned: 1,
    latestAnnouncement: 1,
    'metadata.origin': 1,
    'metadata.reviewStatus': 1,
    'metadata.confidenceScore': 1,
    'metadata.checks.check': 1,
    'metadata.processedAt': 1,
    createdAt: 1,
  };

  // Counted after the live status, so a status filter counts what it shows
  const [{ total: counted, page: insights }] = await TorInsight.aggregate([
    { $match: { $and: conditions } },
    ...LIVE_STATUS,
    ...(liveConditions.length ? [{ $match: { $and: liveConditions } }] : []),
    {
      $facet: {
        total: [{ $count: 'count' }],
        page: [
          // Sort keys a plain find can't express; the projection drops them again
          { $addFields: { _open: stillOpen(now), _priced: { $isNumber: '$facts.referencePriceTHB' } } },
          { $sort: SORTS[sort] ?? SORTS.newest },
          { $skip: (safePage - 1) * safeLimit },
          { $limit: safeLimit },
          { $project: projection },
        ],
      },
    },
  ]);
  const total = counted[0]?.count ?? 0;

  return {
    tors: insights.map((insight) => toPublic(insight, now)),
    total,
    page: safePage,
    pages: Math.ceil(total / safeLimit) || 1,
    limit: safeLimit,
  };
}

/**
 * What the catalog's filters offer, counted over everything the public may
 * see: each status as the public sees it, the most common agencies and
 * technologies, and when the catalog last changed.
 */
export async function torFacets({ showUnreviewed, now = new Date() } = {}) {
  const top = (path) => [
    { $group: { _id: path, count: { $sum: 1 } } },
    { $match: { _id: { $type: 'string' } } },
    { $sort: { count: -1, _id: 1 } },
    { $limit: FACET_LIMIT },
  ];

  const [facets] = await TorInsight.aggregate([
    { $match: visibilityFilter({ showUnreviewed }) },
    ...LIVE_STATUS,
    {
      $facet: {
        statuses: [
          { $group: { _id: { $cond: [pastDeadline(now), 'Closed', '$identification.status'] }, count: { $sum: 1 } } },
        ],
        amended: [{ $match: { 'amendmentInfo.isAmended': true } }, { $count: 'count' }],
        agencies: top('$identification.agency'),
        // Each TOR counted once per technology, even if it lists two versions
        technologies: [
          { $project: { names: { $setUnion: [{ $ifNull: ['$technicalRequirements.requiredTechnologies.name', []] }, []] } } },
          { $unwind: '$names' },
          ...top('$names'),
        ],
        totals: [{ $group: { _id: null, total: { $sum: 1 }, lastUpdated: { $max: '$updatedAt' } } }],
      },
    },
  ]);

  const counted = Object.fromEntries(facets.statuses.map(({ _id, count }) => [_id, count]));
  const named = (rows) => rows.map(({ _id, count }) => ({ name: _id, count }));
  return {
    total: facets.totals[0]?.total ?? 0,
    lastUpdated: facets.totals[0]?.lastUpdated ?? null,
    statuses: Object.fromEntries(STATUSES.map((value) => [value, counted[value] ?? 0])),
    amended: facets.amended[0]?.count ?? 0,
    agencies: named(facets.agencies),
    technologies: named(facets.technologies),
  };
}

/**
 * One TOR's full detail: the insight, plus the document details from the Tor.
 * A TOR the public may not see is reported as not found.
 */
export async function getTorByProjectId(projectId, { showUnreviewed, now = new Date() } = {}) {
  if (!projectId || typeof projectId !== 'string') return null;
  const id = projectId.trim();

  const [insight, rawTor] = await Promise.all([
    TorInsight.findOne({ projectId: id, ...visibilityFilter({ showUnreviewed }) }).lean(),
    Tor.findOne(
      { projectId: id },
      {
        document: 1,
        pipelineStatus: 1,
        source: 1,
        status: 1,
        isAmended: 1,
        announceType: 1,
        'announcementHistory.publishedAt': 1,
        'contract.winnerName': 1,
        'ocr.truncated': 1,
        'ocr.usedOcr': 1,
      },
    ).lean(),
  ]);
  if (!insight) return null;

  return {
    ...toPublic(withLiveStatus(insight, rawTor), now),
    document: rawTor?.document || null,
    ocr: rawTor?.ocr || null,
    source: rawTor?.source || null,
  };
}

// A search box is user input: its text is matched literally, not as a pattern
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
