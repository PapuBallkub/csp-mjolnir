import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';

import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { PipelineLock, PipelineRun, TitleScreen, Tor } from '#models/index.js';
import { JOBS, STEPS, runJob, snapshot } from '#pipeline/jobs/run-job.js';
import { acquireRunLock } from '#pipeline/shared/run-lock.js';

const TEST_DB = 'mjolnir_test_jobs';
let logsDir;

/** Stands in for the child processes: records each step, and answers with the codes given. */
function fakeSteps(exitCodes = {}, { stepMs = 0 } = {}) {
  const ran = [];
  const run = async (step, { until }) => {
    ran.push({ name: step.name, until });
    if (stepMs) await new Promise((resolve) => setTimeout(resolve, stepMs));
    return exitCodes[step.name] ?? 0;
  };
  return { run, ran };
}

before(async () => {
  await connectDatabase({ dbName: TEST_DB });
  logsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gipdp-jobs-'));
});

beforeEach(async () => {
  await Promise.all([PipelineRun.deleteMany({}), PipelineLock.deleteMany({}), Tor.deleteMany({}), TitleScreen.deleteMany({})]);
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDatabase();
  await fs.rm(logsDir, { recursive: true, force: true });
});

const later = (ms) => new Date(Date.now() + ms);

test('JOBS: every job processes in the same order, screen before download', () => {
  assert.deepEqual(JOBS.process, ['screen', 'download', 'ocr', 'extract', 'ocr', 'extract']);
  assert.deepEqual(JOBS.poll, ['fetch', ...JOBS.process]);
  assert.deepEqual(JOBS.sweep, ['sweep', ...JOBS.process]);
  assert.ok(!STEPS.fetch.args.join(' ').includes('15'), 'the poll leaves out 15, which always times out');
});

test('runJob: runs the steps in order with the time box, and records them', async () => {
  const until = later(60_000);
  const { run, ran } = fakeSteps({ screen: 1 });

  const record = await runJob('poll', { until, run, logsDir });

  assert.deepEqual(ran.map((step) => step.name), JOBS.poll.map((key) => STEPS[key].name));
  assert.ok(ran.every((step) => step.until === until));
  assert.equal(record.outcome, 'done', 'a step that failed does not stop the job');
  const saved = await PipelineRun.findById(record._id).lean();
  assert.equal(saved.steps.length, JOBS.poll.length);
  assert.equal(saved.steps.find((step) => step.name === 'screen').exitCode, 1);
  assert.ok(saved.steps.every((step) => step.startedAt));
  assert.ok(saved.before && saved.after);
  assert.ok(saved.finishedAt);
  assert.match(await fs.readFile(saved.logFile, 'utf8'), /=== poll · done/);
});

test('runJob: no step starts once the time box is over', async () => {
  // A clock the first step moves past the time box
  const until = new Date('2026-10-14T07:55:00+07:00');
  let clock = new Date('2026-10-14T07:00:00+07:00');
  const { run: recordStep, ran } = fakeSteps();
  const run = async (step, options) => {
    clock = new Date('2026-10-14T08:10:00+07:00');
    return recordStep(step, options);
  };

  const record = await runJob('process', { until, run, logsDir, now: () => clock });

  assert.equal(ran.length, 1, 'only the step started in time ran');
  assert.equal(record.outcome, 'timed-out');
  const saved = await PipelineRun.findById(record._id).lean();
  assert.equal(saved.steps[0].exitCode, 0);
  assert.ok(saved.steps.slice(1).every((step) => step.exitCode === null));
});

test('runJob: waits for a job already running, then gives up and says so', async () => {
  const other = await acquireRunLock('job');
  const { run, ran } = fakeSteps();

  const record = await runJob('process', { until: later(60_000), run, logsDir, waitMs: 60, retryMs: 20 });

  assert.equal(ran.length, 0);
  assert.equal(record.outcome, 'skipped');
  assert.match(record.error, /Another job run is in progress/);
  await other.release();

  const next = await runJob('process', { until: later(60_000), run, logsDir });
  assert.equal(next.outcome, 'done', 'the lock is free again afterwards');
  assert.equal(await PipelineLock.countDocuments(), 0);
});

test('snapshot: counts projects by stage, screen verdicts and audits', async () => {
  await Tor.create([
    { projectId: '69100000001', source: 'process3', title: 'ก', pipelineStatus: 'fetched' },
    { projectId: '69100000002', source: 'process3', title: 'ข', pipelineStatus: 'fetched' },
    { projectId: '69100000003', source: 'process3', title: 'ค', pipelineStatus: 'ocr_done' },
  ]);
  const screen = (projectId, verdict, audit = false) =>
    ({ projectId, title: 'x', verdict, audit, modelName: 'm', promptVersion: 'p', screenedAt: new Date() });
  await TitleScreen.create([screen('69100000001', 'it'), screen('69100000002', 'not_it'), screen('69100000004', 'not_it', true)]);

  const counts = await snapshot();

  assert.deepEqual(counts.stages, { fetched: 2, ocr_done: 1 });
  assert.deepEqual(counts.screens, { it: 1, not_it: 1, 'not_it (audited)': 1 });
});
