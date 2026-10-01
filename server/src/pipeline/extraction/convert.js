/**
 * server/src/pipeline/extraction/convert.js
 *
 * Turns what the model copied out of a TOR into values: amounts into numbers,
 * Buddhist-era dates into Dates. The model copies, code converts (ADR 0013).
 * Every function returns null for anything it can't read, never a guess.
 */

import { parseThaiAmount } from '../shared/thai-text.js';

const BUDDHIST_ERA_OFFSET = 543;
const BANGKOK_UTC_OFFSET_HOURS = 7;

/** An evidenced amount ("๑๒,๕๐๐,๐๐๐") as a number, or null. */
export function toAmount(evidenced) {
  return evidenced ? parseThaiAmount(evidenced.value) : null;
}

/** An evidenced count (days, years) as a non-negative number, or null. */
export function toNumber(evidenced) {
  const value = evidenced?.value;
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/** An evidenced piece of text, trimmed, or null. */
export function toText(evidenced) {
  const value = typeof evidenced?.value === 'string' ? evidenced.value.trim() : '';
  return value || null;
}

/**
 * An evidenced date ({ day, month, year, era, hour, minute }) as a Date, read
 * as Bangkok time. Buddhist years (2569) become Common Era years (2026). Null
 * for a date that doesn't exist, such as 31 February, or a year outside
 * 2000–2100, which in a TOR means a misread.
 */
export function toDate(evidenced) {
  const parts = evidenced?.value;
  if (!parts) return null;

  const year = parts.era === 'BE' ? parts.year - BUDDHIST_ERA_OFFSET : parts.year;
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null;

  const hour = parts.hour ?? 0;
  const minute = parts.minute ?? 0;
  const date = new Date(
    Date.UTC(year, parts.month - 1, parts.day, hour - BANGKOK_UTC_OFFSET_HOURS, minute),
  );

  // Date.UTC rolls 31 February over into March; a rolled-over date was not real
  const bangkok = new Date(date.getTime() + BANGKOK_UTC_OFFSET_HOURS * 3_600_000);
  if (bangkok.getUTCDate() !== parts.day || bangkok.getUTCMonth() !== parts.month - 1) return null;
  return date;
}
