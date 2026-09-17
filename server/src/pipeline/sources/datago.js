/**
 * server/src/pipeline/sources/datago.js
 *
 * Scraper/fetcher for Thailand Open Government Data CKAN REST API (data.go.th).
 * Queries dataset egp-contact-2568, handles column-shift anomalies,
 * downloads attached TOR documents from e-GP backend, and stores in MongoDB.
 */

import axios from 'axios';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { Tor } from '#models/index.js';
import {
  resolveAndDownloadEgpTorDocument,
  parseTorDocument,
} from '../lib/tor-downloader.js';

const BASE_URL = 'https://data.go.th/api/3/action/datastore_search';
const DEFAULT_RESOURCE_ID = 'e4eaa1b4-eb1a-4534-b227-988ee25b898d'; // egp-contact-2568
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const REQUEST_TIMEOUT_MS = 35000;

/**
 * Fetches procurement records from data.go.th CKAN API.
 *
 * @param {Object} options
 * @param {string} [options.query='คอมพิวเตอร์']
 * @param {number} [options.limit=5]
 * @param {string} [options.resourceId=DEFAULT_RESOURCE_ID]
 * @param {string} options.documentsDir
 * @param {boolean} [options.downloadAttachments=false]
 * @returns {Promise<{ fetched: number, errors: string[] }>}
 */
export async function fetchFromDataGo({
  query = 'คอมพิวเตอร์',
  limit = 5,
  resourceId = DEFAULT_RESOURCE_ID,
  documentsDir,
  downloadAttachments = false,
}) {
  await fs.mkdir(documentsDir, { recursive: true });

  const errors = [];
  let fetchedCount = 0;

  const fetchPoolSize = Math.max(limit * 5, 15);
  const requestUrl = new URL(BASE_URL);
  requestUrl.searchParams.set('resource_id', resourceId);
  requestUrl.searchParams.set('limit', String(fetchPoolSize));
  if (query) {
    requestUrl.searchParams.set('q', query);
  }

  let rawRecords = [];

  try {
    const response = await axios.get(requestUrl.toString(), {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
      timeout: REQUEST_TIMEOUT_MS,
      validateStatus: (status) => status >= 200 && status < 400,
    });

    if (!response.data?.success) {
      throw new Error(
        `data.go.th query failed: ${JSON.stringify(response.data?.error || 'Unknown error')}`,
      );
    }

    rawRecords = response.data?.result?.records || [];
  } catch (err) {
    errors.push(`data.go.th API request error: ${err.message}`);
    return { fetched: 0, errors };
  }

  for (let i = 0; i < rawRecords.length; i++) {
    if (fetchedCount >= limit) break;

    const rec = rawRecords[i];
    const projectId = String(rec['รหัสโครงการ'] || '').trim();
    if (!projectId) continue;

    // Safe numeric parsing handling commas
    const budget =
      Number(String(rec['งบประมาณ(บาท)'] || '').replace(/,/g, '')) || 0;
    const medianPrice =
      Number(String(rec['ราคากลาง(บาท)'] || '').replace(/,/g, '')) || 0;
    const agreedPrice =
      Number(String(rec['ราคาตกลงซื้อ/จ้าง'] || '').replace(/,/g, '')) || 0;

    // Detect if column shift anomaly exists in this data.go.th record
    const hasColumnShift = /^\d{13}$/.test(
      String(rec['พิกัดของโครงการ'] || ''),
    );
    const winnerName = hasColumnShift
      ? String(rec['ละติจูดโครงการ'] || '').trim()
      : String(rec['ชื่อผู้ชนะ'] || '').trim();
    const winnerTaxId = hasColumnShift
      ? String(rec['พิกัดของโครงการ'] || '').trim()
      : String(rec['เลขประจำตัวผู้เสียภาษีอากร'] || '').trim();
    const contractNo = hasColumnShift
      ? String(rec['ลองจิจูดโครงการ'] || '').trim()
      : String(rec['เลขที่สัญญา/ใบสั่งซื้อสั่งจ้าง'] || '').trim();
    const contractSignDate = hasColumnShift
      ? String(rec['ชื่อผู้ชนะ'] || '').trim()
      : String(rec['วันที่ลงนามในสัญญา'] || '').trim();
    const contractEndDate = hasColumnShift
      ? String(rec['เลขคุมสัญญา'] || '').trim()
      : String(rec['วันที่สิ้นสุดสัญญา'] || '').trim();
    const projectStatus = hasColumnShift
      ? String(rec['ชื่อโครงการ'] || '').trim()
      : String(rec['สถานะโครงการ'] || '').trim();

    const expectedPdfFileName = `${projectId}_TOR.pdf`;
    const targetPdfPath = path.join(documentsDir, expectedPdfFileName);

    let documentInfo = null;
    let downloadResult = null;
    const alreadyDownloaded = fsSync.existsSync(targetPdfPath);

    if (alreadyDownloaded) {
      documentInfo = await parseTorDocument(targetPdfPath);
    } else if (downloadAttachments) {
      downloadResult = await resolveAndDownloadEgpTorDocument({
        projectId,
        destDir: documentsDir,
        fileName: expectedPdfFileName,
      });

      if (downloadResult.success) {
        documentInfo = await parseTorDocument(
          downloadResult.filePath,
          downloadResult.companionText || '',
        );
      } else {
        // Continue searching pool for projects that have attachments
        continue;
      }
    }

    const isDownloaded =
      alreadyDownloaded || (downloadResult && downloadResult.success);

    try {
      await Tor.findOneAndUpdate(
        { projectId },
        {
          $set: {
            source: 'datago',
            title: String(rec['ชื่อโครงการ'] || '').trim(),
            agency: String(rec['ชื่อหน่วยงาน'] || '').trim(),
            subAgency: String(rec['ชื่อหน่วยงานย่อย'] || '').trim(),
            province: String(rec['จังหวัด'] || '').trim(),
            district: String(rec['เขต/อำเภอ'] || '').trim(),
            procurementMethod: String(
              rec['กลุ่มวิธีจัดซื้อฯ'] || rec['วิธีจัดซื้อฯ'] || '',
            ).trim(),
            announceDate: rec['วันที่ประกาศ'] || null,
            budgetTHB: budget,
            medianPriceTHB: medianPrice,
            status: winnerName ? 'Awarded' : 'Open',
            contract: {
              winnerName: winnerName || null,
              winnerTaxId: winnerTaxId || null,
              contractNo: contractNo || null,
              contractSignDate: contractSignDate || null,
              contractEndDate: contractEndDate || null,
              agreedPriceTHB: agreedPrice,
              projectStatus: projectStatus || '',
            },
            egpUrl: `https://process3.gprocurement.go.th/egp2procmainWeb/jsp/procsearch.sch?project_id=${projectId}`,
            document: {
              fileName: expectedPdfFileName,
              storagePath: isDownloaded ? targetPdfPath : null,
              sizeBytes:
                downloadResult?.sizeBytes ||
                (alreadyDownloaded ? fsSync.statSync(targetPdfPath).size : null),
              pages: documentInfo?.totalPages || null,
              documentType: documentInfo?.documentType || 'UNKNOWN',
              contentHash: documentInfo?.contentHash || null,
              version: 1,
            },
            pipelineStatus: isDownloaded ? 'downloaded' : 'fetched',
          },
        },
        { upsert: true, returnDocument: 'after' },
      );

      fetchedCount++;
    } catch (err) {
      errors.push(`Failed to save project ${projectId}: ${err.message}`);
    }
  }

  return { fetched: fetchedCount, errors };
}
