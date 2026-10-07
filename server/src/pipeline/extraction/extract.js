/**
 * server/src/pipeline/extraction/extract.js
 *
 * The extraction command: reads each TOR at ocr_done with Gemini and saves a
 * TorInsight. What it processes follows the rules in select.js (D10).
 *
 *   npm run extract                       new TORs and changed sources
 *   npm run extract -- --id 68049205582   one TOR, whatever its state
 *   npm run extract -- --limit 3          at most 3 this run
 *   npm run extract -- --dry-run          save nothing; write review files only
 *   npm run extract -- --outdated         also redo results from an older prompt
 *   npm run extract -- --force            redo everything, reviewed results too
 *   npm run extract -- --recheck          rebuild from the saved answers: no Gemini
 *                                         call, for when the checks or assembly change
 *   npm run extract -- --retry-failed     also try the TORs that gave up after
 *                                         repeated failures
 *
 * Every TOR also gets a review file, server/data/extractions/<projectId>.json,
 * holding the model's own answers with their quotes and pages (D11).
 *
 * One extraction run at a time: a second one exits without doing anything
 * (ADR 0016).
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { Technology, Tor, TorInsight } from '#models/index.js';
import { MAX_ATTEMPTS, clearFailure, loadGivenUp, recordFailure } from '../shared/failures.js';
import { withRunLock } from '../shared/run-lock.js';
import { createGeminiClient, readGeminiConfig } from './gemini.js';
import { buildFromAnswers, classifyPreview, processTor, saveInsight } from './process-tor.js';
import { PROMPT_VERSION } from './prompts.js';
import { decide, sourceFingerprint } from './select.js';

const REVIEW_DIR =
  process.env.EXTRACTIONS_DIR || path.resolve(import.meta.dirname, '../../../data/extractions');

function parseArgs(argv) {
  const value = (name) => {
    const index = argv.indexOf(name);
    return index !== -1 ? argv[index + 1] : null;
  };
  const limit = Number.parseInt(value('--limit') ?? '', 10);
  return {
    id: value('--id'),
    limit: Number.isInteger(limit) && limit > 0 ? limit : Infinity,
    dryRun: argv.includes('--dry-run'),
    force: argv.includes('--force'),
    outdated: argv.includes('--outdated'),
    recheck: argv.includes('--recheck'),
    retryFailed: argv.includes('--retry-failed'),
  };
}

const reviewPath = (projectId) => path.join(REVIEW_DIR, `${projectId}.json`);

// What an extraction works from. A failure counts only against the same
// source, prompt and model: change any of them and the TOR gets new tries.
const inputKeyOf = (fingerprint, model) => `${fingerprint}|${PROMPT_VERSION}|${model}`;

/**
 * Rebuilds records from the answers saved in the review files: the checks and
 * the assembly run again, Gemini isn't asked. Answers made from a source that
 * has changed since are refused: they describe a different document.
 */
async function recheck(tors, existing, args) {
  const counts = { rebuilt: 0, noAnswers: 0, sourceChanged: 0, reviewed: 0, failed: 0 };
  for (const tor of tors) {
    const label = `${tor.projectId} (recheck)`;
    let saved;
    try {
      saved = JSON.parse(await fs.readFile(reviewPath(tor.projectId), 'utf8'));
    } catch {
      counts.noAnswers++;
      continue;
    }
    const before = saved.insight.metadata;
    if (before.sourceFingerprint !== sourceFingerprint(tor)) {
      counts.sourceChanged++;
      console.log(`${label}: the source changed since these answers; run without --recheck`);
      continue;
    }
    const reviewStatus = existing.get(tor.projectId)?.metadata?.reviewStatus ?? 'pending';
    if (reviewStatus !== 'pending' && !args.force) {
      counts.reviewed++;
      continue;
    }

    try {
      const run = {
        model: before.modelName,
        promptVersion: before.promptVersion, // the answers' version, not today's
        fingerprint: before.sourceFingerprint,
        now: new Date(),
      };
      const { insight, review } = await buildFromAnswers(tor, saved, { run, dryRun: args.dryRun });
      await fs.writeFile(reviewPath(tor.projectId), JSON.stringify({ insight, ...review }, null, 2));
      if (!args.dryRun) await saveInsight(insight);
      counts.rebuilt++;
      const { confidenceScore, checks, excluded } = insight.metadata;
      console.log(
        excluded
          ? `${label}: excluded`
          : `${label}: score ${before.confidenceScore} → ${confidenceScore}` +
              (checks.length ? ` · ${checks.map((c) => `${c.check} ${c.field ?? ''}`.trim()).join(', ')}` : ''),
      );
    } catch (error) {
      counts.failed++;
      console.error(`${label}: FAILED, nothing saved · ${error.message}`);
    }
  }
  console.log(
    `\nRechecked ${counts.rebuilt}; skipped ${counts.noAnswers} with no saved answers, ` +
      `${counts.sourceChanged} with a changed source, ${counts.reviewed} reviewed by a person; ${counts.failed} failed`,
  );
}

const sum = (usages, key) => usages.reduce((total, usage) => total + (usage?.[key] ?? 0), 0);

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = readGeminiConfig();
  const client = createGeminiClient(config);
  console.log(
    `Extraction · ${config.model} · prompt ${PROMPT_VERSION}${args.dryRun ? ' · DRY RUN (nothing saved)' : ''}\n`,
  );

  await connectDatabase();
  try {
    await withRunLock('extraction', () => run(args, { client, config }));
  } finally {
    await disconnectDatabase();
  }
}

