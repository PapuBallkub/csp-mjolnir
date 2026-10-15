/**
 * server/src/pipeline/jobs/run-job.js
 *
 * Runs one scheduled job (ADR 0027): its steps in order, each in its own
 * process, exactly as the commands run by hand, with their own locks (ADR
 * 0016). Whatever starts the job, the local scheduler (npm run schedule),
 * cron or Cloud Scheduler, the job is the same.
 *
 *   poll     the national feed, then process
 *   sweep    every agency in egp-agencies.json, then process
 *   process  refresh comparable projects, choose past projects to read in
 *            full tonight (ADR 0028), then screen the new titles, download
 *            what passed, read it, classify it, and extract the IT ones
 *            (ADR 0018, 0026). poll and sweep process the same way, without
 *            the first two.
 *
 * Usage:
 *   npm run job -- poll
 *   npm run job -- process --until 2026-10-14T07:55:00+07:00
 *
 * One job at a time: a job that finds another running waits up to WAIT_MS
 * for it, then gives up and says so in its run record. No step starts after
 * the time box, by default 5 minutes before the next scheduled job; the steps
 * themselves stop taking new work then too. Every job leaves a PipelineRun
 * record and a log file under data/logs/.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { PipelineRun, TitleScreen, Tor, TorInsight } from '#models/index.js';
import { ROUTINE_TYPES } from '../ingestion/sources/process3.js';
import { isPastDeadline, parseUntil } from '../shared/deadline.js';
import { RunLockHeldError, withRunLock } from '../shared/run-lock.js';
import { bangkokTime, untilFor } from './schedule.js';

const PIPELINE_DIR = path.resolve(import.meta.dirname, '..');
const SERVER_DIR = path.resolve(PIPELINE_DIR, '../..');
const LOGS_DIR = process.env.LOGS_DIR || path.join(SERVER_DIR, 'data/logs');

// Each step is a command that also runs by hand (docs/pipeline.md)
export const STEPS = {
  fetch: {
    name: 'ingest fetch',
    script: 'ingestion/ingest.js',
    args: ['--step', 'fetch', '--source', 'process3', '--types', ROUTINE_TYPES.join(',')],
  },
  sweep: { name: 'ingest sweep', script: 'ingestion/ingest.js', args: ['--step', 'sweep'] },
  screen: { name: 'screen', script: 'extraction/screen.js', args: [] },
  download: { name: 'ingest download', script: 'ingestion/ingest.js', args: ['--step', 'download'] },
  ocr: { name: 'ingest ocr', script: 'ingestion/ingest.js', args: ['--step', 'ocr'] },
  extract: { name: 'extract', script: 'extraction/extract.js', args: [] },
  // Past projects to read in full tonight (ADR 0028)
  history: { name: 'ingest history', script: 'ingestion/ingest.js', args: ['--step', 'history'] },
  // Comparable projects for every full extraction (ADR 0021, 0022), the team's nightly batch
  comparisons: { name: 'comparisons', script: '../../scripts/find-comparable.js', args: ['--all', '--save'] },
};

// Screen the new titles, download what passed, preview it, classify the
// previews, read the IT ones whole, and extract them: npm run pipeline's order
const PROCESS = ['screen', 'download', 'ocr', 'extract', 'ocr', 'extract'];

export const JOBS = {
  poll: ['fetch', ...PROCESS],
  sweep: ['sweep', ...PROCESS],
  // The night: comparisons first, so a long night of OCR can't crowd them out,
  // then the past projects chosen for tonight join what's waiting (ADR 0028)
  process: ['comparisons', 'history', ...PROCESS],
};

// How long a job waits for the one before it, and how often it looks
const WAIT_MS = 20 * 60 * 1000;
const RETRY_MS = 30 * 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Runs one step as a child process, copying its output to the log and the console. */
export function runStep(step, { until, log }) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [path.join(PIPELINE_DIR, step.script), ...step.args, '--until', until.toISOString()],
      { cwd: SERVER_DIR, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    child.stdout.on('data', (chunk) => {
      log.write(chunk);
      process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      log.write(chunk);
      process.stderr.write(chunk);
    });
    child.on('error', (error) => {
      log.write(`Could not start ${step.name}: ${error.message}\n`);
      resolve(-1);
    });
    child.on('close', (code, signal) => resolve(code ?? (signal ? 128 : -1)));
  });
}

const countBy = async (model, pipeline) =>
  Object.fromEntries((await model.aggregate(pipeline)).map(({ _id, n }) => [_id ?? 'none', n]));

