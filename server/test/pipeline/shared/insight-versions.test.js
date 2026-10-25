import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';

import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { Tor, TorInsight, TorInsightVersion } from '#models/index.js';
import { saveInsight } from '#pipeline/extraction/process-tor.js';
import { decide, fingerprintFor } from '#pipeline/extraction/select.js';
import { keepVersion, listVersions, rollbackTor } from '#pipeline/shared/insight-versions.js';

const TEST_DB = 'mjolnir_test_insight_versions';
const ID = '69300000001';

/** A full summary, as extraction would save it: what it says, and what it was built from. */
const summary = ({ price, fingerprint = 'f1', prompt = 'extract-v5', model = 'gemini-test' }) => ({
  projectId: ID,
  identification: { titleTh: 'จ้างพัฒนาระบบแจ้งเตือน', agency: 'กรมตัวอย่าง', category: 'software-development', status: 'Open' },
  facts: { referencePriceTHB: price },
  metadata: { modelName: model, promptVersion: prompt, sourceFingerprint: fingerprint, excluded: null },
});

const versions = () => TorInsightVersion.find({ projectId: ID }).sort({ version: 1 }).lean();
const current = () => TorInsight.findOne({ projectId: ID }).lean();

before(async () => {
  await connectDatabase({ dbName: TEST_DB });
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
  await TorInsightVersion.syncIndexes();
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDatabase();
});

test('saveInsight keeps each summary it replaces, says why, and numbers the new one', async () => {
  await saveInsight(summary({ price: 1_000_000 }));
  assert.equal((await current()).metadata.version, 1);
  assert.equal((await versions()).length, 0, 'nothing replaced yet');

  await saveInsight(summary({ price: 1_200_000, fingerprint: 'f2' })); // a new TOR file
  await saveInsight(summary({ price: 1_250_000, fingerprint: 'f2', prompt: 'extract-v6' })); // a newer prompt
  await saveInsight(summary({ price: 1_250_000, fingerprint: 'f2', prompt: 'extract-v6' })); // --force
  await saveInsight(summary({ price: 1_260_000, fingerprint: 'f2', prompt: 'extract-v6' }), { reason: 'rebuilt' });

  assert.deepEqual(
    (await versions()).map((v) => [v.version, v.reason, v.insight.facts.referencePriceTHB]),
    [
      [1, 'source-changed', 1_000_000],
      [2, 'prompt-update', 1_200_000],
      [3, 'forced', 1_250_000],
      [4, 'rebuilt', 1_250_000],
    ],
  );
  const now = await current();
  assert.equal(now.metadata.version, 5);
  assert.equal(now.facts.referencePriceTHB, 1_260_000, 'the summary itself is written as before');
});

test('a title-level record, or a preview waiting for its full text, is replaced with nothing kept', async () => {
  await TorInsight.collection.insertOne({ ...summary({ price: 900_000 }), metadata: { titleOnly: true } });
  await saveInsight(summary({ price: 1_000_000 }));
  assert.equal((await versions()).length, 0);
  assert.equal((await current()).metadata.version, 1);

  await TorInsight.deleteMany({});
  await TorInsight.collection.insertOne({ ...summary({ price: 900_000 }), metadata: { awaitingFullText: true } });
  await saveInsight(summary({ price: 1_000_000 }));
  assert.equal((await versions()).length, 0);
});

test('keepVersion keeps a summary once, and each OCR text once, by the version it is about to be lost from', async () => {
  const tor = { projectId: ID, ocr: { rawText: 'ข้อความ TOR ฉบับแรก' } };
  await TorInsight.create(summary({ price: 1_000_000 }));

  const first = await keepVersion(ID, { reason: 'source-changed', tor });
  assert.equal(first.ocrText, 'ข้อความ TOR ฉบับแรก');
  assert.equal(await keepVersion(ID, { reason: 'source-changed', tor }), null, 'kept already');

  // A later summary from the same text: only the hash is kept
  await TorInsight.updateOne({ projectId: ID }, { $set: { 'metadata.version': 2 } });
  const second = await keepVersion(ID, { reason: 'prompt-update', tor });
  assert.equal(second.ocrText, null);
  assert.equal(second.ocrTextHash, first.ocrTextHash);
});

