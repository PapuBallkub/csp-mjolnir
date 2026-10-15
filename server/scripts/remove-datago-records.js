/**
 * server/scripts/remove-datago-records.js
 *
 * Removes the records the old data.go.th reader made (`Tor.source: 'datago'`).
 * It read mislabelled columns, so their fields are wrong, and it stored some
 * finished contracts as Open (docs/data-sources/data_go_th.md). The planned
 * import of past contracts brings back the ones worth keeping, read right.
 *
 * Only records the feed never showed are touched: fetch sets the source to
 * `process3` on any project it announces, so `datago` means data.go.th alone.
 *
 * A project that was extracted is kept and repaired, not removed: its
 * summary came from its own documents and is worth keeping (several are in
 * the AI pipeline's evaluation table). Its status becomes Awarded, as every
 * data.go.th row is a signed contract, and the contract fields the old reader
 * took from the wrong columns are cleared.
 *
 * Every other such project is removed: the Tor, its title screen and failure
 * records, its downloaded documents, its saved Gemini answers, and any user's
 * watchlist entry for it.
 *
 * Usage:
 *   node scripts/remove-datago-records.js --dry-run   # list what would happen
 *   node scripts/remove-datago-records.js
 *   node scripts/remove-datago-records.js --all       # remove the extracted ones too
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { PipelineFailure, TitleScreen, Tor, TorInsight, User } from '#models/index.js';

const SERVER_DIR = path.resolve(import.meta.dirname, '..');
const DOCUMENTS_DIR = process.env.DOCUMENTS_DIR || path.join(SERVER_DIR, 'data/documents');
const EXTRACTIONS_DIR = process.env.EXTRACTIONS_DIR || path.join(SERVER_DIR, 'data/extractions');

/** The files and folders kept for a project, those that exist. */
async function filesOf(projectId) {
  const candidates = [
    path.join(DOCUMENTS_DIR, projectId),
    path.join(DOCUMENTS_DIR, `${projectId}_TOR.pdf`),
    path.join(EXTRACTIONS_DIR, `${projectId}.json`),
  ];
  const found = [];
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      found.push(candidate);
    } catch {
      // not there
    }
  }
  return found;
}

// The old reader took these from the wrong columns: the signing date from the
// end date, the end date from a column that doesn't exist, the project status
// from the title. The winner, tax ID, number and agreed price it read right.
const MISREAD_CONTRACT_FIELDS = ['contract.contractSignDate', 'contract.contractEndDate', 'contract.projectStatus'];

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const all = process.argv.includes('--all');
  await connectDatabase();
  try {
    const tors = await Tor.find({ source: 'datago' }, { projectId: 1, title: 1, status: 1 }).lean();
    if (tors.length === 0) {
      console.log('No data.go.th records: nothing to do.');
      return;
    }

    // Extracted, or waiting for its full text: a summary from its own documents
    const extracted = new Set(
      await TorInsight.distinct('projectId', {
        projectId: { $in: tors.map((tor) => tor.projectId) },
        'metadata.excluded': null,
      }),
    );
    const keep = all ? [] : tors.filter((tor) => extracted.has(tor.projectId));
    const remove = tors.filter((tor) => !keep.includes(tor));
    const ids = remove.map((tor) => tor.projectId);

    console.log(`${tors.length} data.go.th record(s).`);
    if (keep.length) {
      console.log(`\nKept and repaired${dryRun ? ' (would be)' : ''}: extracted, so status Awarded and misread contract fields cleared:`);
      for (const tor of keep) console.log(`  ${tor.projectId} ${String(tor.status).padEnd(9)} ${String(tor.title ?? '').slice(0, 60)}`);
    }
    const watchers = await User.countDocuments({ 'watchlist.projectId': { $in: ids } });
    console.log(`\nRemoved${dryRun ? ' (would be)' : ''}:`);
    const files = [];
    for (const tor of remove) {
      const own = await filesOf(tor.projectId);
      files.push(...own);
      console.log(
        `  ${tor.projectId} ${String(tor.status).padEnd(9)} ${String(tor.title ?? '').slice(0, 60)}` +
          (extracted.has(tor.projectId) ? ' · insight' : '') +
          (own.length ? ` · ${own.length} file(s)` : ''),
      );
    }
    console.log(`Users watching any of those: ${watchers}`);

    if (dryRun) {
      console.log('\nDry run: nothing changed. Run again without --dry-run.');
      return;
    }

    if (keep.length) {
      const keptIds = keep.map((tor) => tor.projectId);
      await Tor.updateMany(
        { projectId: { $in: keptIds } },
        { $set: { status: 'Awarded' }, $unset: Object.fromEntries(MISREAD_CONTRACT_FIELDS.map((field) => [field, 1])) },
      );
      await TorInsight.updateMany({ projectId: { $in: keptIds } }, { $set: { 'identification.status': 'Awarded' } });
      console.log(`\nRepaired ${keptIds.length} extracted record(s).`);
    }
    if (ids.length === 0) return;

    const removed = {
      insights: (await TorInsight.deleteMany({ projectId: { $in: ids } })).deletedCount,
      screens: (await TitleScreen.deleteMany({ projectId: { $in: ids } })).deletedCount,
      failures: (await PipelineFailure.deleteMany({ projectId: { $in: ids } })).deletedCount,
      // Only users who watch one: an update touches updatedAt even when it pulls nothing
      watchlists: (
        await User.updateMany(
          { 'watchlist.projectId': { $in: ids } },
          { $pull: { watchlist: { projectId: { $in: ids } } } },
        )
      ).modifiedCount,
      files: 0,
    };
    for (const file of files) {
      await fs.rm(file, { recursive: true, force: true });
      removed.files++;
    }
    removed.tors = (await Tor.deleteMany({ source: 'datago', projectId: { $in: ids } })).deletedCount;
    console.log(
      `\nRemoved ${removed.tors} Tor(s), ${removed.insights} insight(s), ${removed.screens} title screen(s), ` +
        `${removed.failures} failure record(s), ${removed.files} file(s) or folder(s); ` +
        `${removed.watchlists} user watchlist(s) updated.`,
    );
  } finally {
    await disconnectDatabase();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
