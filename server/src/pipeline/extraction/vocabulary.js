/**
 * server/src/pipeline/extraction/vocabulary.js
 *
 * Maps technology names as TORs write them onto one canonical name each, so
 * "Postgres", "PostgreSQL" and "PostgreSQL 14" are counted as one technology
 * by search, matching and lock-spec (ADR 0014). Extraction owns the
 * `technologies` collection: a name nothing matches becomes a `new` entry for
 * a person to merge or confirm, and is used straight away.
 */

import { Technology } from '#models/index.js';

/** A name in the form it's matched on: NFKC, no ® or ™, one space, lower case. */
export function technologyKey(name) {
  return String(name ?? '')
    .normalize('NFKC')
    .replace(/[®™©]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// "PostgreSQL 14", "Windows Server 2019", "Oracle 19c", "Chrome v96"
const TRAILING_VERSION = /^(.*\S)\s+v?(\d[\w.]*)$/i;

/** Splits a version off the end of a name, or null when there is none. */
export function splitTrailingVersion(name) {
  const match = String(name ?? '').trim().match(TRAILING_VERSION);
  return match ? { name: match[1], version: match[2] } : null;
}

/** Indexes entries by their key and every alias. */
export function buildVocabulary(entries) {
  const index = new Map();
  for (const entry of entries) {
    const keys = [entry.key ?? technologyKey(entry.name), ...(entry.aliases ?? []).map(technologyKey)];
    for (const key of keys) if (key && !index.has(key)) index.set(key, entry);
  }
  return index;
}

/**
 * Finds the vocabulary entry for one technology as the model gave it.
 * A trailing version is split off only when the rest is a known name: an
 * unknown "Office 365" must not become "Office", version 365.
 *
 * @returns {{ entry: object|null, name: string, version: string|null }}
 */
export function matchTechnology({ name, version = null }, vocabulary) {
  const direct = vocabulary.get(technologyKey(name));
  if (direct) return { entry: direct, name: direct.name, version };

  if (!version) {
    const split = splitTrailingVersion(name);
    const entry = split && vocabulary.get(technologyKey(split.name));
    if (entry) return { entry, name: entry.name, version: split.version };
  }
  return { entry: null, name: String(name ?? '').trim(), version };
}

/**
 * Resolves the model's technologies to canonical `{ name, version }`, adding a
 * `new` entry for each name the vocabulary doesn't know. With `dryRun`,
 * nothing is written: unknown names are only reported.
 *
 * @returns {Promise<{ technologies: object[], unknown: string[] }>}
 */
export async function resolveTechnologies(items, { projectId, dryRun = false }) {
  const vocabulary = buildVocabulary(await Technology.find({}, { name: 1, key: 1, aliases: 1 }).lean());
  const technologies = [];
  const unknown = [];

  for (const item of items ?? []) {
    const match = matchTechnology(item, vocabulary);
    if (!match.name) continue;

    if (!match.entry) {
      const key = technologyKey(match.name);
      unknown.push(match.name);
      if (!dryRun) {
        // Upsert on the key: two TORs naming the same new technology share one entry
        await Technology.updateOne(
          { key },
          { $setOnInsert: { name: match.name, key, status: 'new', firstSeenIn: projectId } },
          { upsert: true },
        );
      }
      vocabulary.set(key, { name: match.name }); // a repeat later in this TOR reuses it
    }

    const duplicate = technologies.some((t) => t.name === match.name && t.version === match.version);
    if (!duplicate) technologies.push({ name: match.name, version: match.version });
  }
  return { technologies, unknown };
}
