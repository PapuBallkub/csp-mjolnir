/**
 * server/src/pipeline/extraction/select.js
 *
 * Which TORs a run processes, and why (ADR 0013, D10). Re-processing is never
 * a side effect: a changed source always is, an older prompt only when asked,
 * and a result a person has reviewed only when forced (R16).
 */

import crypto from 'node:crypto';

const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');

/**
 * A hash over everything an insight is built from: the main PDF, any amendment
 * documents in order (R14), and the OCR text itself, so re-running OCR (say,
 * with a higher page limit) also counts as a changed source.
 */
export function sourceFingerprint(tor) {
  const documents = [tor.document?.contentHash, ...(tor.amendments ?? []).map((a) => a.contentHash)];
  return sha256(JSON.stringify([documents.filter(Boolean), sha256(tor.ocr?.rawText ?? '')]));
}

/**
 * Decides what a run does with one TOR.
 *
 * @param {object} input
 * @param {object|null} input.insight - The existing TorInsight (its metadata), or null
 * @param {string} input.fingerprint - sourceFingerprint of the TOR now
 * @param {string} input.promptVersion - The prompt version now
 * @param {string} input.model - The model now
 * @param {{ force?: boolean, outdated?: boolean, id?: boolean }} input.flags
 * @returns {{ action: 'process' | 'skip', reason: string, warn: boolean }}
 */
export function decide({ insight, fingerprint, promptVersion, model, flags = {} }) {
  if (!insight) return { action: 'process', reason: 'new', warn: false };

  const meta = insight.metadata ?? {};
  const reviewed = (meta.reviewStatus ?? 'pending') !== 'pending';

  // A changed source makes the old result wrong, reviewed or not. It is
  // processed again and goes back to pending review.
  if (meta.sourceFingerprint !== fingerprint) {
    return { action: 'process', reason: 'source-changed', warn: reviewed };
  }
  if (flags.force || flags.id) {
    return { action: 'process', reason: 'forced', warn: reviewed };
  }
  // A person's review is never overwritten by accident (R16)
  if (reviewed) return { action: 'skip', reason: 'reviewed', warn: false };

  const stale = meta.promptVersion !== promptVersion || meta.modelName !== model;
  if (stale) {
    return flags.outdated
      ? { action: 'process', reason: 'outdated', warn: false }
      : { action: 'skip', reason: 'outdated', warn: false };
  }
  return { action: 'skip', reason: 'current', warn: false };
}
