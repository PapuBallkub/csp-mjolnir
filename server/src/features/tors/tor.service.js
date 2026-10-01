import { Tor, TorInsight } from '#models/index.js';

/**
 * Searches and filters normalized TOR records.
 */
export async function listTors({
  q,
  status,
  minBudget,
  maxBudget,
  tech,
  page = 1,
  limit = 20,
} = {}) {
  const query = {};

  // Text search on title and agency
  if (q && typeof q === 'string' && q.trim()) {
    const trimmed = q.trim();
    query.$or = [
      { 'identification.titleTh': { $regex: trimmed, $options: 'i' } },
      { 'identification.agency': { $regex: trimmed, $options: 'i' } },
      { 'identification.department': { $regex: trimmed, $options: 'i' } },
    ];
  }

  // Status filter
  if (status && typeof status === 'string' && status.trim()) {
    query['identification.status'] = status.trim();
  }

  // Budget range (checks referencePriceTHB first, then budgetTHB)
  const parsedMin = Number(minBudget);
  const parsedMax = Number(maxBudget);
  if (!Number.isNaN(parsedMin) && parsedMin >= 0) {
    query.$or = query.$or || [];
    query['facts.referencePriceTHB'] = { ...(query['facts.referencePriceTHB'] || {}), $gte: parsedMin };
  }
  if (!Number.isNaN(parsedMax) && parsedMax > 0) {
    query['facts.referencePriceTHB'] = { ...(query['facts.referencePriceTHB'] || {}), $lte: parsedMax };
  }

  // Tech stack filter
  if (tech && typeof tech === 'string' && tech.trim()) {
    query['technicalRequirements.requiredTechnologies.name'] = {
      $regex: tech.trim(),
      $options: 'i',
    };
  }

  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (safePage - 1) * safeLimit;

  // Projection for catalog/list view — light payload
  const projection = {
    projectId: 1,
    identification: 1,
    facts: {
      budgetTHB: 1,
      referencePriceTHB: 1,
      submissionDeadline: 1,
      procurementMethod: 1,
      penaltyClause: 1,
      postedDate: 1,
      webUrl: 1,
    },
    'technicalRequirements.requiredTechnologies': 1,
    'analytics.lockSpec.riskScore': 1,
    'analytics.lockSpec.verdictText': 1,
    'analytics.priceAnalysis.diffPercentage': 1,
    'amendmentInfo.isAmended': 1,
    createdAt: 1,
  };

  const [total, tors] = await Promise.all([
    TorInsight.countDocuments(query),
    TorInsight.find(query, projection)
      .sort({ 'facts.postedDate': -1, createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),
  ]);

  return {
    tors,
    total,
    page: safePage,
    pages: Math.ceil(total / safeLimit) || 1,
    limit: safeLimit,
  };
}

/**
 * Retrieves complete TOR detail by projectId, combining TorInsight and Tor document metadata.
 */
export async function getTorByProjectId(projectId) {
  if (!projectId || typeof projectId !== 'string') return null;

  const [insight, rawTor] = await Promise.all([
    TorInsight.findOne({ projectId: projectId.trim() }).lean(),
    Tor.findOne({ projectId: projectId.trim() }, {
      document: 1,
      pipelineStatus: 1,
      source: 1,
      'ocr.truncated': 1,
      'ocr.pages': 1,
      'ocr.usedOcr': 1,
    }).lean(),
  ]);

  if (!insight) return null;

  return {
    ...insight,
    document: rawTor?.document || null,
    ocr: rawTor?.ocr || null,
    source: rawTor?.source || null,
  };
}
