/**
 * server/src/pipeline/extraction/gemini.js
 *
 * The only module that talks to Gemini (ADR 0013). Everything else in
 * extraction goes through these functions, and every one of them takes the
 * client as a parameter, so tests pass a fake one: `npm test` never reaches
 * Google Cloud and never costs anything.
 */

import { GoogleGenAI } from '@google/genai';

const DEFAULT_LOCATION = 'global';
const MAX_ATTEMPTS = 4; // the first try plus three retries
const BASE_DELAY_MS = 2000; // 2 s, then 4 s, then 8 s
const REQUEST_TIMEOUT_MS = 5 * 60 * 1000; // a 150-page TOR is a long read

/** A response we cannot use, even though the request itself succeeded. */
export class GeminiResponseError extends Error {
  constructor(message, { finishReason = null } = {}) {
    super(message);
    this.name = 'GeminiResponseError';
    this.finishReason = finishReason;
  }
}

/**
 * Reads the Gemini settings from the environment. Optional for the web server,
 * required for extraction, so it is checked here rather than in env.js.
 */
export function readGeminiConfig(env = process.env) {
  const missing = ['GOOGLE_CLOUD_PROJECT', 'GEMINI_MODEL'].filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(
      `Missing ${missing.join(' and ')} in server/.env. ` +
        'See "AI extraction" in docs/pipeline.md for the setup.',
    );
  }
  return {
    project: env.GOOGLE_CLOUD_PROJECT,
    location: env.GOOGLE_CLOUD_LOCATION || DEFAULT_LOCATION,
    model: env.GEMINI_MODEL,
  };
}

/**
 * Credentials come from Application Default Credentials: your
 * `gcloud auth application-default login` locally, the attached service
 * account in production. There is no API key, by design.
 */
export function createGeminiClient({ project, location }) {
  return new GoogleGenAI({ enterprise: true, project, location });
}

/**
 * Rate limits (429) and server errors (5xx) are worth waiting out. Anything
 * else, such as a bad request or a missing permission, fails the same way
 * every time, so retrying only wastes time.
 */
export function isRetryable(error) {
  const status = error?.status;
  return status === 429 || (Number.isInteger(status) && status >= 500 && status < 600);
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sends one request and returns the response as parsed JSON, shaped by
 * `responseSchema`. Temperature 0: the same TOR should give the same answer.
 *
 * Throws GeminiResponseError when the answer is unusable, such as when it was
 * cut off at the output limit. Nothing partial is ever returned (R4).
 *
 * @returns {Promise<{ data: object, usage: object, finishReason: string }>}
 */
export async function generateJson({
  client,
  model,
  systemInstruction,
  contents,
  responseSchema,
  sleep = defaultSleep,
}) {
  for (let attempt = 1; ; attempt++) {
    let response;
    try {
      response = await client.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction,
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema,
          // The SDK can retry on its own (5 attempts by default). Switched off,
          // so this loop is the one retry policy: otherwise 5 inside 4 would
          // allow 20 requests for a single TOR.
          httpOptions: { timeout: REQUEST_TIMEOUT_MS, retryOptions: { attempts: 1 } },
        },
      });
    } catch (error) {
      if (attempt >= MAX_ATTEMPTS || !isRetryable(error)) throw error;
      await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
      continue;
    }

    const finishReason = response.candidates?.[0]?.finishReason ?? null;
    if (finishReason !== 'STOP') {
      throw new GeminiResponseError(
        `Gemini stopped early (${finishReason ?? 'no finish reason'}); the response is not saved.`,
        { finishReason },
      );
    }

    let data;
    try {
      data = JSON.parse(response.text);
    } catch {
      throw new GeminiResponseError('Gemini returned text that is not valid JSON.', { finishReason });
    }
    return { data, usage: response.usageMetadata ?? {}, finishReason };
  }
}

/**
 * Counts the tokens a request would use, without running it. Free, so it is
 * the way to see what a TOR will cost before extracting it.
 */
export async function countTokens({ client, model, contents }) {
  const response = await client.models.countTokens({ model, contents });
  return response.totalTokens;
}
