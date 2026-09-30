/**
 * server/src/pipeline/ingestion/lib/ocr.js
 *
 * Hybrid text extraction module for TOR PDFs.
 * - Fast path: Extracts embedded digital text via pdf-parse.
 * - Scanned path: Renders PDF pages to images via pdf-to-img and extracts text
 *   using Tesseract.js (tha+eng).
 */

import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { PDFParse } from 'pdf-parse';
import { pdf } from 'pdf-to-img';
import { createWorker } from 'tesseract.js';

const require = createRequire(import.meta.resolve('pdf-to-img'));
const pdfjsDistPkg = require.resolve('pdfjs-dist/package.json');
// pdf.js insists the directory ends in "/" and reads it with fs.readFile, so
// build it with forward slashes: path.sep would end it in "\" on Windows.
const wasmDir = path.join(path.dirname(pdfjsDistPkg), 'wasm').split(path.sep).join('/') + '/';
const napiCanvas = require('@napi-rs/canvas');

// Scanned pages have measured 2.6 s (ADR 0008) to 3.8 s (a 30-page TOR on a
// Windows laptop) each: 10 s per page leaves 2.5-4x headroom, and the budget
// grows with the page count instead of a fixed ceiling that long TORs used to
// hit. Both can be raised per machine through the environment (ADR 0013).
const DEFAULT_MAX_PAGES = 150;
const DEFAULT_SECONDS_PER_PAGE = 10;
const PAGE_TIMEOUT_MS = 60000; // 60s timeout per single page

/**
 * Reads a positive number from the environment. An unset or malformed value
 * falls back to the default, so a typo can never switch a limit off.
 */
function positiveNumberFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Decides whether the OCR text is missing part of the document, so extraction
 * can send the TOR to review instead of trusting an answer that may sit on a
 * page we never read (ADR 0013).
 *
 * @param {Object} run
 * @param {'page-limit' | 'timeout' | null} run.stoppedEarly - Why the page loop ended before the last page, or null if it reached the end
 * @param {number[]} run.skippedPages - Pages whose OCR threw or timed out and contributed no text
 * @param {number} run.pagesAttempted - Pages the loop tried to read
 * @param {number} run.totalPages - Pages in the PDF (0 when unknown)
 * @returns {boolean}
 */
export function isTruncated({ stoppedEarly, skippedPages, pagesAttempted, totalPages }) {
  return (
    stoppedEarly === 'page-limit' ||
    stoppedEarly === 'timeout' ||
    skippedPages.length > 0 ||
    totalPages === 0 ||
    pagesAttempted < totalPages
  );
}

/**
 * Safely cleans OCR / extracted text without removing critical specification data.
 * - Normalizes Unicode using Form C (NFC) for Thai composite characters & tone marks.
 * - Strips isolated page markers (e.g. "-- 1 of 12 --").
 * - Collapses consecutive spaces without altering newlines.
 * - Removes lines consisting purely of punctuation/scanner dust artifacts while preserving
 *   short specification lines (e.g. "๑ ชุด", "24 Core", digits, bullet numbers).
 * - Collapses 3+ consecutive newlines to 2.
 *
 * @param {string} text - Raw extracted text
 * @returns {string} Cleaned normalized text
 */
