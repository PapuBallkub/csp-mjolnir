/**
 * server/src/pipeline/extraction/index.js
 *
 * Public surface of the AI extraction pipeline (per ADR 0003 Rule 2).
 */

export {
  GeminiResponseError,
  countTokens,
  createGeminiClient,
  generateJson,
  isRetryable,
  readGeminiConfig,
} from './gemini.js';
export { PROJECT_CATEGORIES, classifySchema, extractSchema } from './schema.js';
export { processTor, saveInsight } from './process-tor.js';
export { decide, sourceFingerprint } from './select.js';
export { confidenceScore, runChecks } from './checks.js';
export { resolveTechnologies } from './vocabulary.js';
export {
  CLASSIFY_CHARS,
  CLASSIFY_INSTRUCTION,
  EXTRACT_INSTRUCTION,
  PROMPT_VERSION,
  buildClassifyContents,
  buildExtractContents,
} from './prompts.js';
