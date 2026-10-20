import mongoose from 'mongoose';

// Shape only. The counting lives in pipeline/shared/request-pacer.js.
// One document per site: how many requests it has had in a row, and when the
// last one went out. Each pipeline step runs as its own process, but a site
// counts their requests as one run, so the count has to outlive a process.
const requestStreakSchema = new mongoose.Schema(
  {
    // The site, e.g. 'gprocurement.go.th'
    _id: { type: String, required: true },

    // Requests in a row: since the last gap long enough to reset the site's count
    inARow: { type: Number, required: true },

    lastAt: { type: Date, required: true },
  },
  { versionKey: false },
);

export const RequestStreak = mongoose.model('RequestStreak', requestStreakSchema);
