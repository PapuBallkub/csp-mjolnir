/**
 * server/src/pipeline/ingestion/ingest.js
 *
 * Automated CLI runner for the TOR ingestion pipeline (FR01-FR04).
 * Supports independent stage execution and end-to-end chaining:
 * 1. Fetch: Query procurement sources (process3, datago) & pre-filter IT metadata
 * 2. Download: Resolve & stream download official TOR PDF packages from e-GP backend
 * 3. OCR: Hybrid text extraction (digital PDF text or Tesseract OCR for scans)
 *
 * Usage:
 *   # End-to-end
 *   node src/pipeline/ingestion/ingest.js
 *   npm run ingest
 *
 *   # Independent services
 *   node src/pipeline/ingestion/ingest.js --step fetch --query "คอมพิวเตอร์" --limit 3
 *   node src/pipeline/ingestion/ingest.js --step download
 *   node src/pipeline/ingestion/ingest.js --step download --id 68039469567
 *   node src/pipeline/ingestion/ingest.js --step ocr
 *   node src/pipeline/ingestion/ingest.js --step ocr --id 67109111284
 *
 *   # Try again the TORs that gave up after repeated failures
 *   node src/pipeline/ingestion/ingest.js --retry-failed
 *
 * One ingestion run at a time: a second one exits without doing anything
 * (ADR 0016).
 */

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { Tor } from '#models/index.js';
import { MAX_ATTEMPTS, clearFailure, loadGivenUp, recordFailure } from '../shared/failures.js';
import { RunLockHeldError, withRunLock } from '../shared/run-lock.js';
import { FEED_HOURS, fetchFromProcess3 } from './sources/process3.js';
import { fetchFromDataGo } from './sources/datago.js';
import { extractText } from './lib/ocr.js';
import {
  resolveAndDownloadEgpTorDocument,
  parseTorDocument,
} from './lib/tor-downloader.js';

const DOCUMENTS_DIR =
  process.env.DOCUMENTS_DIR ||
  path.resolve(import.meta.dirname, '../../../data/documents');

function parseCliArgs() {
  const argv = process.argv.slice(2);
  let step = 'all'; // 'all' | 'fetch' | 'download' | 'ocr'
  let id = null; // optional single projectId
  let query = 'คอมพิวเตอร์';
  let limit = 5;
  let source = 'all'; // 'all' | 'process3' | 'datago'
  let skipOcr = false;
  let retryFailed = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if ((arg === '--step' || arg === '-s') && i + 1 < argv.length) {
      step = argv[++i].toLowerCase();
    } else if (arg.startsWith('--step=') || arg.startsWith('-s=')) {
      step = arg.split('=')[1].toLowerCase();
    } else if (arg === '--id' && i + 1 < argv.length) {
      id = argv[++i].trim();
    } else if (arg.startsWith('--id=')) {
      id = arg.split('=')[1].trim();
    } else if ((arg === '--query' || arg === '-q' || arg === '--q') && i + 1 < argv.length) {
      query = argv[++i];
    } else if (arg.startsWith('--query=') || arg.startsWith('--q=')) {
      query = arg.split('=')[1];
    } else if ((arg === '--limit' || arg === '-l' || arg === '--l') && i + 1 < argv.length) {
      limit = parseInt(argv[++i], 10) || 5;
    } else if (arg.startsWith('--limit=') || arg.startsWith('--l=')) {
      limit = parseInt(arg.split('=')[1], 10) || 5;
    } else if (arg === '--source' && i + 1 < argv.length) {
      source = argv[++i].toLowerCase();
    } else if (arg.startsWith('--source=')) {
      source = arg.split('=')[1].toLowerCase();
    } else if (arg === '--skip-ocr') {
      skipOcr = true;
    } else if (arg === '--retry-failed') {
      retryFailed = true;
    }
  }

  return { step, id, query, limit, source, skipOcr, retryFailed };
}

/**
 * Leaves out the TORs a step gave up on, unless asked for by id or with
 * --retry-failed, and says how many it left out.
 */
