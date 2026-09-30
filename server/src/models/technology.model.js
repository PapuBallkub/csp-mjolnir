import mongoose from 'mongoose';

// The shared vocabulary of technologies (ADR 0014). Search, matching and
// lock-spec all need one name per technology: "PostgreSQL", "Postgres" and
// "PostgreSQL 14" are the same thing, and are counted as one.
//
// Extraction owns this collection. A name it cannot match becomes a `new`
// entry, used straight away but listed for someone to merge into an existing
// entry (as an alias) or confirm, so OCR typos never become permanent.
const technologySchema = new mongoose.Schema(
  {
    // Display name, e.g. "PostgreSQL"
    name: { type: String, required: true, unique: true, trim: true },

    // What names are matched on: lower-cased, trimmed, spaces collapsed. `key`
    // is the name itself in that form; aliases are other ways TORs write it.
    key: { type: String, required: true, unique: true, lowercase: true, trim: true },
    aliases: [{ type: String, lowercase: true, trim: true, index: true }],

    // e.g. "database", "os", "language", "framework", "platform"
    category: { type: String, default: null, trim: true },

    status: {
      type: String,
      enum: ['confirmed', 'new'],
      default: 'new',
      index: true,
    },

    // The TOR a `new` entry first came from, so a reviewer can look at it
    firstSeenIn: { type: String, default: null, trim: true },
  },
  { timestamps: true },
);

export const Technology = mongoose.model('Technology', technologySchema);
