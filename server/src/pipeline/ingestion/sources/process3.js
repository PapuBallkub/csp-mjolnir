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
const REQUEST_TIMEOUT_MS = 20000;

import {
  AMENDMENT_CODES,
  EGP_ANNOUNCEMENT_CODES,
  FETCHABLE_CODES,
  classifyAnnouncement,
  codeFromTypeName,
} from '../../shared/announcement-codes.js';
import { paceRequest } from '../../shared/request-pacer.js';
import { USER_AGENT } from '../../shared/user-agent.js';
import { deriveStatus } from '../../shared/status-engine.js';
import { fetchStageFields, hasAnnouncement, isPastFetch } from '../lib/fetch-rules.js';

// Re-export for backward compatibility with test/pipeline/ingestion/utils.test.js
export const ANNOUNCEMENT_TYPES = FETCHABLE_CODES.map((code) => ({
  code,
  name: `${EGP_ANNOUNCEMENT_CODES[code].nameEn} (${EGP_ANNOUNCEMENT_CODES[code].nameTh})`,
}));

// What scheduled runs ask for: every code but `15`, which has timed out on
// every request so far. In a sweep it would cost each agency 20 seconds.
export const ROUTINE_TYPES = FETCHABLE_CODES.filter((code) => code !== '15');

// Requests in a row that went unanswered before a run stops asking: a feed
// that hangs would otherwise cost every remaining request its full timeout
const MAX_UNANSWERED_IN_A_ROW = 2;

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

const KINDS = { จ้าง: 'hire', ซื้อ: 'buy', เช่า: 'rent' };

/**
 * What kind of contract a title announces (ADR 0018): จ้าง (hire: a job),
 * ซื้อ (buy: supplying goods) or เช่า (rent). Titles start with the method,
 * then the kind: "ประกวดราคาจ้างบำรุงรักษา…", "ประกวดราคาซื้อชุด…".
 *
 * @returns {'hire' | 'buy' | 'rent' | null}
 */
export function procurementKindOf(title) {
  const match = String(title ?? '').match(/^\s*(?:ประกวดราคา|สอบราคา|ประกวดแบบ)?\s*(จ้าง|ซื้อ|เช่า)/);
  return match ? KINDS[match[1]] : null;
}

// The RSS link is open 17:01–08:29 only, Bangkok time (กรมบัญชีกลาง's RSS
// manual, 4.8, the edition with 2024 examples). An older edition gave a
// lunch-hour opening too; the feed timed out at 12:05 and 12:20 (2026-10-11,
// 2026-10-14) and at 08:36. A request when closed hangs until it times out.
const CLOSED_MINUTES = [[8 * 60 + 30, 17 * 60]];
export const FEED_HOURS = 'e-GP opens the RSS feed only 17:01–08:29 (Bangkok time)';

/** Whether the feed is closed at this moment. Bangkok has no daylight saving. */
export function isFeedClosed(now = new Date()) {
  const minute = (now.getUTCHours() * 60 + now.getUTCMinutes() + 7 * 60) % (24 * 60);
  return CLOSED_MINUTES.some(([from, to]) => minute >= from && minute <= to);
}

/**
 * Fetches procurement announcements from e-GP process3 RSS feed.
 *
 * @param {Object} options
 * @param {string|null} [options.query] - Keep only new projects whose title or description has this text.
 *   None by default: classify decides what is IT, from the document (ADR 0018)
 * @param {string} [options.deptId='']
 * @param {string} options.documentsDir
 * @param {boolean} [options.downloadAttachments=false]
 * @param {Date} [options.now] - When the feed is asked, for its opening hours
 * @param {Function} [options.pace] - Waits before each request (NFR-03); replaced in tests
 * @param {number} [options.limit=5] - At most this many new projects; updates to followed ones are never limited
 * @param {string|null} [options.announceDate] - One day's announcements only, as YYYYMMDD (Gregorian),
 *   with no earlier days filled in (manual 4.6)
 * @returns {Promise<{ fetched: number, discovered: number, updated: number, errors: string[],
 *   unreachable: boolean, rateLimited: boolean, closed: boolean, requested: number, answered: number,
 *   itemsByType: Record<string, number>, countByType: Record<string, number>,
 *   oldestDateByType: Record<string, string> }>}
 *   `countByType` is e-GP's `countbyday`: how many that day really has, where a list shows 20 at most.
 *   `oldestDateByType` is the oldest pubDate in each list, YYYY-MM-DD.
 */
