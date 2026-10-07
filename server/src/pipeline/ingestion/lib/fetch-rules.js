/**
 * server/src/pipeline/ingestion/lib/fetch-rules.js
 *
 * What a fetch may change on a TOR it has seen before (ADR 0016). A schedule
 * fetches the same projects again and again while they stay in the feed, so
 * seeing a project twice must leave alone what the later steps own.
 */

const STAGES = ['fetched', 'downloaded', 'ocr_done'];

/**
 * True once download has handled the TOR. From then on its document and its
 * stage belong to download and OCR, and fetch leaves both alone.
 */
export function isPastFetch(existing) {
  return STAGES.indexOf(existing?.pipelineStatus) > 0;
}

/**
 * The `document` and `pipelineStatus` a fetch writes: nothing for a TOR past
 * fetch. Writing them would send it back to OCR (minutes for a scan), and a
 * document without its contentHash looks like a changed source to extraction,
 * which then pays Gemini for the TOR again.
 */
export function fetchStageFields(existing, { document, isDownloaded }) {
  if (isPastFetch(existing)) return {};
  return { document, pipelineStatus: isDownloaded ? 'downloaded' : 'fetched' };
}

const timeOf = (value) => {
  const time = value ? new Date(value).getTime() : Number.NaN;
  return Number.isNaN(time) ? null : time;
};

/**
 * Whether the history already holds this RSS item: same code, same publish
 * time, same link. A feed lists an item for days, and each poll sees it again;
 * a second amendment has its own publish time, so it still counts as new.
 */
export function hasAnnouncement(history, { code, publishedAt, sourceUrl }) {
  return (history ?? []).some(
    (entry) =>
      entry.code === code &&
      timeOf(entry.publishedAt) === timeOf(publishedAt) &&
      (entry.sourceUrl ?? '') === (sourceUrl ?? ''),
  );
}
