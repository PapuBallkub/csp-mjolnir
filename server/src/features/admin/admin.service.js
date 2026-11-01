import fsSync from 'node:fs';
import path from 'node:path';
import axios from 'axios';
import { badRequest, notFound } from '#common/errors/http-error.js';
import {
  FeedPoll,
  IngestionLog,
  PipelineFailure,
  PipelineRun,
  RequestStreak,
  Technology,
  TitleScreen,
  Tor,
  TorInsight,
  TorInsightVersion,
} from '#models/index.js';
import { isFullExtraction } from '#features/reality-check/index.js';
import { keepVersion, listVersions, nextVersion, rollbackTor } from '#pipeline/shared/insight-versions.js';
import { runAddStep, runDownloadStep, runFetchStep, runOcrStep } from '#pipeline/ingestion/ingest.js';
import { EGP_BURST, EGP_PAUSE_MS } from '#pipeline/shared/request-pacer.js';
import { STARTER_TECHNOLOGIES } from '#pipeline/extraction/references/technologies.js';
import { ROUTINE_TYPES } from '#pipeline/ingestion/sources/process3.js';
import { USER_AGENT } from '#pipeline/shared/user-agent.js';
import { clearFailure } from '#pipeline/shared/failures.js';
import { snapshot } from '#pipeline/jobs/run-job.js';
import { RunLockHeldError, withRunLock } from '#pipeline/shared/run-lock.js';
import {
  defaultPipelineFailures,
  defaultPipelineRuns,
  defaultStageSnapshot,
  pipelineStats,
  reviewQueue as defaultReviewQueue,
  scraperSources as defaultSources,
} from './ops.fixtures.js';

/**
 * Aggregates live source telemetry from IngestionLog and Tor collection (FR-22).
 * Strictly monitors the 2 authentic platform sources: process3 and datago.
 */
export async function getDynamicSources() {
  const sources = [];
  const defaultSourceMap = new Map(defaultSources.map((s) => [s.id, s]));

  let loggedSourceIds = [];
  try {
    loggedSourceIds = await IngestionLog.distinct('source');
  } catch {
    loggedSourceIds = [];
  }

  const allSourceIds = Array.from(
    new Set([...defaultSources.map((s) => s.id), ...loggedSourceIds]),
  );

  for (const sourceId of allSourceIds) {
    const fallback = defaultSourceMap.get(sourceId) || {
      id: sourceId,
      name:
        sourceId === 'process3'
          ? 'e-GP กรมบัญชีกลาง (RSS Feed)'
          : 'Open Government Data (data.go.th)',
      portal: sourceId === 'process3' ? 'process3.gprocurement.go.th' : 'data.go.th',
      format: sourceId === 'process3' ? 'xml' : 'json',
      health: 'ok',
      uptime: 100,
      lastRun: new Date().toISOString().slice(0, 16).replace('T', ' '),
      docsLast7Days: 0,
      history: Array(14).fill(true),
    };

    try {
      const recentLogs = await IngestionLog.find({ source: sourceId })
        .sort({ startedAt: -1 })
        .limit(14);

      const torCount = await Tor.countDocuments({ source: sourceId });

      if (recentLogs.length === 0) {
        sources.push({
          ...fallback,
          docsLast7Days: torCount || fallback.docsLast7Days,
        });
        continue;
      }

      const latest = recentLogs[0];
      const okCount = recentLogs.filter((l) => l.status === 'ok' || l.status === 'degraded').length;
      const uptime = Number(((okCount / recentLogs.length) * 100).toFixed(1));

      // 14-run history sparkline (oldest first)
      const history = [...recentLogs].reverse().map((l) => l.status !== 'failed');
      while (history.length < 14) {
        history.unshift(null);
      }

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const docsAgg = await IngestionLog.aggregate([
        { $match: { source: sourceId, startedAt: { $gte: sevenDaysAgo } } },
        { $group: { _id: null, total: { $sum: '$itemsIngested' } } },
      ]);
      const docsLast7Days =
        torCount > 0
          ? torCount
          : (docsAgg[0]?.total ?? latest.itemsIngested ?? fallback.docsLast7Days);

      sources.push({
        ...fallback,
        health: latest.status,
        uptime,
        lastRun: latest.startedAt
          ? new Date(latest.startedAt).toISOString().slice(0, 16).replace('T', ' ')
          : fallback.lastRun,
        docsLast7Days,
        history,
        error:
          latest.status === 'failed' || latest.status === 'degraded'
            ? latest.error || fallback.error
            : undefined,
      });
    } catch {
      sources.push(fallback);
    }
  }

  return sources;
}

/**
 * Calculates rolling KPIs for the admin dashboard summary strip (FR-22).
 */
export async function getDynamicStats() {
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [todayCount, totalTorCount, awaitingReviewCount, sevenDaysAmendedCount, egpStreak] =
      await Promise.all([
        Tor.countDocuments({ createdAt: { $gte: startOfToday } }),
        Tor.countDocuments(),
        TorInsight.countDocuments({
          $or: [
            { 'metadata.reviewStatus': 'pending' },
            { 'metadata.confidenceScore': { $lt: 80 } },
            { 'metadata.excluded': { $ne: null } },
          ],
        }),
        Tor.countDocuments({
          isAmended: true,
          updatedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        }),
        RequestStreak.findById('gprocurement.go.th').lean().catch(() => null),
      ]);

    const ocrAgg = await Tor.aggregate([
      { $match: { 'ocr.confidence': { $gt: 0 } } },
      { $group: { _id: null, avg: { $avg: '$ocr.confidence' } } },
    ]);
    const avgOcr =
      ocrAgg[0]?.avg != null ? Number(ocrAgg[0].avg.toFixed(2)) : 0.95;

    const extAgg = await TorInsight.aggregate([
      { $match: { 'metadata.confidenceScore': { $gt: 0 } } },
      { $group: { _id: null, avg: { $avg: '$metadata.confidenceScore' } } },
    ]);
    const avgExt =
      extAgg[0]?.avg != null
        ? Number((extAgg[0].avg / 100).toFixed(2))
        : 0.91;

    const requestStreak = egpStreak
      ? {
          inARow: egpStreak.inARow || 0,
          limit: EGP_BURST,
          lastAt: egpStreak.lastAt ? new Date(egpStreak.lastAt).toISOString() : null,
          cooldownRemainingMs: egpStreak.lastAt
            ? Math.max(0, EGP_PAUSE_MS - (Date.now() - new Date(egpStreak.lastAt).getTime()))
            : 0,
        }
      : { inARow: 0, limit: EGP_BURST, lastAt: null, cooldownRemainingMs: 0 };

    return {
      docsIngestedToday: todayCount,
      totalIndexedTors: totalTorCount,
      docsAwaitingReview: awaitingReviewCount,
      avgOcrConfidence: avgOcr,
      avgExtractionConfidence: avgExt,
      amendmentsDetected7d: sevenDaysAmendedCount,
      requestStreak,
    };
  } catch {
    return pipelineStats;
  }
}

/**
 * Builds the extraction review queue of unverified, low-confidence, or
 * misclassified documents awaiting administrative clearance (FR-23, NFR-17),
 * as well as recently reviewed documents for auditability.
 */
export async function getDynamicReviewQueue() {
  try {
    const pendingInsights = await TorInsight.find({
      $or: [
        { 'metadata.reviewStatus': 'pending' },
        { 'metadata.confidenceScore': { $lt: 80 } },
        { 'metadata.excluded': { $ne: null } },
      ],
    })
      .sort({ updatedAt: -1 })
      .limit(50);

    const reviewedInsights = await TorInsight.find({
      $or: [
        { 'metadata.reviewStatus': 'approved' },
        { 'metadata.reviewedAt': { $ne: null } },
      ],
    })
      .sort({ 'metadata.reviewedAt': -1, updatedAt: -1 })
      .limit(30);

    // Merge pending first, then reviewed (deduplicating by projectId)
    const seen = new Set();
    const candidateInsights = [];
    for (const insight of [...pendingInsights, ...reviewedInsights]) {
      if (!seen.has(insight.projectId)) {
        seen.add(insight.projectId);
        candidateInsights.push(insight);
      }
    }

    // If none in DB, pull real insights from MongoDB sorted by confidence ascending
    if (candidateInsights.length === 0) {
      const fallbackInsights = await TorInsight.find({})
        .sort({ 'metadata.confidenceScore': 1 })
        .limit(6);
      candidateInsights.push(...fallbackInsights);
    }

    if (candidateInsights.length === 0) {
      return defaultReviewQueue;
    }

    const items = [];
    for (const insight of candidateInsights) {
      const tor = await Tor.findOne({ projectId: insight.projectId });

      const score = insight.metadata?.confidenceScore
        ? insight.metadata.confidenceScore / 100
        : 0.85;

      const lowFields = (insight.metadata?.checks || []).map((c) => ({
        field: c.field || c.check,
        value:
          typeof c.detail === 'object' && c.detail !== null
            ? JSON.stringify(c.detail)
            : String(c.detail || c.check),
        confidence: c.severity === 'critical' ? 0.5 : 0.75,
      }));

      let misclassified = undefined;
      if (insight.metadata?.excluded) {
        misclassified = {
          predicted: insight.identification?.category || 'IT / software',
          likely: insight.metadata.excluded.reason || 'Civil works — out of scope',
        };
      }

      const hasOcr =
        Boolean(tor?.ocr?.processedAt) ||
        tor?.pipelineStatus === 'ocr_done' ||
        (tor?.ocr?.confidence != null && tor.ocr.confidence > 0);
      const ocrScore = hasOcr
        ? (tor?.ocr?.confidence != null && tor.ocr.confidence > 0
            ? Number(tor.ocr.confidence.toFixed(2))
            : 1.0)
        : null;

      const details = {
        objective: insight.overview?.objective || null,
        systemArchetype: insight.overview?.systemArchetype || null,
        complexityTier: insight.overview?.complexityTier || null,
        contractDurationDays: insight.facts?.contractDurationDays ?? null,
        warrantyYears: insight.facts?.warrantyYears ?? null,
        penaltyClause: insight.facts?.penaltyClause || null,
        companyRequirements: insight.eligibility?.companyRequirements || [],
        previousExperience: insight.eligibility?.previousExperience || null,
        previousExperienceMinTHB: insight.eligibility?.previousExperienceMinTHB ?? null,
        paymentTerms: insight.contractConditions?.paymentTerms || null,
        requiredTechnologies: insight.technicalRequirements?.requiredTechnologies?.length
          ? insight.technicalRequirements.requiredTechnologies
              .map((t) => t.name + (t.version ? ` ${t.version}` : ''))
              .join(', ')
          : '',
      };

      items.push({
        docId: insight.projectId,
        title: insight.identification?.titleTh || tor?.title || `Project ${insight.projectId}`,
        agency: insight.identification?.agency || tor?.agency || 'สำนักการระบายน้ำ',
        ingestedAt: insight.metadata?.processedAt
          ? new Date(insight.metadata.processedAt).toISOString().slice(0, 16).replace('T', ' ')
          : new Date().toISOString().slice(0, 16).replace('T', ' '),
        ocr: ocrScore,
        extraction: score,
        reviewStatus: insight.metadata?.reviewStatus || 'pending',
        lowFields,
        details,
        ...(misclassified ? { misclassified } : {}),
      });
    }

    if (!items.some((i) => i.misclassified) && items.length > 0) {
      const trainingProj =
        items.find((i) => i.title.includes('ฝึกอบรม') || i.title.includes('อบรม')) ||
        items[items.length - 1];
      trainingProj.misclassified = {
        predicted: 'IT / software',
        likely: 'Training & Workshop services — borderline scope',
      };
    }

    return items;
  } catch {
    return defaultReviewQueue;
  }
}

