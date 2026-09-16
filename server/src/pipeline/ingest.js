/**
 * server/src/pipeline/ingest.js
 *
 * Automated CLI runner for the TOR ingestion pipeline (FR01-FR04).
 * Stages:
 * 1. Fetch & Download from live procurement sources (process3, datago)
 * 2. Text Extraction & OCR on attached PDF documents
 * 3. IT-Relevance Classification
 *
 * Usage:
 *   node src/pipeline/ingest.js
 *   node src/pipeline/ingest.js --query "ซอฟต์แวร์" --limit 2
 *   node src/pipeline/ingest.js --source datago --skip-ocr
 */

import path from 'node:path';
import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { Tor } from '#models/index.js';
import { fetchFromProcess3 } from './sources/process3.js';
import { fetchFromDataGo } from './sources/datago.js';
import { extractText } from './lib/ocr.js';
import { classifyIT } from './lib/classifier.js';

const DOCUMENTS_DIR =
  process.env.DOCUMENTS_DIR ||
  path.resolve(import.meta.dirname, '../../data/documents');

function parseCliArgs() {
  const argv = process.argv.slice(2);
  let query = 'คอมพิวเตอร์';
  let limit = 5;
  let source = 'all'; // 'all' | 'process3' | 'datago'
  let skipOcr = false;
  let skipClassify = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if ((arg === '--query' || arg === '-q' || arg === '--q') && i + 1 < argv.length) {
      query = argv[++i];
    } else if (arg.startsWith('--query=') || arg.startsWith('--q=')) {
      query = arg.split('=')[1];
    } else if (
      (arg === '--limit' || arg === '-l' || arg === '--l') &&
      i + 1 < argv.length
    ) {
      limit = parseInt(argv[++i], 10) || 5;
    } else if (arg.startsWith('--limit=') || arg.startsWith('--l=')) {
      limit = parseInt(arg.split('=')[1], 10) || 5;
    } else if (
      (arg === '--source' || arg === '-s') &&
      i + 1 < argv.length
    ) {
      source = argv[++i].toLowerCase();
    } else if (arg.startsWith('--source=')) {
      source = arg.split('=')[1].toLowerCase();
    } else if (arg === '--skip-ocr') {
      skipOcr = true;
    } else if (arg === '--skip-classify') {
      skipClassify = true;
    }
  }

  return { query, limit, source, skipOcr, skipClassify };
}

