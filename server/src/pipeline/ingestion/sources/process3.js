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
  codeFromTypeName,
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
 * Reads an item's description, which the feed writes as
 * "<projectId>, <procurement method>, <announcement type name>", e.g.
 * "69099615682, ประกวดราคาอิเล็กทรอนิกส์ (e-bidding), ประกาศเชิญชวน".
 * The project id is only here: the link points at the announcement document.
 *
 * @returns {{ projectId: string|null, method: string|null, typeName: string|null }}
 */
export function parseItemDescription(description) {
  const [first = '', method = '', ...rest] = String(description ?? '').split(',');
  const id = convertThaiDigitsToArabic(first).trim();
  return {
    projectId: /^\d{11}$/.test(id) ? id : null,
    method: method.trim() || null,
    typeName: rest.join(',').trim() || null,
  };
}

// e-GP closes the RSS link 09:00–12:00 and 13:00–17:00, Bangkok time
// (กรมบัญชีกลาง's RSS manual, 4.5). A request then hangs until it times out.
const CLOSED_MINUTES = [
  [9 * 60, 12 * 60],
  [13 * 60, 17 * 60],
];
export const FEED_HOURS = 'e-GP closes the RSS feed 09:00–12:00 and 13:00–17:00 (Bangkok time)';

/** Whether the feed is closed at this moment. Bangkok has no daylight saving. */
export function isFeedClosed(now = new Date()) {
  const minute = (now.getUTCHours() * 60 + now.getUTCMinutes() + 7 * 60) % (24 * 60);
  return CLOSED_MINUTES.some(([from, to]) => minute >= from && minute <= to);
}

/**
 * Fetches procurement announcements from e-GP process3 RSS feed.
 *
 * @param {Object} options
 * @param {string} [options.query='คอมพิวเตอร์']
 * @param {string} [options.deptId='']
 * @param {string} options.documentsDir
 * @param {boolean} [options.downloadAttachments=false]
 * @param {Date} [options.now] - When the feed is asked, for its opening hours
 * @param {Function} [options.pace] - Waits before each request (NFR-03); replaced in tests
 * @param {number} [options.limit=5] - At most this many new projects; updates to followed ones are never limited
 * @returns {Promise<{ fetched: number, discovered: number, updated: number, errors: string[],
 *   unreachable: boolean, closed: boolean }>}
 */
export async function fetchFromProcess3({
  query = 'คอมพิวเตอร์',
  limit = 5,
  deptId = '',
  documentsDir,
  downloadAttachments = false,
  now = new Date(),
  pace = paceRequest,
}) {
  // Every request would hang for its full timeout: don't send any
  if (isFeedClosed(now)) {
    return {
      fetched: 0,
      discovered: 0,
      updated: 0,
      errors: [`${FEED_HOURS}; nothing was requested.`],
      unreachable: true,
      closed: true,
    };
  }

  await fs.mkdir(documentsDir, { recursive: true });

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    trimValues: true,
    isArray: (name) => name === 'item',
  });

  // `limit` and `query` decide which new projects to add. They never hold back
  // news about a project we already follow, which is why every type is asked
  // for on every run: a cancellation or a winner must always get through.
  let discovered = 0;
  let updated = 0;
  let requested = 0;
  const errors = [];
  const queryLower = query.toLowerCase();
  const matchesQuery = (item) =>
    String(item.title || '').toLowerCase().includes(queryLower) ||
    String(item.description || '').toLowerCase().includes(queryLower);

  let failedRequests = 0;

  for (let i = 0; i < ANNOUNCEMENT_TYPES.length; i++) {
    const annType = ANNOUNCEMENT_TYPES[i];
    requested++;
    let answered = false;
    const requestUrl = new URL(BASE_URL);
    // Spelled with one "n", as e-GP defines it. The correct English spelling
    // is ignored, and the feed then returns no items at all.
    requestUrl.searchParams.set('anounceType', annType.code);
    if (deptId) {
      requestUrl.searchParams.set('deptId', deptId);
    }

    try {
      await pace(requestUrl.toString());
      const response = await axios.get(requestUrl.toString(), {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/xml, text/xml, */*',
        },
        responseType: 'arraybuffer',
        timeout: REQUEST_TIMEOUT_MS,
      });

      answered = true;
      const { xmlText } = decodeThaiXml(response.data);
      const parsed = parser.parse(xmlText);
      const channel = parsed?.rss?.channel || parsed?.channel;
      const items = channel?.item || [];

      for (const currentItem of items) {
        const described = parseItemDescription(currentItem.description);

        // An item names its own type. One of a different type than we asked
        // for means the request went wrong, so it is reported, not saved
        // under the wrong code.
        const namedCode = codeFromTypeName(described.typeName);
        if (namedCode && namedCode !== annType.code) {
          errors.push(`RSS ${annType.code}: got a "${described.typeName}" item (${namedCode}); not saved`);
          continue;
        }

        const rawTorId =
          described.projectId ||
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
        if (!existing) {
          // A new project: only an opening type adds one, and only within the
          // query and the limit
          if (!EGP_ANNOUNCEMENT_CODES[annType.code].discovers) continue;
          if (!matchesQuery(currentItem) || discovered >= limit) continue;
        }
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
        };

        // Derive status and isAmended from announcement history (FR-02, FR-15),
        // dates included: the status engine orders it by publish date
        const simulatedHistory = [
          ...(existing?.announcementHistory || []),
          ...(isNewAnnouncement ? [announcement] : []),
        ];
        const derived = deriveStatus(simulatedHistory, existing?.contract);
        updatePayload.status = derived.status;
        updatePayload.isAmended = derived.isAmended;
        // The latest announcement's code, not the one this item happens to
        // have: an older item seen again mustn't turn a cancellation back
        updatePayload.announceType = derived.latestCode ?? annType.code;

        if (!existing) {
          updatePayload.agency = '';
          updatePayload.subAgency = deptId || '';
          updatePayload.announceDate = currentItem.pubDate || null;
          // e.g. "ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)" or "เฉพาะเจาะจง": decides
          // whether anyone can bid at all
          updatePayload.procurementMethod = described.method;
          updatePayload.egpUrl = link;
        } else {
          if (link) updatePayload.egpUrl = link;
          if (currentItem.pubDate) updatePayload.announceDate = currentItem.pubDate;
          if (!existing.procurementMethod && described.method) updatePayload.procurementMethod = described.method;
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
          const final = deriveStatus(updatedTor.announcementHistory, updatedTor.contract);
          if (
            updatedTor.status !== final.status ||
            updatedTor.isAmended !== final.isAmended ||
            (final.latestCode && updatedTor.announceType !== final.latestCode)
          ) {
            updatedTor.status = final.status;
            updatedTor.isAmended = final.isAmended;
            if (final.latestCode) updatedTor.announceType = final.latestCode;
            await updatedTor.save();
          }
        }

        if (existing) updated++;
        else discovered++;
      }
    } catch (err) {
      if (!answered) failedRequests++;
      errors.push(`RSS ${annType.code} error: ${err.message}`);
    }
  }

  // No fallback when the feed fails. One used to fill the gap with data.go.th
  // contracts saved as new draft TORs, which hid a dead feed behind months-old
  // projects. A feed that doesn't answer is reported, never papered over.
  return {
    fetched: discovered + updated,
    discovered,
    updated,
    errors,
    unreachable: requested > 0 && failedRequests === requested,
    closed: false,
  };
}
