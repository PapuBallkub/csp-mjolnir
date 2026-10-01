import { env } from '#common/config/env.js';
import { Tor, TorInsight } from '#models/index.js';

/**
 * What the public may see (NFR-17). Never a non-IT TOR, and never a result a
 * person rejected. In pilot mode (this sprint's demo) unreviewed results and
 * demo data are shown too, labelled through `review`; otherwise only pipeline
 * results a person approved with a score of 80 or more.
 */
export function visibilityFilter({ showUnreviewed = env.showUnreviewedInsights } = {}) {
  const always = { 'metadata.excluded': null, 'metadata.reviewStatus': { $ne: 'rejected' } };
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
 * Searches and filters the TOR catalog.
 */
export async function listTors(
  { q, status, minBudget, maxBudget, tech, page = 1, limit = 20 } = {},
  { showUnreviewed, now = new Date() } = {},
) {
  const conditions = [visibilityFilter({ showUnreviewed })];

  // Text search on title, agency and department
  if (typeof q === 'string' && q.trim()) {
    const pattern = { $regex: escapeRegex(q.trim()), $options: 'i' };
    conditions.push({
      $or: [
        { 'identification.titleTh': pattern },
        { 'identification.agency': pattern },
        { 'identification.department': pattern },
      ],
    });
  }

  if (typeof status === 'string' && status.trim()) {
    conditions.push(statusCondition(status.trim(), now));
  }

  // Budget range on the reference price (ราคากลาง)
  const range = {};
  const min = Number(minBudget);
  const max = Number(maxBudget);
  if (minBudget !== undefined && minBudget !== '' && Number.isFinite(min) && min >= 0) range.$gte = min;
  if (maxBudget !== undefined && maxBudget !== '' && Number.isFinite(max) && max > 0) range.$lte = max;
  if (Object.keys(range).length > 0) conditions.push({ 'facts.referencePriceTHB': range });

  if (typeof tech === 'string' && tech.trim()) {
    conditions.push({
      'technicalRequirements.requiredTechnologies.name': { $regex: escapeRegex(tech.trim()), $options: 'i' },
    });
  }

  const query = { $and: conditions };
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

  // A light payload for the list
  const projection = {
    projectId: 1,
    identification: 1,
    'facts.budgetTHB': 1,
    'facts.referencePriceTHB': 1,
    'facts.submissionDeadline': 1,
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
    'metadata.origin': 1,
    'metadata.reviewStatus': 1,
    'metadata.confidenceScore': 1,
    'metadata.checks.check': 1,
    'metadata.processedAt': 1,
    createdAt: 1,
  };

  const [total, insights] = await Promise.all([
    TorInsight.countDocuments(query),
    TorInsight.find(query, projection)
      // Real pipeline results before demo data, then newest first
      .sort({ 'metadata.origin': -1, 'facts.postedDate': -1, createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .lean(),
  ]);

  return {
    tors: insights.map((insight) => toPublic(insight, now)),
    total,
    page: safePage,
    pages: Math.ceil(total / safeLimit) || 1,
    limit: safeLimit,
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
    Tor.findOne({ projectId: id }, { document: 1, pipelineStatus: 1, source: 1, 'ocr.truncated': 1, 'ocr.usedOcr': 1 }).lean(),
  ]);
  if (!insight) return null;

  return {
    ...toPublic(insight, now),
    document: rawTor?.document || null,
    ocr: rawTor?.ocr || null,
    source: rawTor?.source || null,
  };
}

// A search box is user input: its text is matched literally, not as a pattern
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
