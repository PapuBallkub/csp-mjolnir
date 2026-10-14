import mongoose from 'mongoose';

// Shape only. The rules live in pipeline/extraction/screen.js (ADR 0026).
// One document per new project: what Gemini made of its title before anything
// was downloaded. Ingestion reads it to decide what to download, as it reads
// TorInsight to decide what to read whole (ADR 0013).
const titleScreenSchema = new mongoose.Schema(
  {
    projectId: { type: String, required: true, unique: true, trim: true },

    // The title as it was screened: a later, different title is screened again
    title: { type: String, required: true },

    // it: clearly software or IT services. not_it: clearly something else.
    // unsure: the title can't tell. Only not_it stops a project here.
    verdict: { type: String, enum: ['it', 'not_it', 'unsure'], required: true, index: true },
    reason: { type: String, default: '' }, // one short sentence, in Thai

    // The kind of IT project, from the title alone (screen-v2, ADR 0028):
    // one of PROJECT_CATEGORIES, or null when the title can't tell
    category: { type: String, default: null },

    // A not_it project picked at random to go the whole way anyway, so the
    // team can measure what the screen misses (ADR 0026)
    audit: { type: Boolean, default: false, index: true },

    modelName: { type: String, required: true },
    promptVersion: { type: String, required: true },
    screenedAt: { type: Date, required: true },
  },
  { versionKey: false },
);

export const TitleScreen = mongoose.model('TitleScreen', titleScreenSchema);