async function run(args, { client, config }) {
  if ((await Technology.countDocuments({ status: 'confirmed' })) === 0) {
    console.warn('The technology vocabulary is empty: run `npm run technologies:seed` first.\n');
  }

  const tors = args.id
    ? await Tor.find({ projectId: args.id }).lean()
    : await Tor.find({ pipelineStatus: { $in: ['ocr_preview', 'ocr_done'] } }).sort({ updatedAt: 1 }).lean();
  if (args.id && !['ocr_preview', 'ocr_done'].includes(tors[0]?.pipelineStatus)) {
    throw new Error(`TOR ${args.id} has no OCR text yet; run \`npm run ingest:ocr -- --id ${args.id}\` first.`);
  }

  const existing = new Map(
    (await TorInsight.find({ projectId: { $in: tors.map((t) => t.projectId) } }, { projectId: 1, metadata: 1 }).lean())
      .map((insight) => [insight.projectId, insight]),
  );
  // Saved answers from a preview hold no extraction to rebuild from
  if (args.recheck) return await recheck(tors.filter((tor) => tor.pipelineStatus === 'ocr_done'), existing, args);

  // A TOR that keeps failing after Gemini answered would be paid for on every run
  const gaveUp = args.id || args.retryFailed ? () => false : await loadGivenUp('extract');

  const skipped = { current: 0, outdated: 0, reviewed: 0, gaveUp: 0 };
  const queue = [];
  for (const tor of tors) {
    const fingerprint = sourceFingerprint(tor);
    const decision = decide({
      insight: existing.get(tor.projectId) ?? null,
      fingerprint,
      promptVersion: PROMPT_VERSION,
      model: config.model,
      flags: { force: args.force, outdated: args.outdated, id: Boolean(args.id) },
    });
    const inputKey = inputKeyOf(fingerprint, config.model);
    if (decision.action === 'skip') skipped[decision.reason]++;
    else if (gaveUp(tor.projectId, inputKey)) skipped.gaveUp++;
    else queue.push({ tor, decision, inputKey });
  }

  await fs.mkdir(REVIEW_DIR, { recursive: true });
  const counts = { saved: 0, excluded: 0, awaiting: 0, failed: 0 };
  const usages = [];

  for (const [index, { tor, decision, inputKey }] of queue.slice(0, args.limit).entries()) {
    const label = `[${index + 1}/${Math.min(queue.length, args.limit)}] ${tor.projectId} (${decision.reason})`;
    if (decision.warn) console.warn(`${label}: a person had reviewed this result; it goes back to pending.`);
    try {
      const started = Date.now();
      // A preview is only classified; its full text is read next, then extracted (ADR 0018)
      const { insight, review, usage } =
        tor.pipelineStatus === 'ocr_preview'
          ? await classifyPreview(tor, { client, config })
          : await processTor(tor, { client, config, dryRun: args.dryRun });
      usages.push(...usage);

      await fs.writeFile(reviewPath(tor.projectId), JSON.stringify({ insight, ...review }, null, 2));
      if (!args.dryRun) {
        await saveInsight(insight);
        await clearFailure({ projectId: tor.projectId, step: 'extract' });
      }

      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      if (insight.metadata.excluded) {
        counts.excluded++;
        console.log(`${label}: not IT, kept as excluded · ${insight.metadata.excluded.reason} · ${seconds} s`);
      } else if (insight.metadata.awaitingFullText) {
        counts.awaiting++;
        console.log(`${label}: IT from its preview; waiting for the full text · ${review.classification.reason} · ${seconds} s`);
      } else {
        counts.saved++;
        const { confidenceScore, checks } = insight.metadata;
        const failed = checks.map((c) => `${c.check}${c.field ? ` ${c.field}` : ''}`).join(', ');
        console.log(
          `${label}: score ${confidenceScore}` +
            (checks.length ? ` · ${checks.length} failed check(s): ${failed}` : ' · all checks passed') +
            ` · ${seconds} s`,
        );
        if (review.unknownTechnologies.length) {
          console.log(`    new technologies for review: ${review.unknownTechnologies.join(', ')}`);
        }
      }
    } catch (error) {
      // Nothing was saved for this TOR; the next run picks it up again (NFR-06),
      // until it has failed MAX_ATTEMPTS times on the same input
      counts.failed++;
      let note = '';
      if (!args.dryRun) {
        const failure = await recordFailure({ projectId: tor.projectId, step: 'extract', error, inputKey });
        note = !failure.counted
          ? ' · Gemini did not answer; not counted as an attempt'
          : ` · attempt ${failure.attempts} of ${MAX_ATTEMPTS}` +
            (failure.gaveUp ? '; skipped from now on until --retry-failed' : '');
      }
      console.error(`${label}: FAILED, nothing saved · ${error.message}${note}`);
    }
  }

  const leftOver = Math.max(0, queue.length - args.limit);
  console.log(
    `\nDone: ${counts.saved} extracted, ${counts.excluded} excluded, ` +
      `${counts.awaiting} IT preview(s) waiting for their full text, ${counts.failed} failed` +
      (leftOver ? `, ${leftOver} left for the next run (--limit)` : ''),
  );
  console.log(
    `Skipped: ${skipped.current} up to date, ${skipped.outdated} on an older prompt (run with --outdated), ` +
      `${skipped.reviewed} reviewed by a person` +
      (skipped.gaveUp
        ? `, ${skipped.gaveUp} after ${MAX_ATTEMPTS} failed attempts (run with --retry-failed)`
        : ''),
  );
  console.log(`Tokens: ${sum(usages, 'promptTokenCount')} in, ${sum(usages, 'candidatesTokenCount')} out, ` +
    `${sum(usages, 'thoughtsTokenCount')} thinking`);
  console.log(`Review files: ${REVIEW_DIR}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`\nExtraction failed: ${error.message}`);
    process.exit(1);
  });
}