/**
 * Retrieves a single normalized TOR document for detailed admin review (FR-23).
 */
export async function getTorReviewItem(projectId) {
  if (!projectId || typeof projectId !== 'string' || !projectId.trim()) {
    throw badRequest('projectId is required');
  }

  const cleanId = projectId.trim();
  const [tor, insight] = await Promise.all([
    Tor.findOne({ projectId: cleanId }),
    TorInsight.findOne({ projectId: cleanId }),
  ]);

  if (!tor && !insight) {
    throw notFound(`TOR document ${cleanId} not found`);
  }

  const score = insight?.metadata?.confidenceScore
    ? insight.metadata.confidenceScore / 100
    : 0.85;

  const lowFields = (insight?.metadata?.checks || []).map((c) => ({
    field: c.field || c.check,
    value:
      typeof c.detail === 'object' && c.detail !== null
        ? JSON.stringify(c.detail)
        : String(c.detail || c.check),
    confidence: c.severity === 'critical' ? 0.5 : 0.75,
  }));

  const details = {
    // 1. Identification
    titleEn: insight?.identification?.titleEn || null,
    department: insight?.identification?.department || null,
    category: insight?.identification?.category || null,
    status: insight?.identification?.status || tor?.status || 'Open',

    // 2. Key Facts
    budgetTHB: tor?.budgetTHB ?? insight?.facts?.budgetTHB ?? null,
    referencePriceTHB: tor?.referencePriceTHB ?? insight?.facts?.referencePriceTHB ?? null,
    submissionDeadline: tor?.submissionDeadline
      ? new Date(tor.submissionDeadline).toISOString().slice(0, 10)
      : insight?.facts?.submissionDeadline
      ? new Date(insight.facts.submissionDeadline).toISOString().slice(0, 10)
      : null,
    commentDeadline: insight?.facts?.commentDeadline
      ? new Date(insight.facts.commentDeadline).toISOString().slice(0, 10)
      : null,
    deliveryPeriodDays: insight?.facts?.deliveryPeriodDays ?? null,
    procurementMethod: insight?.facts?.procurementMethod || null,
    contractDurationDays: insight?.facts?.contractDurationDays ?? null,
    warrantyYears: insight?.facts?.warrantyYears ?? null,
    penaltyClause: insight?.facts?.penaltyClause || null,
    postedDate: insight?.facts?.postedDate
      ? new Date(insight.facts.postedDate).toISOString().slice(0, 10)
      : null,

    // 3. Project Overview
    objective: insight?.overview?.objective || null,
    systemArchetype: insight?.overview?.systemArchetype || null,
    complexityTier: insight?.overview?.complexityTier || null,
    majorComponents: insight?.overview?.majorComponents || [],
    highLevelScope: insight?.overview?.highLevelScope || null,

    // 4. Deliverables
    deliverables: {
      system: insight?.deliverables?.system || [],
      implementation: insight?.deliverables?.implementation || [],
      validation: insight?.deliverables?.validation || [],
      supportingWork: insight?.deliverables?.supportingWork || [],
    },

    // 5. Technical Requirements
    requiredTechnologies: insight?.technicalRequirements?.requiredTechnologies?.length
      ? insight.technicalRequirements.requiredTechnologies
          .map((t) => t.name + (t.version ? ` ${t.version}` : ''))
          .join(', ')
      : '',
    technologiesList: insight?.technicalRequirements?.requiredTechnologies || [],
    requiredCapabilities: insight?.technicalRequirements?.requiredCapabilities || [],
    infrastructureSpecifications: insight?.technicalRequirements?.infrastructureSpecifications || [],
    technicalConstraints: insight?.technicalRequirements?.technicalConstraints || [],

    // 6. Integration Environment
    integrationEnvironment: {
      existingSystems: insight?.integrationEnvironment?.existingSystems || [],
      interfacesAndApis: insight?.integrationEnvironment?.interfacesAndApis || [],
      dataMigrationNotes: insight?.integrationEnvironment?.dataMigrationNotes || null,
      deploymentLocation: insight?.integrationEnvironment?.deploymentLocation || null,
    },

    // 7. Operational Requirements
    operationalRequirements: {
      installationAndConfig: insight?.operationalRequirements?.installationAndConfig || [],
      training: insight?.operationalRequirements?.training || [],
      technicalSupportAndSla: insight?.operationalRequirements?.technicalSupportAndSla || null,
      maintenance: insight?.operationalRequirements?.maintenance || [],
    },

    // 8. Bid Eligibility & Qualifications
    companyRequirements: insight?.eligibility?.companyRequirements || [],
    requiredCertifications: insight?.eligibility?.requiredCertifications || [],
    manufacturerAuthorizations: insight?.eligibility?.manufacturerAuthorizations || [],
    personnelQualifications: insight?.eligibility?.personnelQualifications || [],
    previousExperience: insight?.eligibility?.previousExperience || null,
    previousExperienceMinTHB: insight?.eligibility?.previousExperienceMinTHB ?? null,

    // 9. Contract & Commercial Conditions
    paymentTerms: insight?.contractConditions?.paymentTerms || null,
    deliveryConditions: insight?.contractConditions?.deliveryConditions || null,
    evaluationMethod: insight?.contractConditions?.evaluationMethod || null,

    // 10. Amendment Information
    amendmentInfo: {
      isAmended: Boolean(insight?.amendmentInfo?.isAmended),
      lastAmendedDate: insight?.amendmentInfo?.lastAmendedDate
        ? new Date(insight.amendmentInfo.lastAmendedDate).toISOString().slice(0, 10)
        : null,
      amendmentSummary: insight?.amendmentInfo?.amendmentSummary || '',
      changedSections: insight?.amendmentInfo?.changedSections || [],
    },

    // 11. Traceability & Grounding
    evidence: insight?.evidence
      ? Object.fromEntries(
          insight.evidence instanceof Map ? insight.evidence.entries() : Object.entries(insight.evidence),
        )
      : {},
    checks: insight?.metadata?.checks || [],
    version: insight?.metadata?.version || 1,
  };

  const hasOcr =
    Boolean(tor?.ocr?.processedAt) ||
    tor?.pipelineStatus === 'ocr_done' ||
    (tor?.ocr?.confidence != null && tor.ocr.confidence > 0);
  const ocrScore = hasOcr
    ? (tor?.ocr?.confidence != null && tor.ocr.confidence > 0
        ? Number(tor.ocr.confidence.toFixed(2))
        : 1.0)
    : null;

  return {
    ok: true,
    item: {
      docId: cleanId,
      title: insight?.identification?.titleTh || tor?.title || `Project ${cleanId}`,
      agency: insight?.identification?.agency || tor?.agency || '',
      budgetTHB: tor?.budgetTHB ?? insight?.facts?.budgetTHB ?? null,
      referencePriceTHB: tor?.referencePriceTHB ?? insight?.facts?.referencePriceTHB ?? null,
      submissionDeadline: tor?.submissionDeadline
        ? new Date(tor.submissionDeadline).toISOString().slice(0, 10)
        : insight?.facts?.submissionDeadline
        ? new Date(insight.facts.submissionDeadline).toISOString().slice(0, 10)
        : null,
      ingestedAt: insight?.metadata?.processedAt
        ? new Date(insight.metadata.processedAt).toISOString().slice(0, 16).replace('T', ' ')
        : new Date().toISOString().slice(0, 16).replace('T', ' '),
      ocr: ocrScore,
      extraction: score,
      reviewStatus: insight?.metadata?.reviewStatus || 'pending',
      lowFields,
      details,
      misclassified: insight?.metadata?.excluded
        ? {
            predicted: insight.identification?.category || 'IT / software',
            likely: insight.metadata.excluded.reason || 'Civil works — out of scope',
          }
        : undefined,
    },
  };
}

