/**
 * server/src/pipeline/shared/insight-versions.js
 *
 * Keeps the summary a change replaces (ADR 0031). Before a TOR's summary is
 * overwritten, the old one goes into TorInsightVersion: one record per
 * replaced summary, with the reason, and with the Tor's state it went with
 * (its file, OCR text, and the facts an admin edit also changes). That's the
 * "before" an amendment's diff needs (FR-16), and what a rollback brings back
 * (NFR-07).
 *
 * A version is kept where its source is about to be lost: download, before a
 * package with a different TOR file is applied; OCR, before changed text
 * overwrites the old; saveInsight and the review queue, before they overwrite
 * the summary itself. Each summary is kept once: whichever comes first.
 */

import crypto from 'node:crypto';
import { isFullExtraction } from '#features/reality-check/index.js';
import { Tor, TorInsight, TorInsightVersion } from '#models/index.js';
import { fingerprintFor } from '../extraction/select.js';

const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');
const plain = (record) => (record?.toObject ? record.toObject({ flattenMaps: true }) : record);

// What an admin's review-queue edit also changes on the Tor (FR-23)
const TOR_FACTS = ['title', 'agency', 'budgetTHB', 'referencePriceTHB', 'submissionDeadline'];

/** The Tor as a summary went with it: everything a rollback restores, but the OCR text, kept apart. */
export function torStateOf(tor) {
  const record = plain(tor);
  if (!record) return null;
  const { rawText, ...ocr } = record.ocr ?? {};
  return {
    ...Object.fromEntries(TOR_FACTS.map((key) => [key, record[key] ?? null])),
    document: record.document ?? null,
    ocr,
    pipelineStatus: record.pipelineStatus ?? null,
  };
}

/** The version number of a TOR's summary now, or null when it has none (only a title, a preview, or not IT). */
export async function summaryVersion(projectId) {
  const insight = await TorInsight.findOne({ projectId }, { metadata: 1 }).lean();
  return insight && isFullExtraction(insight) ? (insight.metadata?.version ?? 1) : null;
}

/** The version number the next summary gets: one more than the last kept, or 1. */
export async function nextVersion(projectId) {
  const last = await TorInsightVersion.findOne({ projectId }, { version: 1 }).sort({ version: -1 }).lean();
  return (last?.version ?? 0) + 1;
}

/**
 * Keeps the current summary as a version, before it's replaced. Only a
 * summary: a title-level record, a preview waiting for its full text, or one
 * found not IT has nothing to keep. A summary already kept isn't kept again.
 *
 * @param {object} options
 * @param {string} options.reason - see TorInsightVersion
 * @param {object|null} [options.by] - the admin's id, for 'corrected' and 'rollback'
 * @param {object} [options.current] - the TorInsight now, when already in hand
 * @param {object} [options.tor] - the Tor now, when already in hand
 * @returns {Promise<object|null>} The version kept, or null
 */
export async function keepVersion(projectId, { reason, by = null, current, tor, now = new Date() }) {
  const insight = plain(current !== undefined ? current : await TorInsight.findOne({ projectId }).lean());
  if (!insight || !isFullExtraction(insight)) return null;
  const version = insight.metadata?.version ?? 1;
  if (await TorInsightVersion.exists({ projectId, version })) return null;

  const torRecord = plain(tor !== undefined ? tor : await Tor.findOne({ projectId }).lean());
  const text = torRecord?.ocr?.rawText || null;
  const ocrTextHash = text ? sha256(text) : null;
  // Each distinct text is kept once: by the version it's about to be lost
  // from. The others keep its hash, and a rollback finds the text by it.
  const keepText =
    Boolean(text) &&
    reason === 'source-changed' &&
    !(await TorInsightVersion.exists({ projectId, ocrTextHash, ocrText: { $ne: null } }));

  try {
    return await TorInsightVersion.create({
      projectId,
      version,
      supersededAt: now,
      reason,
      supersededBy: by,
      insight,
      tor: torStateOf(torRecord),
      ocrText: keepText ? text : null,
      ocrTextHash,
    });
  } catch (error) {
    if (error?.code === 11000) return null; // another run kept it first
    throw error;
  }
}

/** Why `next` replaces `current`, from what each was built from. */
export function reasonFor(current, next) {
  const before = current?.metadata ?? {};
  const after = next?.metadata ?? {};
  if (before.sourceFingerprint !== after.sourceFingerprint) return 'source-changed';
  if (before.promptVersion !== after.promptVersion || before.modelName !== after.modelName) return 'prompt-update';
  return 'forced';
}

