import mongoose from 'mongoose';

// Shape only. The keeping and the rollback live in
// pipeline/shared/insight-versions.js (ADR 0031).
//
// A summary a change replaced: one document per replaced summary, so a TOR
// replaced three times has three. Kept as it was, so a later schema change
// never breaks an old version, and with the Tor's state it went with, so a
// rollback can put the TOR back as it was.
const torInsightVersionSchema = new mongoose.Schema(
  {
    projectId: { type: String, required: true },

    // The summary's own metadata.version when it was replaced: 1, 2, 3, …
    version: { type: Number, required: true, min: 1 },

    supersededAt: { type: Date, required: true },

    // Why it was replaced
    reason: {
      type: String,
      required: true,
      enum: [
        'source-changed', // the TOR's file or OCR text changed
        'prompt-update', // a newer prompt or model was run on it (extract --outdated)
        'forced', // extract --force, or --id on one that was up to date
        'rebuilt', // rebuilt from the saved answers (extract --recheck)
        'corrected', // an admin edited it in the review queue (FR-23)
        'rollback', // an older version was brought back over it (NFR-07)
      ],
    },

    // The admin, for 'corrected' and 'rollback'; null for the pipeline
    supersededBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // The whole TorInsight as it was
    insight: { type: mongoose.Schema.Types.Mixed, required: true },

    // The Tor as the summary went with it: its file, OCR details (not the
    // text), and the facts an admin edit also changes on the Tor
    tor: { type: mongoose.Schema.Types.Mixed, default: null },

    // The OCR text it was built from. Each distinct text is kept once, by
    // the version it was about to be lost from; the others keep only its hash.
    ocrText: { type: String, default: null },
    ocrTextHash: { type: String, default: null },
  },
  { versionKey: false, minimize: false },
);

torInsightVersionSchema.index({ projectId: 1, version: 1 }, { unique: true });

export const TorInsightVersion = mongoose.model('TorInsightVersion', torInsightVersionSchema);