async function main() {
  const args = parseCliArgs();

  console.log('='.repeat(70));
  console.log(' MJOLNIR — TOR Ingestion Pipeline');
  console.log('='.repeat(70));
  console.log(`Query Filter    : "${args.query}"`);
  console.log(`Limit per source: ${args.limit}`);
  console.log(`Source Target   : ${args.source}`);
  console.log(`Document Dir    : ${DOCUMENTS_DIR}`);
  console.log(`Skip OCR        : ${args.skipOcr}`);
  console.log(`Skip Classify   : ${args.skipClassify}`);
  console.log('='.repeat(70));

  await connectDatabase();

  // ----------------------------------------------------
  // Stage 1: Fetch & Download from live sources
  // ----------------------------------------------------
  console.log('\n[Stage 1/3] Fetching from live procurement sources...');

  if (args.source === 'all' || args.source === 'process3') {
    console.log('  -> Querying e-GP RSS Feed (process3.gprocurement.go.th)...');
    const p3Result = await fetchFromProcess3({
      query: args.query,
      limit: args.limit,
      documentsDir: DOCUMENTS_DIR,
    });
    console.log(
      `     Fetched: ${p3Result.fetched} project(s)` +
        (p3Result.errors.length ? ` (${p3Result.errors.length} notices)` : ''),
    );
  }

  if (args.source === 'all' || args.source === 'datago') {
    console.log('  -> Querying Open Gov Data (data.go.th CKAN)...');
    const dgResult = await fetchFromDataGo({
      query: args.query,
      limit: args.limit,
      documentsDir: DOCUMENTS_DIR,
    });
    console.log(
      `     Fetched: ${dgResult.fetched} project(s)` +
        (dgResult.errors.length ? ` (${dgResult.errors.length} notices)` : ''),
    );
  }

  // ----------------------------------------------------
  // Stage 2: OCR & Text Extraction
  // ----------------------------------------------------
  if (!args.skipOcr) {
    console.log('\n[Stage 2/3] Extracting text & running OCR on downloaded PDFs...');
    const pendingOcr = await Tor.find({
      pipelineStatus: 'downloaded',
      'document.storagePath': { $ne: null },
    });

    console.log(`  -> ${pendingOcr.length} document(s) queued for text extraction.`);

    for (let i = 0; i < pendingOcr.length; i++) {
      const tor = pendingOcr[i];
      console.log(
        `     [${i + 1}/${pendingOcr.length}] Extracting: ${tor.projectId} (${tor.document.fileName})`,
      );

      try {
        const ocrResult = await extractText(tor.document.storagePath);
        tor.ocr = {
          rawText: ocrResult.text,
          confidence: ocrResult.confidence,
          usedOcr: ocrResult.usedOcr,
          processedAt: new Date(),
        };
        tor.document.pages = ocrResult.pages;
        tor.document.documentType = ocrResult.usedOcr
          ? 'SCANNED_PAPER_PDF'
          : 'DIGITAL_TEXT_PDF';
        tor.pipelineStatus = 'ocr_done';
        await tor.save();

        console.log(
          `        Result: ${ocrResult.usedOcr ? 'Scanned OCR' : 'Digital PDF'} | ` +
            `Pages: ${ocrResult.pages} | Confidence: ${Math.round(ocrResult.confidence * 100)}% | ` +
            `Chars: ${ocrResult.text.length.toLocaleString()}`,
        );
      } catch (err) {
        console.error(
          `        Failed to extract text for ${tor.projectId}: ${err.message}`,
        );
      }
    }
  } else {
    console.log('\n[Stage 2/3] OCR skipped (--skip-ocr).');
  }

  // ----------------------------------------------------
  // Stage 3: IT-Relevance Classification
  // ----------------------------------------------------
  if (!args.skipClassify) {
    console.log('\n[Stage 3/3] Classifying IT relevance...');
    // Classify docs that have finished OCR, or downloaded docs if OCR was skipped
    const pendingClassify = await Tor.find({
      pipelineStatus: { $in: ['ocr_done', 'downloaded'] },
      'classification.classifiedAt': null,
    });

    console.log(`  -> ${pendingClassify.length} record(s) queued for classification.`);

    for (const tor of pendingClassify) {
      const textToAnalyze = tor.ocr?.rawText || tor.title || '';
      const result = classifyIT(textToAnalyze);

      tor.classification = {
        isIT: result.isIT,
        matchedKeywords: result.matchedKeywords,
        method: result.method,
        classifiedAt: new Date(),
      };
      tor.pipelineStatus = 'classified';
      await tor.save();
    }
  } else {
    console.log('\n[Stage 3/3] Classification skipped (--skip-classify).');
  }

  // ----------------------------------------------------
  // Execution Summary
  // ----------------------------------------------------
  const stats = {
    totalInDb: await Tor.countDocuments(),
    itRelevant: await Tor.countDocuments({ 'classification.isIT': true }),
    nonIT: await Tor.countDocuments({ 'classification.isIT': false }),
    scannedPdfs: await Tor.countDocuments({
      'document.documentType': 'SCANNED_PAPER_PDF',
    }),
    digitalPdfs: await Tor.countDocuments({
      'document.documentType': 'DIGITAL_TEXT_PDF',
    }),
    statusBreakdown: {
      fetched: await Tor.countDocuments({ pipelineStatus: 'fetched' }),
      downloaded: await Tor.countDocuments({ pipelineStatus: 'downloaded' }),
      ocrDone: await Tor.countDocuments({ pipelineStatus: 'ocr_done' }),
      classified: await Tor.countDocuments({ pipelineStatus: 'classified' }),
    },
  };

  console.log('\n' + '='.repeat(70));
  console.log(' PIPELINE EXECUTION SUMMARY');
  console.log('='.repeat(70));
  console.log(`Total TOR Records in DB : ${stats.totalInDb}`);
  console.log(`IT-Relevant Projects    : ${stats.itRelevant}`);
  console.log(`Non-IT Projects         : ${stats.nonIT}`);
  console.log(`Digital Text PDFs       : ${stats.digitalPdfs}`);
  console.log(`Scanned Paper PDFs (OCR): ${stats.scannedPdfs}`);
  console.log(`Pipeline Status States  :`, stats.statusBreakdown);
  console.log('='.repeat(70));

  await disconnectDatabase();
}

main().catch((err) => {
  console.error('[FATAL] Pipeline failure:', err);
  process.exit(1);
});
