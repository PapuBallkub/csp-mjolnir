import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';

import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { findComparableProjects } from '#features/reality-check/index.js';
import { Tor, TorInsight, TorInsightVersion } from '#models/index.js';
import { saveInsight } from '#pipeline/extraction/process-tor.js';
import { keepVersion, rollbackTor } from '#pipeline/shared/insight-versions.js';
import { migrateCategories } from '../scripts/migrate-categories.js';

const TEST_DB = 'mjolnir_test_migrate_categories';
const UPDATED = new Date('2026-10-01T00:00:00Z');

/** A record as the old shape stored it: written directly, past the model. */
const oldRecord = (projectId, category, extra = {}) => ({
  projectId,
  identification: { titleTh: 'โครงการ', agency: 'หน่วยงาน', status: 'Awarded', ...(category === undefined ? {} : { category }) },
  facts: { referencePriceTHB: 1_000_000 },
  metadata: { excluded: null, confidenceScore: 90 },
  updatedAt: UPDATED,
  ...extra,
});

/** A kept version as the old shape stored it. */
const oldVersion = (projectId, version, category, extra = {}) => ({
  projectId,
  version,
  supersededAt: UPDATED,
  reason: 'prompt-update',
  insight: { ...oldRecord(projectId, category), metadata: { excluded: null, version } },
  ocrText: null,
  ocrTextHash: null,
  ...extra,
});

/** A full summary, as extraction saves one now. */
const summary = (projectId, categories) => ({
  projectId,
  identification: { titleTh: 'โครงการ', agency: 'หน่วยงาน', categories, status: 'Open' },
  facts: { referencePriceTHB: 1_000_000 },
  metadata: { modelName: 'gemini-test', promptVersion: 'extract-v6', sourceFingerprint: 'f1', excluded: null },
});

const stored = (projectId) => TorInsight.collection.findOne({ projectId });
const kept = (projectId, version) => TorInsightVersion.collection.findOne({ projectId, version });
const oldVersionsLeft = () => TorInsightVersion.collection.countDocuments({ 'insight.identification.category': { $exists: true } });
const emptyCounts = { kept: 0, restored: 0, emptied: 0, kinds: 0 };

before(async () => {
  await connectDatabase({ dbName: TEST_DB });
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
  await TorInsight.createIndexes();
  await TorInsight.collection.createIndex({ 'identification.category': 1 });
  await TorInsight.collection.createIndex({ 'identification.category': 1, 'facts.referencePriceTHB': 1 });
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDatabase();
});

test('each old category becomes a list: real ones kept, others restored from a version or emptied', async () => {
  await TorInsight.collection.insertMany([
    oldRecord('real', 'data-and-ai'),
    oldRecord('reclassified', 'non-IT'),
    oldRecord('approved', 'IT / software'),
    oldRecord('nothing-kept', 'non-IT'),
    oldRecord('unknown', null),
    oldRecord('missing', undefined),
  ]);
  await TorInsightVersion.collection.insertMany([
    { projectId: 'reclassified', version: 1, insight: { identification: { category: 'software-licenses' } } },
    { projectId: 'reclassified', version: 2, insight: { identification: { category: 'network-and-security' } } },
    { projectId: 'reclassified', version: 3, insight: { identification: { category: 'non-IT' } } },
    { projectId: 'approved', version: 1, insight: { identification: { category: 'other-it' } } },
  ]);

  const counts = await migrateCategories();

  const categoriesOf = async (projectId) => (await stored(projectId)).identification.categories;
  assert.deepEqual(await categoriesOf('real'), ['data-and-ai']);
  assert.deepEqual(await categoriesOf('reclassified'), ['network-and-security'], 'the latest real one');
  assert.deepEqual(await categoriesOf('approved'), ['other-it']);
  assert.deepEqual(await categoriesOf('nothing-kept'), []);
  assert.deepEqual(await categoriesOf('unknown'), []);
  assert.deepEqual(await categoriesOf('missing'), []);
  assert.equal((await stored('real')).identification.category, undefined);
  assert.equal((await stored('reclassified')).identification.category, undefined);

  assert.equal(counts.insights.kept, 1);
  assert.equal(counts.insights.restored, 2);
  assert.equal(counts.insights.emptied, 3);
  assert.equal((await stored('real')).updatedAt.getTime(), UPDATED.getTime(), 'the summary itself did not change');
});

