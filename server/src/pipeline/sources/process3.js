/**
 * server/src/pipeline/sources/process3.js
 *
 * Scraper/fetcher for Thailand e-GP RSS feed (process3.gprocurement.go.th).
 * Handles:
 * 1. Live RSS XML feed querying (Draft TOR B0, Invitation D0, Reference Price 15)
 * 2. Thai encoding decoding (UTF-8 / Windows-874)
 * 3. Automatic PDF attachment downloading
 * 4. Offline/weekend fallback to live active catalog
 * 5. MongoDB upsert via Tor model
 */

import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { Tor } from '#models/index.js';
import {
  resolveAndDownloadEgpTorDocument,
  parseTorDocument,
} from '../lib/tor-downloader.js';

const BASE_URL =
  'https://process3.gprocurement.go.th/EPROCRssFeedWeb/egpannouncerss.xml';
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const REQUEST_TIMEOUT_MS = 20000;
const RATE_LIMIT_DELAY_MS = 1000;

export const ANNOUNCEMENT_TYPES = [
  { code: 'B0', name: 'Draft TOR (ร่างประกาศและร่างเอกสารประกวดราคา)' },
  { code: 'D0', name: 'Invitation to Bid (ประกาศเชิญชวน)' },
  { code: '15', name: 'Reference Price (ราคากลาง)' },
];

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Decodes Thai XML buffer checking UTF-8 first, falling back to Windows-874.
 * @param {Buffer|Uint8Array} buffer
 * @returns {{ xmlText: string, encoding: string, isCorrupted: boolean }}
 */
export function decodeThaiXml(buffer) {
  const rawBytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  let xmlText = '';
  let usedEncoding = 'utf-8';

  try {
    const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
    xmlText = utf8Decoder.decode(rawBytes);
    usedEncoding = 'utf-8';
  } catch {
    const win874Decoder = new TextDecoder('windows-874');
    xmlText = win874Decoder.decode(rawBytes);
    usedEncoding = 'windows-874';
  }

  const hasReplacementChar = xmlText.includes('\uFFFD');
  const hasMojibakePattern = /เธ[ก-ฮ]/.test(xmlText);
  const isCorrupted = hasReplacementChar || hasMojibakePattern;

  return { xmlText, encoding: usedEncoding, isCorrupted };
}

/**
 * Fetches procurement announcements from e-GP process3 RSS feed.
 *
 * @param {Object} options
 * @param {string} [options.query='คอมพิวเตอร์']
 * @param {number} [options.limit=5]
 * @param {string} [options.deptId='']
 * @param {string} options.documentsDir
 * @param {boolean} [options.downloadAttachments=false]
 * @returns {Promise<{ fetched: number, errors: string[] }>}
 */
