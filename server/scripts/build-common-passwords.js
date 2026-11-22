/**
 * server/scripts/build-common-passwords.js
 *
 * Builds the common-password list the password policy refuses (ADR 0042,
 * ASVS V6.2.4 and V6.2.12) from SecLists' Pwdb_top-100000.txt, a list of the
 * passwords that appear most in public breach compilations (MIT licence).
 *
 * It keeps the ones our policy would otherwise accept (8 to 128 characters,
 * counted by code point), lowercased, each once, in the source's order (most
 * common first). Reads a file you downloaded and writes one file: no network,
 * no database.
 *
 * Usage, from server/:
 *   curl -L -o /tmp/pwdb.txt https://raw.githubusercontent.com/danielmiessler/SecLists/<commit>/Passwords/Common-Credentials/Pwdb_top-100000.txt
 *   node scripts/build-common-passwords.js /tmp/pwdb.txt
 *
 * The commit used is in src/features/auth/data/common-passwords.LICENSE.
 */

import fs from 'node:fs';
import path from 'node:path';

const MIN = 8;
const MAX = 128;
const OUT = path.resolve(import.meta.dirname, '../src/features/auth/data/common-passwords.txt');

const source = process.argv[2];
if (!source) {
  console.error('Give the downloaded list: node scripts/build-common-passwords.js <Pwdb_top-100000.txt>');
  process.exit(1);
}

const seen = new Set();
const kept = [];
for (const line of fs.readFileSync(source, 'utf8').split(/\r?\n/)) {
  const length = [...line].length;
  if (length < MIN || length > MAX) continue;
  // A few lines in the source are bytes that aren't UTF-8; nobody types those
  if (line.includes('�')) continue;
  const word = line.toLowerCase();
  if (seen.has(word)) continue;
  seen.add(word);
  kept.push(word);
}

fs.writeFileSync(OUT, `${kept.join('\n')}\n`);
console.log(`${kept.length} passwords written to ${path.relative(process.cwd(), OUT)}`);
