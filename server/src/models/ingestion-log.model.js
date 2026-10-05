import mongoose from 'mongoose';

/**
 * Tracks run telemetry for each ingestion source (FR-22).
 *
 * Each scheduled or on-demand fetch records duration, yield, errors, and
 * operational health so the admin monitoring dashboard can compute uptime %,
 * plot the 14-run history sparkline, and surface failure diagnostics directly
 * without parsing server logs.
 */
const ingestionLogSchema = new mongoose.Schema(
  {
    // The ingestion source or scraper identifier
    source: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },

    // Operational health outcome of this run
    status: {
      type: String,
      required: true,
      enum: ['ok', 'degraded', 'failed'],
      index: true,
    },

    startedAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },

    finishedAt: {
      type: Date,
      default: null,
    },

    durationMs: {
      type: Number,
      default: 0,
    },

    // Raw announcements/items discovered from remote API or feed
    itemsDiscovered: {
      type: Number,
      default: 0,
    },

    // Records saved, downloaded, or processed successfully
    itemsIngested: {
      type: Number,
      default: 0,
    },

    // Error diagnostics on degraded or failed runs
    error: {
      type: String,
      default: null,
      trim: true,
    },

    // Contextual execution metadata (e.g. query keyword, rate limit headers)
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
  },
  { timestamps: true },
);

export const IngestionLog = mongoose.model('IngestionLog', ingestionLogSchema);
