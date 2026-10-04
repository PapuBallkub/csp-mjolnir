/**
 * server/scripts/seed.js
 *
 * Loads DEMO data for building the UI: 28 real e-GP notices (seed/tors.json)
 * with made-up insights (seed/torinsights.json, all `origin: 'demo'`), and the
 * starter technology vocabulary.
 *
 * It never deletes, and never replaces real data:
 * - a TOR is added only if ingestion hasn't already saved that project
 * - a demo insight is added, or refreshed, only where no pipeline result exists
 * - technologies are merged into the vocabulary, never cleared
 *
 * So it's safe to run on a database that already holds real extractions, and
 * `npm run extract` later replaces demo insights with real ones.
 *
 *   npm run seed
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { Technology, Tor, TorInsight } from '#models/index.js';
import { seedStarterTechnologies } from '#pipeline/extraction/vocabulary.js';

const SEED_DIR = path.resolve(import.meta.dirname, '../seed');
const readSeed = async (file) => JSON.parse(await fs.readFile(path.join(SEED_DIR, file), 'utf8'));

async function seed() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed a production database.');
  }
  await connectDatabase();
  try {
    const tors = await readSeed('tors.json');
    const insights = await readSeed('torinsights.json');

    const { added: technologiesAdded } = await seedStarterTechnologies();

    // TORs: ingestion's own records win
    const known = new Set(await Tor.distinct('projectId'));
    const newTors = tors.filter((tor) => !known.has(tor.projectId));
    if (newTors.length > 0) await Tor.insertMany(newTors);

    // Insights: demo only where no pipeline result exists
    const existing = new Map(
      (await TorInsight.find({}, { projectId: 1, 'metadata.origin': 1 }).lean()).map((i) => [
        i.projectId,
        i.metadata?.origin ?? 'pipeline',
      ]),
    );
    let demoWritten = 0;
    let keptReal = 0;
    for (const insight of insights) {
      if (existing.has(insight.projectId) && existing.get(insight.projectId) !== 'demo') {
        keptReal++;
        continue;
      }
      const document = new TorInsight({ ...insight, metadata: { ...insight.metadata, origin: 'demo' } });
      await document.validate(); // demo data must fit the current schema too
      const { _id, createdAt, updatedAt, ...fields } = document.toObject({ flattenMaps: true });
      await TorInsight.updateOne({ projectId: insight.projectId }, { $set: fields }, { upsert: true });
      demoWritten++;
    }

    console.log(`Technologies: ${technologiesAdded} added (${await Technology.countDocuments()} in the vocabulary)`);
    console.log(`TORs:         ${newTors.length} added, ${tors.length - newTors.length} already there and kept`);
    console.log(`Insights:     ${demoWritten} demo written, ${keptReal} real pipeline results kept`);
  } finally {
    await disconnectDatabase();
  }
}

seed().catch((error) => {
  console.error(`Seeding failed: ${error.message}`);
  process.exit(1);
});
