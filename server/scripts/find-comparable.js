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
import {
  FULL_EXTRACTION,
  findComparableProjects,
  getProjectPrice,
  calculatePriceBenchmarks,
} from '#features/reality-check/index.js';

function parseArgs(args) {
  const options = {
    projectId: null,
    all: false,
    save: false,
    limit: 5,
    verbose: false,
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
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
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
  --verbose, -v  Show detailed per-project matching log
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

  // Calculate historical price benchmarks (FR-20)
  const benchmarks = calculatePriceBenchmarks(tor, results);
  console.log(`------------------------------------------------------`);
  console.log(`Historical Price Benchmarks (FR-20):`);
  console.log(`  Sample Size:       ${benchmarks.sampleSize} project(s) [Reliability: ${benchmarks.reliability}]`);
  console.log(`  Historical Median: ${formatTHB(benchmarks.historicalMedianTHB)}`);
  console.log(`  Historical Mean:   ${formatTHB(benchmarks.historicalAverageTHB)}`);
  console.log(`  Difference:        ${benchmarks.diffPercentage != null ? `${benchmarks.diffPercentage > 0 ? '+' : ''}${benchmarks.diffPercentage}% vs Median` : 'N/A'}`);
  console.log(`  Verdict/Copy:      ${benchmarks.interpretation}`);
  console.log(`------------------------------------------------------\n`);

  if (save) {
    await TorInsight.updateOne(
      { projectId },
      { $set: { 'analytics.priceAnalysis': benchmarks } }
    );
    console.log(`✓ Saved price benchmarks and ${benchmarks.comparableProjects.length} comparable project(s) to TorInsight.`);
  }
}

async function processAll({ limit, save, verbose = false }) {
  // Comparables are worked out for full extractions only (ADR 0028)
  const tors = await TorInsight.find({
    ...FULL_EXTRACTION,
    'identification.category': { $ne: null },
    $or: [
      { 'facts.referencePriceTHB': { $gt: 0 } },
      { 'facts.budgetTHB': { $gt: 0 } },
    ],
  }).lean();

  console.log(`Processing ${tors.length} valid TOR documents...`);

  let newlyCalculatedCount = 0;
  let updatedCount = 0;
  let unchangedCount = 0;
  let matchedCount = 0;
  let unbenchmarkedCount = 0;

  for (let i = 0; i < tors.length; i++) {
    const tor = tors[i];
    const prev = tor.analytics?.priceAnalysis;
    const prevMedian = prev?.historicalMedianTHB ?? null;
    const prevSampleSize = prev?.sampleSize ?? prev?.comparableProjects?.length ?? 0;

    const results = await findComparableProjects(tor, { limit });
    const benchmarks = calculatePriceBenchmarks(tor, results);

    if (results.length > 0) {
      matchedCount += 1;
    } else {
      unbenchmarkedCount += 1;
    }

    // Track state change
    if (prevMedian === null && benchmarks.historicalMedianTHB !== null) {
      newlyCalculatedCount += 1;
    } else if (
      prevMedian !== null &&
      (prevMedian !== benchmarks.historicalMedianTHB || prevSampleSize !== benchmarks.sampleSize)
    ) {
      updatedCount += 1;
    } else {
      unchangedCount += 1;
    }

    if (verbose) {
      let changeTag = '';
      let changeDetail = '';
      if (prevMedian === null && benchmarks.historicalMedianTHB !== null) {
        changeTag = '★ NEW';
        changeDetail = `Median: ${formatTHB(benchmarks.historicalMedianTHB)} (${benchmarks.sampleSize} peer(s), diff: ${benchmarks.diffPercentage != null ? `${benchmarks.diffPercentage > 0 ? '+' : ''}${benchmarks.diffPercentage}%` : 'N/A'})`;
      } else if (
        prevMedian !== null &&
        (prevMedian !== benchmarks.historicalMedianTHB || prevSampleSize !== benchmarks.sampleSize)
      ) {
        changeTag = '⟳ CHANGED';
        changeDetail = `Median: ${formatTHB(prevMedian)} ➔ ${formatTHB(benchmarks.historicalMedianTHB)} (${prevSampleSize} ➔ ${benchmarks.sampleSize} peers)`;
      } else if (benchmarks.historicalMedianTHB !== null) {
        changeTag = '= UNCHANGED';
        changeDetail = `Median: ${formatTHB(benchmarks.historicalMedianTHB)} (${benchmarks.sampleSize} peer(s), diff: ${benchmarks.diffPercentage != null ? `${benchmarks.diffPercentage > 0 ? '+' : ''}${benchmarks.diffPercentage}%` : 'N/A'})`;
      } else {
        changeTag = '∅ NO PEERS';
        changeDetail = `No comparable projects found in category "${tor.identification?.category}" within budget bracket`;
      }

      const title = tor.identification?.titleTh?.slice(0, 50) || tor.projectId;
      const priceStr = formatTHB(getProjectPrice(tor));

      console.log(`[${i + 1}/${tors.length}] [${tor.projectId}] ${title}`);
      console.log(`      Category: ${tor.identification?.category} | Price: ${priceStr}`);
      console.log(`      Result:   [${changeTag}] ${changeDetail}`);
      if (results.length > 0) {
        const peerSummary = results
          .map((r) => `${r.projectId} (${formatTHB(r.referencePriceTHB)})`)
          .join(', ');
        console.log(`      Peers:    ${peerSummary}`);
      }
      console.log('');
    }

    if (save) {
      await TorInsight.updateOne(
        { projectId: tor.projectId },
        { $set: { 'analytics.priceAnalysis': benchmarks } }
      );
    }
  }

  if (verbose) {
    console.log(`------------------------------------------------------`);
  }
  if (save) {
    console.log(`✓ Saved benchmarks to database for ${tors.length} projects:`);
    console.log(`  • Status:     ${matchedCount} project(s) with peers | ${unbenchmarkedCount} project(s) with 0 peers`);
    console.log(`  • Changes:    ${newlyCalculatedCount} new, ${updatedCount} updated, ${unchangedCount} unchanged`);
  } else {
    console.log(`✓ Dry run across ${tors.length} projects (${matchedCount} with peers, ${unbenchmarkedCount} without).`);
    console.log(`  • Run with --save to persist changes to database.`);
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
