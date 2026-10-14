/**
 * server/src/pipeline/extraction/screen.js
 *
 * The title screen (ADR 0026). Before anything is downloaded, Gemini reads
 * the titles of new projects, a batch at a time, and sorts them into it,
 * not_it and unsure. Only not_it stops a project here; the rest are
 * downloaded and classified from their documents, as before (ADR 0018).
 *
 * A tenth of the not_it projects, chosen by their ID, go the whole way
 * anyway. Their classify results show what the screen gets wrong, which keeps
 * the team's question answerable: how many IT TORs have titles that don't
 * look it.
 *
 * Usage:
 *   npm run screen
 *   npm run screen -- --limit 40 --dry-run
 *   npm run screen -- --until 2026-10-14T07:55:00+07:00
 *
 * Runs under the extraction lock: it spends Gemini like extraction does.
 */

import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { TitleScreen, Tor } from '#models/index.js';
import { isPastDeadline, parseUntil } from '../shared/deadline.js';
import { withRunLock } from '../shared/run-lock.js';
import { WORKABLE } from '../shared/workable.js';
import { createGeminiClient, generateJson, readGeminiConfig } from './gemini.js';
import { SCREEN_INSTRUCTION, SCREEN_VERSION, buildScreenContents } from './prompts.js';
import { SCREEN_VERDICTS, screenSchema } from './schema.js';

// About 40 short lines: small enough that Gemini answers every one, big
// enough that a thousand titles take 25 calls, not a thousand
export const BATCH_SIZE = 40;

// The share of not_it projects that go the whole way anyway
const parsedRate = Number.parseFloat(process.env.SCREEN_AUDIT_RATE ?? '');
export const AUDIT_RATE = parsedRate >= 0 && parsedRate <= 1 ? parsedRate : 0.1;

// As in process-tor.js: the lowest level the model accepts
const THINKING_LEVEL = 'LOW';

// Gemini down for two batches in a row: the rest would fail the same way
const MAX_FAILED_BATCHES_IN_A_ROW = 2;

/**
 * Whether a not_it project is in the audit sample. Fixed by its ID, so
 * screening it again never re-rolls the choice.
 */
export function isAudited(projectId, rate = AUDIT_RATE) {
  const hash = crypto.createHash('sha256').update(String(projectId)).digest();
  return hash.readUInt32BE(0) / 0x1_0000_0000 < rate;
}

/**
 * New projects waiting for the screen: workable, not downloaded yet, and not
 * screened on their current title with the current prompt.
 */
export async function findUnscreened() {
  const tors = await Tor.find(
    { ...WORKABLE, pipelineStatus: 'fetched' },
    { projectId: 1, title: 1, procurementMethod: 1 },
  )
    .sort({ createdAt: 1, _id: 1 }) // oldest first, in a fixed order
    .lean();
  const screens = new Map(
    (await TitleScreen.find({ projectId: { $in: tors.map((tor) => tor.projectId) } }, { projectId: 1, title: 1, promptVersion: 1 }).lean())
      .map((screen) => [screen.projectId, screen]),
  );
  return tors.filter((tor) => {
    const screen = screens.get(tor.projectId);
    return !screen || screen.title !== tor.title || screen.promptVersion !== SCREEN_VERSION;
  });
}

/**
 * Screens one batch with one Gemini call. A project Gemini leaves out, or
 * answers for twice, gets no verdict now and is screened again next run.
 *
 * @returns {Promise<{ screens: object[], missing: string[], usage: object }>}
 */
export async function screenBatch(tors, { client, config, now = new Date(), auditRate = AUDIT_RATE }) {
  const { data, usage } = await generateJson({
    client,
    model: config.model,
    systemInstruction: SCREEN_INSTRUCTION,
    contents: buildScreenContents(tors),
    responseSchema: screenSchema,
    thinkingLevel: THINKING_LEVEL,
  });

  const given = new Map(tors.map((tor) => [tor.projectId, tor]));
  const answers = new Map();
  const twice = new Set();
  for (const answer of data?.results ?? []) {
    const projectId = String(answer?.projectId ?? '').trim();
    if (!given.has(projectId) || !SCREEN_VERDICTS.includes(answer.verdict)) continue;
    if (answers.has(projectId)) twice.add(projectId);
    answers.set(projectId, answer);
  }

  const screens = [];
  for (const [projectId, answer] of answers) {
    if (twice.has(projectId)) continue;
    screens.push({
      projectId,
      title: given.get(projectId).title,
      verdict: answer.verdict,
      reason: String(answer.reason ?? '').trim(),
      audit: answer.verdict === 'not_it' && isAudited(projectId, auditRate),
      modelName: config.model,
      promptVersion: SCREEN_VERSION,
      screenedAt: now,
    });
  }
  const done = new Set(screens.map((screen) => screen.projectId));
  return { screens, missing: tors.map((tor) => tor.projectId).filter((id) => !done.has(id)), usage };
}

