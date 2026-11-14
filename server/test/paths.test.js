import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';

import { getDocumentsDir } from '#common/paths.js';

test('getDocumentsDir: resolves to canonical server/data/documents by default', () => {
  const original = process.env.DOCUMENTS_DIR;
  delete process.env.DOCUMENTS_DIR;
  try {
    const dir = getDocumentsDir();
    assert.ok(path.isAbsolute(dir), 'documents dir should be an absolute path');
    assert.ok(dir.endsWith(path.join('server', 'data', 'documents')));
  } finally {
    if (original !== undefined) process.env.DOCUMENTS_DIR = original;
  }
});

test('getDocumentsDir: honors DOCUMENTS_DIR when set', () => {
  const original = process.env.DOCUMENTS_DIR;
  process.env.DOCUMENTS_DIR = '/tmp/custom-documents';
  try {
    const dir = getDocumentsDir();
    assert.equal(dir, path.resolve('/tmp/custom-documents'));
  } finally {
    if (original !== undefined) {
      process.env.DOCUMENTS_DIR = original;
    } else {
      delete process.env.DOCUMENTS_DIR;
    }
  }
});
