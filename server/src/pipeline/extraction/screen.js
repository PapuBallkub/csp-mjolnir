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
 * Each verdict also names the kind of IT project the title points to, or
 * none (screen-v2, ADR 0028).
 *
 * Past projects imported from data.go.th (npm run history:import) are
 * screened only when asked for, with --past: there can be thousands, and the
 * spend is a decision. Those found IT get a title-level TorInsight record,
 * which counts in benchmarks until full extraction replaces it. Unsure ones
 * get none until their documents are read.
 *
 * Usage:
 *   npm run screen
 *   npm run screen -- --limit 40 --dry-run
 *   npm run screen -- --until 2026-10-14T07:55:00+07:00
 *   npm run screen -- --past --limit 200
 *
 * Runs under the extraction lock: it spends Gemini like extraction does.
 */

import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { TitleScreen, Tor, TorInsight } from '#models/index.js';
import { isPastDeadline, parseUntil } from '../shared/deadline.js';
import { withRunLock } from '../shared/run-lock.js';
import { WORKABLE } from '../shared/workable.js';
import { createGeminiClient, generateJson, readGeminiConfig } from './gemini.js';
import { SCREEN_INSTRUCTION, SCREEN_VERSION, buildScreenContents } from './prompts.js';
import { PROJECT_CATEGORIES, SCREEN_VERDICTS, screenSchema } from './schema.js';
import { buildTitleLevel } from './assemble.js';
import { saveInsight } from './process-tor.js';

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

// Past projects from data.go.th (ADR 0028): never workable, so they're
// screened only when asked for (--past), and only once imported
const PAST = { source: 'datago', pipelineStatus: 'fetched' };

/** What a title-level record is built from: changing any of it builds it again. */
export function titleLevelFingerprint(tor) {
  const basis = ['datago', tor.title, tor.agency, tor.subAgency, tor.budgetTHB, tor.referencePriceTHB, tor.contract ?? null];
  return crypto.createHash('sha256').update(JSON.stringify(basis)).digest('hex');
}

/**
 * Builds title-level records for past projects the screen found IT (ADR
 * 0028). An unsure one gets none: most are hardware a title can't rule out,
 * and a title-level record counts in benchmarks. It can still be chosen to be
 * read in full, after the IT ones. Never over a full extraction, or a project
 * its documents showed not IT: only where there's no record yet, or a
 * title-level one. A title-level record whose project is now screened unsure
 * or not_it is removed.
 *
 * @returns {Promise<number>} How many were saved
 */
export async function saveTitleLevel(screens, { now = new Date() } = {}) {
  if (screens.length === 0) return 0;
  const ids = screens.map((screen) => screen.projectId);
  const existing = new Map(
    (await TorInsight.find({ projectId: { $in: ids } }, { projectId: 1, metadata: 1 }).lean()).map((insight) => [insight.projectId, insight]),
  );
  const titleLevel = (projectId) => Boolean(existing.get(projectId)?.metadata?.titleOnly);

  const dropped = screens.filter((screen) => screen.verdict !== 'it' && titleLevel(screen.projectId));
  if (dropped.length) await TorInsight.deleteMany({ projectId: { $in: dropped.map((screen) => screen.projectId) }, 'metadata.titleOnly': true });

  const kept = screens.filter((screen) => screen.verdict === 'it');
  const tors = new Map((await Tor.find({ projectId: { $in: kept.map((screen) => screen.projectId) } }).lean()).map((tor) => [tor.projectId, tor]));
  let saved = 0;
  for (const screen of kept) {
    const tor = tors.get(screen.projectId);
    if (!tor || (existing.has(screen.projectId) && !titleLevel(screen.projectId))) continue;
    const run = { model: screen.modelName, promptVersion: screen.promptVersion, fingerprint: titleLevelFingerprint(tor), now };
    await saveInsight(buildTitleLevel({ tor, screen, run }));
    saved++;
  }
  return saved;
}

/**
 * Projects waiting for the screen, not screened on their current title with
 * the current prompt: new workable ones from the feed, or with `past`, the
 * past projects imported from data.go.th.
 */
export async function findUnscreened({ past = false } = {}) {
  const tors = await Tor.find(
    past ? PAST : { ...WORKABLE, pipelineStatus: 'fetched' },
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
export async function screenBatch(tors, { client, config, now = new Date(), auditRate = AUDIT_RATE, past = false }) {
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
      // None for not_it, and only one of the fixed kinds
      category: answer.verdict !== 'not_it' && PROJECT_CATEGORIES.includes(answer.category) ? answer.category : null,
      // The audit sample is for new projects, which it sends to download; a
      // past project isn't downloaded that way
      audit: !past && answer.verdict === 'not_it' && isAudited(projectId, auditRate),
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
export async function runScreen({ client, config, limit = Infinity, until = null, dryRun = false, past = false, log = console }) {
  const waiting = await findUnscreened({ past });
  const queue = waiting.slice(0, limit);
  const counts = { it: 0, not_it: 0, unsure: 0, audit: 0, missing: 0, failedBatches: 0, left: 0, titleLevel: 0, usage: [] };
  log.log(
    `${waiting.length} ${past ? 'past' : 'new'} project(s) waiting for the title screen` +
      `${queue.length < waiting.length ? `; screening ${queue.length}` : ''}.`,
  );

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
      const { screens, missing, usage } = await screenBatch(batch, { client, config, past });
      counts.usage.push(usage);
      if (!dryRun) {
        await saveScreens(screens);
        if (past) counts.titleLevel += await saveTitleLevel(screens);
      }
      failedInARow = 0;

      for (const screen of screens) {
        counts[screen.verdict]++;
        if (screen.audit) counts.audit++;
        const tag = screen.audit ? 'not_it, audited' : screen.verdict;
        log.log(`  ${screen.projectId} ${tag.padEnd(16)} ${(screen.category ?? '-').padEnd(23)} ${screen.reason} · ${screen.title.slice(0, 60)}`);
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
    past: argv.includes('--past'),
  };
}

const sum = (usages, key) => usages.reduce((total, usage) => total + (usage?.[key] ?? 0), 0);

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = readGeminiConfig();
  const client = createGeminiClient(config);
  console.log(
    `Title screen${args.past ? ' of past projects' : ''} · ${config.model} · prompt ${SCREEN_VERSION}` +
      `${args.past ? '' : ` · audit ${Math.round(AUDIT_RATE * 100)}% of not_it`}` +
      `${args.dryRun ? ' · DRY RUN (nothing saved)' : ''}\n`,
  );

  await connectDatabase();
  try {
    await withRunLock('extraction', async () => {
      const counts = await runScreen({ client, config, ...args });
      console.log(
        `\nDone: ${counts.it} it, ${counts.unsure} unsure, ${counts.not_it} not_it ` +
          (args.past ? '' : `(${counts.audit} of them audited, so downloaded anyway)`) +
          (counts.titleLevel ? `; ${counts.titleLevel} title-level record(s) saved` : '') +
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
