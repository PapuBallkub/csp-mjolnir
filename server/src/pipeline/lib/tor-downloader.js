/**
 * server/src/pipeline/lib/tor-downloader.js
 *
 * Shared helper module for automated TOR downloader & parser.
 * Handles:
 * 1. Safe streaming download of TOR PDFs with size caps (default max 15MB) and timeouts.
 * 2. Automated resolution and downloading of real live e-GP procurement TOR packages & PDFs.
 * 3. PDF parsing, scanned vs. digital detection, and Thai procurement spec extraction.
 */

import crypto from 'node:crypto';
import axios from 'axios';
import AdmZip from 'adm-zip';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PDFParse } from 'pdf-parse';

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MAX_PDF_SIZE_BYTES = 50 * 1024 * 1024; // 50MB safety limit for large scanned TORs & archives

const EGP_SERVICE_HEADERS = {
  'User-Agent': DEFAULT_USER_AGENT,
  Referer: 'http://process.gprocurement.go.th/egp2procmainWeb/procsearch.sch',
  Origin: 'http://process.gprocurement.go.th',
  Accept: '*/*',
};

/**
 * Computes a SHA-256 cryptographic hash of a buffer or string.
 * Used for document fingerprinting and amendment revision detection (FR10).
 *
 * @param {Buffer|string} input - Buffer or string to hash
 * @returns {string} - Hex-encoded SHA-256 hash
 */
