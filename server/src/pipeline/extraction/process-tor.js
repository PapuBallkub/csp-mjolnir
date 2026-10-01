/**
 * server/src/pipeline/extraction/process-tor.js
 *
 * One TOR through the whole workflow: classify, then (for IT only) extract,
 * check and assemble. A fixed sequence, not an agent loop (D1). The command
 * calls it today and a scheduler will call it later (ADR 0013).
 *
 * Nothing is saved until every step has succeeded, so a failure never leaves a
 * half-built record (R4, NFR-06).
 */

import { TorInsight } from '#models/index.js';
import { buildExcluded, buildInsight } from './assemble.js';
import { QUOTED_LISTS, keepGroundedItems, runChecks } from './checks.js';
import { generateJson } from './gemini.js';
import {
  CLASSIFY_INSTRUCTION,
  EXTRACT_INSTRUCTION,
  PROMPT_VERSION,
  buildClassifyContents,
  buildExtractContents,
} from './prompts.js';
import { classifySchema, extractSchema } from './schema.js';
import { sourceFingerprint } from './select.js';
import { resolveTechnologies as resolveFromDatabase } from './vocabulary.js';

// LOW is the lowest level gemini-3.7-flash accepts, and it thinks 0 tokens on
// both steps; MINIMAL is rejected with a 400
const THINKING_LEVEL = 'LOW';
const EXTRACT_MAX_OUTPUT_TOKENS = 32_768;

const at = (object, path) => path.split('.').reduce((value, key) => value?.[key], object);

/**
 * Asks Gemini: classify, then (for IT only) extract. The only part that costs
 * money, kept apart so the answers can be rebuilt later without asking again.
 *
 * @returns {Promise<{ classification: object, extracted: object|null, usage: object[] }>}
 */
export async function askGemini(tor, { client, config }) {
  const rawText = tor.ocr?.rawText;
  if (!rawText) throw new Error('No OCR text yet; run ingest:ocr first.');

  const ask = (systemInstruction, contents, responseSchema, extra = {}) =>
    generateJson({ client, model: config.model, systemInstruction, contents, responseSchema, thinkingLevel: THINKING_LEVEL, ...extra });

  // 1. Classify: a small call on the first pages decides whether to go on (D8)
  const classify = await ask(CLASSIFY_INSTRUCTION, buildClassifyContents({ title: tor.title, rawText }), classifySchema);
  if (!classify.data.isIT) return { classification: classify.data, extracted: null, usage: [classify.usage] };

  // 2. Extract: the whole document, the feed deliberately left out
  const extract = await ask(EXTRACT_INSTRUCTION, buildExtractContents({ rawText }), extractSchema, {
    maxOutputTokens: EXTRACT_MAX_OUTPUT_TOKENS,
  });
  return { classification: classify.data, extracted: extract.data, usage: [classify.usage, extract.usage] };
}

/**
 * One TOR end to end: ask Gemini, then build the record from its answers.
 *
 * @param {object} tor - A Tor record at ocr_done
 * @param {object} options
 * @param {object} options.client - Gemini client (a fake in tests)
 * @param {{ model: string }} options.config
 * @param {boolean} [options.dryRun] - Don't add new technologies to the vocabulary
 * @param {Function} [options.resolveTechnologies] - Replaced in tests, to run without a database
 * @param {Date} [options.now]
 * @returns {Promise<{ insight: object, review: object, usage: object[] }>}
 */
export async function processTor(tor, { client, config, now = new Date(), ...options }) {
  const answers = await askGemini(tor, { client, config });
  const run = { model: config.model, promptVersion: PROMPT_VERSION, fingerprint: sourceFingerprint(tor), now };
  const built = await buildFromAnswers(tor, answers, { run, ...options });
  return { ...built, usage: answers.usage };
}

/**
 * Builds the record from Gemini's answers: check, resolve, assemble. Free, so
 * `npm run extract -- --recheck` reruns it from the saved answers whenever the
 * checks or the assembly change, without asking Gemini again.
 */
export async function buildFromAnswers(
  tor,
  { classification, extracted },
  { run, dryRun = false, resolveTechnologies = resolveFromDatabase },
) {
  if (!classification.isIT || !extracted) {
    return {
      insight: buildExcluded({ tor, classification, run }),
      review: { classification, extracted: null, unknownTechnologies: [] },
    };
  }

  // 3. Check, and keep only list items whose quote is really in the document (R5)
  const rawText = tor.ocr.rawText;
  const checkResult = runChecks({ tor, classification, extracted });
  const [technologyItems, certificationItems, authorizationItems] = QUOTED_LISTS.map(
    (list) => keepGroundedItems(at(extracted, list), rawText).kept,
  );
  const { technologies, unknown } = await resolveTechnologies(technologyItems, { projectId: tor.projectId, dryRun });

  // 4. Assemble
  const insight = buildInsight({
    tor,
    classification,
    extracted,
    technologies,
    certifications: certificationItems.map((item) => item.name),
    authorizations: authorizationItems.map((item) => item.name),
    checkResult,
    run,
  });
  return {
    insight,
    // The model's own answers, quotes and pages included, for a person to check
    // against the PDF (D11): the stored record drops the list quotes
    review: { classification, extracted, unknownTechnologies: unknown },
  };
}

/**
 * Saves an insight, replacing what extraction wrote before. Validated against
 * the model first, so nothing the schema rejects is ever stored. `analytics`
 * is left alone: price and lock-spec analysis write it, and re-extracting
 * mustn't wipe their results.
 */
export async function saveInsight(insight) {
  const document = new TorInsight(insight);
  await document.validate();

  const fields = document.toObject({ flattenMaps: true });
  for (const key of ['_id', 'createdAt', 'updatedAt', 'analytics']) delete fields[key];

  await TorInsight.updateOne({ projectId: insight.projectId }, { $set: fields }, { upsert: true });
}
