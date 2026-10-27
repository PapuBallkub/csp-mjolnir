/**
 * server/src/pipeline/shared/amendments.js
 *
 * What changed in a TOR we follow, recorded in Tor.amendments (ADR 0032).
 * An entry is one change, from one of two sources:
 *   feed     e-GP announced a changed invitation (D2): the agency's statement
 *   package  a new package in the same stage, with a different TOR file or
 *            facts: what the platform found, the recheck or a new notice
 *            having made download look
 *
 * A draft becoming an invitation is the next stage, not a change. The stage
 * is read from each package's own announcement, which says "ร่าง" on a draft,
 * not from the feed: the feed can lag behind e-GP's packages by days.
 *
 * What changed is said in two steps, as rows of a field, before and after:
 * the facts when download applies the package, the summary's own values once
 * it's extracted again (diff: facts, then complete). Only values that can be
 * compared are: numbers, dates and lists of known items. Two extractions word
 * free text differently, and a row there would report a change nobody made.
 */

import { Tor } from '#models/index.js';
import { isDraftAnnouncement, readPostedDate } from '../ingestion/lib/egp-package.js';

/** A package's stage, from its announcement: 'draft', 'invitation', or null when there's no text to read. */
export function stageOfPackage(pkg) {
  const text = pkg?.announcementText;
  if (!text) return null;
  return isDraftAnnouncement(text) ? 'draft' : 'invitation';
}

/**
 * What a new announcement package is, next to the one before it:
 * 'next-stage' (a draft became an invitation), 'same-stage' (a change, if its
 * contents differ), or 'unknown' (a stage couldn't be read).
 */
export function judgeStages(previous, next) {
  const before = stageOfPackage(previous);
  const after = stageOfPackage(next);
  if (!before || !after) return 'unknown';
  if (before === 'draft' && after === 'invitation') return 'next-stage';
  return before === after ? 'same-stage' : 'unknown';
}

const get = (record, path) => path.split('.').reduce((value, key) => value?.[key], record);

/** A value as a row holds it: an ISO date, a plain number, or null. A price of 0 is none (ADR 0014). */
function asText(value, type) {
  if (value === null || value === undefined || value === '') return null;
  if (type === 'date') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (type === 'price' && !(Number(value) > 0)) return null;
  return String(value);
}

function valueRows(before, after, fields) {
  return fields.flatMap(([field, type]) => {
    const was = asText(get(before, field), type);
    const now = asText(get(after, field), type);
    if (was === now) return [];
    return [{ kind: was === null ? 'added' : now === null ? 'removed' : 'changed', field, before: was, after: now }];
  });
}

// The Tor's facts a package sets (ADR 0020, 0023), named as the summary names them
const TOR_FACTS = [
  ['facts.submissionDeadline', 'date'],
  ['facts.referencePriceTHB', 'price'],
  ['facts.budgetTHB', 'price'],
];

/** A Tor's facts in the summary's shape, so a row names a field the page knows. */
export const torFacts = (tor) => ({
  facts: {
    submissionDeadline: tor?.submissionDeadline ?? null,
    referencePriceTHB: tor?.referencePriceTHB ?? null,
    budgetTHB: tor?.budgetTHB ?? null,
  },
});

/** What a package changed in a Tor's facts: before and after it was applied. */
export function factChanges(before, after) {
  return valueRows(torFacts(before), torFacts(after), TOR_FACTS);
}

// The summary's values that can be compared, and its lists of known items
const SUMMARY_VALUES = [
  ['facts.submissionDeadline', 'date'],
  ['facts.budgetTHB', 'price'],
  ['facts.referencePriceTHB', 'price'],
  ['facts.deliveryPeriodDays', 'number'],
  ['facts.contractDurationDays', 'number'],
  ['facts.warrantyYears', 'number'],
  ['eligibility.previousExperienceMinTHB', 'price'],
];
const SUMMARY_LISTS = [
  // Technologies are named from the vocabulary, so the same one has the same name
  ['technicalRequirements.requiredTechnologies', (item) => item?.name],
  // The standard conditions are keys (models/standard-conditions.js)
  ['eligibility.standardConditions', (item) => item],
];

/** What changed between two summaries, in what can be compared. */
export function summaryChanges(before, after) {
  const rows = valueRows(before, after, SUMMARY_VALUES);
  for (const [field, nameOf] of SUMMARY_LISTS) {
    const names = (record) =>
      new Map(
        (get(record, field) ?? [])
          .map((item) => String(nameOf(item) ?? '').trim())
          .filter(Boolean)
          .map((name) => [name.toLowerCase(), name]),
      );
    const was = names(before);
    const now = names(after);
    for (const [key, name] of now) if (!was.has(key)) rows.push({ kind: 'added', field, before: null, after: name });
    for (const [key, name] of was) if (!now.has(key)) rows.push({ kind: 'removed', field, before: name, after: null });
  }
  return rows;
}

const rowKey = (row) => `${row.field}|${row.before}|${row.after}`;