export function cleanOcrText(text) {
  if (!text || typeof text !== 'string') return '';

  const rawLines = text
    .normalize('NFC')
    .replace(/--\s*\d+\s*of\s*\d+\s*--/gi, '')
    .split('\n');

  const filteredLines = [];
  for (const rawLine of rawLines) {
    const trimmed = rawLine.replace(/[^\S\r\n]+/g, ' ').trim();
    if (trimmed === '') {
      // Preserve intentional paragraph breaks
      filteredLines.push('');
    } else if (/[\p{L}\p{N}]/u.test(trimmed)) {
      // Keep meaningful line containing letters or digits
      filteredLines.push(trimmed);
    }
    // Else: line contains only punctuation/scanner dust, drop it
  }

  return filteredLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Extracts text from a PDF file on disk.
 * Detects whether the document has digital text or requires OCR.
 *
 * @param {string} pdfPath - Absolute or relative path to PDF file
 * @param {Object} [options]
 * @param {number} [options.maxPages] - Maximum pages to OCR (default OCR_MAX_PAGES, else 150)
 * @param {number} [options.secondsPerPage] - OCR time budget per page (default OCR_SECONDS_PER_PAGE, else 10)
 * @returns {Promise<{ text: string, confidence: number, usedOcr: boolean, pages: number, truncated: boolean }>}
 */
export async function extractText(pdfPath, options = {}) {
  const maxPages =
    options.maxPages ?? positiveNumberFromEnv('OCR_MAX_PAGES', DEFAULT_MAX_PAGES);
  const secondsPerPage =
    options.secondsPerPage ??
    positiveNumberFromEnv('OCR_SECONDS_PER_PAGE', DEFAULT_SECONDS_PER_PAGE);
  const buffer = await fs.readFile(pdfPath);

  // 1. Fast path: try embedded digital text
  const digitalResult = await tryEmbeddedDigitalText(buffer);
  if (digitalResult.isDigital) {
    return {
      text: digitalResult.text,
      confidence: 1.0,
      usedOcr: false,
      pages: digitalResult.pages,
      truncated: false,
    };
  }

  // 2. Slow path: scanned PDF -> render pages to images -> Tesseract OCR
  return ocrScannedPdf(pdfPath, digitalResult.pages, { maxPages, secondsPerPage });
}

/**
 * Attempts to extract embedded digital text from PDF buffer.
 * Formats output with page demarcations (=== Page X ===).
 * @param {Buffer} buffer
 * @returns {Promise<{ isDigital: boolean, text: string, pages: number }>}
 */
async function tryEmbeddedDigitalText(buffer) {
  try {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const parsed = await parser.getText();
    const rawPages = parsed?.pages || [];
    const totalPages = rawPages.length;

    const formattedPages = rawPages
      .map((p, idx) => {
        const pageNum = p.num || idx + 1;
        const cleaned = cleanOcrText(p.text || '');
        return cleaned ? `=== Page ${pageNum} ===\n${cleaned}` : '';
      })
      .filter(Boolean);

    const combinedText = formattedPages.join('\n\n').trim();
    const isDigital = combinedText.length >= 50;

    return {
      isDigital,
      text: combinedText,
      pages: totalPages,
    };
  } catch {
    return {
      isDigital: false,
      text: '',
      pages: 0,
    };
  }
}

/**
 * Renders pages to images and runs Tesseract OCR.
 * Demarcates pages with === Page X === headers.
 * @param {string} pdfPath
 * @param {number} [fallbackPages=0]
 * @param {{ maxPages: number, secondsPerPage: number }} limits
 * @returns {Promise<{ text: string, confidence: number, usedOcr: boolean, pages: number, truncated: boolean }>}
 */
async function ocrScannedPdf(pdfPath, fallbackPages = 0, { maxPages, secondsPerPage }) {
  let doc = null;
  let worker = null;
  const startTime = Date.now();

  try {
    // Reset global worker state from any preceding pdf-parse calls
    delete globalThis.pdfjsWorker;
    delete globalThis.pdfjsLib;
    globalThis.Path2D = napiCanvas.Path2D;

    doc = await pdf(pdfPath, {
      scale: 2,
      docInitParams: { wasmUrl: wasmDir },
    });
    worker = await createWorker(['tha', 'eng']);

    // The budget covers the pages we will actually read. When the page count
    // is unknown, budget for the page limit rather than for nothing.
    const totalPages = doc.length || fallbackPages;
    const timeoutMs = Math.min(totalPages || maxPages, maxPages) * secondsPerPage * 1000;

    let pageIndex = 0;
    let stoppedEarly = null;
    const skippedPages = [];
    const pageTexts = [];
    const confidences = [];

    for await (const pageImageBuffer of doc) {
      pageIndex++;
      if (pageIndex > maxPages) {
        stoppedEarly = 'page-limit';
        console.log(`[OCR Notice] Reached maximum page limit of ${maxPages} pages.`);
        break;
      }

      if (Date.now() - startTime > timeoutMs) {
        stoppedEarly = 'timeout';
        console.warn(
          `[OCR Notice] Reached document timeout limit of ${Math.round(timeoutMs / 1000)}s ` +
            `at page ${pageIndex}. Returning extracted text accumulated so far.`,
        );
        break;
      }

      try {
        const recPromise = worker.recognize(pageImageBuffer);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error(`Page ${pageIndex} OCR timed out`)),
            PAGE_TIMEOUT_MS,
          ),
        );

        const result = await Promise.race([recPromise, timeoutPromise]);
        if (result?.data?.text) {
          const cleaned = cleanOcrText(result.data.text);
          if (cleaned) {
            pageTexts.push(`=== Page ${pageIndex} ===\n${cleaned}`);
          }
          if (typeof result.data.confidence === 'number') {
            confidences.push(result.data.confidence);
          }
        }
      } catch (err) {
        skippedPages.push(pageIndex);
        console.warn(`[OCR Warning] Skipping page ${pageIndex}: ${err.message}`);
      }
    }

    // A loop that broke early counted the page it stopped at without reading it.
    const pagesAttempted = stoppedEarly ? pageIndex - 1 : pageIndex;
    const combinedText = pageTexts.join('\n\n').trim();
    const avgConfidence =
      confidences.length > 0
        ? confidences.reduce((a, b) => a + b, 0) / confidences.length / 100
        : 0;

    return {
      text: combinedText,
      confidence: Math.round(avgConfidence * 100) / 100,
      usedOcr: true,
      pages: totalPages || pagesAttempted,
      truncated: isTruncated({ stoppedEarly, skippedPages, pagesAttempted, totalPages }),
    };
  } finally {
    if (doc?.destroy) {
      try {
        await doc.destroy();
      } catch {
        // ignore cleanup error
      }
    }
    if (worker?.terminate) {
      try {
        await worker.terminate();
      } catch {
        // ignore cleanup error
      }
    }
  }
}