/** The OCR text a version was built from: its own, another version's with the same hash, or the Tor's. */
async function textOf(target, tor) {
  if (target.ocrText) return target.ocrText;
  if (!target.ocrTextHash) return null;
  const other = await TorInsightVersion.findOne(
    { projectId: target.projectId, ocrTextHash: target.ocrTextHash, ocrText: { $ne: null } },
    { ocrText: 1 },
  ).lean();
  if (other) return other.ocrText;
  const current = tor?.ocr?.rawText;
  return current && sha256(current) === target.ocrTextHash ? current : null;
}

function failure(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

/**
 * Brings version `to` of a TOR's summary back (NFR-07): the current one is
 * kept first, as 'rollback'; then the summary, and the Tor's file, OCR text
 * and facts it went with, are put back as they were. The restored summary's
 * source matches the Tor again, so the next extraction leaves it alone; a
 * later, really new package takes the normal path. The nightly analysis
 * (`analytics`) stays as it is: the next comparisons run redoes it.
 *
 * @returns {Promise<object>} What it did, or with dryRun what it would do
 */
export async function rollbackTor(projectId, { to, by = null, dryRun = false, now = new Date() }) {
  const target = await TorInsightVersion.findOne({ projectId, version: to }).lean();
  if (!target) throw failure(`TOR ${projectId} has no version ${to}.`, 404);
  const [current, tor] = await Promise.all([TorInsight.findOne({ projectId }).lean(), Tor.findOne({ projectId })]);

  const text = await textOf(target, tor);
  const result = {
    projectId,
    from: current ? (current.metadata?.version ?? 1) : null,
    to,
    restoredTor: Boolean(tor && target.tor),
    restoredText: text !== null,
    dryRun,
  };
  if (dryRun) return result;

  if (current) await keepVersion(projectId, { reason: 'rollback', by, current, tor, now });
  const version = await nextVersion(projectId);

  // The Tor as the summary went with it
  if (tor) {
    if (target.tor) {
      for (const key of TOR_FACTS) tor[key] = target.tor[key];
      if (target.tor.document) tor.document = target.tor.document;
      if (text !== null) {
        tor.ocr = { ...target.tor.ocr, rawText: text };
        if (target.tor.pipelineStatus) tor.pipelineStatus = target.tor.pipelineStatus;
      }
    }
    // The changes that replaced this version or a later one are undone with
    // it: kept, marked, and no longer shown (ADR 0032)
    let undone = 0;
    for (const entry of tor.amendments ?? []) {
      if (!entry.rolledBack && entry.insightVersion != null && entry.insightVersion >= to) {
        entry.rolledBack = true;
        undone++;
      }
    }
    if (undone > 0) {
      const live = tor.amendments.filter((entry) => !entry.rolledBack && entry.detectedAt);
      tor.lastChangeAt = live.length ? new Date(Math.max(...live.map((entry) => new Date(entry.detectedAt).getTime()))) : null;
    }
    result.changesUndone = undone;
    await tor.save();
  }

  // The summary itself, with the next version number
  const restored = { ...target.insight, metadata: { ...target.insight.metadata, version } };
  // Text not found anywhere: the summary is marked as built from the Tor's
  // present text, or the next extraction would undo the rollback
  if (text === null && tor) restored.metadata.sourceFingerprint = fingerprintFor(plain(tor), restored.metadata);
  result.version = version;
  result.madeCurrent = text === null;

  const document = new TorInsight({ ...restored, projectId });
  await document.validate();
  const replacement = document.toObject({ flattenMaps: true });
  for (const key of ['_id', 'createdAt', 'updatedAt', 'analytics']) delete replacement[key];
  if (current?.analytics) replacement.analytics = current.analytics;
  if (current?.createdAt) replacement.createdAt = current.createdAt;
  await TorInsight.replaceOne({ projectId }, replacement, { upsert: true });
  return result;
}

/** A TOR's versions, newest first, without the stored summaries and text: for choosing one to roll back to. */
export async function listVersions(projectId) {
  const current = await TorInsight.findOne({ projectId }, { 'metadata.version': 1 }).lean();
  const versions = await TorInsightVersion.aggregate([
    { $match: { projectId } },
    { $sort: { version: -1 } },
    {
      $project: {
        _id: 0,
        version: 1,
        reason: 1,
        supersededAt: 1,
        supersededBy: 1,
        promptVersion: '$insight.metadata.promptVersion',
        modelName: '$insight.metadata.modelName',
        confidenceScore: '$insight.metadata.confidenceScore',
        reviewStatus: '$insight.metadata.reviewStatus',
        keptText: { $ne: [{ $ifNull: ['$ocrText', null] }, null] },
      },
    },
  ]);
  return { projectId, current: current ? (current.metadata?.version ?? 1) : null, versions };
}
