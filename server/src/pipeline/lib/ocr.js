/**
 * server/src/pipeline/lib/ocr.js
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
const wasmDir = path.join(path.dirname(pdfjsDistPkg), 'wasm') + path.sep;
const napiCanvas = require('@napi-rs/canvas');

const MAX_OCR_PAGES = 30; // Scan up to 30 pages for thorough specification extraction
const PAGE_TIMEOUT_MS = 60000; // 60s timeout per single page
const DOCUMENT_TIMEOUT_MS = 240000; // 4-minute safety ceiling per document

/**
 * Extracts text from a PDF file on disk.
 * Detects whether the document has digital text or requires OCR.
 *
 * @param {string} pdfPath - Absolute or relative path to PDF file
 * @param {Object} [options]
 * @param {number} [options.maxPages=30] - Maximum pages to OCR
 * @param {number} [options.timeoutMs=240000] - Maximum milliseconds for OCR pass
 * @returns {Promise<{ text: string, confidence: number, usedOcr: boolean, pages: number }>}
 */
export async function extractText(pdfPath, options = {}) {
  const maxPages = options.maxPages || MAX_OCR_PAGES;
  const timeoutMs = options.timeoutMs || DOCUMENT_TIMEOUT_MS;
  const buffer = await fs.readFile(pdfPath);

  // 1. Fast path: try embedded digital text
  const digitalResult = await tryEmbeddedDigitalText(buffer);
  if (digitalResult.isDigital) {
    return {
      text: digitalResult.text,
      confidence: 1.0,
      usedOcr: false,
      pages: digitalResult.pages,
    };
  }

  // 2. Slow path: scanned PDF -> render pages to images -> Tesseract OCR
  return ocrScannedPdf(pdfPath, digitalResult.pages, { maxPages, timeoutMs });
}

/**
 * Attempts to extract embedded digital text from PDF buffer.
 * @param {Buffer} buffer
 * @returns {Promise<{ isDigital: boolean, text: string, pages: number }>}
 */
async function tryEmbeddedDigitalText(buffer) {
  try {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const parsed = await parser.getText();
    const rawText = parsed?.text || '';
    const totalPages = parsed?.pages?.length || 0;

    // Remove page markers like "-- 1 of 12 --"
    const cleanedText = rawText
      .replace(/--\s*\d+\s*of\s*\d+\s*--/gi, '')
      .trim();

    const isDigital = cleanedText.length >= 50;

    return {
      isDigital,
      text: cleanedText,
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
 * @param {string} pdfPath
 * @param {number} [fallbackPages=0]
 * @returns {Promise<{ text: string, confidence: number, usedOcr: boolean, pages: number }>}
 */
async function ocrScannedPdf(
  pdfPath,
  fallbackPages = 0,
  { maxPages = MAX_OCR_PAGES, timeoutMs = DOCUMENT_TIMEOUT_MS } = {},
) {
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

    let pageIndex = 0;
    const pageTexts = [];
    const confidences = [];

    for await (const pageImageBuffer of doc) {
      pageIndex++;
      if (pageIndex > maxPages) {
        console.log(`[OCR Notice] Reached maximum page limit of ${maxPages} pages.`);
        break;
      }

      if (Date.now() - startTime > timeoutMs) {
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
          pageTexts.push(result.data.text.trim());
          if (typeof result.data.confidence === 'number') {
            confidences.push(result.data.confidence);
          }
        }
      } catch (err) {
        console.warn(`[OCR Warning] Skipping page ${pageIndex}: ${err.message}`);
      }
    }

    const combinedText = pageTexts.join('\n\n').trim();
    const avgConfidence =
      confidences.length > 0
        ? confidences.reduce((a, b) => a + b, 0) / confidences.length / 100
        : 0;

    return {
      text: combinedText,
      confidence: Math.round(avgConfidence * 100) / 100,
      usedOcr: true,
      pages: pageIndex || fallbackPages,
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