async function withoutGivenUp(candidates, { step, id, retryFailed, inputKeyOf = () => null }) {
  if (id || retryFailed) return candidates;
  const gaveUp = await loadGivenUp(step);
  const kept = candidates.filter((tor) => !gaveUp(tor.projectId, inputKeyOf(tor)));
  const left = candidates.length - kept.length;
  if (left > 0) {
    console.log(
      `  -> ${left} project(s) skipped after ${MAX_ATTEMPTS} failed attempts ` +
        '(run with --retry-failed to try them again).',
    );
  }
  return kept;
}

/** Records a failed step, and says whether it counted and whether the TOR gave up. */
async function noteFailure({ projectId, step, error, transient = false, inputKey = null }) {
  const { attempts, counted, gaveUp } = await recordFailure({ projectId, step, error, transient, inputKey });
  if (!counted) return ' (the source did not answer; not counted as an attempt)';
  return ` (attempt ${attempts} of ${MAX_ATTEMPTS}${gaveUp ? '; skipped from now on until --retry-failed' : ''})`;
}

// OCR works from the PDF: a new PDF gets new tries
const pdfHashOf = (tor) => tor.document?.contentHash ?? null;

/**
 * Service 1: Fetch metadata from procurement sources and pre-filter IT relevance.
 */
export async function runFetchStep({ query, limit, source, documentsDir }) {
  console.log('\n[Service 1: FETCH] Discovering announcements & pre-filtering IT...');
  let totalFetched = 0;

  if (source === 'all' || source === 'process3') {
    console.log('  -> Querying e-GP RSS Feed (process3.gprocurement.go.th)...');
    const p3Result = await fetchFromProcess3({
      query,
      limit,
      documentsDir,
      downloadAttachments: false,
    });
    totalFetched += p3Result.fetched;
    console.log(`     Discovered: ${p3Result.discovered} new project(s); ${p3Result.updated} followed project(s) updated`);
    if (p3Result.closed) {
      console.warn(`     ${FEED_HOURS}, so nothing was requested. Run again after 12:01 or 17:01.`);
    } else {
      reportSourceErrors(p3Result.errors);
      if (p3Result.unreachable) {
        console.warn('     e-GP RSS DID NOT ANSWER: no new announcements were fetched from it this run.');
      }
    }
  }

  if (source === 'all' || source === 'datago') {
    console.log('  -> Querying Open Gov Data (data.go.th CKAN)...');
    const dgResult = await fetchFromDataGo({
      query,
      limit,
      documentsDir,
      downloadAttachments: false,
    });
    totalFetched += dgResult.fetched;
    console.log(`     Discovered: ${dgResult.fetched} project(s)`);
    reportSourceErrors(dgResult.errors);
  }

  return totalFetched;
}

/** Prints every error a source reported. A count alone once hid a dead feed. */
function reportSourceErrors(errors) {
  for (const error of errors) console.warn(`     ! ${error}`);
}

/**
 * Service 2: Download attached TOR packages/PDFs from e-GP backend.
 */
