import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { Tor, TorInsight } from '#models/index.js';
import { STARTER_TECHNOLOGIES } from '#pipeline/extraction/references/technologies.js';
import { buildVocabulary, matchTechnology } from '#pipeline/extraction/vocabulary.js';

// The demo seed must follow the current schema: when a model changes, this
// fails until the seed (and its generator) are brought up to date.
const read = (file) => JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../seed', file), 'utf8'));
const tors = read('tors.json');
const insights = read('torinsights.json');

test('every seed TOR passes the Tor model, with the current price names', () => {
  for (const tor of tors) {
    assert.equal(new Tor(tor).validateSync(), undefined, tor.projectId);
    assert.ok(!('medianPriceTHB' in tor), `${tor.projectId} still uses medianPriceTHB`);
  }
});

test('every seed insight passes the TorInsight model, and is marked demo', () => {
  for (const insight of insights) {
    assert.equal(new TorInsight(insight).validateSync(), undefined, insight.projectId);
    assert.equal(insight.metadata.origin, 'demo', `${insight.projectId} must be labelled demo`);
    // Made-up data never claims a review or a score it didn't get
    assert.equal(insight.metadata.reviewStatus, 'pending');
    assert.equal(insight.metadata.confidenceScore, null);
  }
});

test('every seed insight has a TOR, and uses technology names the vocabulary knows', () => {
  const projectIds = new Set(tors.map((tor) => tor.projectId));
  const vocabulary = buildVocabulary(STARTER_TECHNOLOGIES);
  for (const insight of insights) {
    assert.ok(projectIds.has(insight.projectId), `${insight.projectId} has no seed TOR`);
    for (const technology of insight.technicalRequirements.requiredTechnologies) {
      assert.ok(matchTechnology(technology, vocabulary).entry, `unknown technology "${technology.name}"`);
    }
  }
});
