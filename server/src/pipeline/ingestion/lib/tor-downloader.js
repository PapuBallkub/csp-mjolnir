/**
 * server/src/pipeline/ingestion/lib/tor-downloader.js
 *
 * Downloads from e-GP:
 * 1. A project's announcement package, keeping its project files and reading
 *    its announcement in code (downloadEgpPackage, ADR 0020).
 * 2. A single PDF from a direct URL (downloadTorPdf).
 * Every download is capped at 50 MB and paced (ADR 0016).
 */

import crypto from 'node:crypto';
import axios from 'axios';
import AdmZip from 'adm-zip';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PDFParse } from 'pdf-parse';
import { isOutage } from '../../shared/failures.js';
import { paceRequest } from '../../shared/request-pacer.js';
import { convertThaiDigitsToArabic } from '../../shared/thai-text.js';
import { baseName, pickTorFiles, readPackageFacts, roleOfEntry } from './egp-package.js';
import { textLayerOf } from './text-layer.js';

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
 * Safely downloads a single TOR PDF from a direct URL to disk.
 * Enforces strict size limits and validates PDF magic bytes (%PDF).
 *
 * @param {Object} params
 * @param {string} params.url - URL to download from
 * @param {string} params.destDir - Destination directory
 * @param {string} params.fileName - Destination filename (e.g. 68039469567_TOR.pdf)
 * @param {number} [params.maxSizeBytes=15728640] - Maximum allowed size
 * @returns {Promise<{ success: boolean, filePath?: string, sizeBytes?: number, error?: string, transient?: boolean }>}
 *   `transient` is true when the site didn't answer, so trying again later may work
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
    await paceRequest(url);
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
      transient: isOutage(err),
    };
  }
}

const PROCESS5 = 'https://process5.gprocurement.go.th';

/** The text layer of a PDF and its page count; empty for a file pdf-parse can't open. */
async function readPdf(buffer) {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const { text, pages } = await parser.getText();
    return { text: text ?? '', pages: pages?.length ?? 0 };
  } catch {
    return { text: '', pages: 0 };
  } finally {
    await parser.destroy().catch(() => {});
  }
}