export async function runDownloadStep({ id, documentsDir, source = 'manual', retryFailed = false }) {
  console.log('\n[Service 2: DOWNLOAD] Resolving and downloading TOR PDFs...');
  await fs.mkdir(documentsDir, { recursive: true });

  let queryFilter = { pipelineStatus: 'fetched' };
  if (id) {
    queryFilter = { projectId: id };
  }

  let candidates = await Tor.find(queryFilter);

  // If targeting a specific ID not yet in the DB, create placeholder so we can download it
  if (id && candidates.length === 0) {
    const expectedPdfPath = path.join(documentsDir, `${id}_TOR.pdf`);
    const placeholder = new Tor({
      projectId: id,
      title: `Project ${id}`,
      source: ['process3', 'datago'].includes(source) ? source : 'manual',
      pipelineStatus: 'fetched',
      document: {
        fileName: `${id}_TOR.pdf`,
        storagePath: fsSync.existsSync(expectedPdfPath) ? expectedPdfPath : null,
      },
    });
    candidates = [placeholder];
  }

  candidates = await withoutGivenUp(candidates, { step: 'download', id, retryFailed });

  if (candidates.length === 0) {
    console.log('  -> No documents queued for download.');
    return 0;
  }

  console.log(`  -> ${candidates.length} project(s) queued for download.`);
  let successCount = 0;

  for (let i = 0; i < candidates.length; i++) {
    const tor = candidates[i];
    const expectedPdfName = `${tor.projectId}_TOR.pdf`;
    const targetPdfPath = path.join(documentsDir, expectedPdfName);

    console.log(`     [${i + 1}/${candidates.length}] Project ${tor.projectId}...`);

    let documentInfo = null;
    let isDownloaded = false;

    if (fsSync.existsSync(targetPdfPath)) {
      console.log(`        Already exists on disk: ${expectedPdfName}`);
      documentInfo = await parseTorDocument(targetPdfPath);
      isDownloaded = true;
    } else {
      const dlRes = await resolveAndDownloadEgpTorDocument({
        projectId: tor.projectId,
        destDir: documentsDir,
        fileName: expectedPdfName,
      });

      if (dlRes.success) {
        console.log(`        Downloaded: ${expectedPdfName} (${(dlRes.sizeBytes / 1024).toFixed(1)} KB)`);
        documentInfo = await parseTorDocument(dlRes.filePath, dlRes.companionText || '');
        isDownloaded = true;
      } else {
        const note = await noteFailure({
          projectId: tor.projectId,
          step: 'download',
          error: dlRes.error,
          transient: Boolean(dlRes.transient),
        });
        console.warn(`        Download failed: ${dlRes.error}${note}`);
      }
    }

    if (isDownloaded) {
      tor.document = {
        fileName: expectedPdfName,
        storagePath: targetPdfPath,
        sizeBytes: fsSync.statSync(targetPdfPath).size,
        pages: documentInfo?.totalPages || null,
        documentType: documentInfo?.documentType || 'UNKNOWN',
        contentHash: documentInfo?.contentHash || null,
        version: tor.document?.version || 1,
      };
      tor.pipelineStatus = 'downloaded';
      await tor.save();
      await clearFailure({ projectId: tor.projectId, step: 'download' });
      successCount++;
    }
  }

  return successCount;
}

/**
 * Service 3: OCR and Text Extraction on downloaded PDF documents.
 */
export async function runOcrStep({ id, documentsDir, source = 'manual', retryFailed = false }) {
  console.log('\n[Service 3: OCR] Extracting text & running OCR on PDF documents...');

  let queryFilter = {
    pipelineStatus: 'downloaded',
    'document.storagePath': { $ne: null },
  };

  if (id) {
    queryFilter = { projectId: id };
  }

  let candidates = await Tor.find(queryFilter);

  // If targeting a specific ID not in DB or without storagePath, check disk
  if (id && candidates.length === 0) {
    const expectedPdfPath = path.join(documentsDir, `${id}_TOR.pdf`);
    if (fsSync.existsSync(expectedPdfPath)) {
      const created = await Tor.findOneAndUpdate(
        { projectId: id },
        {
          $set: {
            title: `Project ${id}`,
            source: ['process3', 'datago'].includes(source) ? source : 'manual',
            pipelineStatus: 'downloaded',
            'document.fileName': `${id}_TOR.pdf`,
            'document.storagePath': expectedPdfPath,
            'document.sizeBytes': fsSync.statSync(expectedPdfPath).size,
          },
        },
        { upsert: true, returnDocument: 'after' },
      );
      candidates = [created];
    }
  }

  candidates = await withoutGivenUp(candidates, { step: 'ocr', id, retryFailed, inputKeyOf: pdfHashOf });

  if (candidates.length === 0) {
    console.log('  -> No documents queued for OCR.');
    return 0;
  }

  console.log(`  -> ${candidates.length} document(s) queued for text extraction.`);
  let successCount = 0;

  for (let i = 0; i < candidates.length; i++) {
    const tor = candidates[i];
    const pdfPath = tor.document?.storagePath || path.join(documentsDir, `${tor.projectId}_TOR.pdf`);

    if (!fsSync.existsSync(pdfPath)) {
      const error = `File not found at ${pdfPath}`;
      const note = await noteFailure({ projectId: tor.projectId, step: 'ocr', error, inputKey: pdfHashOf(tor) });
      console.warn(`     [${i + 1}/${candidates.length}] Skipping ${tor.projectId}: ${error}${note}`);
      continue;
    }

    console.log(`     [${i + 1}/${candidates.length}] Extracting: ${tor.projectId} (${path.basename(pdfPath)})`);

    try {
      const ocrResult = await extractText(pdfPath);
      tor.ocr = {
        rawText: ocrResult.text,
        confidence: ocrResult.confidence,
        usedOcr: ocrResult.usedOcr,
        truncated: ocrResult.truncated,
        processedAt: new Date(),
      };
      tor.document.pages = ocrResult.pages;
      tor.document.documentType = ocrResult.usedOcr
        ? 'SCANNED_PAPER_PDF'
        : 'DIGITAL_TEXT_PDF';
      tor.pipelineStatus = 'ocr_done';
      await tor.save();
      await clearFailure({ projectId: tor.projectId, step: 'ocr' });

      console.log(
        `        Type: ${ocrResult.usedOcr ? 'Scanned Paper (OCR)' : 'Digital Text PDF'} | ` +
          `Pages: ${ocrResult.pages} | Confidence: ${Math.round(ocrResult.confidence * 100)}% | ` +
          `Chars: ${ocrResult.text.length.toLocaleString()}` +
          (ocrResult.truncated ? ' | TRUNCATED: some pages were not read' : ''),
      );
      successCount++;
    } catch (err) {
      // OCR runs here, not at a source, so every failure is this TOR's own
      const note = await noteFailure({ projectId: tor.projectId, step: 'ocr', error: err, inputKey: pdfHashOf(tor) });
      console.error(`        Failed to extract text for ${tor.projectId}: ${err.message}${note}`);
    }
  }

  return successCount;
}

