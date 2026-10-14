import mongoose from 'mongoose';

// Shape only. Written by pipeline/jobs/run-job.js (ADR 0027).
// One document per scheduled job: which steps ran, how each ended, and how
// the database moved, so a day of runs can be read back afterwards.
const stepSchema = new mongoose.Schema(
  {
    name: { type: String, required: true }, // e.g. "ingest fetch", "screen"
    exitCode: { type: Number, default: null }, // null: not run, time was up
    startedAt: { type: Date, default: null },
    ms: { type: Number, default: 0 },
  },
  { _id: false },
);

const pipelineRunSchema = new mongoose.Schema(
  {
    job: { type: String, enum: ['poll', 'sweep', 'process'], required: true },
    host: { type: String, default: '' },
    startedAt: { type: Date, required: true, index: true },
    finishedAt: { type: Date, default: null },
    until: { type: Date, default: null }, // the time box: no new step starts after it

    // done: every step ran. timed-out: time was up first. skipped: another
    // job held the lock for too long. failed: the runner itself broke.
    outcome: { type: String, enum: ['running', 'done', 'timed-out', 'skipped', 'failed'], default: 'running' },
    steps: [stepSchema],

    // Counts before and after: projects by pipeline stage, screen verdicts and
    // insights by state
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, default: null },

    logFile: { type: String, default: '' },
    error: { type: String, default: '' },
  },
  // Kept even when empty: no projects at a stage is a count too
  { versionKey: false, minimize: false },
);

export const PipelineRun = mongoose.model('PipelineRun', pipelineRunSchema);
