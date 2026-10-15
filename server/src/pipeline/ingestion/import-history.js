/**
 * server/src/pipeline/ingestion/import-history.js
 *
 * Imports past contracts from data.go.th (ADR 0028): of FY2568's 4.69 million
 * contracts, the publicly announced ones whose titles look like IT, as
 * ordinary Tor records with status Awarded. Not a separate kind of record: a
 * project the feed follows ends up the same way once it's awarded.
 *
 * No Gemini here. The title screen runs after, only when asked for
 * (npm run screen -- --past): it decides which are IT, and gives those a
 * title-level TorInsight record.
 *
 * Usage:
 *   npm run history:import -- --dry-run              # count what each filter keeps; save nothing
 *   npm run history:import -- --parts 10 --limit 50  # one file, the first 50 kept
 *   npm run history:import
 *
 * One ingestion run at a time (ADR 0016). Every write is an upsert by project
 * ID, so an interrupted import can simply run again.
 */

import { pathToFileURL } from 'node:url';
import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { Tor } from '#models/index.js';
import { RunLockHeldError, withRunLock } from '../shared/run-lock.js';
import { procurementKindOf } from './sources/process3.js';
import {
  checkRow,
  isPubliclyAnnounced,
  listParts,
  mergeContracts,
  looksIt,
  openPart,
  readCsv,
  readRow,
} from './sources/datago-contracts.js';

// Writes go out in batches this size
const WRITE_BATCH = 500;

// The share of rows that may fail the position check before a file is
// refused: more means its layout changed, and reading on would store garbage
const MAX_BAD_SHARE = 0.01;
const CHECK_AFTER_ROWS = 1000;

// The title screen's cost per title, from its first batch of past projects
// (2026-10-15): about 130 input and 63 output tokens, its instructions shared
// across 40 titles
const SCREEN_TOKENS_IN = 130;
const SCREEN_TOKENS_OUT = 63;

/** Stops reading a file early: --limit reached. */
class EnoughRows extends Error {}

/**
 * Writes past contracts as Tor records. A project we already have keeps every
 * value it has, from the feed or its documents, and gains its contract; a new
 * one is created from the row. Every row is a signed contract: Awarded.
 *
 * @returns {Promise<{ inserted: number, updated: number }>}
 */
export async function upsertPastContracts(rows) {
  if (rows.length === 0) return { inserted: 0, updated: 0 };
  const result = await Tor.bulkWrite(
    rows.map((row) => ({
      updateOne: {
        filter: { projectId: row.projectId },
        update: {
          $set: {
            status: 'Awarded',
            'contract.winnerName': row.winnerName,
            'contract.winnerTaxId': row.winnerTaxId,
            'contract.contractNo': row.contractNo,
            'contract.contractSignDate': row.signedOn,
            'contract.contractEndDate': row.endsOn,
            'contract.agreedPriceTHB': row.agreedPriceTHB,
            'contract.amountTHB': row.contractAmountTHB,
            'contract.fiscalYear': row.fiscalYear,
            'contract.projectStatus': row.projectStatus,
            'contract.contractStatus': row.contractStatus,
            'contract.winners': row.winners ?? [],
          },
          $setOnInsert: {
            source: 'datago',
            title: row.title,
            agency: row.agency,
            subAgency: row.subAgency,
            province: row.province,
            district: row.district,
            budgetTHB: row.budgetTHB,
            referencePriceTHB: row.referencePriceTHB,
            announceDate: row.announcedOn,
            procurementMethod: row.method,
            procurementKind: row.kind ?? procurementKindOf(row.title),
            isAmended: false,
            pipelineStatus: 'fetched',
          },
        },
        upsert: true,
      },
    })),
    { ordered: false },
  );
  return { inserted: result.upsertedCount, updated: result.matchedCount };
}

/**
 * Reads one file and keeps what passes the filters, counting each stage. A
 * project's rows (one per contract) are merged into one project before
 * anything is written, so the file's kept rows are held until it's read: a few
 * thousand, all in part 1.
 *
 * @param {import('node:stream').Readable} stream
 * @param {{ dryRun?: boolean, limit?: number, write?: Function }} options
 */