async function main() {
  const args = parseCliArgs();

  console.log('='.repeat(70));
  console.log(' MJOLNIR — Independent TOR Ingestion Pipeline');
  console.log('='.repeat(70));
  console.log(`Execution Step  : ${args.step.toUpperCase()}`);
  if (args.id) {
    console.log(`Target Project  : ${args.id}`);
  }
  console.log(`Query Filter    : "${args.query}"`);
  console.log(`Limit per source: ${args.limit}`);
  console.log(`Source Target   : ${args.source}`);
  console.log(`Document Dir    : ${DOCUMENTS_DIR}`);
  console.log(`Skip OCR        : ${args.skipOcr}`);
  console.log(`Retry failed    : ${args.retryFailed}`);
  console.log('='.repeat(70));

  await connectDatabase();
  try {
    await withRunLock('ingestion', () => runSteps(args));
  } finally {
    await disconnectDatabase();
  }
}

async function runSteps(args) {
  const isAll = args.step === 'all';

  if (isAll || args.step === 'fetch') {
    await runFetchStep({
      query: args.query,
      limit: args.limit,
      source: args.source,
      documentsDir: DOCUMENTS_DIR,
    });
  }

  if (isAll || args.step === 'download') {
    await runDownloadStep({
      id: args.id,
      source: args.source,
      documentsDir: DOCUMENTS_DIR,
      retryFailed: args.retryFailed,
    });
  }

  if ((isAll && !args.skipOcr) || args.step === 'ocr') {
    await runOcrStep({
      id: args.id,
      source: args.source,
      documentsDir: DOCUMENTS_DIR,
      retryFailed: args.retryFailed,
    });
  }

  // ----------------------------------------------------
  // Execution Summary
  // ----------------------------------------------------
  const stats = {
    totalInDb: await Tor.countDocuments(),
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
    },
  };

  console.log('\n' + '='.repeat(70));
  console.log(' PIPELINE SUMMARY');
  console.log('='.repeat(70));
  console.log(`Total TOR Records in DB : ${stats.totalInDb}`);
  console.log(`Digital Text PDFs       : ${stats.digitalPdfs}`);
  console.log(`Scanned Paper PDFs (OCR): ${stats.scannedPdfs}`);
  console.log(`Pipeline Status States  :`, stats.statusBreakdown);
  console.log('='.repeat(70));
}

// Only execute main when invoked as direct CLI script. import.meta.url is a
// file URL (file:///D:/...) and argv[1] a platform path (D:\...), so compare
// them as URLs: a string template matches on Linux and silently never on Windows.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    if (err instanceof RunLockHeldError) console.error(`\n${err.message}`);
    else console.error('[FATAL] Pipeline failure:', err);
    process.exit(1);
  });
}
