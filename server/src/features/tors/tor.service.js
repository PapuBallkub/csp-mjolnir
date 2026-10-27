import fs from 'node:fs';
import { Readable } from 'node:stream';
import axios from 'axios';
import AdmZip from 'adm-zip';
import { env } from '#common/config/env.js';
import { Tor, TorInsight } from '#models/index.js';
import { USER_AGENT } from '#pipeline/shared/user-agent.js';

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
    // A past project known only from its title and data.go.th row (ADR 0028)
    'metadata.titleOnly': { $ne: true },
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
 * A signed contract means Awarded, whatever the stored status says: the same
 * rule as the status engine (hasSignedContract), so old records whose status
 * was never brought up to date can't show a signed contract as open. A
 * winner's name, a contract number or a price counts: data.go.th leaves the
 * name blank on some signed contracts (ADR 0028).
 */
const filled = (field) => ({ $gt: [{ $strLenCP: { $ifNull: [field, ''] } }, 0] });
const SIGNED_CONTRACT = {
  $or: [
    filled('$contract.winnerName'),
    filled('$contract.contractNo'),
    { $gt: [{ $ifNull: ['$contract.agreedPriceTHB', 0] }, 0] },
    { $gt: [{ $ifNull: ['$contract.amountTHB', 0] }, 0] },
  ],
};

/** The same rule, for a Tor already in hand */
const hasSignedContract = (contract) =>
  Boolean(contract?.winnerName || contract?.contractNo || contract?.agreedPriceTHB > 0 || contract?.amountTHB > 0);

/*
 * The same goes for the facts the Tor holds, read from the feed or from the
 * e-GP package's documents (ADR 0020): the agency, budget, ราคากลาง and when
 * bids close. A changed invitation updates them on the Tor, and the page
 * shows them without another extraction. Where the Tor has none, the
 * insight's own value stands. A price of 0 is "none" (ADR 0014).
 */
const torValue = (field) => ({ $first: `$_tor.${field}` });
const torPrice = (field, fallback) => ({ $cond: [{ $gt: [torValue(field), 0] }, torValue(field), fallback] });
const torText = (field, fallback) => ({
  $cond: [{ $gt: [{ $strLenCP: { $ifNull: [torValue(field), ''] } }, 0] }, torValue(field), fallback],
});

export const LIVE_STATUS = [
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
            agency: 1,
            budgetTHB: 1,
            referencePriceTHB: 1,
            submissionDeadline: 1,
            status: { $cond: [SIGNED_CONTRACT, 'Awarded', '$status'] },
            contractSigned: SIGNED_CONTRACT,
            // The stage e-GP announced last (ADR 0017), only for TORs the feed
            // actually announced: an older record's announceType is a guess
            latestAnnouncement: {
              $cond: [
                { $gt: [{ $size: { $ifNull: ['$announcementHistory', []] } }, 0] },
                { code: '$announceType', publishedAt: { $max: '$announcementHistory.publishedAt' } },
                null,
              ],
            },
            // The latest change we know of and haven't rolled back (ADR 0032)
            lastChangeAt: 1,
            latestChange: {
              $let: {
                vars: { live: { $filter: { input: { $ifNull: ['$amendments', []] }, cond: { $ne: ['$$this.rolledBack', true] } } } },
                in: {
                  $cond: [
                    { $gt: [{ $size: '$$live' }, 0] },
                    {
                      $let: {
                        vars: { last: { $last: '$$live' } },
                        in: {
                          source: '$$last.source',
                          date: '$$last.date',
                          detectedAt: '$$last.detectedAt',
                          previousCheckAt: '$$last.previousCheckAt',
                          fields: { $setUnion: [{ $ifNull: ['$$last.changes.field', []] }, []] },
                        },
                      },
                    },
                    null,
                  ],
                },
              },
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
      'identification.agency': torText('agency', '$identification.agency'),
      'facts.budgetTHB': torPrice('budgetTHB', '$facts.budgetTHB'),
      'facts.referencePriceTHB': torPrice('referencePriceTHB', '$facts.referencePriceTHB'),
      'facts.submissionDeadline': { $ifNull: [torValue('submissionDeadline'), '$facts.submissionDeadline'] },
      // A change's date and sections, read live, like the status (ADR 0031's Q5, 0032)
      lastChangeAt: { $ifNull: [torValue('lastChangeAt'), null] },
      latestChange: { $ifNull: [torValue('latestChange'), null] },
      'amendmentInfo.lastAmendedDate': {
        $ifNull: [torValue('latestChange.date'), { $ifNull: [torValue('latestChange.detectedAt'), '$amendmentInfo.lastAmendedDate'] }],
      },
      'amendmentInfo.changedSections': { $ifNull: [torValue('latestChange.fields'), '$amendmentInfo.changedSections'] },
    },
  },
  { $unset: '_tor' },
];

