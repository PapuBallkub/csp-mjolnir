/**
 * server/scripts/seed.js
 *
 * Loads the starter technology vocabulary. Demo data is opt-in (ADR 0015):
 * 28 real e-GP notices (seed/tors.json) with made-up insights
 * (seed/torinsights.json, all `origin: 'demo'`), for building UI only.
 *
 *   npm run seed                      the technology vocabulary only
 *   npm run seed -- --demo            also the demo TORs and insights
 *   npm run seed -- --remove-demo     delete every demo insight, nothing else
 *
 * Loading never deletes, and never replaces real data:
 * - a TOR is added only if ingestion hasn't already saved that project
 * - a demo insight is added, or refreshed, only where no pipeline result exists
 * - technologies are merged into the vocabulary, never cleared
 *
 * Removing deletes demo insights only: pipeline results and every Tor record
 * stay, so the catalog then shows real results alone.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { Technology, Tor, TorInsight } from '#models/index.js';
import { seedStarterTechnologies } from '#pipeline/extraction/vocabulary.js';

const SEED_DIR = path.resolve(import.meta.dirname, '../seed');
const readSeed = async (file) => JSON.parse(await fs.readFile(path.join(SEED_DIR, file), 'utf8'));

async function seed({ withDemo, removeDemo }) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed a production database.');
  }
  if (withDemo && removeDemo) throw new Error('Choose one of --demo and --remove-demo.');

  await connectDatabase();
  try {
    if (removeDemo) {
      const { deletedCount } = await TorInsight.deleteMany({ 'metadata.origin': 'demo' });
      console.log(`Insights:     ${deletedCount} demo removed; real pipeline results and all TORs kept`);
      return;
    }

    const { added: technologiesAdded } = await seedStarterTechnologies();
    console.log(`Technologies: ${technologiesAdded} added (${await Technology.countDocuments()} in the vocabulary)`);
    if (!withDemo) {
      console.log('Demo data:    not loaded (add --demo to load it, for building UI only)');
      return;
    }

    const tors = await readSeed('tors.json');
    const insights = await readSeed('torinsights.json');

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

    console.log(`TORs:         ${newTors.length} added, ${tors.length - newTors.length} already there and kept`);
    console.log(`Insights:     ${demoWritten} demo written, ${keptReal} real pipeline results kept`);
  } finally {
    await disconnectDatabase();
  }
}

const args = process.argv.slice(2);
seed({ withDemo: args.includes('--demo'), removeDemo: args.includes('--remove-demo') }).catch((error) => {
  console.error(`Seeding failed: ${error.message}`);
  process.exit(1);
});
