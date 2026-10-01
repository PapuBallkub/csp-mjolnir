import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CLASSIFY_CHARS,
  EXTRACT_INSTRUCTION,
  PROMPT_VERSION,
  buildClassifyContents,
  buildExtractContents,
  parseVersion,
} from '#pipeline/extraction/prompts.js';

test('parseVersion splits the version line off a prompt', () => {
  assert.deepEqual(parseVersion('version: extract-v7\n\nRead the TOR.'), {
    version: 'extract-v7',
    body: 'Read the TOR.',
  });
  assert.throws(() => parseVersion('Read the TOR.'), /version/);
});

test('the extract prompt carries a version, and the glossary, but not the version line', () => {
  assert.match(PROMPT_VERSION, /^extract-v\d+$/);
  assert.match(EXTRACT_INSTRUCTION, /Glossary/);
  assert.doesNotMatch(EXTRACT_INSTRUCTION, /^version:/m);
});

test('classify reads the feed title and only the first pages', () => {
  const rawText = 'ก'.repeat(CLASSIFY_CHARS + 500);
  const contents = buildClassifyContents({ title: 'จ้างพัฒนาระบบ', rawText });

  assert.match(contents, /จ้างพัฒนาระบบ/);
  assert.ok(contents.includes('ก'.repeat(CLASSIFY_CHARS)));
  assert.ok(!contents.includes('ก'.repeat(CLASSIFY_CHARS + 1)), 'nothing past the first pages');
});

test('extract is never shown the feed, so cross-source stays a real check', () => {
  const contents = buildExtractContents({ rawText: '=== Page 1 ===\nราคากลาง', title: 'FEED-TITLE', referencePriceTHB: 1 });
  assert.equal(contents, '=== Page 1 ===\nราคากลาง');
});
