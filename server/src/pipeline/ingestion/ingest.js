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
import { IngestionLog, Tor, TorInsight } from '#models/index.js';
import { MAX_ATTEMPTS, clearFailure, loadGivenUp, recordFailure } from '../shared/failures.js';
import { RunLockHeldError, withRunLock } from '../shared/run-lock.js';
import { FEED_HOURS, fetchFromProcess3 } from './sources/process3.js';
import { fetchFromDataGo } from './sources/datago.js';
import { PREVIEW_PAGES, extractText, isPreviewRead } from './lib/ocr.js';
import { downloadEgpPackage, downloadEgpPricePackage } from './lib/tor-downloader.js';

const DOCUMENTS_DIR =
  process.env.DOCUMENTS_DIR ||
  path.resolve(import.meta.dirname, '../../../data/documents');

function parseCliArgs() {
  const argv = process.argv.slice(2);
  let step = 'all'; // 'all' | 'fetch' | 'download' | 'ocr'
  let id = null; // optional single projectId
  let query = null; // e-GP: none, classify decides; data.go.th: คอมพิวเตอร์
  let limit = null; // e-GP: no cap on new projects; data.go.th: 5
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
      limit = parseInt(argv[++i], 10) || null;
    } else if (arg.startsWith('--limit=') || arg.startsWith('--l=')) {
      limit = parseInt(arg.split('=')[1], 10) || null;
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

// Download and OCR only TORs still to come or open (ADR 0018):
// - announced by the e-GP feed, the only source of open projects (ADR 0017).
//   With no announcement, "Open" is only the status engine's default.
// - not past: a TOR with a contract winner is past, whatever its status says.
const WORKABLE = {
  status: { $in: ['Draft', 'Open'] },
  'announcementHistory.0': { $exists: true },
  'contract.winnerName': { $in: [null, ''] },
};

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
    const startedAt = new Date();
    try {
      const p3Result = await fetchFromProcess3({
        query,
        limit: limit ?? Infinity,
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

      const status =
        p3Result.unreachable ? 'failed' : p3Result.errors.length > 0 ? (p3Result.fetched > 0 ? 'degraded' : 'failed') : 'ok';
      await IngestionLog.create({
        source: 'process3',
        status,
        startedAt,
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt.getTime(),
        itemsDiscovered: p3Result.discovered ?? p3Result.fetched,
        itemsIngested: p3Result.fetched,
        error: p3Result.unreachable ? 'e-GP RSS did not answer' : p3Result.errors.length ? p3Result.errors.join('; ') : null,
        metadata: { query, limit },
      }).catch((err) => console.warn('Could not record IngestionLog for process3:', err.message));
    } catch (err) {
      console.warn('Process3 fetch error:', err.message);
      await IngestionLog.create({
        source: 'process3',
        status: 'failed',
        startedAt,
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt.getTime(),
        error: err.message,
        metadata: { query, limit },
      }).catch(() => {});
    }
  }

  if (source === 'all' || source === 'datago') {
    console.log('  -> Querying Open Gov Data (data.go.th CKAN)...');
    const startedAt = new Date();
    try {
      const dgResult = await fetchFromDataGo({
        query: query ?? 'คอมพิวเตอร์',
        limit: limit ?? 5,
        documentsDir,
        downloadAttachments: false,
      });
      totalFetched += dgResult.fetched;
      console.log(`     Discovered: ${dgResult.fetched} project(s)`);
      reportSourceErrors(dgResult.errors);

      const status =
        dgResult.errors.length > 0 ? (dgResult.fetched > 0 ? 'degraded' : 'failed') : 'ok';
      await IngestionLog.create({
        source: 'datago',
        status,
        startedAt,
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt.getTime(),
        itemsDiscovered: dgResult.fetched + dgResult.errors.length,
        itemsIngested: dgResult.fetched,
        error: dgResult.errors.length ? dgResult.errors.join('; ') : null,
        metadata: { query, limit },
      }).catch((err) => console.warn('Could not record IngestionLog for datago:', err.message));
    } catch (err) {
      console.warn('DataGo fetch error:', err.message);
      await IngestionLog.create({
        source: 'datago',
        status: 'failed',
        startedAt,
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt.getTime(),
        error: err.message,
        metadata: { query, limit },
      }).catch(() => {});
    }
  }

  return totalFetched;
}

/** Prints every error a source reported. A count alone once hid a dead feed. */
function reportSourceErrors(errors) {
  for (const error of errors) console.warn(`     ! ${error}`);
}

/**
 * Records a new package on a TOR (ADR 0020): its files and facts, and its TOR
 * as the document. The facts are the documents' own, like the feed's:
 * - the agency, only where the feed gave none;
 * - ราคากลาง and when bids close, wherever this package states them. One that
 *   doesn't, a draft's empty bid date say, leaves the last value standing.
 *
 * @returns {{ torChanged: boolean }} Whether the TOR's bytes changed, which
 *   means it must be read again
 */
export function applyPackage(tor, { package: pkg, tor: file }) {
  tor.packages.push(pkg);
  tor.packageCheckNeeded = false;

  const { agency, referencePriceTHB, submissionWindow } = pkg.facts;
  if (agency && !tor.agency) tor.agency = agency.value;
  if (referencePriceTHB) tor.referencePriceTHB = referencePriceTHB.value;
  if (submissionWindow) tor.submissionDeadline = submissionWindow.closesAt;

  const before = tor.document?.contentHash ?? null;
  const torChanged = file.contentHash !== before;
  tor.document = {
    fileName: file.fileName,
    storagePath: file.storagePath,
    sizeBytes: file.sizeBytes,
    pages: file.pages,
    documentType: file.documentType,
    contentHash: file.contentHash,
    // A new version only when there was an earlier one and it differs
    version: (tor.document?.version ?? 1) + (before && torChanged ? 1 : 0),
    parts: file.parts ?? [],
  };
  return { torChanged };
}

/**
 * OCRs a TOR as one document (ADR 0020), whether it's one file or several. A
 * preview spends its page budget across the parts in order; a part left
 * unread makes the result a preview. Each part's text is headed by its name.
 *
 * @param {{ storagePath: string, fileName?: string, pages?: number }[]} parts
 * @param {{ maxPages?: number }} options
 * @param {Function} ocr - extractText
 */
export async function readTorParts(parts, options, ocr) {
  if (parts.length === 1) return ocr(parts[0].storagePath, options);

  let budget = options.maxPages ?? Infinity;
  const reads = [];
  for (const part of parts) {
    if (budget <= 0) {
      reads.push({ part, read: null });
      continue;
    }
    const read = await ocr(part.storagePath, Number.isFinite(budget) ? { maxPages: budget } : {});
    reads.push({ part, read });
    if (read.usedOcr) budget -= read.pagesRead ?? 0; // a text layer costs no OCR
  }

  const done = reads.filter(({ read }) => read);
  const pagesRead = done.reduce((sum, { read }) => sum + (read.pagesRead ?? 0), 0);
  const ocrPages = done.filter(({ read }) => read.usedOcr).reduce((sum, { read }) => sum + read.pagesRead, 0);
  return {
    text: done.map(({ part, read }) => `=== ${part.fileName ?? path.basename(part.storagePath)} ===\n${read.text}`).join('\n\n'),
    pages: reads.reduce((sum, { part, read }) => sum + (read?.pages ?? part.pages ?? 0), 0),
    pagesRead,
    usedOcr: done.some(({ read }) => read.usedOcr),
    // OCR's own confidence, by how many pages each part had read that way,
    // to two decimals like extractText's
    confidence: ocrPages
      ? Math.round(
          (done.filter(({ read }) => read.usedOcr).reduce((sum, { read }) => sum + read.confidence * read.pagesRead, 0) /
            ocrPages) *
            100,
        ) / 100
      : 1,
    truncated: reads.some(({ read }) => !read || read.truncated),
  };
}

/**
 * Records a new price package on a TOR (ADR 0023). The budget is the form's
 * alone. ราคากลาง from the form is a check: the announcement's real text
 * beats the form's OCR, so the form's fills in only where the announcement
 * gave none, and a difference is noted on the package.
 */
export function applyPricePackage(tor, pkg) {
  const { budgetTHB, referencePriceTHB } = pkg.facts;
  const problems = [...pkg.problems];
  if (budgetTHB) tor.budgetTHB = budgetTHB.value;
  if (referencePriceTHB) {
    if (!(tor.referencePriceTHB > 0)) tor.referencePriceTHB = referencePriceTHB.value;
    else if (Math.abs(tor.referencePriceTHB - referencePriceTHB.value) >= 1) {
      problems.push(
        `ราคากลาง: the price form says ${referencePriceTHB.value.toLocaleString()}, ` +
          `the announcement ${tor.referencePriceTHB.toLocaleString()}; the announcement's stands`,
      );
    }
  }
  tor.packages.push({ ...pkg, problems });
  return { problems };
}

const describeFacts = ({ agency, referencePriceTHB, submissionWindow }) =>
  [
    agency && `agency ${agency.value}`,
    referencePriceTHB && `ราคากลาง ${referencePriceTHB.value.toLocaleString()}`,
    submissionWindow && `bids close ${submissionWindow.closesAt.toISOString()}`,
  ]
    .filter(Boolean)
    .join(' · ') || 'no facts stated';

/**
 * Service 2: Download each workable TOR's e-GP package (ADR 0020): a new
 * project's, one whose project moved to a new stage, and one downloaded
 * before packages were kept. A package already downloaded isn't again.
 *
 * @param {Function} [options.download] - downloadEgpPackage; replaced in tests
 */
export async function runDownloadStep({
  id,
  documentsDir,
  source = 'manual',
  retryFailed = false,
  download = downloadEgpPackage,
  downloadPrice = downloadEgpPricePackage,
}) {
  console.log('\n[Service 2: DOWNLOAD] Downloading e-GP document packages...');
  await fs.mkdir(documentsDir, { recursive: true });

  // Only TORs still to come or open: a cancelled or awarded one isn't a job,
  // so its documents aren't worth fetching (ADR 0018). The price package is
  // asked for once, and again at each new stage (ADR 0023).
  let queryFilter = {
    ...WORKABLE,
    $or: [
      { pipelineStatus: 'fetched' },
      { packageCheckNeeded: true },
      { 'packages.0': { $exists: false } },
      { priceCheckedAt: null },
    ],
  };
  if (id) {
    queryFilter = { projectId: id };
  }

  let candidates = await Tor.find(queryFilter);

  // If targeting a specific ID not yet in the DB, create placeholder so we can download it
  if (id && candidates.length === 0) {
    const placeholder = new Tor({
      projectId: id,
      title: `Project ${id}`,
      source: ['process3', 'datago'].includes(source) ? source : 'manual',
      pipelineStatus: 'fetched',
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
    console.log(`     [${i + 1}/${candidates.length}] Project ${tor.projectId}...`);

    // Before the announcement's package clears the flag: a new stage may bring a new price too
    const checkPrice = !tor.priceCheckedAt || tor.packageCheckNeeded;
    const zipIdsOf = (kind) =>
      (tor.packages ?? []).filter((pkg) => (pkg.kind ?? 'announcement') === kind).map((pkg) => pkg.zipId);

    const result = await download({
      projectId: tor.projectId,
      documentsDir,
      knownZipIds: zipIdsOf('announcement'),
    });

    if (!result.success) {
      const note = await noteFailure({
        projectId: tor.projectId,
        step: 'download',
        error: result.error,
        transient: Boolean(result.transient),
      });
      console.warn(`        Download failed: ${result.error}${note}`);
      continue;
    }

    if (result.unchanged) {
      tor.packageCheckNeeded = false;
      console.log(`        Package unchanged (${result.zipId})`);
    } else {
      const { torChanged } = applyPackage(tor, result);
      // A new TOR is read again; one whose bytes didn't change keeps its text
      if (torChanged || tor.pipelineStatus === 'fetched') tor.pipelineStatus = 'downloaded';
      const kept = result.package.files.map((file) => `${file.fileName} (${file.role})`).join(', ');
      console.log(`        Package ${result.package.name}: ${kept}`);
      console.log(`        Read: ${describeFacts(result.package.facts)}`);
      for (const problem of result.package.problems) console.warn(`        ! ${problem}`);
      const more = result.tor.parts.length > 1 ? ` + ${result.tor.parts.length - 1} more part(s)` : '';
      console.log(`        TOR: ${result.tor.fileName}${more}${torChanged ? '' : ' (unchanged, not read again)'}`);
    }

    if (checkPrice) {
      const price = await downloadPrice({
        projectId: tor.projectId,
        documentsDir,
        knownZipIds: zipIdsOf('price'),
        announcedReferencePrice: tor.referencePriceTHB > 0 ? tor.referencePriceTHB : null,
      });
      if (!price.success) {
        // Asked again next run; the TOR's own download still counts as done
        console.warn(`        Price package: ${price.error}`);
      } else {
        tor.priceCheckedAt = new Date();
        if (price.none) console.log('        Price package: none in e-GP');
        else if (price.unchanged) console.log(`        Price package unchanged (${price.zipId})`);
        else {
          const { problems } = applyPricePackage(tor, price.package);
          const { budgetTHB } = price.package.facts;
          console.log(`        Price form: ${budgetTHB ? `budget ${budgetTHB.value.toLocaleString()}` : 'no budget read'}`);
          for (const problem of problems) console.warn(`        ! ${problem}`);
        }
      }
    }
    await tor.save();
    await clearFailure({ projectId: tor.projectId, step: 'download' });
    successCount++;
  }

  return successCount;
}

/**
 * Service 3: OCR, in two passes over the TORs still to come or open (ADR 0018).
 * 1. Preview: a downloaded scan is read for its first PREVIEW_PAGES pages,
 *    enough for classify to decide whether it's IT. A digital PDF, or a scan
 *    no longer than that, is read whole.
 * 2. Full: a preview that classify found to be IT is read whole, so
 *    extraction can follow.
 * With --id, one TOR is read whole, whatever its state.
 *
 * @param {Function} [options.ocr] - extractText; replaced in tests
 */
export async function runOcrStep({ id, documentsDir, source = 'manual', retryFailed = false, ocr = extractText }) {
  console.log('\n[Service 3: OCR] Extracting text & running OCR on PDF documents...');

  let previews = [];
  let fullReads = [];

  if (id) {
    fullReads = await Tor.find({ projectId: id });

    // If targeting a specific ID not in DB or without storagePath, check disk
    if (fullReads.length === 0) {
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
        fullReads = [created];
      }
    }
  } else {
    // A TOR already extracted as IT whose file changed is read whole: a
    // preview would be classified again, and hide its page meanwhile (ADR 0020)
    const extracted = await TorInsight.distinct('projectId', {
      'metadata.excluded': null,
      'metadata.awaitingFullText': { $ne: true },
    });
    const downloaded = { pipelineStatus: 'downloaded', 'document.storagePath': { $ne: null }, ...WORKABLE };
    previews = await Tor.find({ ...downloaded, projectId: { $nin: extracted } });

    // Extraction says which previews are IT; ingestion only reads that (ADR 0013)
    const waiting = await TorInsight.distinct('projectId', { 'metadata.awaitingFullText': true });
    fullReads = await Tor.find({
      ...WORKABLE,
      $or: [
        { pipelineStatus: 'ocr_preview', projectId: { $in: waiting } },
        { ...downloaded, projectId: { $in: extracted } },
      ],
    });
  }

  previews = await withoutGivenUp(previews, { step: 'ocr', id, retryFailed, inputKeyOf: pdfHashOf });
  fullReads = await withoutGivenUp(fullReads, { step: 'ocr', id, retryFailed, inputKeyOf: pdfHashOf });
  const queue = [
    ...previews.map((tor) => ({ tor, preview: true })),
    ...fullReads.map((tor) => ({ tor, preview: false })),
  ];

  if (queue.length === 0) {
    console.log('  -> No documents queued for OCR.');
    return 0;
  }

  console.log(
    `  -> ${previews.length} document(s) to preview (first ${PREVIEW_PAGES} pages), ` +
      `${fullReads.length} to read whole.`,
  );
  let successCount = 0;

  for (const [i, { tor, preview }] of queue.entries()) {
    const label = `     [${i + 1}/${queue.length}]`;
    const pdfPath = tor.document?.storagePath || path.join(documentsDir, `${tor.projectId}_TOR.pdf`);
    // A TOR in several files is read as one document (ADR 0020)
    const parts = tor.document?.parts?.length ? tor.document.parts : [{ storagePath: pdfPath }];

    const missing = parts.find((part) => !fsSync.existsSync(part.storagePath));
    if (missing) {
      const error = `File not found at ${missing.storagePath}`;
      const note = await noteFailure({ projectId: tor.projectId, step: 'ocr', error, inputKey: pdfHashOf(tor) });
      console.warn(`${label} Skipping ${tor.projectId}: ${error}${note}`);
      continue;
    }

    const files = parts.length > 1 ? `${parts.length} files` : path.basename(pdfPath);
    console.log(`${label} ${preview ? 'Previewing' : 'Reading whole'}: ${tor.projectId} (${files})`);

    try {
      const ocrResult = await readTorParts(parts, preview ? { maxPages: PREVIEW_PAGES } : {}, ocr);
      // A short scan or a digital PDF was read whole even on the preview pass
      const isPreview = preview && isPreviewRead(ocrResult);
      tor.ocr = {
        rawText: ocrResult.text,
        confidence: ocrResult.confidence,
        usedOcr: ocrResult.usedOcr,
        truncated: ocrResult.truncated,
        preview: isPreview,
        pagesRead: ocrResult.pagesRead ?? null,
        processedAt: new Date(),
      };
      tor.document.pages = ocrResult.pages;
      tor.document.documentType = ocrResult.usedOcr
        ? 'SCANNED_PAPER_PDF'
        : 'DIGITAL_TEXT_PDF';
      tor.pipelineStatus = isPreview ? 'ocr_preview' : 'ocr_done';
      await tor.save();
      await clearFailure({ projectId: tor.projectId, step: 'ocr' });

      console.log(
        `        Type: ${ocrResult.usedOcr ? 'Scanned Paper (OCR)' : 'Digital Text PDF'} | ` +
          (isPreview
            ? `PREVIEW: ${ocrResult.pagesRead} of ${ocrResult.pages} pages`
            : `Pages: ${ocrResult.pages}`) +
          ` | Confidence: ${Math.round(ocrResult.confidence * 100)}% | ` +
          `Chars: ${ocrResult.text.length.toLocaleString()}` +
          (!isPreview && ocrResult.truncated ? ' | TRUNCATED: some pages were not read' : ''),
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
  console.log(`Query Filter    : ${args.query ? `"${args.query}"` : "none for e-GP (classify decides); คอมพิวเตอร์ for data.go.th"}`);
  console.log(`Limit per source: ${args.limit ?? "none for e-GP; 5 for data.go.th"}`);
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