test('the contract kind is copied from the Tor; a TOR with none, or no Tor, says null', async () => {
  await Tor.collection.insertMany([
    { projectId: 'hired', procurementKind: 'hire' },
    { projectId: 'bought', procurementKind: null },
  ]);
  await TorInsight.collection.insertMany([
    oldRecord('hired', 'data-and-ai'),
    oldRecord('bought', 'data-and-ai'),
    oldRecord('alone', 'data-and-ai'),
  ]);

  const counts = await migrateCategories();

  assert.equal((await stored('hired')).facts.procurementKind, 'hire');
  assert.equal((await stored('bought')).facts.procurementKind, null);
  assert.equal((await stored('alone')).facts.procurementKind, null);
  assert.equal(counts.insights.kinds, 3);
});

test('the old indexes go and the new ones stay', async () => {
  const counts = await migrateCategories();
  assert.equal(counts.indexes, 2);

  const names = (await TorInsight.collection.indexes()).map((index) => index.name);
  assert.ok(!names.some((name) => name.startsWith('identification.category_')));
  assert.ok(names.includes('identification.categories_1'));
  assert.ok(names.includes('identification.categories_1_facts.referencePriceTHB_1'));
});

test('a dry run counts and changes nothing', async () => {
  await TorInsight.collection.insertOne(oldRecord('real', 'data-and-ai'));
  await TorInsightVersion.collection.insertOne(oldVersion('real', 1, 'data-and-ai'));

  const counts = await migrateCategories({ dryRun: true });

  assert.deepEqual(counts, {
    insights: { ...emptyCounts, kept: 1, kinds: 1 },
    versions: { ...emptyCounts, kept: 1, kinds: 1 },
    indexes: 2,
  });
  assert.equal((await stored('real')).identification.category, 'data-and-ai');
  assert.equal((await stored('real')).identification.categories, undefined);
  assert.equal((await kept('real', 1)).insight.identification.category, 'data-and-ai');
  assert.equal((await kept('real', 1)).insight.identification.categories, undefined);
  assert.ok((await TorInsight.collection.indexes()).some((index) => index.name === 'identification.category_1'));
});

test('running it again changes nothing, and leaves a record already in the new shape alone', async () => {
  await TorInsight.collection.insertMany([
    oldRecord('old', 'data-and-ai'),
    { ...oldRecord('new', undefined), identification: { categories: ['other-it', 'data-and-ai'] }, facts: { procurementKind: 'buy' } },
  ]);
  await TorInsightVersion.collection.insertOne(oldVersion('old', 1, 'data-and-ai'));

  await migrateCategories();
  assert.deepEqual((await stored('new')).identification.categories, ['other-it', 'data-and-ai']);
  assert.equal((await stored('new')).facts.procurementKind, 'buy');

  assert.deepEqual(await migrateCategories(), { insights: emptyCounts, versions: emptyCounts, indexes: 0 });
  assert.deepEqual((await stored('old')).identification.categories, ['data-and-ai']);
  assert.deepEqual((await kept('old', 1)).insight.identification.categories, ['data-and-ai']);
});

test('kept versions become lists by the same rule, and nothing else in them changes', async () => {
  await Tor.collection.insertOne({ projectId: 'tor', procurementKind: 'hire' });
  await TorInsight.collection.insertOne(oldRecord('tor', 'data-and-ai'));
  await TorInsightVersion.collection.insertMany([
    oldVersion('tor', 1, 'IT / software'), // nothing before it to take from
    oldVersion('tor', 2, 'software-licenses', { ocrText: 'ข้อความ TOR', ocrTextHash: 'hash-a' }),
    oldVersion('tor', 3, 'IT / software'),
    oldVersion('tor', 4, null),
    oldVersion('tor', 5, 'data-and-ai'),
  ]);
  const before = await kept('tor', 2);

  const counts = await migrateCategories();

  const lists = await Promise.all([1, 2, 3, 4, 5].map(async (version) => (await kept('tor', version)).insight.identification.categories));
  assert.deepEqual(lists, [[], ['software-licenses'], ['software-licenses'], [], ['data-and-ai']]);
  assert.deepEqual(counts.versions, { kept: 2, restored: 1, emptied: 2, kinds: 5 });
  assert.equal(await oldVersionsLeft(), 0);

  const after = await kept('tor', 2);
  assert.equal(after.insight.facts.procurementKind, 'hire');
  delete before.insight.identification.category;
  before.insight.identification.categories = ['software-licenses'];
  before.insight.facts.procurementKind = 'hire';
  assert.deepEqual(after, before);
});