export function computeContentHash(input) {
  if (!input) return '';
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Converts Thai digits (๐-๙) to standard Arabic digits (0-9).
 * @param {string} str
 * @returns {string}
 */
export function convertThaiDigitsToArabic(str) {
  if (!str) return '';
  const thaiDigits = ['๐', '๑', '๒', '๓', '๔', '๕', '๖', '๗', '๘', '๙'];
  return str.replace(/[๐-๙]/g, (char) => {
    const idx = thaiDigits.indexOf(char);
    return idx !== -1 ? String(idx) : char;
  });
}

/**
 * Safely downloads a single TOR PDF from a direct URL to disk.
 * Enforces strict size limits and validates PDF magic bytes (%PDF).
 *
 * @param {Object} params
 * @param {string} params.url - URL to download from
 * @param {string} params.destDir - Destination directory
 * @param {string} params.fileName - Destination filename (e.g. 68039469567_TOR.pdf)
 * @param {number} [params.maxSizeBytes=15728640] - Maximum allowed size
 * @returns {Promise<{ success: boolean, filePath?: string, sizeBytes?: number, error?: string }>}
 */
export async function downloadTorPdf({
  url,
  destDir,
  fileName,
  maxSizeBytes = MAX_PDF_SIZE_BYTES,
}) {
  await fs.mkdir(destDir, { recursive: true });
  const targetFilePath = path.join(destDir, fileName);

  try {
    const response = await axios({
      method: 'GET',
      url,
      headers: {
        'User-Agent': DEFAULT_USER_AGENT,
        Accept: 'application/pdf, application/octet-stream, */*',
      },
      responseType: 'arraybuffer',
      timeout: 25000,
      maxContentLength: maxSizeBytes,
    });

    const buffer = Buffer.from(response.data);

    // Verify PDF header magic bytes (%PDF)
    const magic = buffer.subarray(0, 4).toString('ascii');
    if (!magic.startsWith('%PDF')) {
      return {
        success: false,
        error: `Downloaded file does not have valid PDF magic header (got "${magic}").`,
      };
    }

    if (buffer.length > maxSizeBytes) {
      return {
        success: false,
        error: `File size (${buffer.length} bytes) exceeded limit of ${maxSizeBytes} bytes.`,
      };
    }

    const contentHash = computeContentHash(buffer);
    await fs.writeFile(targetFilePath, buffer);

    return {
      success: true,
      filePath: targetFilePath,
      sizeBytes: buffer.length,
      contentHash,
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
    };
  }
}

/**
 * Resolves and downloads real live TOR documents directly from Thailand e-GP procurement backend.
 * Checks official approval packages and price estimate packages, downloads the archive,
 * extracts the primary TOR / announcement PDF, and stores it in the target directory.
 *
 * @param {Object} params
 * @param {string} [params.projectId] - 11-digit e-GP project ID
 * @param {string} [params.directUrl] - Direct download link if available
 * @param {string} params.destDir - Directory to store extracted PDF
 * @param {string} params.fileName - Target filename (e.g. <projectId>_TOR.pdf)
 * @param {number} [params.maxSizeBytes=15728640]
 * @returns {Promise<{ success: boolean, filePath?: string, sizeBytes?: number, originalFileName?: string, packageName?: string, error?: string, companionText?: string, totalArchiveFiles?: number }>}
 */
export async function resolveAndDownloadEgpTorDocument({
  projectId,
  directUrl,
  destDir,
  fileName,
  maxSizeBytes = MAX_PDF_SIZE_BYTES,
}) {
  if (!projectId && !directUrl) {
    return { success: false, error: 'Project ID or Direct URL is required' };
  }

  await fs.mkdir(destDir, { recursive: true });
  const targetPath = path.join(destDir, fileName);

  let zipId = null;
  let packageName = null;

  // Only treat directUrl as downloadUrl if it is an actual binary package/file,
  // rather than a web portal search/announcement page (e.g. procsearch.sch)
  const isDirectBinaryUrl =
    Boolean(directUrl) &&
    (/\.(pdf|zip)$/i.test(directUrl) ||
      directUrl.includes('downloadFile') ||
      directUrl.includes('v1/download'));
  let downloadUrl = isDirectBinaryUrl ? directUrl : null;

  if (!downloadUrl) {
    // 1. Check official announcement & TOR document package
    try {
      const announRes = await axios.get(
        `https://process5.gprocurement.go.th/egp-approval-service/apv-common/infoProcureDocAnnounZip?projectId=${projectId}`,
        { headers: EGP_SERVICE_HEADERS, timeout: 10000 },
      );
      if (announRes.data?.data?.zipId) {
        zipId = announRes.data.data.zipId;
        packageName =
          announRes.data.data.buildName1 || `${projectId}_announ_pkg.zip`;
      }
    } catch {
      // Continue to next probe
    }

    // 2. Check price estimate / TOR package
    if (!zipId) {
      try {
        const priceRes = await axios.get(
          `https://process5.gprocurement.go.th/egp-doc-price-estimate-service/dpe-common/infoDocPriceestZipHis?projectId=${projectId}`,
          { headers: EGP_SERVICE_HEADERS, timeout: 10000 },
        );
        if (priceRes.data?.data?.zipFileId) {
          zipId = priceRes.data.data.zipFileId;
          packageName =
            priceRes.data.data.zipFileName || `${projectId}_pricebuild.zip`;
        }
      } catch {
        // Continue
      }
    }

    if (!zipId) {
      return {
        success: false,
        error: `No online attachment archive found in e-GP backend for project ${projectId}.`,
      };
    }

    downloadUrl = `https://process5.gprocurement.go.th/egp-upload-service/v1/downloadFileTest?fileId=${zipId}`;
  }

  // 3. Download the actual binary archive from e-GP upload service
  try {
    const dlResponse = await axios.get(downloadUrl, {
      headers: EGP_SERVICE_HEADERS,
      responseType: 'arraybuffer',
      timeout: 30000,
      maxContentLength: maxSizeBytes,
    });

    const rawBuffer = Buffer.from(dlResponse.data);

    // If direct PDF
    if (rawBuffer.subarray(0, 4).toString('ascii').startsWith('%PDF')) {
      const contentHash = computeContentHash(rawBuffer);
      await fs.writeFile(targetPath, rawBuffer);
      return {
        success: true,
        filePath: targetPath,
        sizeBytes: rawBuffer.length,
        originalFileName: fileName,
        packageName,
        contentHash,
      };
    }

    // If ZIP archive
    const zip = new AdmZip(rawBuffer);
    const pdfEntries = zip
      .getEntries()
      .filter((e) => !e.isDirectory && e.entryName.toLowerCase().endsWith('.pdf'));

    if (pdfEntries.length === 0) {
      return {
        success: false,
        error: `No PDF files found inside e-GP archive "${packageName}".`,
      };
    }

    // Rank entries to pick the best TOR document
    // Priority:
    // 1. Explicit TOR filenames (e.g. Attach_TOR_1.pdf, TOR.pdf)
    // 2. Official Announcement documents (e.g. annoudoc*.pdf, doc*.pdf, bidding notice.pdf)
    // 3. Price build / median price document (e.g. pB0.pdf)
    // 4. Any other PDF
    pdfEntries.sort((a, b) => {
      const nameA = a.entryName.toLowerCase();
      const nameB = b.entryName.toLowerCase();

      const getScore = (name) => {
        if (name.includes('tor')) return 100;
        if (name.includes('annou')) return 80;
        if (name.includes('bidding') || name.includes('noltice')) return 70;
        if (name.includes('doc_')) return 60;
        if (name.includes('pb0')) return 50;
        return 10;
      };

      return getScore(nameB) - getScore(nameA);
    });

    const bestEntry = pdfEntries[0];
    const pdfData = bestEntry.getData();
    const contentHash = computeContentHash(pdfData);

    await fs.writeFile(targetPath, pdfData);

    // Look for companion text document if the best entry might be scanned
    let companionText = '';
    const textEntry = pdfEntries.find(
      (e) =>
        e.entryName.toLowerCase().includes('annou') ||
        e.entryName.toLowerCase().includes('pb0'),
    );
    if (textEntry && textEntry !== bestEntry) {
      try {
        const textBuf = textEntry.getData();
        const p = new PDFParse({ data: new Uint8Array(textBuf) });
        const res = await p.getText();
        companionText = (res?.text || '').trim();
      } catch {
        // ignore companion text errors
      }
    }

    return {
      success: true,
      filePath: targetPath,
      sizeBytes: pdfData.length,
      originalFileName: bestEntry.entryName,
      packageName,
      companionText,
      totalArchiveFiles: pdfEntries.length,
      contentHash,
    };
  } catch (err) {
    return {
      success: false,
      error: `Failed to download or extract e-GP attachment for ${projectId}: ${err.message}`,
    };
  }
}

/**
 * Parses a downloaded TOR PDF file and extracts document metadata & specifications.
 * Detects whether the document is a scanned image PDF or contains embedded text.
 * Also parses companion text if available.
 *
 * @param {string|Buffer} filePathOrBuffer
 * @param {string} [companionText='']
 * @returns {Promise<Object>}
 */
export async function parseTorDocument(filePathOrBuffer, companionText = '') {
  try {
    let buffer;
    if (typeof filePathOrBuffer === 'string') {
      buffer = await fs.readFile(filePathOrBuffer);
    } else {
      buffer = filePathOrBuffer;
    }

    const contentHash = computeContentHash(buffer);
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const parsed = await parser.getText();

    const rawText = parsed?.text || '';
    const totalPages = parsed?.pages?.length || 0;

    // Check if text is just empty page markers (e.g. "-- 1 of 12 --")
    const cleanedText = rawText
      .replace(/--\s*\d+\s*of\s*\d+\s*--/gi, '')
      .trim();
    const isScanned = cleanedText.length < 50 && totalPages > 0;

    // Use companion text from announcement if primary signed TOR is scanned
    const analysisText =
      isScanned && companionText.length > 50 ? companionText : cleanedText;
    const arabicText = convertThaiDigitsToArabic(analysisText);

    // Extract structured spec hints
    const specs = {};

    // 1. IT Hardware & Quantity extraction
    const qtyMatch = arabicText.match(
      /(?:จำนวน|รวม)\s*([\d,]+)\s*(?:ชุด|เครื่อง|รายการ|ระบบ)/i,
    );
    if (qtyMatch) {
      const parsedQty = parseInt(qtyMatch[1].replace(/,/g, ''), 10);
      if (!isNaN(parsedQty) && parsedQty > 0) {
        specs.quantityItems = parsedQty;
      }
    }

    // 2. Notebook / Computer / Server check
    if (/โน้ตบุ๊ก|notebook|laptop/i.test(analysisText)) {
      specs.deviceType = 'Notebook / Laptop';
    } else if (/เครื่องแม่ข่าย|server/i.test(analysisText)) {
      specs.deviceType = 'Server / Data Center';
    } else if (/คอมพิวเตอร์|pc|desktop/i.test(analysisText)) {
      specs.deviceType = 'Personal Computer (PC)';
    } else if (/คลาวด์|cloud/i.test(analysisText)) {
      specs.deviceType = 'Cloud Infrastructure / VM';
    }

    // 3. Virtual Machines & Compute Specs
    const vmMatch = arabicText.match(/(\d+)\s*(?:VM|เครื่องเสมือน)/i);
    if (vmMatch) specs.virtualMachines = parseInt(vmMatch[1], 10);

    const cpuMatch = arabicText.match(/(\d+)\s*(?:Core|vCPU|แกน)/i);
    if (cpuMatch) specs.cpuCores = parseInt(cpuMatch[1], 10);

    const ramMatch = arabicText.match(
      /(\d+)\s*(?:GB|กิกะไบต์)\s*(?:RAM|หน่วยความจำ)/i,
    );
    if (ramMatch) specs.ramGB = parseInt(ramMatch[1], 10);

    // 4. SLA & Uptime
    const slaMatch = arabicText.match(/SLA.*?(\d{2}(?:\.\d+)?)\s*%/i);
    if (slaMatch) specs.slaUptimePercent = parseFloat(slaMatch[1]);

    // 5. Standards & Certifications
    const standards = [];
    if (/ISO\s*27001/i.test(analysisText)) standards.push('ISO/IEC 27001');
    if (/ISO\s*20000/i.test(analysisText)) standards.push('ISO/IEC 20000-1');
    if (/CSA\s*STAR/i.test(analysisText)) standards.push('CSA STAR');
    if (/Tier\s*3/i.test(analysisText)) standards.push('Tier 3 Data Center');
    if (standards.length > 0) specs.standardsRequired = standards;

    // 6. Warranty / Contract Period
    const warrantyMatch = arabicText.match(/รับประกัน.*?(\d+)\s*(?:ปี|เดือน)/i);
    if (warrantyMatch) {
      specs.warrantyPeriod = warrantyMatch[0].trim();
    }

    return {
      success: true,
      totalPages,
      isScanned,
      documentType: isScanned ? 'SCANNED_PAPER_PDF' : 'DIGITAL_TEXT_PDF',
      rawTextLength: cleanedText.length,
      contentHash,
      snippet:
        cleanedText.slice(0, 300) ||
        (isScanned
          ? 'Scanned document (physical ink signatures). OCR required for full text extraction.'
          : 'No text content.'),
      hasCompanionText: companionText.length > 0,
      companionSnippet: companionText ? companionText.slice(0, 300) : null,
      extractedSpecs: Object.keys(specs).length > 0 ? specs : null,
    };
  } catch (err) {
    return {
      success: false,
      error: `PDF parsing failed: ${err.message}`,
    };
  }
}