test('rollback brings back the summary, the file and the text it was built from, and extraction leaves it', async () => {
  const tor = await Tor.create({
    projectId: ID,
    source: 'process3',
    title: 'จ้างพัฒนาระบบแจ้งเตือน',
    agency: 'กรมตัวอย่าง',
    status: 'Open',
    referencePriceTHB: 1_000_000,
    pipelineStatus: 'ocr_done',
    document: { fileName: 'tor-v1.pdf', contentHash: 'hash-a', version: 1 },
    ocr: { rawText: 'ข้อความ TOR ฉบับแรก', usedOcr: false },
  });
  const first = summary({ price: 1_000_000 });
  first.metadata.sourceFingerprint = fingerprintFor(tor.toObject(), first.metadata);
  await saveInsight(first);

  // A new package changes the TOR (download keeps the summary first), and it's read and extracted
  await keepVersion(ID, { reason: 'source-changed', tor });
  Object.assign(tor, {
    referencePriceTHB: 9_000_000,
    document: { fileName: 'tor-v2.pdf', contentHash: 'hash-b', version: 2 },
    ocr: { rawText: 'ข้อความ TOR ฉบับที่ผิด', usedOcr: false },
  });
  await tor.save();
  const second = summary({ price: 9_000_000 });
  second.metadata.sourceFingerprint = fingerprintFor(tor.toObject(), second.metadata);
  await saveInsight(second);

  // A dry run changes nothing; a version that isn't there is refused
  assert.deepEqual(
    { ...(await rollbackTor(ID, { to: 1, dryRun: true })) },
    { projectId: ID, from: 2, to: 1, restoredTor: true, restoredText: true, dryRun: true },
  );
  assert.equal((await current()).metadata.version, 2);
  await assert.rejects(rollbackTor(ID, { to: 7 }), (error) => error.status === 404);

  const result = await rollbackTor(ID, { to: 1 });
  assert.equal(result.version, 3);
  assert.equal(result.madeCurrent, false);

  const insight = await current();
  assert.equal(insight.facts.referencePriceTHB, 1_000_000);
  assert.equal(insight.metadata.version, 3);
  const restoredTor = await Tor.findOne({ projectId: ID }).lean();
  assert.deepEqual(
    [restoredTor.document.contentHash, restoredTor.ocr.rawText, restoredTor.referencePriceTHB],
    ['hash-a', 'ข้อความ TOR ฉบับแรก', 1_000_000],
  );

  // Its source matches again: the next extraction skips it as up to date
  const decision = decide({
    insight,
    fingerprint: fingerprintFor(restoredTor, insight.metadata),
    promptVersion: insight.metadata.promptVersion,
    model: insight.metadata.modelName,
  });
  assert.deepEqual([decision.action, decision.reason], ['skip', 'current']);

  // And the rollback can itself be rolled back
  const { current: now, versions: listed } = await listVersions(ID);
  assert.equal(now, 3);
  assert.deepEqual(listed.map((v) => [v.version, v.reason, v.keptText]), [[2, 'rollback', false], [1, 'source-changed', true]]);
});

const withTechnologies = (insight, names) => ({
  ...insight,
  technicalRequirements: { requiredTechnologies: names.map((name) => ({ name, version: null })) },
});

test("a summary made again because its TOR changed completes that change's record; a prompt update adds nothing (ADR 0032)", async () => {
  const found = new Date('2026-10-25T22:05:00+07:00');
  await Tor.collection.insertOne({
    projectId: ID,
    amendments: [
      { source: 'package', detectedAt: found, insightVersion: 1, diff: 'facts', changes: [{ kind: 'changed', field: 'document', before: 'a.zip', after: 'b.zip' }] },
    ],
  });
  await saveInsight(withTechnologies(summary({ price: 1_000_000 }), ['PostgreSQL']));

  await saveInsight(withTechnologies(summary({ price: 1_000_000, fingerprint: 'f2' }), ['PostgreSQL', 'NGINX Plus']));
  let [change] = (await Tor.findOne({ projectId: ID }).lean()).amendments;
  assert.equal(change.diff, 'complete');
  assert.deepEqual(change.changes.map((row) => [row.field, row.after]), [
    ['document', 'b.zip'],
    ['technicalRequirements.requiredTechnologies', 'NGINX Plus'],
  ]);

  // A newer prompt on version 2 isn't the agency's change: an open record of version 2 stays as it is
  await Tor.updateOne({ projectId: ID }, { $push: { amendments: { source: 'package', detectedAt: new Date(), insightVersion: 2, diff: 'facts', changes: [] } } });
  await saveInsight(withTechnologies(summary({ price: 1_000_000, fingerprint: 'f2', prompt: 'extract-v6' }), ['PostgreSQL', 'NGINX Plus', 'Redis']));
  [, change] = (await Tor.findOne({ projectId: ID }).lean()).amendments;
  assert.deepEqual([change.diff, change.changes.length], ['facts', 0]);
});

test('a rollback undoes the changes that replaced the version it brings back, and only those', async () => {
  const first = new Date('2026-10-20T22:05:00+07:00');
  const second = new Date('2026-10-24T22:05:00+07:00');
  await Tor.create({
    projectId: ID,
    source: 'process3',
    title: 'จ้างพัฒนาระบบแจ้งเตือน',
    status: 'Open',
    lastChangeAt: second,
    amendments: [
      { source: 'package', detectedAt: first, insightVersion: 1, diff: 'complete' },
      { source: 'package', detectedAt: second, insightVersion: 2, diff: 'complete' },
    ],
  });
  await saveInsight(summary({ price: 1_000_000 }));
  await saveInsight(summary({ price: 1_100_000, fingerprint: 'f2' }));
  await saveInsight(summary({ price: 9_000_000, fingerprint: 'f3' })); // the second change, processed wrongly

  const result = await rollbackTor(ID, { to: 2 });

  const tor = await Tor.findOne({ projectId: ID }).lean();
  assert.equal(result.changesUndone, 1);
  assert.deepEqual(tor.amendments.map((entry) => entry.rolledBack), [false, true]);
  assert.equal(tor.lastChangeAt.toISOString(), first.toISOString(), 'the latest change still standing');
  assert.equal((await current()).facts.referencePriceTHB, 1_100_000);
});