export async function fetchFromProcess3({
  query = null,
  limit = 5,
  deptId = '',
  documentsDir,
  downloadAttachments = false,
  now = new Date(),
  pace = paceRequest,
  types = null, // only these announcement codes, e.g. ['D0'] for an agency sweep
  announceDate = null, // one day only, YYYYMMDD
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
      rateLimited: false,
      requested: 0,
      answered: 0,
      itemsByType: {},
      countByType: {},
      oldestDateByType: {},
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
  const queryLower = (query ?? '').toLowerCase();
  const matchesQuery = (item) =>
    String(item.title || '').toLowerCase().includes(queryLower) ||
    String(item.description || '').toLowerCase().includes(queryLower);

  let failedRequests = 0;
  let unansweredInARow = 0;
  let rateLimited = false;
  const itemsByType = {};
  const countByType = {};
  const oldestDateByType = {};

  const wanted = types ? ANNOUNCEMENT_TYPES.filter((t) => types.includes(t.code)) : ANNOUNCEMENT_TYPES;
  for (let i = 0; i < wanted.length; i++) {
    const annType = wanted[i];
    if (unansweredInARow >= MAX_UNANSWERED_IN_A_ROW) {
      errors.push(`stopped asking after ${unansweredInARow} requests in a row went unanswered`);
      break;
    }
    requested++;
    let answered = false;
    const requestUrl = new URL(BASE_URL);
    // Spelled with one "n", as e-GP defines it. The correct English spelling
    // is ignored, and the feed then returns no items at all.
    requestUrl.searchParams.set('anounceType', annType.code);
    if (deptId) {
      requestUrl.searchParams.set('deptId', deptId);
    }
    if (announceDate) requestUrl.searchParams.set('announceDate', announceDate);

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
      unansweredInARow = 0;
      const { xmlText } = decodeThaiXml(response.data);
      const parsed = parser.parse(xmlText);
      const channel = parsed?.rss?.channel || parsed?.channel;
      const items = channel?.item || [];
      itemsByType[annType.code] = items.length;
      // How many that day really has, where the list shows 20 at most (manual 4.7)
      const count = Number.parseInt(String(channel?.countbyday ?? ''), 10);
      if (Number.isInteger(count)) countByType[annType.code] = count;
      // The oldest day in the list: the one a full list may have cut short
      const days = items
        .map((item) => String(item.pubDate ?? '').slice(0, 10))
        .filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day))
        .sort();
      if (days.length) oldestDateByType[annType.code] = days[0];

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
            documentInfo = await parseTorDocument(downloadRes.filePath);
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

        // A new stage of a project already downloaded comes with a new package,
        // perhaps: download checks e-GP for it (ADR 0020)
        if (isNewAnnouncement && !needsDocument && EGP_ANNOUNCEMENT_CODES[annType.code].buildsPackage) {
          updatePayload.packageCheckNeeded = true;
        }

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
          updatePayload.procurementKind = procurementKindOf(currentItem.title);
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
              storagePath: isDownloaded
                ? (downloadRes?.filePath ?? targetPdfPath)
                : (existing?.document?.storagePath || null),
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
        // A changed invitation of a TOR we follow: the agency's own statement
        // of a change. Download fills in what changed when the package comes (ADR 0032)
        if (isNewAnnouncement && existing && AMENDMENT_CODES.includes(annType.code)) {
          const receivedAt = announcement.receivedAt;
          update.$push.amendments = {
            source: 'feed',
            stage: 'invitation', // a D2 changes an invitation
            date: announcement.publishedAt,
            headline: updatePayload.title,
            detectedAt: receivedAt,
            previousCheckAt: existing.packagesCheckedAt ?? null,
          };
          updatePayload.lastChangeAt = receivedAt;
        }

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
      if (!answered) {
        failedRequests++;
        // e-GP asked us to slow down: it would refuse the rest too, and asking
        // anyway only digs deeper. The caller decides when to try again.
        if (err.response?.status === 429) {
          rateLimited = true;
          errors.push(`RSS ${annType.code}: e-GP asked us to slow down (HTTP 429); stopped asking`);
          break;
        }
        unansweredInARow++;
      }
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
    // A feed that refused us (429) answered: it's busy, not down
    unreachable: !rateLimited && requested > 0 && failedRequests === requested,
    rateLimited,
    closed: false,
    requested,
    answered: requested - failedRequests,
    itemsByType,
    countByType,
    oldestDateByType,
  };
}