/**
 * Records a change on a Tor in hand (not saved): into the entry this run
 * already opened, else into a changed invitation the feed announced that no
 * package has answered yet, else a new 'package' entry.
 *
 * @param {object} tor - a Tor document
 * @param {object} change
 * @param {object[]} [change.rows] - what changed
 * @param {Date} change.now - the run's time: one run's changes go in one entry
 * @param {string} [change.stage] - 'draft' or 'invitation': the stage that changed
 * @param {string} [change.zipId] - the package it came with
 * @param {string} [change.previousZipId] - the package it replaced
 * @param {number} [change.insightVersion] - the summary version it replaced (ADR 0031)
 * @param {Date} [change.date] - the date the documents state
 * @returns {object} The entry
 */
export function recordChange(tor, { rows = [], now, ...fields }) {
  const live = (tor.amendments ?? []).filter((entry) => !entry.rolledBack);
  let entry =
    live.find((e) => e.detectedAt && new Date(e.detectedAt).getTime() === now.getTime()) ??
    live.find((e) => e.source === 'feed' && !e.zipId);
  if (!entry) {
    tor.amendments.push({ source: 'package', detectedAt: now, previousCheckAt: tor.packagesCheckedAt ?? null, changes: [] });
    entry = tor.amendments[tor.amendments.length - 1];
  }
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null && (entry[key] === undefined || entry[key] === null)) entry[key] = value;
  }
  const known = new Set(entry.changes.map(rowKey));
  for (const row of rows) if (!known.has(rowKey(row))) entry.changes.push(row);
  if (entry.changes.length > 0 && entry.diff !== 'complete') entry.diff = 'facts';
  tor.lastChangeAt = now;
  return entry;
}

/** A Tor's last package of a kind, before a new one is applied. */
export const lastPackage = (tor, kind) => (tor.packages ?? []).filter((pkg) => (pkg.kind ?? 'announcement') === kind).at(-1) ?? null;

/**
 * Judges a new announcement package just applied to a Tor in hand, and
 * records it as a change when it is one: the same stage with a different TOR
 * file or facts, or an answer to a changed invitation the feed announced.
 *
 * @param {object} tor - the Tor document, the package applied
 * @param {object} seen
 * @param {object|null} seen.previous - the announcement package before it
 * @param {object} seen.pkg - the new package
 * @param {boolean} seen.torChanged - its TOR file differs
 * @param {object} seen.factsBefore - the Tor's facts before it was applied
 * @param {number|null} seen.insightVersion - the summary version now, which a re-extraction will replace
 * @returns {{ verdict: string, entry?: object }} 'first', 'next-stage', 'unknown', 'same-contents' or 'same-stage'
 */
export function noteNewPackage(tor, { previous, pkg, torChanged, factsBefore, insightVersion, now }) {
  if (!previous) return { verdict: 'first' };
  const verdict = judgeStages(previous, pkg);
  const awaited = (tor.amendments ?? []).some((e) => !e.rolledBack && e.source === 'feed' && !e.zipId);
  if (verdict !== 'same-stage' && !awaited) return { verdict };

  const rows = factChanges(factsBefore, tor);
  if (torChanged) rows.unshift({ kind: 'changed', field: 'document', before: previous.name ?? null, after: pkg.name ?? null });
  if (rows.length === 0 && !awaited) return { verdict: 'same-contents' };
  const entry = recordChange(tor, {
    rows,
    now,
    stage: stageOfPackage(pkg) ?? undefined,
    zipId: pkg.zipId,
    previousZipId: previous.zipId,
    contentHash: torChanged ? tor.document?.contentHash : undefined,
    insightVersion: insightVersion ?? undefined,
    date: postedDateOf(pkg) ?? undefined,
  });
  return { verdict: awaited && verdict !== 'same-stage' ? 'announced' : verdict, entry };
}

/** The date an announcement states it was posted, as a date; null when it states none. */
export function postedDateOf(pkg) {
  const day = pkg?.announcementText ? readPostedDate(pkg.announcementText) : null;
  return day ? new Date(`${day}T00:00:00+07:00`) : null;
}

/**
 * Adds the summary's own changes to the change that replaced summary version
 * `version`, once it's extracted again, and marks the entry complete. Rows the
 * facts already said aren't said twice.
 */
export async function completeChange(projectId, version, before, after) {
  const tor = await Tor.findOne(
    { projectId, amendments: { $elemMatch: { insightVersion: version, diff: { $ne: 'complete' }, rolledBack: { $ne: true } } } },
    { amendments: 1 },
  ).lean();
  if (!tor) return false;
  const entry = tor.amendments.find((e) => e.insightVersion === version && e.diff !== 'complete' && !e.rolledBack);
  const said = new Set(entry.changes.map((row) => row.field));
  const rows = summaryChanges(before, after).filter((row) => !said.has(row.field));
  await Tor.updateOne(
    { projectId, 'amendments._id': entry._id },
    { $push: { 'amendments.$.changes': { $each: rows } }, $set: { 'amendments.$.diff': 'complete' } },
  );
  return true;
}
