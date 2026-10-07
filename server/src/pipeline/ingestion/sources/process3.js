/**
 * server/src/pipeline/ingestion/sources/process3.js
 *
 * Scraper/fetcher for Thailand e-GP RSS feed (process3.gprocurement.go.th).
 * Handles:
 * 1. Live RSS XML feed querying (Draft TOR B0, Invitation D0, Reference Price 15)
 * 2. Thai encoding decoding (UTF-8 / Windows-874)
 * 3. Automatic PDF attachment downloading
 * 4. MongoDB upsert via Tor model
 *
 * When the feed doesn't answer, nothing is fetched and the errors say why
 * (`unreachable` is true when every request failed). There is no fallback.
 */

import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { Tor } from '#models/index.js';
import { convertThaiDigitsToArabic } from '../../shared/thai-text.js';
import {
  resolveAndDownloadEgpTorDocument,
  parseTorDocument,
} from '../lib/tor-downloader.js';

const BASE_URL =
  'https://process3.gprocurement.go.th/EPROCRssFeedWeb/egpannouncerss.xml';
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const REQUEST_TIMEOUT_MS = 20000;

import {
  EGP_ANNOUNCEMENT_CODES,
  FETCHABLE_CODES,
  classifyAnnouncement,
} from '../../shared/announcement-codes.js';
import { paceRequest } from '../../shared/request-pacer.js';
import { deriveStatus } from '../../shared/status-engine.js';
import { fetchStageFields, hasAnnouncement, isPastFetch } from '../lib/fetch-rules.js';

// Re-export for backward compatibility with test/pipeline/ingestion/utils.test.js
export const ANNOUNCEMENT_TYPES = FETCHABLE_CODES.map((code) => ({
  code,
  name: `${EGP_ANNOUNCEMENT_CODES[code].nameEn} (${EGP_ANNOUNCEMENT_CODES[code].nameTh})`,
}));

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
 * @returns {Promise<{ fetched: number, errors: string[], unreachable: boolean }>}
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
  let requested = 0;
  const errors = [];

  for (let i = 0; i < ANNOUNCEMENT_TYPES.length; i++) {
    if (fetchedCount >= limit) break;

    const annType = ANNOUNCEMENT_TYPES[i];
    requested++;
    const requestUrl = new URL(BASE_URL);
    requestUrl.searchParams.set('announceType', annType.code);
    if (deptId) {
      requestUrl.searchParams.set('deptId', deptId);
    }

    try {
      await paceRequest(requestUrl.toString());
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

        // --- FR-02: Check existing record to decide if this announcement updates it ---
        const existing = await Tor.findOne({ projectId: String(torId) }).lean();
        // Seen again after download: its document is done, so don't parse it again
        const needsDocument = !isPastFetch(existing);

        let documentInfo = null;
        let downloadRes = null;
        const alreadyDownloaded = needsDocument && fsSync.existsSync(targetPdfPath);

        if (alreadyDownloaded) {
          documentInfo = await parseTorDocument(targetPdfPath);
        } else if (needsDocument && downloadAttachments) {
          downloadRes = await resolveAndDownloadEgpTorDocument({
            projectId: String(torId),
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

        const announcement = {
          code: annType.code,
          type: classifyAnnouncement(annType.code),
          receivedAt: new Date(),
          publishedAt: currentItem.pubDate ? new Date(currentItem.pubDate) : null,
          sourceUrl: link,
        };
        // The feed lists an item for days; each poll must record it only once
        const isNewAnnouncement = !hasAnnouncement(existing?.announcementHistory, announcement);

        const updatePayload = {
          source: 'process3',
          title: (currentItem.title ? String(currentItem.title).trim() : '') || existing?.title || 'No Title',
          announceType: annType.code,
        };

        // Derive status and isAmended from announcement history (FR-02, FR-15)
        const simulatedHistory = [
          ...(existing?.announcementHistory || []),
          ...(isNewAnnouncement ? [{ code: annType.code }] : []),
        ];
        const derived = deriveStatus(simulatedHistory, existing?.contract);
        updatePayload.status = derived.status;
        updatePayload.isAmended = derived.isAmended;

        if (!existing) {
          updatePayload.agency = '';
          updatePayload.subAgency = deptId || '';
          updatePayload.announceDate = currentItem.pubDate || null;
          updatePayload.procurementMethod = null;
          updatePayload.egpUrl = link;
        } else {
          if (link) updatePayload.egpUrl = link;
          if (currentItem.pubDate) updatePayload.announceDate = currentItem.pubDate;
        }

        Object.assign(
          updatePayload,
          fetchStageFields(existing, {
            isDownloaded,
            document: {
              fileName: expectedPdfName,
              storagePath: isDownloaded ? targetPdfPath : (existing?.document?.storagePath || null),
              sizeBytes:
                downloadRes?.sizeBytes ||
                (alreadyDownloaded
                  ? fsSync.statSync(targetPdfPath).size
                  : (existing?.document?.sizeBytes || null)),
              pages: documentInfo?.totalPages || existing?.document?.pages || null,
              documentType: documentInfo?.documentType || existing?.document?.documentType || 'UNKNOWN',
              contentHash: documentInfo?.contentHash || existing?.document?.contentHash || null,
              version: existing?.document?.version || 1,
            },
          }),
        );

        const update = { $set: updatePayload };
        if (isNewAnnouncement) update.$push = { announcementHistory: announcement };

        const updatedTor = await Tor.findOneAndUpdate(
          { projectId: String(torId) },
          update,
          { upsert: true, returnDocument: 'after' },
        );

        if (updatedTor) {
          const { status: finalStatus, isAmended: finalAmended } = deriveStatus(
            updatedTor.announcementHistory,
            updatedTor.contract,
          );
          if (
            updatedTor.status !== finalStatus ||
            updatedTor.isAmended !== finalAmended
          ) {
            updatedTor.status = finalStatus;
            updatedTor.isAmended = finalAmended;
            await updatedTor.save();
          }
        }

        fetchedCount++;
      }
    } catch (err) {
      errors.push(`RSS ${annType.code} error: ${err.message}`);
    }
  }

  // No fallback when the feed fails. One used to fill the gap with data.go.th
  // contracts saved as new draft TORs, which hid a dead feed behind months-old
  // projects. A feed that doesn't answer is reported, never papered over.
  return { fetched: fetchedCount, errors, unreachable: requested > 0 && errors.length === requested };
}