// Windows refuses some characters in file names that zips can carry
const safeFileName = (name) => baseName(name).replace(/[<>:"|?*\u0000-\u001f]/g, '_');

/**
 * Downloads a project's current announcement package from e-GP and keeps its
 * project files (ADR 0020): the announcement, the bidding document, the TOR
 * and any other file that isn't one of e-GP's blank forms. They go in
 * `<documentsDir>/<projectId>/<package>/`, so each stage's files stay. The
 * announcement's and bidding document's facts are read in code.
 *
 * @param {object} params
 * @param {string} params.projectId - 11-digit e-GP project ID
 * @param {string} params.documentsDir - Where packages are kept
 * @param {string[]} [params.knownZipIds] - Packages already downloaded: if
 *   e-GP's current one is among them, nothing is downloaded
 * @param {number} [params.maxSizeBytes]
 * @param {Date} [params.now]
 * @param {Function} [params.pace] - Waits before each request (NFR-03); replaced in tests
 * @returns {Promise<
 *   | { success: true, unchanged: true, zipId: string }
 *   | { success: true, unchanged: false, package: object, tor: object }
 *   | { success: false, error: string, transient?: boolean }>}
 *   `transient` is true when e-GP didn't answer, so trying again later may work.
 */
export async function downloadEgpPackage({
  projectId,
  documentsDir,
  knownZipIds = [],
  maxSizeBytes = MAX_PDF_SIZE_BYTES,
  now = new Date(),
  pace = paceRequest,
}) {
  // 1. Which package e-GP has for the project now
  let zipId = null;
  let name = null;
  try {
    const url = `${PROCESS5}/egp-approval-service/apv-common/infoProcureDocAnnounZip?projectId=${projectId}`;
    await pace(url);
    const { data } = await axios.get(url, { headers: EGP_SERVICE_HEADERS, timeout: 10000 });
    zipId = data?.data?.zipId ?? null;
    name = data?.data?.buildName1 || `${projectId}.zip`;
  } catch (err) {
    return {
      success: false,
      error: `e-GP did not answer for project ${projectId}: ${err.message}`,
      transient: isOutage(err),
    };
  }
  // The price package is not a stand-in: its one page is a price form, not a TOR
  if (!zipId) return { success: false, error: `No announcement package in e-GP for project ${projectId}.` };
  if (knownZipIds.includes(zipId)) return { success: true, unchanged: true, zipId };

  // 2. Download it
  let buffer;
  try {
    const url = `${PROCESS5}/egp-upload-service/v1/downloadFileTest?fileId=${zipId}`;
    await pace(url);
    const response = await axios.get(url, {
      headers: EGP_SERVICE_HEADERS,
      responseType: 'arraybuffer',
      timeout: 30000,
      maxContentLength: maxSizeBytes,
    });
    buffer = Buffer.from(response.data);
  } catch (err) {
    return {
      success: false,
      error: `Failed to download e-GP package ${name} for ${projectId}: ${err.message}`,
      transient: isOutage(err),
    };
  }

  // 3. What's in it: a zip, or now and then a single PDF
  let entries;
  if (buffer.subarray(0, 4).toString('ascii').startsWith('%PDF')) {
    entries = [{ name: `${projectId}.pdf`, data: buffer }];
  } else {
    try {
      entries = new AdmZip(buffer)
        .getEntries()
        .filter((entry) => !entry.isDirectory)
        .map((entry) => ({ name: entry.entryName, data: entry.getData() }));
    } catch (err) {
      return { success: false, error: `e-GP package ${name} for ${projectId} is not a zip: ${err.message}` };
    }
  }

  const files = [];
  const texts = {};
  for (const entry of entries) {
    const role = roleOfEntry(entry.name);
    if (role === 'form') continue;
    const file = {
      role,
      fileName: safeFileName(entry.name),
      sizeBytes: entry.data.length,
      contentHash: computeContentHash(entry.data),
      data: entry.data,
      pages: null,
      textLayer: null,
    };
    if (/\.pdf$/i.test(file.fileName)) {
      const { text, pages } = await readPdf(entry.data);
      file.pages = pages;
      file.textLayer = textLayerOf(text);
      if (file.textLayer === 'text' && (role === 'announcement' || role === 'bidding')) texts[role] = text;
    }
    files.push(file);
  }

  // 4. The TOR's files, by elimination; a package without one is read from its documents
  const picked = pickTorFiles(files.map((file) => ({ ...file, name: file.fileName }))).map((pick) =>
    files.find((file) => file.fileName === pick.fileName),
  );
  for (const file of picked) file.role = 'tor';
  const fallback = files.find((file) => file.role === 'bidding') ?? files.find((file) => file.role === 'announcement');
  const parts = picked.length > 0 ? picked : [fallback].filter(Boolean);
  if (parts.length === 0) return { success: false, error: `e-GP package ${name} for ${projectId} holds no PDF of its own.` };

  // 5. Keep the files: one folder per package, so a new stage never overwrites the last
  const folder = path.join(documentsDir, projectId, `${path.basename(name, '.zip')}_${zipId.slice(0, 8)}`);
  await fs.mkdir(folder, { recursive: true });
  for (const file of files) {
    file.storagePath = path.join(folder, file.fileName);
    await fs.writeFile(file.storagePath, file.data);
    delete file.data;
  }

  const { problems, ...facts } = readPackageFacts({
    announcementText: texts.announcement,
    biddingText: texts.bidding,
  });
  if (files.some((file) => file.role === 'announcement') && !texts.announcement) {
    problems.push('The announcement has no readable text layer');
  }

  return {
    success: true,
    unchanged: false,
    package: {
      zipId,
      name,
      downloadedAt: now,
      files,
      announcementText: texts.announcement ?? '',
      biddingText: texts.bidding ?? '',
      facts,
      problems,
    },
    tor: torDocumentOf(parts),
  };
}

/**
 * The TOR as one document, from the files it's in. Its hash covers every
 * part, so a change to any of them is a changed TOR.
 */
function torDocumentOf(parts) {
  const [first] = parts;
  return {
    fileName: first.fileName,
    storagePath: first.storagePath,
    sizeBytes: parts.reduce((sum, part) => sum + part.sizeBytes, 0),
    pages: parts.reduce((sum, part) => sum + (part.pages ?? 0), 0) || null,
    contentHash: parts.length === 1 ? first.contentHash : computeContentHash(parts.map((part) => part.contentHash).join('|')),
    documentType: parts.every((part) => part.textLayer === 'text') ? 'DIGITAL_TEXT_PDF' : 'SCANNED_PAPER_PDF',
    // Only when there are several: OCR reads them in order as one document
    parts:
      parts.length > 1
        ? parts.map(({ fileName, storagePath, pages, contentHash }) => ({ fileName, storagePath, pages, contentHash }))
        : [],
  };
}

/**
 * The TOR alone, for the fetch-time download the sources still offer
 * (`downloadAttachments`, which nothing turns on: the download step owns
 * downloading). It goes through downloadEgpPackage, so the TOR is chosen the
 * same way everywhere.
 *
 * @returns {Promise<{ success: boolean, filePath?: string, sizeBytes?: number, originalFileName?: string, packageName?: string, contentHash?: string, error?: string, transient?: boolean }>}
 */
export async function resolveAndDownloadEgpTorDocument({ projectId, destDir }) {
  const result = await downloadEgpPackage({ projectId, documentsDir: destDir });
  if (!result.success) return result;
  return {
    success: true,
    filePath: result.tor.storagePath,
    sizeBytes: result.tor.sizeBytes,
    originalFileName: result.tor.fileName,
    packageName: result.package.name,
    contentHash: result.tor.contentHash,
  };
}

/**
 * Parses a downloaded TOR PDF file and extracts document metadata & specifications.
 * Detects whether the document has a readable text layer (text-layer.js):
 * a scan, or a garbled layer, needs OCR.
 *
 * @param {string|Buffer} filePathOrBuffer
 * @returns {Promise<Object>}
 */
export async function parseTorDocument(filePathOrBuffer) {
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
    const isScanned = textLayerOf(rawText) !== 'text' && totalPages > 0;

    const analysisText = isScanned ? '' : cleanedText;
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
      extractedSpecs: Object.keys(specs).length > 0 ? specs : null,
    };
  } catch (err) {
    return {
      success: false,
      error: `PDF parsing failed: ${err.message}`,
    };
  }
}