export async function importStream(stream, { dryRun = false, limit = Infinity, write = upsertPastContracts } = {}) {
  const counts = { rows: 0, bad: 0, public: 0, it: 0, projects: 0, inserted: 0, updated: 0, badExamples: [], samples: [] };
  const kept = new Map(); // project ID -> its rows, in file order

  try {
    await readCsv(stream, async (values, line) => {
      const problem = checkRow(values);
      if (problem) {
        counts.bad++;
        if (counts.badExamples.length < 3) counts.badExamples.push(`line ${line}: ${problem}`);
      } else {
        counts.rows++;
        const row = readRow(values);
        if (isPubliclyAnnounced(row.method)) {
          counts.public++;
          if (looksIt(row.title)) {
            counts.it++;
            // A few kept titles, spread through the file, to judge the keyword list by
            if (counts.it % 500 === 1 && counts.samples.length < 6) counts.samples.push(row.title);
            const rows = kept.get(row.projectId);
            if (rows) rows.push(row);
            else if (kept.size < limit) kept.set(row.projectId, [row]);
            // --limit counts projects: the first one past it ends the file
            else throw new EnoughRows();
          }
        }
      }
      const seen = counts.rows + counts.bad;
      if (seen === CHECK_AFTER_ROWS && counts.bad / seen > MAX_BAD_SHARE) {
        throw new Error(`${counts.bad} of the first ${seen} rows can't be read by position: has the layout changed?`);
      }
    });
  } catch (error) {
    if (!(error instanceof EnoughRows)) throw error;
    stream.destroy();
  }

  const projects = [...kept.values()].map(mergeContracts);
  counts.projects = projects.length;
  if (!dryRun) {
    for (let start = 0; start < projects.length; start += WRITE_BATCH) {
      const { inserted, updated } = await write(projects.slice(start, start + WRITE_BATCH));
      counts.inserted += inserted;
      counts.updated += updated;
    }
  }
  return counts;
}

function parseArgs(argv) {
  const value = (name) => {
    const index = argv.indexOf(name);
    return index !== -1 ? argv[index + 1] : null;
  };
  const limit = Number.parseInt(value('--limit') ?? '', 10);
  const parts = value('--parts')?.split(',').map((part) => Number.parseInt(part.trim(), 10));
  if (parts?.some((part) => !(part >= 1 && part <= 10))) throw new Error('--parts takes part numbers, 1 to 10, e.g. --parts 1,4');
  return {
    dryRun: argv.includes('--dry-run'),
    limit: Number.isInteger(limit) && limit > 0 ? limit : Infinity,
    parts: parts ?? null,
  };
}

const thousands = (n) => n.toLocaleString('en-US');

async function run(args) {
  const all = await listParts();
  const parts = args.parts ? all.filter((part) => args.parts.includes(part.part)) : all;
  const total = { rows: 0, bad: 0, public: 0, it: 0, projects: 0, inserted: 0, updated: 0 };

  for (const part of parts) {
    const size = part.sizeBytes ? ` (${Math.round(part.sizeBytes / 1e6)} MB)` : '';
    console.log(`\nPart ${part.part}${size}: reading...`);
    const started = Date.now();
    const counts = await importStream(await openPart(part), { dryRun: args.dryRun, limit: args.limit - total.projects });
    for (const key of Object.keys(total)) total[key] += counts[key];
    console.log(
      `  ${thousands(counts.rows)} rows · ${thousands(counts.public)} publicly announced · ` +
        `${thousands(counts.it)} with an IT-looking title, ${thousands(counts.projects)} project(s)` +
        (args.dryRun ? '' : ` · ${counts.inserted} new, ${counts.updated} already known`) +
        (counts.bad ? ` · ${counts.bad} unreadable (${counts.badExamples.join('; ')})` : '') +
        ` · ${Math.round((Date.now() - started) / 1000)} s`,
    );
    for (const title of counts.samples) console.log(`    e.g. ${title.slice(0, 110)}`);
    if (total.projects >= args.limit) break;
  }

  console.log(
    `\nTotal: ${thousands(total.rows)} rows, ${thousands(total.public)} publicly announced, ` +
      `${thousands(total.it)} with an IT-looking title: ${thousands(total.projects)} project(s), some awarded as several contracts.`,
  );
  if (args.dryRun) {
    console.log(
      `Dry run: nothing saved. Screening those ${thousands(total.projects)} titles would take about ` +
        `${thousands(Math.ceil(total.projects / 40))} Gemini calls, ${thousands(total.projects * SCREEN_TOKENS_IN)} input and ` +
        `${thousands(total.projects * SCREEN_TOKENS_OUT)} output tokens (npm run screen -- --past).`,
    );
  } else {
    console.log(`Saved: ${thousands(total.inserted)} new Tor record(s), ${thousands(total.updated)} already known.`);
    console.log('Next: npm run screen -- --past, to screen their titles and build their title-level records.');
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`Past contracts from data.go.th (egp-contact-2568)${args.dryRun ? ' · DRY RUN (nothing saved)' : ''}`);
  await connectDatabase();
  try {
    await withRunLock('ingestion', () => run(args));
  } finally {
    await disconnectDatabase();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    if (error instanceof RunLockHeldError) console.error(`\n${error.message}`);
    else console.error(`\nImport failed: ${error.message}`);
    process.exit(1);
  });
}
