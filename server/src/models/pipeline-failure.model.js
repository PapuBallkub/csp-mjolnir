import mongoose from 'mongoose';

// Shape only. The rules live in pipeline/shared/failures.js (ADR 0016).
// One document per TOR and step that is failing. It is deleted when the step
// succeeds, so the collection lists exactly the TORs that are stuck.
const pipelineFailureSchema = new mongoose.Schema(
  {
    projectId: { type: String, required: true, trim: true },

    step: {
      type: String,
      required: true,
      enum: ['download', 'ocr', 'extract'],
    },

    // What the step worked from (the PDF's hash for OCR; the source, prompt
    // and model for extraction). Failures on an older input don't count
    // against a new one.
    inputKey: { type: String, default: null },

    // Failures that were this TOR's own. A source that didn't answer (a
    // timeout, a 5xx, a 429) is recorded but not counted: an outage mustn't
    // make every waiting TOR give up.
    attempts: { type: Number, default: 0, min: 0 },

    lastError: { type: String, default: '' },
    lastTransient: { type: Boolean, default: false },
    firstFailedAt: { type: Date, required: true },
    lastFailedAt: { type: Date, required: true },
  },
  { versionKey: false },
);

pipelineFailureSchema.index({ projectId: 1, step: 1 }, { unique: true });
pipelineFailureSchema.index({ step: 1, attempts: 1 });

export const PipelineFailure = mongoose.model('PipelineFailure', pipelineFailureSchema);
