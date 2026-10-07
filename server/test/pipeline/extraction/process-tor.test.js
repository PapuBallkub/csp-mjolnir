import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { TorInsight } from '#models/index.js';
import { buildInsight } from '#pipeline/extraction/assemble.js';
import { classifyPreview, processTor, saveInsight } from '#pipeline/extraction/process-tor.js';
import { RUN, fixture } from './fixtures.js';

const CONFIG = { model: 'gemini-3.7-flash' };

// Plays back the classify answer, then the extract answer, and records requests
function fakeClient(...answers) {
  const calls = [];
  return {
    calls,
    models: {
      async generateContent(request) {
        calls.push(request);
        return {
          text: JSON.stringify(answers[calls.length - 1]),
          candidates: [{ finishReason: 'STOP' }],
          usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 10 },
        };
      },
    },
  };
}

// Stands in for the vocabulary, so these tests need no database
function fakeResolver() {
  const received = [];
  const resolve = async (items) => {
    received.push(...items);
    return { technologies: items.map(({ name, version }) => ({ name, version })), unknown: [] };
  };
  return { resolve, received };
}

test('a non-IT TOR stops after the classify call: extraction never runs (D8)', async () => {
  const { tor, classification } = fixture();
  const client = fakeClient({ ...classification, isIT: false, category: null, reason: 'ซื้อคอมพิวเตอร์อย่างเดียว' });

  const { insight } = await processTor(tor, { client, config: CONFIG, resolveTechnologies: fakeResolver().resolve });

  assert.equal(client.calls.length, 1);
  assert.equal(insight.metadata.excluded.reason, 'ซื้อคอมพิวเตอร์อย่างเดียว');
});

test('an IT TOR is classified, extracted, checked and assembled', async () => {
  const { tor, classification, extracted } = fixture();
  const client = fakeClient(classification, extracted);
  const vocabulary = fakeResolver();

  const { insight, review, usage } = await processTor(tor, { client, config: CONFIG, resolveTechnologies: vocabulary.resolve });

  assert.equal(client.calls.length, 2);
  // An invented technology is dropped before it ever reaches the vocabulary (R5)
  assert.deepEqual(vocabulary.received.map((t) => t.name), ['Postgres', 'Kubernetes']);
  assert.equal(insight.facts.budgetTHB, 12_500_000);
  assert.equal(insight.metadata.confidenceScore, 95, 'one minor failure: the dropped technology');
  assert.deepEqual(review.extracted, extracted, 'the review file keeps the model\'s own answers');
  assert.equal(usage.length, 2);
});

test('both calls think at LOW, and the extraction gets room for a long answer', async () => {
  const { tor, classification, extracted } = fixture();
  const client = fakeClient(classification, extracted);
  await processTor(tor, { client, config: CONFIG, resolveTechnologies: fakeResolver().resolve });

  for (const call of client.calls) assert.deepEqual(call.config.thinkingConfig, { thinkingLevel: 'LOW' });
  assert.equal(client.calls[1].config.maxOutputTokens, 32_768);
  assert.doesNotMatch(String(client.calls[1].contents), /12492771|ประกวดราคาจ้าง/, 'the feed stays out');
});

test('a TOR with no OCR text fails before any call is made', async () => {
  const { tor } = fixture();
  tor.ocr.rawText = '';
  const client = fakeClient();
  await assert.rejects(processTor(tor, { client, config: CONFIG }), /No OCR text/);
  assert.equal(client.calls.length, 0);
});

// saveInsight needs a database: skipped, not failed, when none is running
let isDbConnected = false;
const { tor: savedTor } = fixture();

before(async () => {
  try {
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000));
    await Promise.race([connectDatabase(), timeout]);
    isDbConnected = true;
    await TorInsight.deleteOne({ projectId: savedTor.projectId });
  } catch {
    // no local MongoDB
  }
});

after(async () => {
  if (!isDbConnected) return;
  await TorInsight.deleteOne({ projectId: savedTor.projectId });
  await disconnectDatabase();
});

test('saveInsight replaces extraction\'s fields in place, and leaves analytics alone', async (t) => {
  if (!isDbConnected) return t.skip('MongoDB is not reachable');

  const input = fixture();
  const build = (budget) =>
    buildInsight({
      ...input,
      tor: { ...input.tor, budgetTHB: budget },
      technologies: [],
      certifications: [],
      authorizations: [],
      checkResult: { checks: [], score: 100 },
      run: RUN,
    });

  await saveInsight(build(12_500_000));
  const first = await TorInsight.findOne({ projectId: savedTor.projectId }).lean();
  // Price analysis writes here later; re-extracting must not wipe it
  await TorInsight.updateOne({ projectId: savedTor.projectId }, { $set: { 'analytics.lockSpec.riskScore': 42 } });

  await saveInsight(build(13_000_000));
  const all = await TorInsight.find({ projectId: savedTor.projectId }).lean();

  assert.equal(all.length, 1, 'one record per TOR');
  assert.equal(String(all[0]._id), String(first._id));
  assert.equal(all[0].facts.budgetTHB, 13_000_000);
  assert.equal(all[0].analytics.lockSpec.riskScore, 42);
  assert.equal(all[0].evidence.budgetTHB, undefined, 'stale evidence went with the old value');
});

// A scan read for its first pages only (ADR 0018)
const previewOf = (tor) => ({ ...tor, ocr: { ...tor.ocr, preview: true, pagesRead: 6 } });

test('classifyPreview: an IT preview waits for its full text, hidden, with nothing extracted', async () => {
  const { tor, classification } = fixture();
  const client = fakeClient(classification);

  const { insight, review } = await classifyPreview(previewOf(tor), { client, config: CONFIG });

  assert.equal(client.calls.length, 1, 'only the classify call');
  assert.equal(insight.metadata.awaitingFullText, true);
  assert.equal(insight.metadata.excluded, undefined);
  assert.equal(insight.identification.category, 'software-development');
  assert.equal(review.preview, true);
  await new TorInsight(insight).validate(); // fits the model
});

test('classifyPreview: a non-IT preview is excluded, and its TOR stops there', async () => {
  const { tor, classification } = fixture();
  const client = fakeClient({ ...classification, isIT: false, category: null, reason: 'ซื้อเตียงผ่าตัด' });

  const { insight } = await classifyPreview(previewOf(tor), { client, config: CONFIG });

  assert.equal(insight.metadata.excluded.reason, 'ซื้อเตียงผ่าตัด');
  assert.ok(!insight.metadata.awaitingFullText);
});

test('a preview is never extracted, and a full text is never only classified', async () => {
  const { tor, classification, extracted } = fixture();

  const client = fakeClient(classification, extracted);
  await assert.rejects(processTor(previewOf(tor), { client, config: CONFIG }), /Only a preview has been read/);
  assert.equal(client.calls.length, 0, 'refused before any call');

  await assert.rejects(classifyPreview(tor, { client, config: CONFIG }), /has its full text/);
});
