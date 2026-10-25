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
import { isFullExtraction } from '#features/reality-check/index.js';
import { completeChange } from '../shared/amendments.js';
import { keepVersion, nextVersion, reasonFor } from '../shared/insight-versions.js';
import { buildAwaitingFullText, buildExcluded, buildInsight } from './assemble.js';
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
import { biddingTextOf, textsOf } from './documents.js';
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
  // A preview is part of the document by design: extracting from it would
  // leave out whatever sits on the pages nobody read (ADR 0018)
  if (tor.ocr.preview) throw new Error('Only a preview has been read; extraction waits for the full text.');

  const usage = [];
  return keepingUsage(usage, async () => {
    // 1. Classify: a small call on the first pages decides whether to go on (D8)
    const classify = await classifyText(tor, { client, config });
    usage.push(classify.usage);
    if (!classify.data.isIT) return { classification: classify.data, extracted: null, usage };

    const ask = (systemInstruction, contents, responseSchema, extra = {}) =>
      generateJson({ client, model: config.model, systemInstruction, contents, responseSchema, thinkingLevel: THINKING_LEVEL, ...extra });

    // 2. Extract: the TOR and its bidding document (ADR 0025), the feed deliberately left out
    const contents = buildExtractContents({ rawText, biddingText: biddingTextOf(tor) });
    const extract = await ask(EXTRACT_INSTRUCTION, contents, extractSchema, {
      maxOutputTokens: EXTRACT_MAX_OUTPUT_TOKENS,
    });
    usage.push(extract.usage);
    return { classification: classify.data, extracted: extract.data, usage };
  });
}

/**
 * Runs work that calls Gemini, and if it fails, hands the error on with the
 * tokens already spent (`error.usage`): a call that answered costs money even
 * when what follows it fails, and the run's token count must say so. An
 * unusable answer carries its own usage (GeminiResponseError).
 */
async function keepingUsage(usage, work) {
  try {
    return await work();
  } catch (error) {
    const spent = [...usage];
    if (error?.usage && !Array.isArray(error.usage)) spent.push(error.usage);
    else if (Array.isArray(error?.usage)) spent.push(...error.usage.filter((item) => !spent.includes(item)));
    if (error && typeof error === 'object') error.usage = spent;
    throw error;
  }
}

/** The classify call alone: the title and the first pages (D8). */
function classifyText(tor, { client, config }) {
  return generateJson({
    client,
    model: config.model,
    systemInstruction: CLASSIFY_INSTRUCTION,
    contents: buildClassifyContents({ title: tor.title, rawText: tor.ocr.rawText }),
    responseSchema: classifySchema,
    thinkingLevel: THINKING_LEVEL,
  });
}

/**
 * Classifies a preview, the first pages of a scan (ADR 0018). Not IT: the
 * record is excluded and the TOR stops here. IT: the record waits for the
 * full text, which ingestion reads next; extraction then runs on it.
 *
 * @returns {Promise<{ insight: object, review: object, usage: object[] }>}
 */
export async function classifyPreview(tor, { client, config, now = new Date() }) {
  if (!tor.ocr?.rawText) throw new Error('No OCR text yet; run ingest:ocr first.');
  if (!tor.ocr.preview) throw new Error('This TOR has its full text; extract it instead.');

  const usage = [];
  return keepingUsage(usage, async () => {
    const classify = await classifyText(tor, { client, config });
    usage.push(classify.usage);
    const run = { model: config.model, promptVersion: PROMPT_VERSION, fingerprint: sourceFingerprint(tor), now };
    const classification = classify.data;
    const insight = classification.isIT
      ? buildAwaitingFullText({ tor, classification, run })
      : buildExcluded({ tor, classification, run });
    return { insight, review: { classification, extracted: null, unknownTechnologies: [], preview: true }, usage };
  });
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
  // Building can still fail after Gemini answered: its tokens are counted then too
  return keepingUsage(answers.usage, async () => {
    // An extraction read the bidding document too; an excluded record, the TOR alone
    const fingerprint = sourceFingerprint(tor, { bidding: Boolean(answers.extracted) });
    const run = { model: config.model, promptVersion: PROMPT_VERSION, fingerprint, now };
    const built = await buildFromAnswers(tor, answers, { run, ...options });
    return { ...built, usage: answers.usage };
  });
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

  // 3. Check, and keep only list items whose quote is really in the documents (R5)
  const checkResult = runChecks({ tor, classification, extracted });
  const [technologyItems, certificationItems, authorizationItems] = QUOTED_LISTS.map(
    (list) => keepGroundedItems(at(extracted, list), textsOf(tor)).kept,
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
 *
 * The summary it replaces is kept as a version first (ADR 0031), and the new
 * one is numbered after it. `reason` says why, when the caller knows better
 * than what the two were built from (extract --recheck: 'rebuilt').
 */
export async function saveInsight(insight, { reason } = {}) {
  const current = await TorInsight.findOne({ projectId: insight.projectId }).lean();
  const why = current ? (reason ?? reasonFor(current, insight)) : null;
  if (current) await keepVersion(insight.projectId, { reason: why, current });
  const document = new TorInsight({
    ...insight,
    metadata: { ...insight.metadata, version: await nextVersion(insight.projectId) },
  });
  await document.validate();

  const fields = document.toObject({ flattenMaps: true });
  for (const key of ['_id', 'createdAt', 'updatedAt', 'analytics']) delete fields[key];

  await TorInsight.updateOne({ projectId: insight.projectId }, { $set: fields }, { upsert: true });

  // A summary made again because its TOR changed completes that change's
  // record with what the summary itself says now (ADR 0032). A prompt update
  // isn't the agency's change, so it adds nothing there.
  if (why === 'source-changed' && isFullExtraction(current) && isFullExtraction(insight)) {
    await completeChange(insight.projectId, current.metadata?.version ?? 1, current, insight);
  }
}
