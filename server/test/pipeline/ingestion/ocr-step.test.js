import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';

import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { Tor, TorInsight } from '#models/index.js';
import { runOcrStep } from '#pipeline/ingestion/ingest.js';

// A database of its own: the OCR step takes every waiting TOR, and the other
// test files leave theirs in mjolnir_test while this one runs
const TEST_DB = 'mjolnir_test_ocr_step';

const ID = {
  longScan: '55555100001', // previewed: 6 of 28 pages
  shortScan: '55555100002', // 4 pages: read whole on the preview pass
  digital: '55555100003', // digital text: always read whole
  pastWithWinner: '55555100004', // stored as Open, but it has a winner
  cancelled: '55555100005',
  itPreview: '55555100006', // classify said IT: read whole now
  notItPreview: '55555100007', // classify said not IT: left as it is
};

// What the fake OCR reads for each document, by whether it was limited
const READS = {
  [ID.longScan]: (limited) => ({ usedOcr: true, pages: 28, pagesRead: limited ? 6 : 28, truncated: limited }),
  [ID.shortScan]: () => ({ usedOcr: true, pages: 4, pagesRead: 4, truncated: false }),
  [ID.digital]: () => ({ usedOcr: false, pages: 40, pagesRead: 40, truncated: false }),
  [ID.itPreview]: (limited) => ({ usedOcr: true, pages: 30, pagesRead: limited ? 6 : 30, truncated: limited }),
};

let documentsDir;
const calls = [];

async function fakeOcr(pdfPath, options) {
  const id = path.basename(pdfPath).slice(0, 11);
  calls.push({ id, options });
  const limited = Boolean(options.maxPages);
  return { text: `ข้อความ ${id} ${limited ? 'บางหน้า' : 'ทั้งเล่ม'}`, confidence: 0.9, ...READS[id](limited) };
}

const tor = (projectId, fields) => ({
  projectId,
  source: 'process3',
  title: `ทดสอบ OCR ${projectId}`,
  status: 'Open',
  announcementHistory: [{ code: 'D0', type: 'invitation', publishedAt: new Date('2026-10-07') }],
  pipelineStatus: 'downloaded',
  document: { fileName: `${projectId}_TOR.pdf`, storagePath: path.join(documentsDir, `${projectId}_TOR.pdf`) },
  ...fields,
});

before(async () => {
  await connectDatabase({ dbName: TEST_DB });
  await mongoose.connection.dropDatabase();
  documentsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gipdp-ocr-step-'));
  for (const id of Object.values(ID)) await fs.writeFile(path.join(documentsDir, `${id}_TOR.pdf`), '%PDF-1.4');

  await Tor.insertMany([
    tor(ID.longScan),
    tor(ID.shortScan, { status: 'Draft' }),
    tor(ID.digital),
    tor(ID.pastWithWinner, { contract: { winnerName: 'บริษัท ผู้ชนะ จำกัด' } }),
    tor(ID.cancelled, { status: 'Cancelled' }),
    tor(ID.itPreview, { pipelineStatus: 'ocr_preview', ocr: { rawText: 'บางหน้า', preview: true, pagesRead: 6 } }),
    tor(ID.notItPreview, { pipelineStatus: 'ocr_preview', ocr: { rawText: 'บางหน้า', preview: true, pagesRead: 6 } }),
  ]);
  // What extraction decided about the two previews (the model's fields aren't needed here)
  await TorInsight.collection.insertMany([
    { projectId: ID.itPreview, metadata: { awaitingFullText: true } },
    { projectId: ID.notItPreview, metadata: { excluded: { reason: 'ซื้อเตียงผ่าตัด' } } },
  ]);

  await runOcrStep({ documentsDir, ocr: fakeOcr });
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDatabase();
  await fs.rm(documentsDir, { recursive: true, force: true });
});

const stored = (projectId) => Tor.findOne({ projectId }).lean();

test('OCR step: a long scan is read for its first 6 pages only, and kept as a preview', async () => {
  const doc = await stored(ID.longScan);
  assert.equal(doc.pipelineStatus, 'ocr_preview');
  assert.deepEqual([doc.ocr.preview, doc.ocr.pagesRead, doc.document.pages], [true, 6, 28]);
  assert.deepEqual(calls.find((call) => call.id === ID.longScan).options, { maxPages: 6 });
});

test('OCR step: a short scan or a digital PDF is read whole on the preview pass', async () => {
  for (const id of [ID.shortScan, ID.digital]) {
    const doc = await stored(id);
    assert.equal(doc.pipelineStatus, 'ocr_done', id);
    assert.equal(doc.ocr.preview, false, id);
  }
});

test('OCR step: a preview classify found IT is read whole; one found not IT is left alone', async () => {
  const it = await stored(ID.itPreview);
  assert.equal(it.pipelineStatus, 'ocr_done');
  assert.deepEqual([it.ocr.preview, it.ocr.pagesRead], [false, 30]);
  assert.match(it.ocr.rawText, /ทั้งเล่ม/);
  assert.deepEqual(calls.find((call) => call.id === ID.itPreview).options, {});

  const notIt = await stored(ID.notItPreview);
  assert.equal(notIt.pipelineStatus, 'ocr_preview');
  assert.ok(!calls.some((call) => call.id === ID.notItPreview));
});

test('OCR step: a TOR that is past (a winner, or cancelled) is never read', async () => {
  for (const id of [ID.pastWithWinner, ID.cancelled]) {
    assert.equal((await stored(id)).pipelineStatus, 'downloaded', id);
    assert.ok(!calls.some((call) => call.id === id), id);
  }
});
