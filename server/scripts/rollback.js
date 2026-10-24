/**
 * server/scripts/rollback.js
 *
 * Lists the summaries a change replaced for one TOR, and brings one back
 * (NFR-07, ADR 0031): the same as the admin API's rollback.
 *
 *   npm run rollback -- --id 69099707497                     its versions
 *   npm run rollback -- --id 69099707497 --to 2 --dry-run    what bringing version 2 back would do
 *   npm run rollback -- --id 69099707497 --to 2              bring it back
 *
 * The current summary is kept as a version first, so a rollback can itself be
 * rolled back. It takes both pipeline locks: with a run going, it does nothing
 * and says so.
 */

import { pathToFileURL } from 'node:url';
import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { listVersions, rollbackTor } from '#pipeline/shared/insight-versions.js';
import { RunLockHeldError, withRunLock } from '#pipeline/shared/run-lock.js';

function parseArgs(argv) {
  const value = (name) => {
    const index = argv.indexOf(name);
    return index !== -1 ? argv[index + 1] : null;
  };
  const to = value('--to');
  return {
    id: value('--id')?.trim() || null,
    to: to === null ? null : Number.parseInt(to, 10),
    dryRun: argv.includes('--dry-run'),
  };
}

const when = (date) => (date ? new Date(date).toISOString().slice(0, 16).replace('T', ' ') : '-');

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.id) throw new Error('Name a TOR: npm run rollback -- --id <projectId> [--to <version>] [--dry-run]');
  if (args.to !== null && !(Number.isInteger(args.to) && args.to >= 1)) throw new Error('--to takes a version number, 1 or more');

  await connectDatabase();
  try {
    if (args.to === null) {
      const { current, versions } = await listVersions(args.id);
      if (current === null) console.log(`${args.id} has no summary.`);
      else console.log(`${args.id}: the current summary is version ${current}.`);
      if (versions.length === 0) console.log('No earlier version kept.');
      for (const v of versions) {
        console.log(
          `  v${v.version}  replaced ${when(v.supersededAt)}  ${v.reason.padEnd(14)}  ` +
            `${v.promptVersion ?? '-'}  score ${v.confidenceScore ?? '-'}  ${v.reviewStatus ?? '-'}` +
            (v.keptText ? '  (text kept)' : ''),
        );
      }
      return;
    }

    const result = await withRunLock('extraction', () =>
      withRunLock('ingestion', () => rollbackTor(args.id, { to: args.to, dryRun: args.dryRun })),
    );
    const what = [
      result.restoredTor ? "the TOR's file and facts" : null,
      result.restoredText ? 'its OCR text' : null,
    ].filter(Boolean);
    if (result.dryRun) {
      console.log(
        `Dry run: version ${result.to} would replace version ${result.from}` +
          (what.length ? `, with ${what.join(' and ')}` : '') +
          '. Nothing changed.',
      );
      return;
    }
    console.log(
      `Version ${result.to} is back, as version ${result.version}` +
        (what.length ? `, with ${what.join(' and ')}` : '') +
        `. Version ${result.from} is kept, and can be brought back the same way.`,
    );
    if (result.madeCurrent) {
      console.log("  ! Its OCR text wasn't kept: it's marked as built from the TOR's present text, so extraction leaves it.");
    }
  } catch (error) {
    if (!(error instanceof RunLockHeldError)) throw error;
    console.error(`${error.message}\nNothing was rolled back. Try again once the run is over.`);
    process.exitCode = 1;
  } finally {
    await disconnectDatabase();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
