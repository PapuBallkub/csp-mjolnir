/**
 * server/src/pipeline/shared/failures.js
 *
 * When to stop retrying a TOR (ADR 0016). Every step finds its own work, so a
 * TOR that fails stays in the queue, and a schedule would retry it on every
 * run, for ever: a download e-GP has no file for, an OCR that crashes on one
 * PDF, an extraction that costs money each time and fails after the call.
 *
 * Each failure is recorded per TOR and step. After MAX_ATTEMPTS failures of
 * its own, the TOR is left out until someone asks for it again, with
 * `--retry-failed` or `--id`.
 */

import axios from 'axios';
import { PipelineFailure } from '#models/index.js';

const parsedMax = Number.parseInt(process.env.PIPELINE_MAX_ATTEMPTS ?? '', 10);
export const MAX_ATTEMPTS = parsedMax > 0 ? parsedMax : 3;

// Network failures that mean "nobody answered", from axios and from fetch
const NETWORK_CODES = new Set([
  'ECONNABORTED',
  'ECONNREFUSED',
  'ECONNRESET',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'ETIMEDOUT',
  'ERR_NETWORK',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
]);

/**
 * Whether an error means the other side didn't answer, rather than that this
 * TOR is the problem: no response at all, a server error (5xx), or a rate
 * limit (429). Works for axios errors (e-GP, data.go.th) and Gemini's.
 */
export function isOutage(error) {
  const status = error?.response?.status ?? error?.status;
  if (Number.isInteger(status)) return status === 429 || status >= 500;
  const code = error?.code ?? error?.cause?.code;
  return NETWORK_CODES.has(code) || (axios.isAxiosError(error) && !error.response);
}

const messageOf = (error) =>
  String(typeof error === 'string' ? error : (error?.message ?? error)).slice(0, 1000);

/**
 * Records that a step failed for one TOR. An outage is recorded but not
 * counted. A failure on a different input than last time starts the count
 * again: a new PDF or a new prompt deserves its own tries.
 *
 * @param {object} input
 * @param {string} input.projectId
 * @param {'download'|'ocr'|'extract'} input.step
 * @param {Error|string} input.error
 * @param {string|null} [input.inputKey] - What the step worked from
 * @param {boolean} [input.transient] - Defaults to isOutage(error)
 * @returns {Promise<{ attempts: number, counted: boolean, gaveUp: boolean }>}
 */
export async function recordFailure({
  projectId,
  step,
  error,
  inputKey = null,
  transient = isOutage(error),
  now = new Date(),
  maxAttempts = MAX_ATTEMPTS,
}) {
  // Read, then write: safe because the run lock lets one run work at a time
  const previous = await PipelineFailure.findOne({ projectId, step }).lean();
  const sameInput = Boolean(previous) && (previous.inputKey ?? null) === inputKey;
  const attempts = (sameInput ? previous.attempts : 0) + (transient ? 0 : 1);

  await PipelineFailure.updateOne(
    { projectId, step },
    {
      $set: {
        inputKey,
        attempts,
        lastError: messageOf(error),
        lastTransient: transient,
        firstFailedAt: sameInput ? previous.firstFailedAt : now,
        lastFailedAt: now,
      },
    },
    { upsert: true },
  );
  return { attempts, counted: !transient, gaveUp: attempts >= maxAttempts };
}

/** Forgets a step's failures for one TOR, once the step has succeeded. */
export async function clearFailure({ projectId, step }) {
  await PipelineFailure.deleteOne({ projectId, step });
}

/**
 * Loads the TORs a step has given up on, and returns a test for one TOR:
 * `gaveUp(projectId, inputKey)`. A TOR whose input has changed since its
 * failures (a new PDF, a new prompt) is not given up on: it gets new tries.
 */
export async function loadGivenUp(step, { maxAttempts = MAX_ATTEMPTS } = {}) {
  const rows = await PipelineFailure.find(
    { step, attempts: { $gte: maxAttempts } },
    { projectId: 1, inputKey: 1 },
  ).lean();
  const keys = new Map(rows.map((row) => [row.projectId, row.inputKey ?? null]));
  return (projectId, inputKey = null) => keys.has(projectId) && keys.get(projectId) === inputKey;
}