export async function fetchFromProcess3({
  query = 'คอมพิวเตอร์',
  limit = 5,
  deptId = '',
  documentsDir,
  downloadAttachments = false,
}) {
  await fs.mkdir(documentsDir, { recursive: true });

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    trimValues: true,
    isArray: (name) => name === 'item',
  });

  let fetchedCount = 0;
  const errors = [];

  for (let i = 0; i < ANNOUNCEMENT_TYPES.length; i++) {
    if (fetchedCount >= limit) break;

    const annType = ANNOUNCEMENT_TYPES[i];
    const requestUrl = new URL(BASE_URL);
    requestUrl.searchParams.set('announceType', annType.code);
    if (deptId) {
      requestUrl.searchParams.set('deptId', deptId);
    }

    try {
      const response = await axios.get(requestUrl.toString(), {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/xml, text/xml, */*',
        },
        responseType: 'arraybuffer',
        timeout: REQUEST_TIMEOUT_MS,
      });

      const { xmlText } = decodeThaiXml(response.data);
      const parsed = parser.parse(xmlText);
      const channel = parsed?.rss?.channel || parsed?.channel;
      const items = channel?.item || [];

      const queryLower = query.toLowerCase();
      const filtered = items.filter((item) => {
        const title = String(item.title || '').toLowerCase();
        const desc = String(item.description || '').toLowerCase();
        return title.includes(queryLower) || desc.includes(queryLower);
      });

      for (const currentItem of filtered) {
        if (fetchedCount >= limit) break;

        const rawTorId =
          currentItem.project_id ||
          currentItem.projectId ||
          currentItem.guid?.['#text'] ||
          currentItem.guid ||
          currentItem.link?.match(/project_id=(\d+)/i)?.[1] ||
          currentItem.link?.match(/projectId=(\d+)/i)?.[1];

        const torId = convertThaiDigitsToArabic(String(rawTorId || '')).replace(
          /\D/g,
          '',
        );
        if (!torId) continue;

        const title = currentItem.title
          ? String(currentItem.title).trim()
          : 'No Title';
        const link = currentItem.link || '';

        const expectedPdfName = `${torId}_TOR.pdf`;
        const targetPdfPath = path.join(documentsDir, expectedPdfName);

        let documentInfo = null;
        let downloadRes = null;
        const alreadyDownloaded = fsSync.existsSync(targetPdfPath);

        if (alreadyDownloaded) {
          documentInfo = await parseTorDocument(targetPdfPath);
        } else if (downloadAttachments) {
          downloadRes = await resolveAndDownloadEgpTorDocument({
            projectId: String(torId),
            directUrl: link.startsWith('http') ? link : null,
            destDir: documentsDir,
            fileName: expectedPdfName,
          });

          if (downloadRes.success) {
            documentInfo = await parseTorDocument(
              downloadRes.filePath,
              downloadRes.companionText || '',
            );
          }
        }

        const isDownloaded =
          alreadyDownloaded || (downloadRes && downloadRes.success);

        await Tor.findOneAndUpdate(
          { projectId: String(torId) },
          {
            $set: {
              source: 'process3',
              title,
              agency: '',
              subAgency: deptId || '',
              announceType: annType.code,
              announceDate: currentItem.pubDate || new Date().toISOString(),
              procurementMethod: annType.name.split(' (')[0],
              egpUrl: link,
              document: {
                fileName: expectedPdfName,
                storagePath: isDownloaded ? targetPdfPath : null,
                sizeBytes:
                  downloadRes?.sizeBytes ||
                  (alreadyDownloaded
                    ? fsSync.statSync(targetPdfPath).size
                    : null),
                pages: documentInfo?.totalPages || null,
                documentType: documentInfo?.documentType || 'UNKNOWN',
              },
              pipelineStatus: isDownloaded ? 'downloaded' : 'fetched',
            },
          },
          { upsert: true, returnDocument: 'after' },
        );

        fetchedCount++;
      }
    } catch (err) {
      errors.push(`RSS ${annType.code} error: ${err.message}`);
    }

    if (i < ANNOUNCEMENT_TYPES.length - 1) {
      await delay(RATE_LIMIT_DELAY_MS);
    }
  }

  // Fallback: If RSS was empty (weekends/after-hours), discover active e-GP projects via catalog
  if (fetchedCount === 0) {
    try {
      const catalogUrl = `https://data.go.th/api/3/action/datastore_search?resource_id=e4eaa1b4-eb1a-4534-b227-988ee25b898d&limit=15&q=${encodeURIComponent(query)}`;
      const catRes = await axios.get(catalogUrl, {
        headers: { 'User-Agent': USER_AGENT },
        timeout: REQUEST_TIMEOUT_MS,
      });

      const candidates = catRes.data?.result?.records || [];
      for (const cand of candidates) {
        if (fetchedCount >= limit) break;

        const projectId = String(cand['รหัสโครงการ'] || '').trim();
        if (!projectId) continue;

        const expectedPdfName = `${projectId}_TOR.pdf`;
        const targetPdfPath = path.join(documentsDir, expectedPdfName);

        let documentInfo = null;
        let downloadRes = null;
        const alreadyDownloaded = fsSync.existsSync(targetPdfPath);

        if (alreadyDownloaded) {
          documentInfo = await parseTorDocument(targetPdfPath);
        } else if (downloadAttachments) {
          downloadRes = await resolveAndDownloadEgpTorDocument({
            projectId,
            destDir: documentsDir,
            fileName: expectedPdfName,
          });

          if (downloadRes.success) {
            documentInfo = await parseTorDocument(
              downloadRes.filePath,
              downloadRes.companionText || '',
            );
          } else {
            continue; // Move to next candidate if no attachment
          }
        }

        const isDownloaded =
          alreadyDownloaded || (downloadRes && downloadRes.success);
        const budget =
          Number(String(cand['งบประมาณ(บาท)'] || '').replace(/,/g, '')) || 0;
        const medianPrice =
          Number(String(cand['ราคากลาง(บาท)'] || '').replace(/,/g, '')) || 0;

        await Tor.findOneAndUpdate(
          { projectId },
          {
            $set: {
              source: 'process3',
              title: String(cand['ชื่อโครงการ'] || '').trim(),
              agency: String(cand['ชื่อหน่วยงาน'] || '').trim(),
              subAgency: String(cand['ชื่อหน่วยงานย่อย'] || deptId || '').trim(),
              province: String(cand['จังหวัด'] || '').trim(),
              district: String(cand['เขต/อำเภอ'] || '').trim(),
              budgetTHB: budget,
              medianPriceTHB: medianPrice,
              announceType: 'B0',
              announceDate: cand['วันที่ประกาศ'] || new Date().toISOString(),
              procurementMethod: String(
                cand['กลุ่มวิธีจัดซื้อฯ'] || cand['วิธีจัดซื้อฯ'] || '',
              ).trim(),
              egpUrl: `https://process3.gprocurement.go.th/egp2procmainWeb/jsp/procsearch.sch?project_id=${projectId}`,
              document: {
                fileName: expectedPdfName,
                storagePath: isDownloaded ? targetPdfPath : null,
                sizeBytes:
                  downloadRes?.sizeBytes ||
                  (alreadyDownloaded
                    ? fsSync.statSync(targetPdfPath).size
                    : null),
                pages: documentInfo?.totalPages || null,
                documentType: documentInfo?.documentType || 'UNKNOWN',
              },
              pipelineStatus: isDownloaded ? 'downloaded' : 'fetched',
            },
          },
          { upsert: true, returnDocument: 'after' },
        );

        fetchedCount++;
      }
    } catch (err) {
      errors.push(`Discovery fallback error: ${err.message}`);
    }
  }

  return { fetched: fetchedCount, errors };
}
