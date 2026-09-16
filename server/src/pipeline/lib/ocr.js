/**
 * server/src/pipeline/lib/ocr.js
 *
 * Hybrid text extraction module for TOR PDFs.
 * - Fast path: Extracts embedded digital text via pdf-parse.
 * - Scanned path: Renders PDF pages to images via pdf-to-img and extracts text
 *   using Tesseract.js (tha+eng).
 */

import fs from 'node:fs/promises';
import { PDFParse } from 'pdf-parse';
import { pdf } from 'pdf-to-img';
import { createWorker } from 'tesseract.js';

const MAX_OCR_PAGES = 20; // Memory & performance guard for scanned documents
const PAGE_TIMEOUT_MS = 60000; // 60s timeout per page

/**
 * Extracts text from a PDF file on disk.
 * Detects whether the document has digital text or requires OCR.
 *
 * @param {string} pdfPath - Absolute or relative path to PDF file
 * @returns {Promise<{ text: string, confidence: number, usedOcr: boolean, pages: number }>}
 */
export async function extractText(pdfPath) {
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
  return ocrScannedPdf(pdfPath, digitalResult.pages);
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
async function ocrScannedPdf(pdfPath, fallbackPages = 0) {
  let doc = null;
  let worker = null;

  try {
    doc = await pdf(pdfPath, { scale: 2 });
    worker = await createWorker(['tha', 'eng']);

    let pageIndex = 0;
    const pageTexts = [];
    const confidences = [];

    for await (const pageImageBuffer of doc) {
      pageIndex++;
      if (pageIndex > MAX_OCR_PAGES) break;

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