/**
 * A change as the public sees it: none rolled back, nothing internal (ADR 0032).
 * `rereadPending` says the summary on the page predates it: an announced
 * change whose package hasn't come yet, or a new TOR file the summary it
 * replaced is still standing for.
 */
function publicChanges(tor, summaryVersion) {
  return (tor?.amendments ?? [])
    .filter((entry) => !entry.rolledBack)
    .map(({ source, stage, round, date, headline, detectedAt, previousCheckAt, zipId, previousZipId, insightVersion, diff, changes = [] }) => ({
      source,
      stage: stage ?? null,
      rereadPending:
        (source === 'feed' && !zipId) ||
        (changes.some((row) => row.field === 'document') && insightVersion != null && insightVersion === summaryVersion),
      round: round || null,
      date: date ?? null,
      headline: headline || null,
      detectedAt: detectedAt ?? null,
      previousCheckAt: previousCheckAt ?? null,
      zipId: zipId ?? null,
      previousZipId: previousZipId ?? null,
      diff,
      changes: changes.map(({ kind, field, before, after }) => ({ kind, field, before, after })),
    }));
}

/** LIVE_STATUS for one insight already in hand, with its Tor. */
function withLiveStatus(insight, tor) {
  if (!tor) return { ...insight, contractSigned: false, latestAnnouncement: null, lastChangeAt: null, latestChange: null };
  const history = tor.announcementHistory ?? [];
  const times = history.map((entry) => entry.publishedAt).filter(Boolean).map((date) => new Date(date).getTime());
  const latest = (tor.amendments ?? []).filter((entry) => !entry.rolledBack).at(-1) ?? null;
  const fields = latest ? [...new Set((latest.changes ?? []).map((row) => row.field))] : [];
  return {
    ...insight,
    contractSigned: hasSignedContract(tor.contract),
    lastChangeAt: tor.lastChangeAt ?? null,
    latestChange: latest
      ? { source: latest.source, date: latest.date ?? null, detectedAt: latest.detectedAt ?? null, previousCheckAt: latest.previousCheckAt ?? null, fields }
      : null,
    latestAnnouncement: history.length
      ? { code: tor.announceType, publishedAt: times.length ? new Date(Math.max(...times)) : null }
      : null,
    identification: {
      ...insight.identification,
      status: hasSignedContract(tor.contract) ? 'Awarded' : (tor.status ?? insight.identification?.status),
      agency: tor.agency || insight.identification?.agency,
    },
    facts: {
      ...insight.facts,
      budgetTHB: tor.budgetTHB > 0 ? tor.budgetTHB : (insight.facts?.budgetTHB ?? null),
      referencePriceTHB: tor.referencePriceTHB > 0 ? tor.referencePriceTHB : (insight.facts?.referencePriceTHB ?? null),
      submissionDeadline: tor.submissionDeadline ?? insight.facts?.submissionDeadline ?? null,
    },
    amendmentInfo: {
      ...insight.amendmentInfo,
      isAmended: tor.isAmended ?? insight.amendmentInfo?.isAmended,
      lastAmendedDate: latest ? (latest.date ?? latest.detectedAt ?? null) : (insight.amendmentInfo?.lastAmendedDate ?? null),
      changedSections: latest ? fields : (insight.amendmentInfo?.changedSections ?? []),
    },
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
    'amendmentInfo.lastAmendedDate': 1,
    contractSigned: 1,
    latestAnnouncement: 1,
    lastChangeAt: 1,
    latestChange: 1,
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
        agency: 1,
        budgetTHB: 1,
        referencePriceTHB: 1,
        submissionDeadline: 1,
        announceType: 1,
        'announcementHistory.publishedAt': 1,
        'contract.winnerName': 1,
        'contract.contractNo': 1,
        'contract.agreedPriceTHB': 1,
        'contract.amountTHB': 1,
        'ocr.truncated': 1,
        'ocr.usedOcr': 1,
        amendments: 1,
        lastChangeAt: 1,
      },
    ).lean(),
  ]);
  if (!insight) return null;

  return {
    ...toPublic(withLiveStatus(insight, rawTor), now),
    document: publicDocument(rawTor?.document),
    ocr: rawTor?.ocr || null,
    source: rawTor?.source || null,
    // What changed in it, oldest first, with both originals (FR-16, ADR 0032)
    amendments: publicChanges(rawTor, insight.metadata?.version ?? 1),
  };
}

/**
 * What the public may know about the TOR's file: what the page shows. Never
 * where the server keeps it (`storagePath`, the parts' paths) or its hash.
 */
function publicDocument(document) {
  if (!document) return null;
  const { fileName = null, sizeBytes = null, pages = null, documentType = null } = document;
  return { fileName, sizeBytes, pages, documentType };
}

