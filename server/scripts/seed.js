import fs from 'node:fs/promises';
import path from 'node:path';
import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { Tor, TorInsight, Technology } from '#models/index.js';

async function seed() {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to seed production database!');
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log(' SEEDING DATABASE (Real e-GP TORs & Normalized Insights)');
  console.log('='.repeat(60));

  await connectDatabase();

  const seedDir = path.resolve(import.meta.dirname, '../seed');

  // Load JSON files
  const torsRaw = await fs.readFile(path.join(seedDir, 'tors.json'), 'utf8');
  const insightsRaw = await fs.readFile(path.join(seedDir, 'torinsights.json'), 'utf8');
  const techRaw = await fs.readFile(path.join(seedDir, 'technologies.json'), 'utf8');

  const tors = JSON.parse(torsRaw);
  const insights = JSON.parse(insightsRaw);
  const technologies = JSON.parse(techRaw);

  // Clear existing collections
  console.log('Clearing existing collections (tors, torinsights, technologies)...');
  await Tor.deleteMany({});
  await TorInsight.deleteMany({});
  await Technology.deleteMany({});

  // Insert Technologies
  console.log(`Inserting ${technologies.length} technologies...`);
  await Technology.insertMany(technologies);

  // Clean legacy pipelineStatus values if any
  const cleanedTors = tors.map((t) => {
    const copy = { ...t };
    if (!['fetched', 'downloaded', 'ocr_done'].includes(copy.pipelineStatus)) {
      copy.pipelineStatus = copy.ocr?.rawText ? 'ocr_done' : copy.document?.storagePath ? 'downloaded' : 'fetched';
    }
    return copy;
  });

  // Insert Tors
  console.log(`Inserting ${cleanedTors.length} TOR notices...`);
  await Tor.insertMany(cleanedTors);

  // Insert TorInsights
  console.log(`Inserting ${insights.length} normalized TOR insights...`);
  await TorInsight.insertMany(insights);

  console.log('='.repeat(60));
  console.log(' SEED COMPLETED SUCCESSFULLY');
  console.log('='.repeat(60));
  console.log(`Technologies : ${await Technology.countDocuments()}`);
  console.log(`Tors         : ${await Tor.countDocuments()}`);
  console.log(`TorInsights  : ${await TorInsight.countDocuments()}`);
  console.log('='.repeat(60));

  await disconnectDatabase();
}

seed().catch(async (err) => {
  console.error('[FATAL] Seed error:', err);
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
