/**
 * server/scripts/check-gemini.js
 *
 * Checks the Gemini setup end to end before any extraction runs: your gcloud
 * login, the project, the region and the model. It sends one tiny request
 * (a fraction of a baht), then counts the tokens in a real TOR's text. Counting
 * is free, and tells you what one extraction will read.
 *
 *   npm run gemini:check
 *   npm run gemini:check -- --id 67079184063
 */

import { pathToFileURL } from 'node:url';
import { Type } from '@google/genai';
import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { Tor } from '#models/index.js';
import {
  countTokens,
  createGeminiClient,
  generateJson,
  readGeminiConfig,
} from '#pipeline/extraction/index.js';

function argValue(name) {
  const argv = process.argv.slice(2);
  const index = argv.indexOf(name);
  return index !== -1 ? argv[index + 1] : null;
}

async function main() {
  const config = readGeminiConfig();
  const client = createGeminiClient(config);
  console.log(`Project ${config.project} · region ${config.location} · model ${config.model}\n`);

  // 1. One tiny structured request: proves login, permission, region and model.
  const started = Date.now();
  const { data, usage } = await generateJson({
    client,
    model: config.model,
    contents: 'ตอบคำว่า OK',
    responseSchema: {
      type: Type.OBJECT,
      properties: { reply: { type: Type.STRING } },
      required: ['reply'],
    },
  });
  console.log(`1. Test request: ${JSON.stringify(data)} in ${Date.now() - started} ms`);
  console.log(
    `   tokens: input ${usage.promptTokenCount ?? '?'}, output ${usage.candidatesTokenCount ?? '?'}, ` +
      `thinking ${usage.thoughtsTokenCount ?? 0}\n`,
  );

  // 2. Count (free) the tokens in a real TOR: the longest one, unless --id.
  await connectDatabase();
  try {
    const id = argValue('--id');
    const [tor] = id
      ? await Tor.find({ projectId: id }).lean()
      : await Tor.aggregate([
          { $match: { pipelineStatus: 'ocr_done' } },
          { $addFields: { length: { $strLenCP: { $ifNull: ['$ocr.rawText', ''] } } } },
          { $sort: { length: -1 } },
          { $limit: 1 },
        ]);

    if (!tor?.ocr?.rawText) {
      console.log('2. No TOR text to count yet. Run `npm run ingest` first.');
      return;
    }

    const chars = tor.ocr.rawText.length;
    const tokens = await countTokens({ client, model: config.model, contents: tor.ocr.rawText });
    console.log(`2. TOR ${tor.projectId}: ${tor.document?.pages ?? '?'} pages, ${chars.toLocaleString()} characters`);
    console.log(
      `   = ${tokens.toLocaleString()} input tokens (${(chars / tokens).toFixed(2)} characters per token)`,
    );
  } finally {
    await disconnectDatabase();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`\nGemini check failed: ${error.message}`);
    process.exit(1);
  });
}