// A search box is user input: its text is matched literally, not as a pattern
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const PROCESS5 = 'https://process5.gprocurement.go.th';
const MAX_PREVIEW_BYTES = 40 * 1024 * 1024; // 40MB
const PREVIEW_TIMEOUT_MS = 15000;

// In-Memory LRU Cache for on-demand PDF previews (Max 20 entries, 30 min TTL)
const PDF_CACHE_MAX_ENTRIES = 20;
const PDF_CACHE_TTL_MS = 30 * 60 * 1000;
const pdfPreviewCache = new Map();

function getCachedPdf(key) {
  const entry = pdfPreviewCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > PDF_CACHE_TTL_MS) {
    pdfPreviewCache.delete(key);
    return null;
  }
  // LRU bump: delete and re-insert at end of Map
  pdfPreviewCache.delete(key);
  entry.timestamp = Date.now();
  pdfPreviewCache.set(key, entry);
  return entry;
}

function setCachedPdf(key, buffer, fileName) {
  if (pdfPreviewCache.size >= PDF_CACHE_MAX_ENTRIES) {
    const oldestKey = pdfPreviewCache.keys().next().value;
    if (oldestKey) pdfPreviewCache.delete(oldestKey);
  }
  pdfPreviewCache.set(key, {
    buffer,
    fileName,
    timestamp: Date.now(),
  });
}

/**
 * Streams the PDF document for a project on demand without persisting binary data to DB.
 * 1. If downloaded file exists on disk (from OCR pipeline), stream it directly.
 * 2. If in-memory LRU cache has the buffer, stream it instantly in ~1ms.
 * 3. If direct e-GP template URL is available, stream it.
 * 4. Query e-GP process5 API on the fly, extract candidate PDFs, populate cache, and stream.
 *
 * @param {string} projectId - 11-digit e-GP project ID
 * @param {object} [options]
 * @param {number} [options.part=0] - For multi-part documents, which part (0-indexed)
 * @returns {Promise<{ stream: import('stream').Readable, fileName: string, contentLength?: number } | null>}
 */