/** Where everything stands: projects by stage, screen verdicts, insights by state. */
export async function snapshot() {
  return {
    stages: await countBy(Tor, [{ $group: { _id: '$pipelineStatus', n: { $sum: 1 } } }]),
    screens: await countBy(TitleScreen, [
      { $group: { _id: { $cond: ['$audit', 'not_it (audited)', '$verdict'] }, n: { $sum: 1 } } },
    ]),
    insights: await countBy(TorInsight, [
      { $match: { 'metadata.origin': { $ne: 'demo' } } },
      {
        $group: {
          _id: {
            $cond: [
              { $ifNull: ['$metadata.excluded', false] },
              'excluded',
              { $cond: ['$metadata.awaitingFullText', 'awaiting full text', 'extracted'] },
            ],
          },
          n: { $sum: 1 },
        },
      },
    ]),
  };
}

/**
 * Holds the job lock while `work` runs. If another job holds it, waits for it,
 * looking again every `retryMs`, for up to `waitMs`.
 *
 * @returns {Promise<{ ran: true, value: any } | { ran: false, reason: string }>}
 */
async function withJobLock(work, { waitMs, retryMs, onWait }) {
  const giveUpAt = Date.now() + waitMs;
  for (;;) {
    try {
      return { ran: true, value: await withRunLock('job', work) };
    } catch (error) {
      if (!(error instanceof RunLockHeldError)) throw error;
      if (Date.now() + retryMs > giveUpAt) return { ran: false, reason: error.message };
      onWait(error);
      await sleep(retryMs);
    }
  }
}

/**
 * Runs a job and records it.
 *
 * @param {Function} [options.run] - runStep; replaced in tests
 * @returns {Promise<object>} The PipelineRun record
 */
export async function runJob(
  job,
  { until, startedAt = new Date(), run = runStep, logsDir = LOGS_DIR, waitMs = WAIT_MS, retryMs = RETRY_MS, now = () => new Date() } = {},
) {
  if (!JOBS[job]) throw new Error(`No job "${job}": choose ${Object.keys(JOBS).join(', ')}.`);
  const day = bangkokTime(startedAt).slice(0, 10);
  const logFile = path.join(logsDir, day, `${bangkokTime(startedAt).slice(11).replace(':', '')}-${job}.log`);
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const log = fs.createWriteStream(logFile, { flags: 'a' });
  const say = (line) => {
    log.write(`${line}\n`);
    console.log(line);
  };

  const record = await PipelineRun.create({
    job,
    host: os.hostname(),
    startedAt,
    until,
    logFile,
    steps: JOBS[job].map((key) => ({ name: STEPS[key].name })),
  });
  say(`=== ${job} · started ${bangkokTime(startedAt)} · no new work after ${bangkokTime(until)} (Bangkok time) ===`);

  try {
    const locked = await withJobLock(
      async () => {
        record.before = await snapshot();
        await record.save();
        let timedOut = false;
        for (const [index, key] of JOBS[job].entries()) {
          if (isPastDeadline(until, now())) {
            timedOut = true;
            say(`\n--- time box over: ${JOBS[job].length - index} step(s) not started ---`);
            break;
          }
          const step = STEPS[key];
          const stepStarted = new Date();
          say(`\n--- ${step.name} · ${bangkokTime(stepStarted)} ---`);
          const exitCode = await run(step, { until, log });
          Object.assign(record.steps[index], { exitCode, startedAt: stepStarted, ms: Date.now() - stepStarted.getTime() });
          await record.save();
          if (exitCode !== 0) say(`(${step.name} exited with ${exitCode}; the next steps run anyway)`);
        }
        record.after = await snapshot();
        record.outcome = timedOut ? 'timed-out' : 'done';
      },
      { waitMs, retryMs, onWait: (error) => say(`Waiting for the job before: ${error.message}`) },
    );
    if (!locked.ran) {
      record.outcome = 'skipped';
      record.error = locked.reason;
      say(`Skipped: ${locked.reason}`);
    }
  } catch (error) {
    record.outcome = 'failed';
    record.error = error.message;
    say(`The job failed: ${error.stack ?? error.message}`);
  } finally {
    record.finishedAt = new Date();
    await record.save();
    say(`=== ${job} · ${record.outcome} · finished ${bangkokTime(record.finishedAt)} · log ${logFile} ===`);
    await new Promise((resolve) => log.end(resolve));
  }
  return record;
}

async function main() {
  const [job, ...rest] = process.argv.slice(2);
  if (!JOBS[job]) {
    throw new Error(`Name a job: npm run job -- ${Object.keys(JOBS).join(' | ')} [--until <time>]`);
  }
  const index = rest.indexOf('--until');
  const startedAt = new Date();
  const until = parseUntil(index !== -1 ? rest[index + 1] : null) ?? untilFor(startedAt);

  await connectDatabase();
  try {
    const record = await runJob(job, { until, startedAt });
    if (record.outcome === 'failed') process.exitCode = 1;
  } finally {
    await disconnectDatabase();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`\nJob failed: ${error.message}`);
    process.exit(1);
  });
}
