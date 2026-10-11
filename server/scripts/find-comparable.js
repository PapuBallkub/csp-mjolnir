/**
 * server/scripts/find-comparable.js
 *
 * Command-line tool to run comparable project identification (FR-19).
 *
 * Usage:
 *   node scripts/find-comparable.js --id <projectId>
 *   node scripts/find-comparable.js --all [--save] [--limit <N>]
 *   npm run comparable -- --id 68039469567
 *
 * Flags:
 *   --id <id>      Inspect comparable projects for one specific TOR
 *   --all          Run across all TorInsight records
 *   --save         Persist comparable projects into TorInsight.analytics.priceAnalysis
 *   --limit <N>    Maximum comparable matches to return (default: 5)
 */

import { pathToFileURL } from 'node:url';
import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { TorInsight } from '#models/index.js';
import { findComparableProjects, getProjectPrice } from '#features/reality-check/index.js';

function parseArgs(args) {
  const options = {
    projectId: null,
    all: false,
    save: false,
    limit: 5,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--id' && args[i + 1]) {
      options.projectId = args[++i];
    } else if (arg === '--all') {
      options.all = true;
    } else if (arg === '--save') {
      options.save = true;
    } else if (arg === '--limit' && args[i + 1]) {
      options.limit = parseInt(args[++i], 10) || 5;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    }
  }
  return options;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/find-comparable.js --id <projectId>
  node scripts/find-comparable.js --all [--save] [--limit <N>]
  npm run comparable -- --id <projectId>

Options:
  --id <id>      Run similarity for a specific projectId
  --all          Run similarity across all TorInsight documents
  --save         Save matched comparable projects to database
  --limit <N>    Number of comparable projects to find (default: 5)
  --help, -h     Show this help message
`);
}

function formatTHB(amount) {
  if (amount == null) return 'N/A';
  return `฿${amount.toLocaleString('en-US')}`;
}

async function inspectOne(projectId, { limit, save }) {
  const tor = await TorInsight.findOne({ projectId }).lean();
  if (!tor) {
    console.error(`Error: Project ${projectId} not found in TorInsight.`);
    return;
  }

  const category = tor.identification?.category ?? 'Not specified';
  const price = getProjectPrice(tor);

  console.log(`\n======================================================`);
  console.log(`Target TOR: [${tor.projectId}] ${tor.identification?.titleTh}`);
  console.log(`Category:   ${category}`);
  console.log(`Price:      ${formatTHB(price)}`);
  console.log(`======================================================\n`);

  const results = await findComparableProjects(tor, { limit });

  if (results.length === 0) {
    console.log(`No comparable projects found matching category "${category}" within budget bracket.`);
    return;
  }

  console.log(`Found ${results.length} comparable project(s):\n`);
  results.forEach((item, index) => {
    console.log(
      `[${index + 1}] ${item.title}\n` +
      `    ID:     ${item.projectId} (FY: ${item.year})\n` +
      `    Price:  ${formatTHB(item.referencePriceTHB)}\n` +
      `    Score:  ${(item.score * 100).toFixed(1)}% ` +
      `(Scale: ${(item.breakdown.scaleSim * 100).toFixed(0)}%, ` +
      `Scope: ${(item.breakdown.scopeSim * 100).toFixed(0)}%, ` +
      `Tech: ${(item.breakdown.techSim * 100).toFixed(0)}%)\n`
    );
  });

  if (save) {
    const comparableList = results.map((r) => ({
      title: r.title,
      year: r.year,
      referencePriceTHB: r.referencePriceTHB,
    }));

    await TorInsight.updateOne(
      { projectId },
      { $set: { 'analytics.priceAnalysis.comparableProjects': comparableList } }
    );
    console.log(`✓ Saved ${comparableList.length} comparable project(s) to TorInsight.`);
  }
}

async function processAll({ limit, save }) {
  const tors = await TorInsight.find({
    'identification.category': { $ne: null },
    $or: [
      { 'facts.referencePriceTHB': { $gt: 0 } },
      { 'facts.budgetTHB': { $gt: 0 } },
    ],
  }).lean();

  console.log(`Processing ${tors.length} valid TOR documents...`);

  let updatedCount = 0;
  for (const tor of tors) {
    const results = await findComparableProjects(tor, { limit });
    if (save && results.length > 0) {
      const comparableList = results.map((r) => ({
        title: r.title,
        year: r.year,
        referencePriceTHB: r.referencePriceTHB,
      }));

      await TorInsight.updateOne(
        { projectId: tor.projectId },
        { $set: { 'analytics.priceAnalysis.comparableProjects': comparableList } }
      );
      updatedCount += 1;
    }
  }

  if (save) {
    console.log(`✓ Done: Updated ${updatedCount} of ${tors.length} projects in database.`);
  } else {
    console.log(`✓ Done dry run across ${tors.length} projects (use --save to persist changes).`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help || (!options.projectId && !options.all)) {
    printHelp();
    return;
  }

  await connectDatabase();
  try {
    if (options.projectId) {
      await inspectOne(options.projectId, options);
    } else if (options.all) {
      await processAll(options);
    }
  } finally {
    await disconnectDatabase();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Execution failed: ${error.message}`);
    process.exit(1);
  });
}