export async function getTorPdfStream(projectId, { part = 0 } = {}) {
  if (!projectId || typeof projectId !== 'string') return null;
  const id = projectId.trim();

  const tor = await Tor.findOne({ projectId: id }).lean();
  if (!tor) return null;

  // 1. Check local file if downloaded by OCR pipeline
  let localPath = tor.document?.storagePath;
  let fileName = tor.document?.fileName || `${id}_TOR.pdf`;

  if (part > 0 && Array.isArray(tor.document?.parts) && tor.document.parts[part]) {
    localPath = tor.document.parts[part].storagePath;
    fileName = tor.document.parts[part].fileName || fileName;
  }

  if (localPath && fs.existsSync(localPath)) {
    try {
      const stats = fs.statSync(localPath);
      return {
        stream: fs.createReadStream(localPath),
        fileName,
        contentLength: stats.size,
      };
    } catch {
      // Fall through to cache/network fetch if file read fails
    }
  }

  // 2. Check In-Memory LRU Cache
  const cacheKey = `${id}:${part}`;
  const cached = getCachedPdf(cacheKey);
  if (cached) {
    return {
      stream: Readable.from(cached.buffer),
      fileName: cached.fileName,
      contentLength: cached.buffer.byteLength,
    };
  }

  // 3. Direct URL from e-GP template service or portal
  const directUrl = tor.egpUrl || tor.announcementHistory?.[0]?.url;
  if (directUrl && (directUrl.includes('view-pdf-file') || directUrl.endsWith('.pdf'))) {
    try {
      const resp = await axios.get(directUrl, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/pdf,*/*' },
        responseType: 'arraybuffer',
        timeout: PREVIEW_TIMEOUT_MS,
      });
      const directBuffer = Buffer.from(resp.data);
      setCachedPdf(cacheKey, directBuffer, `${id}_announcement.pdf`);
      return {
        stream: Readable.from(directBuffer),
        fileName: `${id}_announcement.pdf`,
        contentLength: directBuffer.byteLength,
      };
    } catch {
      // Fall through to dynamic lookup
    }
  }

  // 4. Dynamic lookup from e-GP process5 API
  try {
    const lookupUrls = [
      `${PROCESS5}/egp-approval-service/apv-common/infoProcureDocAnnounZip?projectId=${id}`,
      `${PROCESS5}/egp-approval-service/apv-common/infoProcureDocAnnounZipTemp?projectId=${id}`,
    ];

    let zipId = null;
    let templateId = null;

    for (const url of lookupUrls) {
      try {
        const { data } = await axios.get(url, {
          headers: { 'User-Agent': USER_AGENT, Accept: '*/*' },
          timeout: 8000,
        });
        if (data?.data?.buildName2) {
          templateId = data.data.buildName2;
        }
        if (data?.data?.zipId) {
          zipId = data.data.zipId;
          break;
        }
      } catch {
        continue;
      }
    }

    // Blank bank guarantee forms and legal boilerplate e-GP includes in every package
    const isJunkForm = (entryName) => {
      const base = String(entryName).split(/[\\/]/).pop();
      return (
        /bond\.pdf$/i.test(base) ||
        /^contract_\d+\.pdf$/i.test(base) ||
        /^definition_\d+\.pdf$/i.test(base) ||
        /^quotation\.pdf$/i.test(base) ||
        /^bidding noltice\.pdf$/i.test(base) ||
        /^bill_payment\.pdf$/i.test(base) ||
        /^action_plan/i.test(base) ||
        /^price adjustment/i.test(base)
      );
    };

    // A. Priority 1: If zipId is known, download zip in memory and extract the real TOR specification PDF
    if (zipId) {
      try {
        const resp = await axios.get(
          `${PROCESS5}/egp-upload-service/v1/downloadFileTest?fileId=${zipId}`,
          {
            headers: { 'User-Agent': USER_AGENT, Accept: '*/*' },
            responseType: 'arraybuffer',
            timeout: PREVIEW_TIMEOUT_MS,
            maxContentLength: MAX_PREVIEW_BYTES,
          },
        );

        const buffer = Buffer.from(resp.data);
        if (buffer.subarray(0, 4).toString('ascii').startsWith('%PDF')) {
          setCachedPdf(cacheKey, buffer, `${id}_document.pdf`);
          return {
            stream: Readable.from(buffer),
            fileName: `${id}_document.pdf`,
            contentLength: buffer.byteLength,
          };
        }

        const zip = new AdmZip(buffer);
        const entries = zip
          .getEntries()
          .filter((e) => !e.isDirectory && /\.pdf$/i.test(e.entryName) && !isJunkForm(e.entryName));

        if (entries.length > 0) {
          // Categorize entries
          const torCandidates = entries.filter((e) =>
            /(^|[^a-z])tor([^a-z]|$)|ขอบเขต|คุณลักษณะ/i.test(e.entryName),
          ).sort((a, b) => b.header.size - a.header.size);

          const biddingCandidates = entries.filter((e) =>
            /doc_/i.test(e.entryName),
          ).sort((a, b) => b.header.size - a.header.size);

          const announcementCandidates = entries.filter((e) =>
            /annoudoc/i.test(e.entryName),
          ).sort((a, b) => b.header.size - a.header.size);

          const otherCandidates = entries.filter((e) =>
            !torCandidates.includes(e) &&
            !biddingCandidates.includes(e) &&
            !announcementCandidates.includes(e),
          ).sort((a, b) => b.header.size - a.header.size);

          // Ordered list of useful documents
          const sortedCandidates = [
            ...torCandidates,
            ...biddingCandidates,
            ...announcementCandidates,
            ...otherCandidates,
          ];

          // Warm cache for discovered candidate parts for instant sub-document tab switches
          for (let i = 0; i < Math.min(sortedCandidates.length, 5); i++) {
            const cand = sortedCandidates[i];
            try {
              const cBuf = cand.getData();
              setCachedPdf(`${id}:${i}`, cBuf, cand.name || `${id}_document_${i}.pdf`);
            } catch {
              // Ignore single entry extraction failure
            }
          }

          const selected = sortedCandidates[part] || sortedCandidates[0];
          const pdfData = selected.getData();
          setCachedPdf(cacheKey, pdfData, selected.name || `${id}_TOR.pdf`);

          return {
            stream: Readable.from(pdfData),
            fileName: selected.name || `${id}_TOR.pdf`,
            contentLength: pdfData.byteLength,
          };
        }
      } catch {
        // Fall through to template lookup if zip extraction fails
      }
    }

    // B. Priority 2: Fall back to 2-page announcement letter template if no TOR file in ZIP
    if (templateId) {
      try {
        const resp = await axios.get(
          `${PROCESS5}/egp-template-service/dwnt/view-pdf-file?templateId=${templateId}`,
          {
            headers: { 'User-Agent': USER_AGENT, Accept: 'application/pdf,*/*' },
            responseType: 'arraybuffer',
            timeout: PREVIEW_TIMEOUT_MS,
          },
        );
        const templBuffer = Buffer.from(resp.data);
        setCachedPdf(cacheKey, templBuffer, `${id}_announcement.pdf`);
        return {
          stream: Readable.from(templBuffer),
          fileName: `${id}_announcement.pdf`,
          contentLength: templBuffer.byteLength,
        };
      } catch {
        // Failed
      }
    }
  } catch {
    // Upstream unavailable
  }

  return null;
}

