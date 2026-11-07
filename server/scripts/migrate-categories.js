/**
 * server/scripts/migrate-categories.js
 *
 * Moves stored summaries to the shape of ADR 0034, once: the ones in use
 * (TorInsight) and the ones kept (TorInsightVersion), by the same rule.
 *
 * - `identification.category`, one value, becomes `identification.categories`,
 *   a list. A real category becomes a list of one. A value that was never a
 *   category ('non-IT' from the old reclassify, 'IT / software' from the old
 *   approve) takes the latest real one from the versions before it, or none.
 *   A missing one becomes [].
 * - A list already there stays: it's an admin's edit, made after the new code
 *   went out and before this ran.
 * - `facts.procurementKind` is copied from the Tor.
 * - The two old indexes are dropped and the new ones built: Mongoose never
 *   drops an index, and in production it doesn't build them either.
 *
 * It only touches summaries still in the old shape, so it's safe to run again,
 * and it reads both shapes, so a run that stopped part-way can finish. It
 * writes to the collections directly, so `updatedAt` doesn't move: the
 * summaries themselves haven't changed.
 *
 * Nothing else reads the old shape. A rollback to a version this hasn't reached
 * would lose its category, so run this before anyone rolls a TOR back.
 *
 * Prices and lock-spec findings are stored on the record (ADR 0022), so pages
 * show the old results until `npm run comparable -- --all --save` runs.
 *
 *   npm run migrate:categories -- --dry-run   # count what would change
 *   npm run migrate:categories
 *
 * It takes both pipeline locks: with a run going, it does nothing and says so.
 */

import { pathToFileURL } from 'node:url';
import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { Tor, TorInsight, TorInsightVersion } from '#models/index.js';
import { cleanCategories } from '#models/project-categories.js';
import { RunLockHeldError, withRunLock } from '#pipeline/shared/run-lock.js';

const OLD_INDEXES = ['identification.category_1', 'identification.category_1_facts.referencePriceTHB_1'];

/** What's read of a summary at `path`: a version can also hold a whole OCR text. */
const summaryFields = (path) => ({
  projectId: 1,
  [`${path}identification.category`]: 1,
  [`${path}identification.categories`]: 1,
  [`${path}facts.procurementKind`]: 1,
});

/** The list a stored summary holds, in either shape. */
const listIn = ({ category, categories } = {}) => (categories?.length ? categories : cleanCategories([category]));

const noChanges = () => ({ kept: 0, restored: 0, emptied: 0, kinds: 0 });

/**
 * The update that brings one stored summary to the new shape, or null when it's
 * there already.
 *
 * @param {object} summary
 * @param {object} context
 * @param {string} context.path - where the summary sits in its document
 * @param {string[]} context.earlier - the latest real list from the versions before it
 * @param {string|null} context.kind - its Tor's procurement kind
 * @param {object} context.counts - added to
 */
function upgrade(summary, { path, earlier, kind, counts }) {
  const { category, categories } = summary.identification ?? {};
  const update = {};

  if (category !== undefined || categories === undefined) {
    let list = listIn(summary.identification);
    if (list.length) counts.kept++;
    else {
      if (category) list = earlier;
      if (list.length) counts.restored++;
      else counts.emptied++;
    }
    update.$set = { [`${path}identification.categories`]: list };
    update.$unset = { [`${path}identification.category`]: 1 };
  }
  if (summary.facts?.procurementKind === undefined) {
    counts.kinds++;
    update.$set = { ...update.$set, [`${path}facts.procurementKind`]: kind };
  }
  return update.$set ? update : null;
}

/**
 * @returns {Promise<{ insights: object, versions: object, indexes: number }>}
 *   For insights and versions, each: kept, a real category, now a list of one
 *   (or a list that was there already). restored: taken from a version before
 *   it. emptied: no category to keep. kinds: given a procurement kind field.
 *   indexes: old indexes dropped.
 */
export async function migrateCategories({ dryRun = false } = {}) {
  const insights = TorInsight.collection;
  const versions = TorInsightVersion.collection;
  const counts = { insights: noChanges(), versions: noChanges(), indexes: 0 };

  const kinds = new Map(
    (await Tor.find({ procurementKind: { $ne: null } }, { projectId: 1, procurementKind: 1 }).lean())
      .map((tor) => [tor.projectId, tor.procurementKind]),
  );

  // Oldest first, so each version can take from the ones before it. All of it
  // is worked out before anything is written, so neither collection's writes
  // can change what the other reads.
  const kept = await versions.find({}, { projection: { ...summaryFields('insight.'), version: 1 } }).toArray();
  kept.sort((a, b) => a.version - b.version);

  const latest = new Map();
  const versionWrites = [];
  for (const { _id, projectId, insight } of kept) {
    const update = upgrade(insight ?? {}, {
      path: 'insight.',
      earlier: latest.get(projectId) ?? [],
      kind: kinds.get(projectId) ?? null,
      counts: counts.versions,
    });
    if (update) versionWrites.push({ updateOne: { filter: { _id }, update } });

    const list = listIn(insight?.identification);
    if (list.length) latest.set(projectId, list);
  }

  const insightWrites = [];
  for (const { _id, projectId, ...summary } of await insights.find({}, { projection: summaryFields('') }).toArray()) {
    const update = upgrade(summary, {
      path: '',
      earlier: latest.get(projectId) ?? [],
      kind: kinds.get(projectId) ?? null,
      counts: counts.insights,
    });
    if (update) insightWrites.push({ updateOne: { filter: { _id }, update } });
  }

  const oldIndexes = (await insights.indexes()).map((index) => index.name).filter((name) => OLD_INDEXES.includes(name));
  counts.indexes = oldIndexes.length;
  if (dryRun) return counts;

  if (insightWrites.length) await insights.bulkWrite(insightWrites, { ordered: false });
  if (versionWrites.length) await versions.bulkWrite(versionWrites, { ordered: false });
  for (const name of oldIndexes) await insights.dropIndex(name);
  await TorInsight.createIndexes();
  return counts;
}

const described = ({ kept, restored, emptied, kinds }) =>
  `${kept} to a list of one, ${restored} restored from a kept version, ${emptied} with none; procurement kind on ${kinds}`;

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  await connectDatabase();
  try {
    const counts = await withRunLock('extraction', () => withRunLock('ingestion', () => migrateCategories({ dryRun })));
    const verb = dryRun ? 'Would change' : 'Changed';
    console.log(`${verb} summaries: ${described(counts.insights)}.`);
    console.log(`${verb} kept versions: ${described(counts.versions)}.`);
    console.log(`${verb} ${counts.indexes} old index(es).`);
    if (dryRun) console.log('Dry run: nothing changed. Run again without --dry-run.');
    else console.log('Next: npm run comparable -- --all --save');
  } catch (error) {
    if (error instanceof RunLockHeldError) throw new Error('A pipeline run is going: nothing changed. Try again when it ends.');
    throw error;
  } finally {
    await disconnectDatabase();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
