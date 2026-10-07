import mongoose from 'mongoose';

// Shape only. The lease logic lives in pipeline/shared/run-lock.js (ADR 0016).
// One document per pipeline while a run of it is going: two runs of the same
// pipeline must never work at once, or both pick the same TOR.
const pipelineLockSchema = new mongoose.Schema(
  {
    // The pipeline the lock is for: 'ingestion' or 'extraction'
    _id: { type: String, required: true },

    // Which run holds it: host, process id and a random part
    owner: { type: String, required: true },

    acquiredAt: { type: Date, required: true },

    // The holder pushes this forward while it runs. A run that crashed stops
    // pushing, so its lock frees itself once this time passes.
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false },
);

export const PipelineLock = mongoose.model('PipelineLock', pipelineLockSchema);