test('a kept version is read in either shape, so a run that stopped part-way can finish', async () => {
  await TorInsightVersion.collection.insertMany([
    { ...oldVersion('tor', 1, undefined), insight: { identification: { categories: ['network-and-security'] }, facts: { procurementKind: null } } },
    oldVersion('tor', 2, 'IT / software'),
  ]);
  await TorInsight.collection.insertOne(oldRecord('tor', 'non-IT'));

  await migrateCategories();

  assert.deepEqual((await kept('tor', 2)).insight.identification.categories, ['network-and-security']);
  assert.deepEqual((await stored('tor')).identification.categories, ['network-and-security']);
});

test('an admin edit made before the migration survives it, in the summary and in the version it kept', async () => {
  await TorInsight.collection.insertOne(oldRecord('edited', 'data-and-ai'));

  // The review queue's steps, on a record not migrated yet
  const insight = await TorInsight.findOne({ projectId: 'edited' });
  const before = insight.toObject({ flattenMaps: true });
  await keepVersion('edited', { reason: 'corrected', current: before, tor: null });
  insight.identification.categories = ['other-it', 'data-and-ai'];
  insight.metadata.version = 2;
  await insight.save();

  await migrateCategories();

  const now = await stored('edited');
  assert.deepEqual(now.identification.categories, ['other-it', 'data-and-ai']);
  assert.equal(now.identification.category, undefined);
  assert.deepEqual((await kept('edited', 1)).insight.identification.categories, ['data-and-ai']);
  assert.equal(await oldVersionsLeft(), 0);
});

test('after the migration, a replaced summary moves to the versions as a list, in its order', async () => {
  await TorInsight.collection.insertOne(oldRecord('tor', 'data-and-ai'));
  await migrateCategories();

  await saveInsight(summary('tor', ['software-development', 'data-and-ai']), { reason: 'forced' });
  await saveInsight(summary('tor', ['other-it']), { reason: 'forced' });

  assert.deepEqual((await kept('tor', 1)).insight.identification.categories, ['data-and-ai']);
  assert.deepEqual((await kept('tor', 2)).insight.identification.categories, ['software-development', 'data-and-ai']);
  assert.deepEqual((await stored('tor')).identification.categories, ['other-it']);
  assert.equal(await oldVersionsLeft(), 0);
});

test('a summary replaced before the migration ran is caught by it', async () => {
  await TorInsight.collection.insertOne(oldRecord('tor', 'data-and-ai'));

  await saveInsight(summary('tor', ['software-development', 'data-and-ai']), { reason: 'forced' });
  assert.equal(await oldVersionsLeft(), 1, 'it moved in the old shape');

  await migrateCategories();

  assert.deepEqual((await kept('tor', 1)).insight.identification.categories, ['data-and-ai']);
  assert.deepEqual((await stored('tor')).identification.categories, ['software-development', 'data-and-ai']);
  assert.equal(await oldVersionsLeft(), 0);
});

test('a version from before the change rolls back whole', async () => {
  await Tor.create({ projectId: 'tor', source: 'process3', title: 'โครงการ', agency: 'หน่วยงาน', status: 'Open', procurementKind: 'hire' });
  await TorInsight.collection.insertOne({ ...oldRecord('tor', 'other-it'), metadata: { excluded: null, version: 2 } });
  await TorInsightVersion.collection.insertOne(oldVersion('tor', 1, 'data-and-ai'));
  await migrateCategories();

  await rollbackTor('tor', { to: 1 });

  const restored = await stored('tor');
  assert.deepEqual(restored.identification.categories, ['data-and-ai']);
  assert.equal(restored.identification.category, undefined);
  assert.equal(restored.facts.procurementKind, 'hire');
  assert.deepEqual((await kept('tor', 2)).insight.identification.categories, ['other-it'], 'what it replaced is kept');
});

test('a migrated past project is found by the comparison in the database', async () => {
  await TorInsight.collection.insertMany([oldRecord('past', 'data-and-ai'), oldRecord('other', 'network-and-security')]);
  await migrateCategories();

  const results = await findComparableProjects({
    projectId: 'target',
    identification: { categories: ['software-development', 'data-and-ai'] },
    facts: { referencePriceTHB: 1_000_000 },
  });

  assert.deepEqual(results.map((result) => result.projectId), ['past']);
});
