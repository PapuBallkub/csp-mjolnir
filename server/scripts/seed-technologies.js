/**
 * server/scripts/seed-technologies.js
 *
 * Loads the starter technology vocabulary as `confirmed` entries. Safe to run
 * again: entries are matched on their key, existing aliases are kept, and a
 * `new` entry a reviewer hasn't handled yet is confirmed if it's in the list.
 *
 *   npm run technologies:seed
 */

import { pathToFileURL } from 'node:url';
import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { Technology } from '#models/index.js';
import { STARTER_TECHNOLOGIES } from '#pipeline/extraction/references/technologies.js';
import { technologyKey } from '#pipeline/extraction/vocabulary.js';

async function main() {
  await connectDatabase();
  try {
    let added = 0;
    for (const { name, category, aliases } of STARTER_TECHNOLOGIES) {
      const result = await Technology.updateOne(
        { key: technologyKey(name) },
        {
          $set: { name, category, status: 'confirmed' },
          $addToSet: { aliases: { $each: aliases.map(technologyKey) } },
        },
        { upsert: true },
      );
      added += result.upsertedCount;
    }
    const confirmed = await Technology.countDocuments({ status: 'confirmed' });
    const waiting = await Technology.countDocuments({ status: 'new' });
    console.log(`Seeded ${STARTER_TECHNOLOGIES.length} technologies (${added} new).`);
    console.log(`Vocabulary: ${confirmed} confirmed, ${waiting} new waiting for review.`);
  } finally {
    await disconnectDatabase();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Seeding failed: ${error.message}`);
    process.exit(1);
  });
}
