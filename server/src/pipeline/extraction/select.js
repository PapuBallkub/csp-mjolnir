/**
 * server/src/pipeline/extraction/select.js
 *
 * Which TORs a run processes, and why (ADR 0013, D10). Re-processing is never
 * a side effect: a changed source always is, an older prompt only when asked,
 * and a result a person has reviewed only when forced (R16).
 */

import crypto from 'node:crypto';
import { biddingTextOf, isExtraction } from './documents.js';

const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');

/**
 * A hash over everything an insight is built from: the main PDF, any amendment
 * documents in order (R14), and the OCR text itself, so re-running OCR (say,
 * with a higher page limit) also counts as a changed source.
 *
 * A full extraction also reads the bidding document (ADR 0025), so its hash
 * covers that too (`bidding: true`). An excluded or awaiting record was built
 * from the TOR alone, and a new bidding document doesn't make it wrong: its
 * hash leaves the bidding document out, so it isn't classified again for one.
 *
 * @param {object} tor
 * @param {{ bidding?: boolean }} [options]
 */
export function sourceFingerprint(tor, { bidding = false } = {}) {
  const documents = [tor.document?.contentHash, ...(tor.amendments ?? []).map((a) => a.contentHash)];
  const parts = [documents.filter(Boolean), sha256(tor.ocr?.rawText ?? '')];
  const biddingText = bidding ? biddingTextOf(tor) : '';
  if (biddingText) parts.push(sha256(biddingText));
  return sha256(JSON.stringify(parts));
}

/** The fingerprint to compare an existing insight with: by what it was built from. */
export const fingerprintFor = (tor, metadata) => sourceFingerprint(tor, { bidding: isExtraction(metadata) });

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
