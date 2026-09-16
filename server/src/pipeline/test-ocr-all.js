/**
 * server/src/pipeline/test-ocr-all.js
 *
 * Tests the OCR module across all TOR PDFs currently in server/data/documents.
 * Outputs extracted text (.txt) and detailed audit metrics (.json) into:
 *   server/data/ocr_extracted_texts/
 */

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractText } from './lib/ocr.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCUMENTS_DIR = path.resolve(__dirname, '../../data/documents');
const OUTPUT_DIR = path.resolve(__dirname, '../../data/ocr_extracted_texts');

async function main() {
  console.log('='.repeat(72));
  console.log(' TOR OCR BATCH TEST RUNNER');
  console.log('='.repeat(72));
  console.log(`Input Directory : ${DOCUMENTS_DIR}`);
  console.log(`Output Directory: ${OUTPUT_DIR}`);
  console.log(`Page Limit      : 30 pages max per document`);
  console.log(`Timeout Limit   : 4 minutes (240s) max per document`);
  console.log('='.repeat(72));

  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const files = (await fs.readdir(DOCUMENTS_DIR)).filter((f) =>
    f.toLowerCase().endsWith('.pdf'),
  );

  if (files.length === 0) {
    console.log('[Notice] No PDF files found in documents directory.');
    return;
  }

  console.log(`Found ${files.length} PDF documents to process.\n`);

  const results = [];

  for (let i = 0; i < files.length; i++) {
    const fileName = files[i];
    const filePath = path.join(DOCUMENTS_DIR, fileName);
    const stat = fsSync.statSync(filePath);
    const projectId = fileName.split('_')[0];

    console.log(`------------------------------------------------------------------------`);
    console.log(`[${i + 1}/${files.length}] Processing: ${fileName}`);
    console.log(`     File Size : ${(stat.size / 1024 / 1024).toFixed(2)} MB (${stat.size.toLocaleString()} bytes)`);

    const startTime = Date.now();
    try {
      const result = await extractText(filePath, { maxPages: 30, timeoutMs: 240000 });
      const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);

      console.log(`     Type      : ${result.usedOcr ? 'SCANNED_PAPER_PDF (OCR)' : 'DIGITAL_TEXT_PDF (Direct)'}`);
      console.log(`     Pages     : ${result.pages}`);
      console.log(`     Confidence: ${Math.round(result.confidence * 100)}%`);
      console.log(`     Length    : ${result.text.length.toLocaleString()} characters`);
      console.log(`     Duration  : ${elapsedSec}s`);
      console.log(`     Snippet   : ${result.text.slice(0, 120).replace(/\s+/g, ' ').trim()}...`);

      // 1. Save extracted plain text
      const txtFileName = `${projectId}_raw_text.txt`;
      const txtFilePath = path.join(OUTPUT_DIR, txtFileName);
      await fs.writeFile(txtFilePath, result.text, 'utf-8');

      // 2. Save execution metadata JSON
      const meta = {
        projectId,
        fileName,
        fileSizeBytes: stat.size,
        documentType: result.usedOcr ? 'SCANNED_PAPER_PDF' : 'DIGITAL_TEXT_PDF',
        usedOcr: result.usedOcr,
        pages: result.pages,
        confidence: result.confidence,
        textLength: result.text.length,
        durationSeconds: parseFloat(elapsedSec),
        processedAt: new Date().toISOString(),
        txtFile: txtFileName,
        first300Chars: result.text.slice(0, 300),
      };

      const jsonFileName = `${projectId}_summary.json`;
      const jsonFilePath = path.join(OUTPUT_DIR, jsonFileName);
      await fs.writeFile(jsonFilePath, JSON.stringify(meta, null, 2), 'utf-8');

      results.push(meta);
    } catch (err) {
      const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
      console.error(`     [FAILED]  : ${err.message} (${elapsedSec}s)`);
      results.push({
        projectId,
        fileName,
        error: err.message,
        durationSeconds: parseFloat(elapsedSec),
      });
    }
  }

  // Summary Table
  console.log('\n' + '='.repeat(72));
  console.log(' BATCH OCR SUMMARY REPORT');
  console.log('='.repeat(72));
  console.table(
    results.map((r) => ({
      Project: r.projectId,
      Type: r.error ? 'ERROR' : (r.usedOcr ? 'SCANNED' : 'DIGITAL'),
      Pages: r.pages || 'N/A',
      Confidence: r.confidence !== undefined ? `${Math.round(r.confidence * 100)}%` : 'N/A',
      Characters: r.textLength !== undefined ? r.textLength.toLocaleString() : 'N/A',
      Duration: `${r.durationSeconds}s`,
    })),
  );
  console.log(`All outputs stored in: ${OUTPUT_DIR}`);
  console.log('='.repeat(72));
}

main().catch((err) => {
  console.error('[FATAL] Batch runner error:', err);
  process.exit(1);
});
