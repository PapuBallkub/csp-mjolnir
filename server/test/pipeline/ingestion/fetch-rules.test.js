import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fetchStageFields, hasAnnouncement, isPastFetch } from '#pipeline/ingestion/lib/fetch-rules.js';

const document = { fileName: '1_TOR.pdf', storagePath: null, contentHash: null, version: 1 };

test('isPastFetch: only a TOR that download has handled', () => {
  assert.equal(isPastFetch(null), false);
  assert.equal(isPastFetch({ pipelineStatus: 'fetched' }), false);
  assert.equal(isPastFetch({ pipelineStatus: 'downloaded' }), true);
  assert.equal(isPastFetch({ pipelineStatus: 'ocr_done' }), true);
});

test('fetchStageFields: a new or fetched TOR gets its document and stage', () => {
  assert.deepEqual(fetchStageFields(null, { document, isDownloaded: false }), {
    document,
    pipelineStatus: 'fetched',
  });
  assert.deepEqual(fetchStageFields({ pipelineStatus: 'fetched' }, { document, isDownloaded: true }), {
    document,
    pipelineStatus: 'downloaded',
  });
});

test('fetchStageFields: a TOR past fetch is never sent back, nor its document rewritten', () => {
  assert.deepEqual(fetchStageFields({ pipelineStatus: 'ocr_done' }, { document, isDownloaded: false }), {});
  assert.deepEqual(fetchStageFields({ pipelineStatus: 'downloaded' }, { document, isDownloaded: true }), {});
});

test('hasAnnouncement: the same RSS item seen again is already there', () => {
  const history = [
    {
      code: 'D0',
      publishedAt: new Date('2026-10-03T08:00:00.000Z'),
      sourceUrl: 'https://process3.gprocurement.go.th/egp?project_id=1',
    },
  ];
  const seenAgain = {
    code: 'D0',
    publishedAt: new Date('2026-10-03T08:00:00.000Z'),
    sourceUrl: 'https://process3.gprocurement.go.th/egp?project_id=1',
  };
  assert.equal(hasAnnouncement(history, seenAgain), true);
});

test('hasAnnouncement: a second amendment, published later, is new', () => {
  const history = [{ code: 'D1', publishedAt: new Date('2026-10-05T08:00:00Z'), sourceUrl: 'u' }];
  assert.equal(hasAnnouncement(history, { code: 'D1', publishedAt: new Date('2026-10-09T08:00:00Z'), sourceUrl: 'u' }), false);
  assert.equal(hasAnnouncement(history, { code: 'D2', publishedAt: new Date('2026-10-05T08:00:00Z'), sourceUrl: 'u' }), false);
});

test('hasAnnouncement: items without a publish time match on code and link', () => {
  const history = [{ code: 'B0', publishedAt: null, sourceUrl: 'u' }];
  assert.equal(hasAnnouncement(history, { code: 'B0', publishedAt: null, sourceUrl: 'u' }), true);
  assert.equal(hasAnnouncement(history, { code: 'B0', publishedAt: null, sourceUrl: 'other' }), false);
  assert.equal(hasAnnouncement(undefined, { code: 'B0', publishedAt: null, sourceUrl: 'u' }), false);
});
