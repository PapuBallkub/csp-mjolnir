import mongoose from 'mongoose';

// Shape only. Written by the fetch and sweep steps (ADR 0027).
// One document per time a source was asked: the national feed once, or one
// agency in a sweep. Together they show whether the feed answers, when, and
// how much it gives: the polling health of FR-22.
const feedPollSchema = new mongoose.Schema(
  {
    source: { type: String, enum: ['process3'], required: true },
    deptId: { type: String, default: '' }, // '' for the national feed
    startedAt: { type: Date, required: true, index: true },
    finishedAt: { type: Date, required: true },

    // Nothing was sent: the feed's closed hours (ADR 0017)
    closed: { type: Boolean, default: false },
    // e-GP asked us to slow down (HTTP 429) and the rest went unasked
    rateLimited: { type: Boolean, default: false },

    requested: { type: Number, default: 0 }, // requests sent
    answered: { type: Number, default: 0 }, // of those, answered at all
    // Items returned, by announcement code. An agency's list stops at 20, so
    // 20 here may mean some were cut off.
    itemsByType: { type: Map, of: Number, default: {} },
    discovered: { type: Number, default: 0 }, // new projects added
    updated: { type: Number, default: 0 }, // followed projects seen again

    problems: [{ type: String }], // the first few errors
  },
  { versionKey: false },
);

export const FeedPoll = mongoose.model('FeedPoll', feedPollSchema);
