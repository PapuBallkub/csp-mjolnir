/**
 * server/src/pipeline/extraction/prompts.js
 *
 * Loads the prompts from prompts/ and references/, and builds the text each
 * request sends. Prompts live in Markdown so a wording change and its version
 * bump sit in the same file and the same commit (ADR 0013).
 */

import fs from 'node:fs';
import path from 'node:path';
import { DOCUMENTS, withPageHeaders } from './documents.js';

// The classify step reads the start of the TOR only: background, objective and
// scope come first, and a non-IT TOR should never pay for a full read (D8).
export const CLASSIFY_CHARS = 10_000;

const read = (relative) => fs.readFileSync(path.join(import.meta.dirname, relative), 'utf8').trim();

/**
 * Splits the `version: …` first line off a prompt. The version covers the whole
 * extraction package (prompts, glossary and schema.js): any change to them
 * bumps it, and results from an older version can be re-run with --outdated.
 */
export function parseVersion(markdown) {
  const match = markdown.match(/^version:\s*(\S+)\s*\n/);
  if (!match) {
    throw new Error('A versioned prompt must start with a "version: <name>" line.');
  }
  return { version: match[1], body: markdown.slice(match[0].length).trim() };
}

const extract = parseVersion(read('prompts/extract.md'));

export const PROMPT_VERSION = extract.version;
export const CLASSIFY_INSTRUCTION = read('prompts/classify.md');
export const EXTRACT_INSTRUCTION = `${extract.body}\n\n${read('references/glossary.md')}`;

// The title screen has a version of its own: changing it re-screens the
// projects still waiting, and nothing that was extracted (ADR 0026)
const screen = parseVersion(read('prompts/screen.md'));
export const SCREEN_VERSION = screen.version;
export const SCREEN_INSTRUCTION = screen.body;

/** The screen request: one project a line, its ID, how it's bought and its title. */
export function buildScreenContents(tors) {
  const lines = tors.map((tor) =>
    [tor.projectId, tor.procurementMethod || '-', String(tor.title ?? '').replace(/\s+/g, ' ').trim()].join(' | '),
  );
  return `Projects, one a line: project ID | procurement method | title\n\n${lines.join('\n')}`;
}

/** The classify request: the feed's title helps, and the first pages decide. */
export function buildClassifyContents({ title, rawText }) {
  return [
    `Project title from the e-GP feed: ${title || '(none)'}`,
    `First pages of the document:\n\n${rawText.slice(0, CLASSIFY_CHARS)}`,
  ].join('\n\n');
}

/**
 * The extract request: the TOR, then the bidding document when there is one
 * (ADR 0025), each under a "=== Document: … ===" line naming it as the
 * evidence does. The feed's values are deliberately left out: the
 * cross-source check compares the two, and a model shown the feed's price
 * would only copy it back.
 */
export function buildExtractContents({ rawText, biddingText = '' }) {
  const parts = [`=== Document: ${DOCUMENTS.tor} ===\n${rawText}`];
  if (biddingText.trim()) parts.push(`=== Document: ${DOCUMENTS.bidding} ===\n${withPageHeaders(biddingText)}`);
  return parts.join('\n\n');
}
