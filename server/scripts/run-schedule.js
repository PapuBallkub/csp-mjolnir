/**
 * server/scripts/run-schedule.js
 *
 * Runs the pipeline's jobs on their schedule from this machine (ADR 0027): it
 * waits for each time in pipeline/jobs/schedule.js and starts that job, one
 * after another. Meant for a test day on a laptop; a server would start the
 * same jobs from cron or Cloud Scheduler instead.
 *
 * Keep the window open, the machine awake and MongoDB running. Ctrl+C stops
 * it, and the job running stops too, releasing its locks.
 *
 * A machine that sleeps through a job's time starts it when it wakes, late;
 * any other times it slept through are skipped.
 *
 * Usage:
 *   npm run schedule
 *   npm run schedule -- --now process    # run this job first, right away
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { JOBS } from '#pipeline/jobs/run-job.js';
import { SCHEDULE, bangkokTime, nextSlot } from '#pipeline/jobs/schedule.js';

const SERVER_DIR = path.resolve(import.meta.dirname, '..');
const RUN_JOB = path.join(SERVER_DIR, 'src/pipeline/jobs/run-job.js');

// Waits in short steps, so a laptop waking from sleep notices a time it slept through
const TICK_MS = 30 * 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const stamp = () => `[${bangkokTime(new Date())}]`;

function startJob(job) {
  console.log(`${stamp()} Starting ${job}`);
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [RUN_JOB, job], { cwd: SERVER_DIR, stdio: 'inherit' });
    child.on('error', (error) => {
      console.error(`${stamp()} Could not start ${job}: ${error.message}`);
      resolve(-1);
    });
    child.on('close', (code) => {
      console.log(`${stamp()} ${job} finished (exit ${code})\n`);
      resolve(code);
    });
  });
}

async function main() {
  const argv = process.argv.slice(2);
  const first = argv.includes('--now') ? argv[argv.indexOf('--now') + 1] : null;
  if (first && !JOBS[first]) throw new Error(`--now takes a job: ${Object.keys(JOBS).join(', ')}`);

  console.log('Pipeline schedule, Bangkok time:');
  for (const slot of SCHEDULE) console.log(`  ${slot.at}  ${slot.job}`);
  console.log('Keep this window open and the machine awake. Ctrl+C stops.\n');

  if (first) await startJob(first);
  for (;;) {
    const slot = nextSlot(new Date());
    console.log(`${stamp()} Next: ${slot.job} at ${bangkokTime(slot.at)}`);
    while (Date.now() < slot.at.getTime()) await sleep(Math.min(TICK_MS, slot.at.getTime() - Date.now()));
    const lateMinutes = Math.round((Date.now() - slot.at.getTime()) / 60_000);
    if (lateMinutes > 1) console.log(`${stamp()} ${lateMinutes} min late: the machine was asleep or busy`);
    await startJob(slot.job);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