/** Saves verdicts, replacing an older one for the same project. */
export async function saveScreens(screens) {
  if (screens.length === 0) return;
  await TitleScreen.bulkWrite(
    screens.map((screen) => ({
      replaceOne: { filter: { projectId: screen.projectId }, replacement: screen, upsert: true },
    })),
  );
}

/**
 * Screens every project waiting, a batch at a time, until done or the time
 * box is over.
 *
 * @returns {Promise<{ it: number, not_it: number, unsure: number, audit: number, missing: number,
 *   failedBatches: number, left: number, usage: object[] }>}
 */
export async function runScreen({ client, config, limit = Infinity, until = null, dryRun = false, log = console }) {
  const waiting = await findUnscreened();
  const queue = waiting.slice(0, limit);
  const counts = { it: 0, not_it: 0, unsure: 0, audit: 0, missing: 0, failedBatches: 0, left: 0, usage: [] };
  log.log(`${waiting.length} new project(s) waiting for the title screen${queue.length < waiting.length ? `; screening ${queue.length}` : ''}.`);

  let failedInARow = 0;
  for (let start = 0; start < queue.length; start += BATCH_SIZE) {
    if (isPastDeadline(until)) {
      counts.left = queue.length - start;
      log.log(`Time box over: ${counts.left} project(s) left for the next run.`);
      break;
    }
    const batch = queue.slice(start, start + BATCH_SIZE);
    const label = `[${start + 1}–${start + batch.length}/${queue.length}]`;
    try {
      const { screens, missing, usage } = await screenBatch(batch, { client, config });
      counts.usage.push(usage);
      if (!dryRun) await saveScreens(screens);
      failedInARow = 0;

      for (const screen of screens) {
        counts[screen.verdict]++;
        if (screen.audit) counts.audit++;
        const tag = screen.audit ? 'not_it, audited' : screen.verdict;
        log.log(`  ${screen.projectId} ${tag.padEnd(16)} ${screen.reason} · ${screen.title.slice(0, 70)}`);
      }
      counts.missing += missing.length;
      const note = missing.length ? `; ${missing.length} unanswered, screened again next run` : '';
      log.log(`${label} ${screens.length} screened${note}`);
    } catch (error) {
      counts.failedBatches++;
      if (Array.isArray(error?.usage)) counts.usage.push(...error.usage);
      else if (error?.usage) counts.usage.push(error.usage);
      log.error(`${label} FAILED, screened again next run · ${error.message}`);
      if (++failedInARow >= MAX_FAILED_BATCHES_IN_A_ROW) {
        counts.left = queue.length - start - batch.length;
        log.error(`Gemini failed ${failedInARow} batches in a row: stopped. ${counts.left} project(s) left for the next run.`);
        break;
      }
    }
  }
  return counts;
}

function parseArgs(argv) {
  const value = (name) => {
    const index = argv.indexOf(name);
    return index !== -1 ? argv[index + 1] : null;
  };
  const limit = Number.parseInt(value('--limit') ?? '', 10);
  return {
    limit: Number.isInteger(limit) && limit > 0 ? limit : Infinity,
    until: parseUntil(value('--until')),
    dryRun: argv.includes('--dry-run'),
  };
}

const sum = (usages, key) => usages.reduce((total, usage) => total + (usage?.[key] ?? 0), 0);

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = readGeminiConfig();
  const client = createGeminiClient(config);
  console.log(
    `Title screen · ${config.model} · prompt ${SCREEN_VERSION} · audit ${Math.round(AUDIT_RATE * 100)}% of not_it` +
      `${args.dryRun ? ' · DRY RUN (nothing saved)' : ''}\n`,
  );

  await connectDatabase();
  try {
    await withRunLock('extraction', async () => {
      const counts = await runScreen({ client, config, ...args });
      console.log(
        `\nDone: ${counts.it} it, ${counts.unsure} unsure, ${counts.not_it} not_it ` +
          `(${counts.audit} of them audited, so downloaded anyway)` +
          (counts.missing ? `, ${counts.missing} unanswered` : '') +
          (counts.failedBatches ? `, ${counts.failedBatches} batch(es) failed` : ''),
      );
      console.log(`Tokens: ${sum(counts.usage, 'promptTokenCount')} in, ${sum(counts.usage, 'candidatesTokenCount')} out, ` +
        `${sum(counts.usage, 'thoughtsTokenCount')} thinking`);
    });
  } finally {
    await disconnectDatabase();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`\nTitle screen failed: ${error.message}`);
    process.exit(1);
  });
}
