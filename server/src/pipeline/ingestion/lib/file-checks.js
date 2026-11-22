/**
 * server/src/pipeline/ingestion/lib/file-checks.js
 *
 * What a file from e-GP must pass before the pipeline keeps it: how much a zip
 * may unpack to, which types are kept, and the virus scan. Every check runs on
 * bytes in memory, before anything is parsed or written to disk.
 */

import { baseName } from './egp-package.js';

/**
 * How much one package may unpack to, from the size its download may reach.
 * The most seen (2026-11-22, 1,013 packages): 31 files, 179.7 MB in all, one
 * file of 99.7 MB.
 *
 * @param {number} packageBytes - The download's cap
 */
export const zipLimitsFor = (packageBytes) => ({
  maxEntries: 100,
  maxEntryBytes: packageBytes,
  maxTotalBytes: 2 * packageBytes,
});

const mb = (bytes) => `${Math.round(bytes / (1024 * 1024))} MB`;

/**
 * Why a zip is refused before it's unpacked, from its central directory, or
 * null. The sizes are the ones the headers declare: adm-zip never inflates an
 * entry past its declared size, so a header that lies only cuts its own entry
 * short, and that entry then fails its CRC check.
 *
 * @param {{ name: string, size: number }[]} entries - Files only, no folders
 * @param {{ maxEntries: number, maxEntryBytes: number, maxTotalBytes: number }} limits
 * @returns {string | null}
 */
export function zipLimitProblem(entries, { maxEntries, maxEntryBytes, maxTotalBytes }) {
  if (entries.length > maxEntries) return `holds ${entries.length} files, more than the ${maxEntries} we unpack`;
  const large = entries.find((entry) => !(entry.size <= maxEntryBytes));
  if (large) return `holds ${baseName(large.name)}, which unpacks to more than ${mb(maxEntryBytes)}`;
  const total = entries.reduce((sum, entry) => sum + entry.size, 0);
  if (total > maxTotalBytes) return `unpacks to ${mb(total)}, more than ${mb(maxTotalBytes)}`;
  return null;
}

// The only files kept, by extension, and the bytes each must start with. Only
// PDFs are ever parsed or served; the Office files are kept and never opened,
// so a zip's signature is enough for .xlsx and .docx.
const KEPT_TYPES = [
  { extension: /\.pdf$/i, magic: Buffer.from('%PDF-', 'latin1'), label: 'a PDF' },
  { extension: /\.(xlsx|docx)$/i, magic: Buffer.from([0x50, 0x4b, 0x03, 0x04]), label: 'an Office file' },
  { extension: /\.(xls|doc)$/i, magic: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), label: 'an Office file' },
];

/**
 * Why a file isn't kept, or null: its type isn't one we keep, or its first
 * bytes aren't what its extension says.
 *
 * @param {string} name
 * @param {Buffer} data
 * @returns {string | null}
 */
export function fileTypeProblem(name, data) {
  const type = KEPT_TYPES.find((candidate) => candidate.extension.test(name));
  if (!type) return 'its type is not one we keep (PDF, Excel or Word)';
  if (!data.subarray(0, type.magic.length).equals(type.magic)) return `its first bytes are not ${type.label}`;
  return null;
}

/**
 * Checks the files a package keeps: the type check, then the virus scan. The
 * first file ClamAV flags fails the whole package, and nothing is kept.
 *
 * @param {{ name: string, data: Buffer }[]} entries - The files to keep
 * @param {object} options
 * @param {((data: Buffer) => Promise<object>) | null} options.scan - Null when
 *   this machine has no scanner: the files are kept, marked unscanned, and
 *   never served until a rescan
 * @param {string} options.label - Names the package in a failure
 * @param {Date} options.now
 * @returns {Promise<
 *   | { entries: { name: string, data: Buffer, scan: object }[], problems: string[] }
 *   | { failed: { success: false, error: string, transient: boolean, final: boolean } }>}
 *   `final`: the same bytes would fail the same way, so trying again is no use.
 */
export async function checkKeptFiles(entries, { scan, label, now }) {
  const kept = [];
  const problems = [];
  for (const entry of entries) {
    const file = baseName(entry.name);
    const problem = fileTypeProblem(file, entry.data);
    if (problem) {
      problems.push(`${file} not kept: ${problem}`);
      continue;
    }
    if (!scan) {
      kept.push({ ...entry, scan: { result: 'unscanned', signature: null, scannedAt: null } });
      continue;
    }

    const verdict = await scan(entry.data);
    if (verdict.result === 'clean') {
      kept.push({ ...entry, scan: { result: 'clean', signature: null, scannedAt: now } });
      continue;
    }
    const failed = (error, final) => ({ failed: { success: false, error, transient: !final, final } });
    if (verdict.result === 'infected') {
      return failed(`ClamAV flagged ${file} in ${label} as ${verdict.signature}: nothing from the package was kept`, true);
    }
    if (verdict.reason === 'too-large') return failed(`${file} in ${label} is too large for ClamAV to scan`, true);
    return failed(`ClamAV could not scan ${file} in ${label} (${verdict.reason})`, false);
  }
  return { entries: kept, problems };
}