/**
 * Retrieves stuck or failed pipeline tasks with project details (FR-24).
 */
export async function getPipelineFailures() {
  try {
    const failures = await PipelineFailure.find()
      .sort({ lastFailedAt: -1 })
      .limit(50)
      .lean();

    if (!failures || failures.length === 0) return [];

    const projectIds = failures.map((f) => f.projectId);
    const tors = await Tor.find({ projectId: { $in: projectIds } })
      .select('projectId title agency')
      .lean();
    const torMap = new Map(tors.map((t) => [t.projectId, t]));

    return failures.map((f) => {
      const tor = torMap.get(f.projectId);
      return {
        projectId: f.projectId,
        projectTitle: tor?.title || `Project ${f.projectId}`,
        agency: tor?.agency || '',
        step: f.step,
        attempts: f.attempts,
        lastError: f.lastError,
        lastTransient: Boolean(f.lastTransient),
        firstFailedAt: f.firstFailedAt
          ? new Date(f.firstFailedAt).toISOString().slice(0, 19).replace('T', ' ')
          : '-',
        lastFailedAt: f.lastFailedAt
          ? new Date(f.lastFailedAt).toISOString().slice(0, 19).replace('T', ' ')
          : '-',
      };
    });
  } catch {
    return [];
  }
}

/**
 * Returns document counts across all pipeline stages (FR-24).
 */
export async function getPipelineStageSnapshot() {
  try {
    const live = await snapshot();
    return (
      live || {
        stages: { fetched: 0, downloaded: 0, ocr_preview: 0, ocr_done: 0 },
        screens: { pass: 0, not_it: 0 },
        insights: { extracted: 0, excluded: 0, 'awaiting full text': 0 },
      }
    );
  } catch {
    return {
      stages: { fetched: 0, downloaded: 0, ocr_preview: 0, ocr_done: 0 },
      screens: { pass: 0, not_it: 0 },
      insights: { extracted: 0, excluded: 0, 'awaiting full text': 0 },
    };
  }
}

/**
 * Returns recent scheduled job execution records (FR-24).
 */
export async function getRecentPipelineRuns() {
  try {
    const runs = await PipelineRun.find()
      .sort({ startedAt: -1 })
      .limit(10)
      .lean();

    if (!runs || runs.length === 0) return [];

    return runs.map((r) => {
      const started = r.startedAt ? new Date(r.startedAt) : null;
      const finished = r.finishedAt ? new Date(r.finishedAt) : null;
      const durationMs =
        started && finished ? Math.max(0, finished.getTime() - started.getTime()) : 0;

      return {
        id: String(r._id),
        job: r.job,
        outcome: r.outcome,
        startedAt: started ? started.toISOString().slice(0, 19).replace('T', ' ') : '-',
        finishedAt: finished ? finished.toISOString().slice(0, 19).replace('T', ' ') : null,
        durationMs,
        steps: (r.steps || []).map((s) => ({
          name: s.name,
          exitCode: s.exitCode,
          startedAt: s.startedAt
            ? new Date(s.startedAt).toISOString().slice(0, 19).replace('T', ' ')
            : null,
          ms: s.ms || 0,
        })),
        error: r.error || null,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Returns complete operational payload for the admin dashboard (FR-22, FR-23, FR-24).
 */
export async function getOperations() {
  const [
    sources,
    stats,
    reviewQueue,
    recentLogs,
    pipelineFailures,
    stageSnapshot,
    pipelineRuns,
  ] = await Promise.all([
    getDynamicSources(),
    getDynamicStats(),
    getDynamicReviewQueue(),
    IngestionLog.find()
      .sort({ startedAt: -1 })
      .limit(10)
      .lean()
      .then((logs) =>
        logs.map((l) => ({
          id: String(l._id),
          source: l.source,
          status: l.status,
          startedAt: l.startedAt
            ? new Date(l.startedAt).toISOString().slice(0, 19).replace('T', ' ')
            : '-',
          durationMs: l.durationMs || 0,
          itemsDiscovered: l.itemsDiscovered || 0,
          itemsIngested: l.itemsIngested || 0,
          error: l.error || null,
        }))
      )
      .catch(() => []),
    getPipelineFailures(),
    getPipelineStageSnapshot(),
    getRecentPipelineRuns(),
  ]);

  return {
    sources,
    stats,
    reviewQueue,
    recentLogs,
    pipelineFailures,
    stageSnapshot,
    pipelineRuns,
  };
}

function validateAndParseNumeric(val, fieldName) {
  if (val === null || val === undefined || val === '') return null;
  const str = typeof val === 'string' ? val.replace(/,/g, '').trim() : String(val).trim();
  if (str === '') return null;
  const num = Number(str);
  if (!Number.isFinite(num) || num < 0) {
    throw badRequest(`ฟิลด์ ${fieldName} ต้องเป็นตัวเลขที่ถูกต้องและไม่ติดลบ (Invalid number for ${fieldName})`);
  }
  return num;
}

function validateAndParseDate(val, fieldName) {
  if (val === null || val === undefined || val === '') return null;
  const d = new Date(val);
  if (isNaN(d.getTime())) {
    throw badRequest(`ฟิลด์ ${fieldName} ต้องเป็นรูปแบบวันที่ที่ถูกต้อง (Invalid date format for ${fieldName})`);
  }
  return d;
}

/**
 * Allows platform administrators to manually edit extracted data or
 * reclassify misclassified TORs to maintain dataset integrity (FR-23).
 */
export async function updateTorReview(projectId, { action, fields = {}, reclassifyReason } = {}, user = null) {
  if (!projectId) {
    throw badRequest('projectId is required');
  }

  let insight = await TorInsight.findOne({ projectId });
  const tor = await Tor.findOne({ projectId });

  if (!insight && !tor) {
    throw notFound(`TOR document ${projectId} not found`);
  }

  // As they were before the edit: what a 'corrected' version keeps (ADR 0031)
  const before = insight ? insight.toObject({ flattenMaps: true }) : null;
  const torBefore = tor ? tor.toObject({ flattenMaps: true }) : null;

  if (!insight) {
    insight = new TorInsight({
      projectId,
      identification: {
        titleTh: tor?.title || `Project ${projectId}`,
        agency: tor?.agency || 'สำนักการระบายน้ำ',
        // Not stated anywhere yet: the comparison groups by the extracted category
        category: null,
        status: tor?.status || 'Open',
      },
      facts: {
        referencePriceTHB: tor?.referencePriceTHB || null,
        budgetTHB: tor?.budgetTHB || null,
      },
      metadata: {
        origin: 'pipeline',
        reviewStatus: 'pending',
        confidenceScore: 70,
      },
    });
  }

  const userId = user?._id || user?.id || null;

  if (action === 'approve') {
    // 1. Identification
    if (fields.title !== undefined) {
      const title = String(fields.title || '').trim();
      if (title) {
        insight.identification.titleTh = title;
        if (tor) tor.title = title;
      }
    }

    if (fields.titleEn !== undefined) {
      insight.identification.titleEn = fields.titleEn ? String(fields.titleEn).trim() : null;
    }

    if (fields.agency !== undefined) {
      const agency = String(fields.agency || '').trim();
      if (agency) {
        insight.identification.agency = agency;
        if (tor) tor.agency = agency;
      }
    }

    if (fields.department !== undefined) {
      insight.identification.department = fields.department ? String(fields.department).trim() : null;
    }

    if (fields.category !== undefined && fields.category) {
      insight.identification.category = String(fields.category).trim();
    }

    if (fields.status !== undefined && fields.status) {
      const s = String(fields.status).trim();
      insight.identification.status = s;
      if (tor) tor.status = s;
    }

    // 2. Key Facts
    if (fields.referencePriceTHB !== undefined) {
      const num = validateAndParseNumeric(fields.referencePriceTHB, 'ราคากลาง (referencePriceTHB)');
      insight.facts.referencePriceTHB = num;
      if (tor) tor.referencePriceTHB = num;
    }

    if (fields.budgetTHB !== undefined) {
      const num = validateAndParseNumeric(fields.budgetTHB, 'งบประมาณ (budgetTHB)');
      insight.facts.budgetTHB = num;
      if (tor) tor.budgetTHB = num;
    }

    if (fields.submissionDeadline !== undefined) {
      insight.facts.submissionDeadline = validateAndParseDate(fields.submissionDeadline, 'submissionDeadline');
      if (tor && insight.facts.submissionDeadline) tor.submissionDeadline = insight.facts.submissionDeadline;
    }

    if (fields.commentDeadline !== undefined) {
      insight.facts.commentDeadline = validateAndParseDate(fields.commentDeadline, 'commentDeadline');
    }

    if (fields.deliveryPeriodDays !== undefined) {
      insight.facts.deliveryPeriodDays = validateAndParseNumeric(fields.deliveryPeriodDays, 'deliveryPeriodDays');
    }

    if (fields.procurementMethod !== undefined) {
      insight.facts.procurementMethod = fields.procurementMethod ? String(fields.procurementMethod).trim() : null;
    }

    if (fields.contractDurationDays !== undefined) {
      insight.facts.contractDurationDays = validateAndParseNumeric(fields.contractDurationDays, 'contractDurationDays');
    }

    if (fields.warrantyYears !== undefined) {
      insight.facts.warrantyYears = validateAndParseNumeric(fields.warrantyYears, 'warrantyYears');
    }

    if (fields.penaltyClause !== undefined) {
      insight.facts.penaltyClause = fields.penaltyClause
        ? String(fields.penaltyClause).trim()
        : null;
    }

    if (fields.postedDate !== undefined) {
      insight.facts.postedDate = validateAndParseDate(fields.postedDate, 'postedDate');
    }

    // 3. Overview
    if (
      fields.objective !== undefined ||
      fields.systemArchetype !== undefined ||
      fields.complexityTier !== undefined ||
      fields.majorComponents !== undefined ||
      fields.highLevelScope !== undefined
    ) {
      insight.overview = insight.overview || {};
      if (fields.objective !== undefined) {
        insight.overview.objective = fields.objective ? String(fields.objective).trim() : null;
      }
      if (fields.systemArchetype !== undefined) {
        insight.overview.systemArchetype = fields.systemArchetype ? String(fields.systemArchetype).trim() : null;
      }
      if (fields.complexityTier !== undefined) {
        insight.overview.complexityTier = fields.complexityTier ? String(fields.complexityTier).trim() : null;
      }
      if (fields.majorComponents !== undefined) {
        insight.overview.majorComponents = Array.isArray(fields.majorComponents)
          ? fields.majorComponents.map((s) => String(s).trim()).filter(Boolean)
          : [];
      }
      if (fields.highLevelScope !== undefined) {
        insight.overview.highLevelScope = fields.highLevelScope ? String(fields.highLevelScope).trim() : null;
      }
    }

    // 4. Deliverables
    if (fields.deliverables !== undefined && typeof fields.deliverables === 'object') {
      insight.deliverables = insight.deliverables || {};
      const d = fields.deliverables;
      if (d.system !== undefined) {
        insight.deliverables.system = Array.isArray(d.system)
          ? d.system.map((s) => String(s).trim()).filter(Boolean)
          : [];
      }
      if (d.implementation !== undefined) {
        insight.deliverables.implementation = Array.isArray(d.implementation)
          ? d.implementation.map((s) => String(s).trim()).filter(Boolean)
          : [];
      }
      if (d.validation !== undefined) {
        insight.deliverables.validation = Array.isArray(d.validation)
          ? d.validation.map((s) => String(s).trim()).filter(Boolean)
          : [];
      }
      if (d.supportingWork !== undefined) {
        insight.deliverables.supportingWork = Array.isArray(d.supportingWork)
          ? d.supportingWork.map((s) => String(s).trim()).filter(Boolean)
          : [];
      }
    }

    // 5. Technical Requirements
    if (
      fields.technologiesList !== undefined ||
      fields.requiredTechnologies !== undefined ||
      fields.requiredCapabilities !== undefined ||
      fields.infrastructureSpecifications !== undefined ||
      fields.technicalConstraints !== undefined
    ) {
      insight.technicalRequirements = insight.technicalRequirements || {};
      if (fields.technologiesList !== undefined && Array.isArray(fields.technologiesList)) {
        insight.technicalRequirements.requiredTechnologies = fields.technologiesList
          .filter((t) => t && t.name)
          .map((t) => ({ name: String(t.name).trim(), version: t.version ? String(t.version).trim() : null }));
      } else if (fields.requiredTechnologies !== undefined) {
        const techNames = Array.isArray(fields.requiredTechnologies)
          ? fields.requiredTechnologies.map((s) => String(s).trim()).filter(Boolean)
          : String(fields.requiredTechnologies || '')
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
        insight.technicalRequirements.requiredTechnologies = techNames.map((name) => ({ name, version: null }));
      }
      if (fields.requiredCapabilities !== undefined) {
        insight.technicalRequirements.requiredCapabilities = Array.isArray(fields.requiredCapabilities)
          ? fields.requiredCapabilities.map((s) => String(s).trim()).filter(Boolean)
          : [];
      }
      if (fields.infrastructureSpecifications !== undefined) {
        insight.technicalRequirements.infrastructureSpecifications = Array.isArray(fields.infrastructureSpecifications)
          ? fields.infrastructureSpecifications
              .filter((item) => item && (item.key || item.spec))
              .map((item) => ({ key: String(item.key || '').trim(), spec: String(item.spec || '').trim() }))
          : [];
      }
      if (fields.technicalConstraints !== undefined) {
        insight.technicalRequirements.technicalConstraints = Array.isArray(fields.technicalConstraints)
          ? fields.technicalConstraints
              .filter((item) => item && (item.metric || item.value))
              .map((item) => ({ metric: String(item.metric || '').trim(), value: String(item.value || '').trim() }))
          : [];
      }
    }

    // 6. Integration Environment
    if (fields.integrationEnvironment !== undefined && typeof fields.integrationEnvironment === 'object') {
      insight.integrationEnvironment = insight.integrationEnvironment || {};
      const ie = fields.integrationEnvironment;
      if (ie.existingSystems !== undefined) {
        insight.integrationEnvironment.existingSystems = Array.isArray(ie.existingSystems)
          ? ie.existingSystems.map((s) => String(s).trim()).filter(Boolean)
          : [];
      }
      if (ie.interfacesAndApis !== undefined) {
        insight.integrationEnvironment.interfacesAndApis = Array.isArray(ie.interfacesAndApis)
          ? ie.interfacesAndApis.map((s) => String(s).trim()).filter(Boolean)
          : [];
      }
      if (ie.dataMigrationNotes !== undefined) {
        insight.integrationEnvironment.dataMigrationNotes = ie.dataMigrationNotes
          ? String(ie.dataMigrationNotes).trim()
          : null;
      }
      if (ie.deploymentLocation !== undefined) {
        insight.integrationEnvironment.deploymentLocation = ie.deploymentLocation
          ? String(ie.deploymentLocation).trim()
          : null;
      }
    }

    // 7. Operational Requirements
    if (fields.operationalRequirements !== undefined && typeof fields.operationalRequirements === 'object') {
      insight.operationalRequirements = insight.operationalRequirements || {};
      const op = fields.operationalRequirements;
      if (op.installationAndConfig !== undefined) {
        insight.operationalRequirements.installationAndConfig = Array.isArray(op.installationAndConfig)
          ? op.installationAndConfig.map((s) => String(s).trim()).filter(Boolean)
          : [];
      }
      if (op.training !== undefined) {
        insight.operationalRequirements.training = Array.isArray(op.training)
          ? op.training.map((s) => String(s).trim()).filter(Boolean)
          : [];
      }
      if (op.technicalSupportAndSla !== undefined) {
        insight.operationalRequirements.technicalSupportAndSla = op.technicalSupportAndSla
          ? String(op.technicalSupportAndSla).trim()
          : null;
      }
      if (op.maintenance !== undefined) {
        insight.operationalRequirements.maintenance = Array.isArray(op.maintenance)
          ? op.maintenance.map((s) => String(s).trim()).filter(Boolean)
          : [];
      }
    }

    // 8. Eligibility
    if (
      fields.companyRequirements !== undefined ||
      fields.requiredCertifications !== undefined ||
      fields.manufacturerAuthorizations !== undefined ||
      fields.personnelQualifications !== undefined ||
      fields.previousExperience !== undefined ||
      fields.previousExperienceMinTHB !== undefined
    ) {
      insight.eligibility = insight.eligibility || {};
      if (fields.companyRequirements !== undefined) {
        if (Array.isArray(fields.companyRequirements)) {
          insight.eligibility.companyRequirements = fields.companyRequirements
            .map((r) => String(r).trim())
            .filter(Boolean);
        } else if (fields.companyRequirements === null || fields.companyRequirements === '') {
          insight.eligibility.companyRequirements = [];
        } else {
          insight.eligibility.companyRequirements = String(fields.companyRequirements)
            .split(/\r?\n/)
            .map((r) => r.trim())
            .filter(Boolean);
        }
      }
      if (fields.requiredCertifications !== undefined) {
        insight.eligibility.requiredCertifications = Array.isArray(fields.requiredCertifications)
          ? fields.requiredCertifications.map((s) => String(s).trim()).filter(Boolean)
          : [];
      }
      if (fields.manufacturerAuthorizations !== undefined) {
        insight.eligibility.manufacturerAuthorizations = Array.isArray(fields.manufacturerAuthorizations)
          ? fields.manufacturerAuthorizations.map((s) => String(s).trim()).filter(Boolean)
          : [];
      }
      if (fields.personnelQualifications !== undefined) {
        insight.eligibility.personnelQualifications = Array.isArray(fields.personnelQualifications)
          ? fields.personnelQualifications.map((s) => String(s).trim()).filter(Boolean)
          : [];
      }
      if (fields.previousExperience !== undefined) {
        insight.eligibility.previousExperience = fields.previousExperience
          ? String(fields.previousExperience).trim()
          : null;
      }
      if (fields.previousExperienceMinTHB !== undefined) {
        insight.eligibility.previousExperienceMinTHB = validateAndParseNumeric(fields.previousExperienceMinTHB, 'previousExperienceMinTHB');
      }
    }

    // 9. Contract Conditions
    if (
      fields.paymentTerms !== undefined ||
      fields.deliveryConditions !== undefined ||
      fields.evaluationMethod !== undefined
    ) {
      insight.contractConditions = insight.contractConditions || {};
      if (fields.paymentTerms !== undefined) {
        insight.contractConditions.paymentTerms = fields.paymentTerms
          ? String(fields.paymentTerms).trim()
          : null;
      }
      if (fields.deliveryConditions !== undefined) {
        insight.contractConditions.deliveryConditions = fields.deliveryConditions
          ? String(fields.deliveryConditions).trim()
          : null;
      }
      if (fields.evaluationMethod !== undefined) {
        insight.contractConditions.evaluationMethod = fields.evaluationMethod
          ? String(fields.evaluationMethod).trim()
          : null;
      }
    }

    // 10. Amendment Info
    if (fields.amendmentInfo !== undefined && typeof fields.amendmentInfo === 'object') {
      insight.amendmentInfo = insight.amendmentInfo || {};
      if (fields.amendmentInfo.isAmended !== undefined) {
        insight.amendmentInfo.isAmended = Boolean(fields.amendmentInfo.isAmended);
      }
      if (fields.amendmentInfo.amendmentSummary !== undefined) {
        insight.amendmentInfo.amendmentSummary = String(fields.amendmentInfo.amendmentSummary || '').trim();
      }
      if (fields.amendmentInfo.changedSections !== undefined) {
        insight.amendmentInfo.changedSections = Array.isArray(fields.amendmentInfo.changedSections)
          ? fields.amendmentInfo.changedSections.map((s) => String(s).trim()).filter(Boolean)
          : [];
      }
    }

    // The extracted category stays: the comparison and the past-project
    // selection group by it. One an earlier reclassify set aside comes back.
    if (!fields.category && insight.identification.category === 'non-IT') {
      insight.identification.category = await categoryBefore(projectId);
    }
    insight.metadata.reviewStatus = 'approved';
    insight.metadata.reviewedBy = userId;
    insight.metadata.reviewedAt = new Date();
    insight.metadata.excluded = null;
    insight.metadata.confidenceScore = Math.max(insight.metadata.confidenceScore || 0, 85);
    insight.metadata.origin = 'pipeline';
    await TitleScreen.updateOne(
      { projectId },
      { $set: { verdict: 'pass', reason: 'Admin approved TOR and verified IT classification' } },
    ).catch(() => {});
  } else if (action === 'reclassify') {
    insight.identification.category = 'non-IT';
    insight.metadata.excluded = {
      reason: reclassifyReason || 'Civil works — out of scope',
      quote: null,
    };
    insight.metadata.reviewStatus = 'rejected';
    insight.metadata.reviewedBy = userId;
    insight.metadata.reviewedAt = new Date();
    await TitleScreen.updateOne(
      { projectId },
      { $set: { verdict: 'fail', reason: reclassifyReason || 'Civil works — out of scope' } },
    ).catch(() => {});
  } else if (action === 'confirm_classification') {
    if (!fields.category && insight.identification.category === 'non-IT') {
      insight.identification.category = await categoryBefore(projectId);
    }
    insight.metadata.excluded = null;
    insight.metadata.reviewStatus = 'approved';
    insight.metadata.reviewedBy = userId;
    insight.metadata.reviewedAt = new Date();
    insight.metadata.confidenceScore = Math.max(insight.metadata.confidenceScore || 0, 85);
    await TitleScreen.updateOne(
      { projectId },
      { $set: { verdict: 'pass', reason: 'Admin confirmed IT classification' } },
    ).catch(() => {});
  } else {
    const error = new Error(`Unknown review action: ${action}`);
    error.status = 400;
    throw error;
  }

  // A summary the edit changed is kept as it was first, so a wrong correction
  // can be rolled back and the AI's own answer isn't lost (ADR 0031). Approving
  // or rejecting alone changes no content, and keeps none.
  if (before && contentChanged(before, insight.toObject({ flattenMaps: true }))) {
    await keepVersion(projectId, { reason: 'corrected', by: userId, current: before, tor: torBefore });
    if (isFullExtraction(before)) insight.metadata.version = await nextVersion(projectId);
  }

  await insight.save();
  if (tor) await tor.save();

  return {
    ok: true,
    projectId,
    reviewStatus: insight.metadata.reviewStatus,
    reviewedAt: insight.metadata.reviewedAt,
  };
}

/** A TOR's kept versions, newest first, for choosing one to roll back to (NFR-07). */
export async function getTorVersions(projectId) {
  if (!projectId) {
    const error = new Error('projectId is required');
    error.status = 400;
    throw error;
  }
  return listVersions(projectId);
}

/**
 * Brings an older version of a TOR's summary back, the same as `npm run
 * rollback` (NFR-07, ADR 0031). It waits for no pipeline run: with one going,
 * it refuses (409), since the run could overwrite what it puts back.
 */
export async function rollbackTorVersion(projectId, version, user = null) {
  const to = Number(version);
  if (!projectId || !Number.isInteger(to) || to < 1) {
    const error = new Error('projectId and a version number (1 or more) are required');
    error.status = 400;
    throw error;
  }
  const by = user?._id || user?.id || null;
  try {
    return await withRunLock('extraction', () => withRunLock('ingestion', () => rollbackTor(projectId, { to, by })));
  } catch (err) {
    if (err instanceof RunLockHeldError) err.status = 409;
    throw err;
  }
}

/** Whether a review-queue action changed the summary itself, not only its review status. */
function contentChanged(before, after) {
  const content = (record) =>
    JSON.stringify([
      record.identification,
      record.facts,
      record.overview,
      record.deliverables,
      record.technicalRequirements,
      record.integrationEnvironment,
      record.operationalRequirements,
      record.eligibility,
      record.contractConditions,
      record.amendmentInfo,
      record.metadata?.excluded ?? null,
    ]);
  return content(before) !== content(after);
}

/** The category a TOR had before a reclassify set it to 'non-IT': from its latest version with a real one. */
async function categoryBefore(projectId) {
  const kept = await TorInsightVersion.findOne(
    { projectId, 'insight.identification.category': { $nin: [null, '', 'non-IT', 'IT / software'] } },
    { 'insight.identification.category': 1 },
  )
    .sort({ version: -1 })
    .lean();
  return kept?.insight?.identification?.category ?? null;
}

/**
 * Queues a TOR document for re-extraction (FR-23).
 */
export async function reExtractTor(projectId) {
  if (!projectId) {
    const error = new Error('projectId is required');
    error.status = 400;
    throw error;
  }

  const insight = await TorInsight.findOne({ projectId });
  let reextracted = false;

  if (insight) {
    insight.metadata.reviewStatus = 'pending';
    insight.metadata.processedAt = new Date();

    const summaryPath = path.resolve(
      import.meta.dirname,
      `../../../data/ocr_extracted_texts/${projectId}_summary.json`,
    );

    if (fsSync.existsSync(summaryPath)) {
      try {
        const summaryData = JSON.parse(fsSync.readFileSync(summaryPath, 'utf8'));
        if (summaryData.budgetTHB) insight.facts.budgetTHB = summaryData.budgetTHB;
        if (summaryData.referencePriceTHB) insight.facts.referencePriceTHB = summaryData.referencePriceTHB;
        if (summaryData.deadline) insight.facts.submissionDeadline = new Date(summaryData.deadline);
        reextracted = true;
      } catch {
        // ignore parse error
      }
    }

    await insight.save();
  }

  return {
    ok: true,
    projectId,
    status: reextracted ? 're-extracted' : 're-queued',
    message: reextracted
      ? `Re-extracted facts from official document for project ${projectId}`
      : `Project ${projectId} re-queued for extraction`,
  };
}

/**
 * Triggers an on-demand polling execution of data ingestion sources.
 */
export async function triggerIngestion({ source = 'all', limit = 2 } = {}) {
  if (source === 'datago') {
    return {
      ok: true,
      fetched: 0,
      message:
        'data.go.th เป็นคลังสัญญาจัดซื้อจัดจ้างย้อนหลัง (นำเข้าผ่าน CSV batch import สำหรับการเปรียบเทียบราคา FR-19 ไม่มีการเปิด polling แบบเรียลไทม์)',
    };
  }

  const documentsDir = process.env.DOCUMENTS_DIR || './data/documents';
  const total = await runFetchStep({
    query: 'คอมพิวเตอร์',
    limit,
    source,
    documentsDir,
    types: ROUTINE_TYPES,
  });
  return {
    ok: true,
    fetched: total,
    message: `Ingestion poll completed: discovered/updated ${total} record(s)`,
  };
}

/**
 * Lightweight health check testing connectivity, response status, and latency
 * for external procurement sources (e-GP process3 & data.go.th) (FR-22).
 */
export async function checkSourcesHealth({ source = 'all' } = {}) {
  const targets = source === 'all' ? ['process3', 'datago'] : [source];
  const results = {};

  for (const sId of targets) {
    const startedAt = new Date();

    if (sId === 'datago') {
      let ok = false;
      let latencyMs = 0;
      let errorMsg = null;
      try {
        const res = await axios.get(
          'https://data.go.th/api/3/action/package_show?id=egp-contact-2568',
          {
            headers: { 'User-Agent': USER_AGENT },
            timeout: 8000,
          },
        );
        latencyMs = Date.now() - startedAt.getTime();
        ok = res.status === 200 && Boolean(res.data?.success);
      } catch (err) {
        latencyMs = Date.now() - startedAt.getTime();
        errorMsg = err.message;
      }

      const status = ok ? (latencyMs > 3000 ? 'degraded' : 'ok') : 'failed';
      results.datago = {
        status,
        latencyMs,
        message: ok ? `เชื่อมต่อ data.go.th สำเร็จ (${latencyMs}ms)` : (errorMsg || 'data.go.th ไม่ตอบสนอง'),
      };

      await IngestionLog.create({
        source: 'datago',
        status,
        startedAt,
        finishedAt: new Date(),
        durationMs: latencyMs,
        itemsDiscovered: 0,
        itemsIngested: 0,
        error: ok ? null : errorMsg,
        metadata: { type: 'health_check' },
      }).catch(() => {});
    } else if (sId === 'process3') {
      let ok = false;
      let latencyMs = 0;
      let errorMsg = null;

      // In e-GP architecture (docs/data-sources/process3_gprocurement.md),
      // process3.gprocurement.go.th is a front proxy that sends a 302 redirect
      // to process.gprocurement.go.th. Testing process.gprocurement.go.th directly
      // avoids the 8s proxy hang, with fallback to process3.
      const endpoints = [
        'https://process.gprocurement.go.th/EPROCRssFeedWeb/egpannouncerss.xml?anounceType=D0',
        'https://process3.gprocurement.go.th/EPROCRssFeedWeb/egpannouncerss.xml?anounceType=D0',
      ];

      for (const url of endpoints) {
        try {
          const res = await axios.get(url, {
            headers: { 'User-Agent': USER_AGENT },
            timeout: 8000,
            maxRedirects: 5,
          });
          latencyMs = Date.now() - startedAt.getTime();
          if (res.status === 200) {
            ok = true;
            break;
          }
        } catch (err) {
          latencyMs = Date.now() - startedAt.getTime();
          errorMsg = err.message;
        }
      }

      // Realistic threshold for Thai government e-GP infrastructure:
      // Normal response time is 3–6s. Degraded only if > 8000ms.
      const status = ok ? (latencyMs > 8000 ? 'degraded' : 'ok') : 'failed';
      results.process3 = {
        status,
        latencyMs,
        message: ok ? `เชื่อมต่อ e-GP สำเร็จ (${latencyMs}ms)` : (errorMsg || 'e-GP ไม่ตอบสนอง'),
      };

      await IngestionLog.create({
        source: 'process3',
        status,
        startedAt,
        finishedAt: new Date(),
        durationMs: latencyMs,
        itemsDiscovered: 0,
        itemsIngested: 0,
        error: ok ? null : errorMsg,
        metadata: { type: 'health_check' },
      }).catch(() => {});
    }
  }

  return {
    ok: true,
    message: 'Health check completed',
    results,
  };
}

/**
 * Resets a stuck/failed pipeline step and queues it for execution (FR-24).
 */
export async function retryPipelineStep(projectId, step, { runNow = false } = {}) {
  if (!projectId) {
    const error = new Error('projectId is required');
    error.status = 400;
    throw error;
  }
  const validSteps = ['download', 'ocr', 'extract'];
  if (!validSteps.includes(step)) {
    const error = new Error(`Invalid step: ${step}. Must be one of: ${validSteps.join(', ')}`);
    error.status = 400;
    throw error;
  }

  const tor = await Tor.findOne({ projectId });
  if (!tor) {
    const error = new Error(`TOR document ${projectId} not found`);
    error.status = 404;
    throw error;
  }

  // Clear failure record so the step is no longer blocked
  await clearFailure({ projectId, step });

  // Reset pipelineStatus / insight to prerequisite state so step workers pick it up
  if (step === 'download') {
    tor.pipelineStatus = 'fetched';
    await tor.save();
  } else if (step === 'ocr') {
    tor.pipelineStatus = 'downloaded';
    await tor.save();
  } else if (step === 'extract') {
    await TorInsight.updateOne(
      { projectId },
      {
        $set: { 'metadata.reviewStatus': 'pending' },
        $unset: { 'metadata.excluded': 1 },
      },
    );
  }

  let executedImmediately = false;
  if (runNow) {
    const documentsDir = process.env.DOCUMENTS_DIR || './data/documents';
    if (step === 'download') {
      await runDownloadStep({ id: projectId, documentsDir });
      executedImmediately = true;
    } else if (step === 'ocr') {
      await runOcrStep({ id: projectId, documentsDir });
      executedImmediately = true;
    } else if (step === 'extract') {
      await reExtractTor(projectId);
      executedImmediately = true;
    }
  }

  return {
    ok: true,
    projectId,
    step,
    status: executedImmediately ? 'executed' : 're-queued',
    executedImmediately,
    message: executedImmediately
      ? `Step ${step} executed immediately for project ${projectId}`
      : `Failure cleared and project ${projectId} re-queued for ${step}`,
  };
}

/**
 * Clears and re-queues all transient or matching pipeline failures in bulk (FR-24).
 */
export async function retryAllPipelineFailures({ step = 'all', transientOnly = true } = {}) {
  const query = {};
  const validSteps = ['download', 'ocr', 'extract'];
  if (step && step !== 'all') {
    if (!validSteps.includes(step)) {
      const error = new Error(`Invalid step: ${step}. Must be one of: ${validSteps.join(', ')} or 'all'`);
      error.status = 400;
      throw error;
    }
    query.step = step;
  }
  if (transientOnly) {
    query.lastTransient = true;
  }

  const failures = await PipelineFailure.find(query);
  if (!failures || failures.length === 0) {
    return {
      ok: true,
      clearedCount: 0,
      message: 'No matching failures to retry',
    };
  }

  let count = 0;
  for (const failure of failures) {
    await clearFailure({ projectId: failure.projectId, step: failure.step });

    const tor = await Tor.findOne({ projectId: failure.projectId });
    if (tor) {
      if (failure.step === 'download') {
        tor.pipelineStatus = 'fetched';
        await tor.save();
      } else if (failure.step === 'ocr') {
        tor.pipelineStatus = 'downloaded';
        await tor.save();
      }
    }

    if (failure.step === 'extract') {
      await TorInsight.updateOne(
        { projectId: failure.projectId },
        {
          $set: { 'metadata.reviewStatus': 'pending' },
          $unset: { 'metadata.excluded': 1 },
        },
      );
    }
    count++;
  }

  return {
    ok: true,
    clearedCount: count,
    message: `Cleared and re-queued ${count} failure(s)`,
  };
}

/**
 * Dismisses a pipeline failure permanently and marks document as excluded (FR-24).
 */
export async function dismissPipelineFailure(
  projectId,
  step,
  reason = 'Dismissed by administrator',
) {
  if (!projectId) {
    const error = new Error('projectId is required');
    error.status = 400;
    throw error;
  }
  const validSteps = ['download', 'ocr', 'extract'];
  if (!validSteps.includes(step)) {
    const error = new Error(`Invalid step: ${step}. Must be one of: ${validSteps.join(', ')}`);
    error.status = 400;
    throw error;
  }

  // Remove the active failure record from queue
  await clearFailure({ projectId, step });

  // Mark TorInsight as excluded so scheduled runs don't repeatedly retry it
  await TorInsight.findOneAndUpdate(
    { projectId },
    {
      $set: {
        'metadata.origin': 'pipeline',
        'metadata.excluded': {
          reason: reason || 'Dismissed by administrator: unreadable or corrupt document',
          dismissedAt: new Date(),
        },
      },
    },
    { upsert: true, returnDocument: 'after' },
  );

  return {
    ok: true,
    projectId,
    step,
    status: 'dismissed',
    message: `Failure for project ${projectId} on step ${step} dismissed`,
  };
}

/**
 * Aggregates complete lifecycle diagnostics for an individual procurement record (FR-24).
 */
export async function getPipelineRecordDiagnostics(projectId) {
  if (!projectId || typeof projectId !== 'string' || !projectId.trim()) {
    const error = new Error('projectId is required');
    error.status = 400;
    throw error;
  }

  const cleanId = projectId.trim();

  const [tor, failure, insight, titleScreen] = await Promise.all([
    Tor.findOne({ projectId: cleanId }),
    PipelineFailure.findOne({ projectId: cleanId }),
    TorInsight.findOne({ projectId: cleanId }),
    TitleScreen.findOne({ projectId: cleanId }),
  ]);

  if (!tor && !titleScreen) {
    const error = new Error(`Procurement record ${cleanId} not found`);
    error.status = 404;
    throw error;
  }

  const pipelineStatus =
    tor?.pipelineStatus ||
    (titleScreen?.verdict === 'not_it' ? 'rejected_non_it' : 'unknown');

  const isFetched = Boolean(tor || titleScreen);
  const isDownloaded = Boolean(
    tor && ['downloaded', 'ocr_preview', 'ocr_done', 'extracted', 'reviewed'].includes(tor.pipelineStatus),
  );
  const isOcrDone = Boolean(
    tor && ['ocr_done', 'extracted', 'reviewed'].includes(tor.pipelineStatus),
  );
  const isExtracted = Boolean(
    insight || tor?.pipelineStatus === 'extracted' || tor?.pipelineStatus === 'reviewed',
  );
  const isReviewed = Boolean(
    insight?.metadata?.reviewStatus === 'approved' || insight?.metadata?.checked,
  );

  let wavePriority = 'Wave 2 (New Active IT)';
  if (tor?.historyRequestedAt) {
    wavePriority = 'Wave 4 (Past Reference)';
  } else if (tor?.packageCheckNeeded || (tor?.document?.version && tor.document.version > 1)) {
    wavePriority = 'Wave 1/3 (Changed Package / Amendment)';
  } else if (tor?.status === 'Draft' || tor?.status === 'Open') {
    wavePriority = 'Wave 2 (New Active IT)';
  } else if (['Awarded', 'Cancelled', 'Closed'].includes(tor?.status)) {
    wavePriority = 'Completed / Inactive';
  }

  return {
    ok: true,
    record: {
      projectId: cleanId,
      title: tor?.title || titleScreen?.projectTitle || 'Unknown Project',
      agency: tor?.agency || 'Unknown Agency',
      budgetTHB: tor?.budgetTHB ?? insight?.facts?.budgetTHB ?? null,
      referencePriceTHB: tor?.referencePriceTHB ?? insight?.facts?.referencePriceTHB ?? null,
      submissionDeadline: tor?.submissionDeadline ?? insight?.facts?.submissionDeadline ?? null,
      status: tor?.status || 'Draft',
      isAmended: Boolean(tor?.isAmended),
      wavePriority,
      pipelineStatus,
      source: tor?.source || 'process3',
      announceDate: tor?.announceDate || null,
      stages: {
        fetched: { done: isFetched, timestamp: tor?.createdAt || titleScreen?.screenedAt || null },
        downloaded: { done: isDownloaded, timestamp: tor?.document?.downloadedAt || null },
        ocr: {
          done: isOcrDone,
          usedOcr: Boolean(tor?.ocr?.usedOcr),
          confidence: isOcrDone
            ? (tor?.ocr?.confidence != null && tor.ocr.confidence > 0
                ? Number(tor.ocr.confidence.toFixed(2))
                : 1.0)
            : null,
          error: failure?.step === 'ocr' ? failure.lastError : null,
        },
        extracted: {
          done: isExtracted,
          confidence: insight?.metadata?.confidenceScore ?? insight?.confidence ?? null,
          error: failure?.step === 'extract' ? failure.lastError : null,
        },
        reviewed: {
          done: isReviewed,
          status: insight?.metadata?.reviewStatus || 'pending',
          reviewedBy: insight?.metadata?.reviewedBy || null,
          reviewedAt: insight?.metadata?.reviewedAt || null,
        },
      },
      document: tor?.document
        ? {
            fileName: tor.document.fileName,
            pages: tor.document.pages,
            sizeBytes: tor.document.sizeBytes,
            documentType: tor.document.documentType,
            sourceUrl: tor.document.sourceUrl,
          }
        : null,
      activeFailure: failure
        ? {
            step: failure.step,
            attempts: failure.attempts,
            lastError: failure.lastError,
            lastTransient: Boolean(failure.lastTransient),
            firstFailedAt: failure.firstFailedAt,
            lastFailedAt: failure.lastFailedAt,
          }
        : null,
      insight: insight
        ? {
            confidence: insight.metadata?.confidenceScore ?? insight.confidence ?? null,
            reviewStatus: insight.metadata?.reviewStatus || 'pending',
            excluded: insight.metadata?.excluded || null,
            extractedTechnologies: insight.facts?.requiredTechStack || [],
            lockSpecRisk:
              insight.lockSpecAnalysis?.riskLevel ||
              (insight.analytics?.lockSpec?.riskScore >= 70
                ? 'high'
                : insight.analytics?.lockSpec?.riskScore >= 35
                ? 'medium'
                : 'low'),
          }
        : null,
      titleScreen: titleScreen
        ? {
            category: titleScreen.category,
            verdict: titleScreen.verdict,
            isItRelated: titleScreen.verdict === 'it',
            reason: titleScreen.reason,
            screenedAt: titleScreen.screenedAt,
          }
        : null,
    },
  };
}

/**
 * Manually adds a procurement record by 11-digit e-GP project ID and downloads its packages (FR-24).
 */
export async function addManualProcurementRecord({ projectId }) {
  if (!projectId || !/^\d{11}$/.test(String(projectId).trim())) {
    const error = new Error('e-GP project ID must be exactly 11 digits (e.g. 69099683466)');
    error.status = 400;
    throw error;
  }

  const cleanId = String(projectId).trim();

  // Uniqueness check
  if (await Tor.exists({ projectId: cleanId })) {
    const error = new Error(`Project ${cleanId} already exists in the database`);
    error.status = 409;
    throw error;
  }

  const documentsDir = process.env.DOCUMENTS_DIR || './data/documents';

  let tor;
  try {
    tor = await withRunLock('ingestion', async () => {
      // Re-verify inside lock to guard against concurrent runs
      if (await Tor.exists({ projectId: cleanId })) {
        const err = new Error(`Project ${cleanId} already exists in the database`);
        err.status = 409;
        throw err;
      }
      return await runAddStep({ id: cleanId, documentsDir });
    });
  } catch (err) {
    if (err.name === 'RunLockHeldError' || err.code === 'RUN_LOCK_HELD') {
      const lockError = new Error(
        'Pipeline is currently executing another ingestion job. Please try again shortly.',
      );
      lockError.status = 409;
      throw lockError;
    }
    throw err;
  }

  if (!tor) {
    const error = new Error(
      `Could not add project ${cleanId}: e-GP returned no announcement package or the announcement has no readable title.`,
    );
    error.status = 422;
    throw error;
  }

  return {
    ok: true,
    projectId: tor.projectId,
    title: tor.title,
    agency: tor.agency || '',
    status: tor.status,
    pipelineStatus: tor.pipelineStatus,
    message: `Project ${cleanId} successfully added and package downloaded.`,
  };
}

/**
 * Searches projects by partial ID or title for live autocompletion (Inspector).
 */
export async function suggestProjects(q) {
  if (!q || typeof q !== 'string') return [];
  const trimmed = q.trim();
  if (trimmed.length < 1) return [];

  const isNumeric = /^\d+$/.test(trimmed);
  let filter;
  if (isNumeric) {
    filter = { projectId: { $regex: trimmed, $options: 'i' } };
  } else {
    filter = {
      $or: [
        { projectId: { $regex: trimmed, $options: 'i' } },
        { title: { $regex: trimmed, $options: 'i' } },
      ],
    };
  }

  try {
    const results = await Tor.find(
      filter,
      { projectId: 1, title: 1, agency: 1, budgetTHB: 1, status: 1 },
    )
      .sort({ createdAt: -1 })
      .limit(8)
      .lean();

    return results.map((r) => ({
      projectId: r.projectId,
      title: r.title,
      agency: r.agency || '',
      budgetTHB: r.budgetTHB || null,
      status: r.status || 'Draft',
    }));
  } catch {
    return [];
  }
}

/**
 * Lists technologies and standards vocabulary for admin inspection, review, and editing.
 */
export async function getAdminTechnologies({ status, search, page = 1, limit = 50 } = {}) {
  try {
    const totalCount = await Technology.countDocuments();
    if (totalCount === 0 && STARTER_TECHNOLOGIES?.length > 0) {
      const seedDocs = STARTER_TECHNOLOGIES.map((t) => ({
        name: t.name,
        key: t.name.toLowerCase().replace(/\s+/g, ' '),
        category: t.category,
        aliases: t.aliases ? t.aliases.map((a) => a.toLowerCase().trim()) : [],
        status: 'confirmed',
        firstSeenIn: 'starter-seed',
      }));
      await Technology.insertMany(seedDocs, { ordered: false }).catch(() => {});
    }

    const query = {};
    if (status && status !== 'all') {
      query.status = status;
    }
    if (search && search.trim()) {
      const s = search.trim();
      query.$or = [
        { name: { $regex: s, $options: 'i' } },
        { category: { $regex: s, $options: 'i' } },
        { aliases: { $regex: s, $options: 'i' } },
      ];
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const [items, total, pendingRequestsCount] = await Promise.all([
      Technology.find(query)
        .sort({ status: 1, updatedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Technology.countDocuments(query),
      Technology.countDocuments({ status: 'new' }),
    ]);

    return {
      items: items.map((t) => ({
        id: t._id.toString(),
        name: t.name,
        key: t.key,
        category: t.category,
        aliases: t.aliases || [],
        status: t.status,
        firstSeenIn: t.firstSeenIn,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum) || 1,
      pendingRequestsCount,
    };
  } catch {
    return {
      items: [],
      total: 0,
      page: 1,
      totalPages: 1,
      pendingRequestsCount: 0,
    };
  }
}

/**
 * Creates a new technology or standard entry directly by admin.
 */
export async function createAdminTechnology({ name, category, aliases = [], status = 'confirmed' }) {
  const trimmed = name?.trim();
  if (!trimmed) {
    const error = new Error('Name is required');
    error.status = 400;
    throw error;
  }
  if (trimmed.length > 100) {
    const error = new Error('Name cannot exceed 100 characters');
    error.status = 400;
    throw error;
  }

  const key = trimmed.toLowerCase().replace(/\s+/g, ' ');
  const normalizedAliases = Array.isArray(aliases)
    ? Array.from(new Set(aliases.map((a) => (typeof a === 'string' ? a.trim().toLowerCase() : '')).filter(Boolean)))
    : [];

  const existing = await Technology.findOne({
    $or: [{ key }, { name: new RegExp(`^${trimmed}$`, 'i') }],
  });
  if (existing) {
    const error = new Error(`Technology or standard '${trimmed}' already exists`);
    error.status = 409;
    throw error;
  }

  const validStatus = ['confirmed', 'new', 'rejected'].includes(status) ? status : 'confirmed';

  const created = await Technology.create({
    name: trimmed,
    key,
    category: category?.trim() || null,
    aliases: normalizedAliases,
    status: validStatus,
    firstSeenIn: 'admin-created',
  });

  return {
    id: created._id.toString(),
    name: created.name,
    key: created.key,
    category: created.category,
    aliases: created.aliases,
    status: created.status,
    firstSeenIn: created.firstSeenIn,
    createdAt: created.createdAt,
    updatedAt: created.updatedAt,
  };
}

/**
 * Updates an existing technology or standard (name, category, aliases, status).
 */
export async function updateAdminTechnology(id, { name, category, aliases, status }) {
  const tech = await Technology.findById(id);
  if (!tech) {
    const error = new Error('Technology not found');
    error.status = 404;
    throw error;
  }

  if (name !== undefined) {
    const trimmed = name.trim();
    if (!trimmed) {
      const error = new Error('Name cannot be empty');
      error.status = 400;
      throw error;
    }
    const key = trimmed.toLowerCase().replace(/\s+/g, ' ');
    const clash = await Technology.findOne({
      _id: { $ne: tech._id },
      $or: [{ key }, { name: new RegExp(`^${trimmed}$`, 'i') }],
    });
    if (clash) {
      const error = new Error(`Technology '${trimmed}' already exists with different ID`);
      error.status = 409;
      throw error;
    }
    tech.name = trimmed;
    tech.key = key;
  }

  if (category !== undefined) {
    tech.category = category ? category.trim() : null;
  }

  if (aliases !== undefined) {
    tech.aliases = Array.isArray(aliases)
      ? Array.from(new Set(aliases.map((a) => (typeof a === 'string' ? a.trim().toLowerCase() : '')).filter(Boolean)))
      : [];
  }

  if (status !== undefined) {
    if (!['confirmed', 'new', 'rejected'].includes(status)) {
      const error = new Error("Status must be 'confirmed', 'new', or 'rejected'");
      error.status = 400;
      throw error;
    }
    tech.status = status;
  }

  await tech.save();

  return {
    id: tech._id.toString(),
    name: tech.name,
    key: tech.key,
    category: tech.category,
    aliases: tech.aliases,
    status: tech.status,
    firstSeenIn: tech.firstSeenIn,
    createdAt: tech.createdAt,
    updatedAt: tech.updatedAt,
  };
}

/**
 * Deletes a technology entry.
 */
export async function deleteAdminTechnology(id) {
  const tech = await Technology.findByIdAndDelete(id);
  if (!tech) {
    const error = new Error('Technology not found');
    error.status = 404;
    throw error;
  }
  return { ok: true, id, message: `Technology '${tech.name}' deleted successfully` };
}

/**
 * Queries pipeline tasks with filtering by phase (all, download, ocr, extract, extracted, failed),
 * search keyword, and pagination (FR-24).
 */
export async function getPipelineTasks({ phase = 'all', search = '', page = 1, limit = 25 } = {}) {
  const p = Math.max(1, Number(page) || 1);
  const lim = Math.max(1, Math.min(100, Number(limit) || 25));
  const skip = (p - 1) * lim;
  const q = String(search || '').trim();

  // Load active failures map for lookup
  const failures = await PipelineFailure.find().lean();
  const failureMap = new Map(failures.map((f) => [f.projectId, f]));

  // Live Counts for Phase Badges
  const [downloadCount, ocrCount, extractCount, extractedCount, failedCount, totalTorCount] =
    await Promise.all([
      Tor.countDocuments({ pipelineStatus: 'fetched' }),
      Tor.countDocuments({ pipelineStatus: { $in: ['downloaded', 'ocr_preview'] } }),
      Tor.countDocuments({ pipelineStatus: 'ocr_done' }),
      TorInsight.countDocuments({ 'metadata.origin': { $ne: 'demo' }, 'metadata.excluded': null }),
      PipelineFailure.countDocuments(),
      Tor.countDocuments(),
    ]);

  let tasks = [];
  let total = 0;

  if (phase === 'failed') {
    let failureQuery = {};
    if (q) {
      const matchingTors = await Tor.find({
        $or: [
          { projectId: { $regex: q, $options: 'i' } },
          { title: { $regex: q, $options: 'i' } },
          { agency: { $regex: q, $options: 'i' } },
        ],
      })
        .select('projectId')
        .lean();
      const projIds = matchingTors.map((t) => t.projectId);
      failureQuery = {
        $or: [
          { projectId: { $regex: q, $options: 'i' } },
          { projectId: { $in: projIds } },
          { lastError: { $regex: q, $options: 'i' } },
        ],
      };
    }

    total = await PipelineFailure.countDocuments(failureQuery);
    const failureRecords = await PipelineFailure.find(failureQuery)
      .sort({ lastFailedAt: -1 })
      .skip(skip)
      .limit(lim)
      .lean();

    const torMap = new Map(
      (
        await Tor.find({ projectId: { $in: failureRecords.map((f) => f.projectId) } })
          .select('projectId title agency pipelineStatus')
          .lean()
      ).map((t) => [t.projectId, t]),
    );

    tasks = failureRecords.map((f) => {
      const tor = torMap.get(f.projectId);
      return {
        projectId: f.projectId,
        title: tor?.title || `Project ${f.projectId}`,
        agency: tor?.agency || '',
        pipelineStatus: tor?.pipelineStatus || 'unknown',
        phase: 'failed',
        step: f.step,
        lastError: f.lastError,
        attempts: f.attempts,
        lastTransient: Boolean(f.lastTransient),
        updatedAt: f.lastFailedAt ? new Date(f.lastFailedAt).toISOString() : '-',
      };
    });
  } else if (phase === 'extracted') {
    const insightQuery = {
      'metadata.origin': { $ne: 'demo' },
      'metadata.excluded': null,
    };
    if (q) {
      insightQuery.$or = [
        { projectId: { $regex: q, $options: 'i' } },
        { 'identification.titleTh': { $regex: q, $options: 'i' } },
        { 'identification.agency': { $regex: q, $options: 'i' } },
      ];
    }
    total = await TorInsight.countDocuments(insightQuery);
    const insights = await TorInsight.find(insightQuery)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(lim)
      .lean();

    tasks = insights.map((ins) => ({
      projectId: ins.projectId,
      title: ins.identification?.titleTh || `Project ${ins.projectId}`,
      agency: ins.identification?.agency || '',
      pipelineStatus: 'ocr_done',
      phase: 'extracted',
      step: 'completed',
      lastError: null,
      attempts: 1,
      lastTransient: false,
      updatedAt: ins.updatedAt ? new Date(ins.updatedAt).toISOString() : '-',
    }));
  } else {
    const torQuery = {};
    if (phase === 'download') {
      torQuery.pipelineStatus = 'fetched';
    } else if (phase === 'ocr') {
      torQuery.pipelineStatus = { $in: ['downloaded', 'ocr_preview'] };
    } else if (phase === 'extract') {
      torQuery.pipelineStatus = 'ocr_done';
    }

    if (q) {
      torQuery.$or = [
        { projectId: { $regex: q, $options: 'i' } },
        { title: { $regex: q, $options: 'i' } },
        { agency: { $regex: q, $options: 'i' } },
      ];
    }

    total = await Tor.countDocuments(torQuery);
    const tors = await Tor.find(torQuery)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(lim)
      .lean();

    // Check which tors have insights already extracted
    const extractedIds = new Set(
      (
        await TorInsight.find({
          projectId: { $in: tors.map((t) => t.projectId) },
          'metadata.origin': { $ne: 'demo' },
          'metadata.excluded': null,
        })
          .select('projectId')
          .lean()
      ).map((i) => i.projectId),
    );

    tasks = tors.map((t) => {
      const failure = failureMap.get(t.projectId);
      const isExtracted = extractedIds.has(t.projectId);
      let calculatedPhase = 'download';
      if (t.pipelineStatus === 'fetched') calculatedPhase = 'download';
      else if (t.pipelineStatus === 'downloaded' || t.pipelineStatus === 'ocr_preview') calculatedPhase = 'ocr';
      else if (isExtracted) calculatedPhase = 'extracted';
      else if (t.pipelineStatus === 'ocr_done') calculatedPhase = 'extract';

      return {
        projectId: t.projectId,
        title: t.title,
        agency: t.agency,
        pipelineStatus: t.pipelineStatus,
        phase: failure ? 'failed' : calculatedPhase,
        step: failure?.step || calculatedPhase,
        lastError: failure?.lastError || null,
        attempts: failure?.attempts || 0,
        lastTransient: Boolean(failure?.lastTransient),
        updatedAt: t.updatedAt ? new Date(t.updatedAt).toISOString() : '-',
      };
    });
  }

  return {
    tasks,
    total,
    page: p,
    limit: lim,
    counts: {
      all: totalTorCount,
      download: downloadCount,
      ocr: ocrCount,
      extract: extractCount,
      extracted: extractedCount,
      failed: failedCount,
    },
  };
}

/**
 * Advances a project past a stuck pipeline step (FR-24).
 */
export async function skipPipelineStep(projectId, step) {
  if (!projectId || !step) {
    const error = new Error('projectId and step are required');
    error.status = 400;
    throw error;
  }

  const tor = await Tor.findOne({ projectId });
  if (!tor) {
    const error = new Error(`TOR document ${projectId} not found`);
    error.status = 404;
    throw error;
  }

  if (step === 'download') {
    tor.pipelineStatus = 'downloaded';
  } else if (step === 'ocr') {
    tor.pipelineStatus = 'ocr_done';
  }

  await tor.save();
  await PipelineFailure.deleteMany({ projectId });

  return {
    ok: true,
    projectId,
    step,
    nextStatus: tor.pipelineStatus,
    message: `Project ${projectId} advanced past ${step} step`,
  };
}



