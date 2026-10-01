import assert from 'node:assert/strict';
import { test } from 'node:test';

import { STARTER_TECHNOLOGIES } from '#pipeline/extraction/references/technologies.js';
import {
  buildVocabulary,
  matchTechnology,
  splitTrailingVersion,
  technologyKey,
} from '#pipeline/extraction/vocabulary.js';

const vocabulary = buildVocabulary(STARTER_TECHNOLOGIES);
const match = (name, version = null) => {
  const { name: canonical, version: v, entry } = matchTechnology({ name, version }, vocabulary);
  return { name: canonical, version: v, known: Boolean(entry) };
};

test('technologyKey ignores case, extra spaces and trademark signs', () => {
  assert.equal(technologyKey('  Microsoft®  SQL   Server '), 'microsoft sql server');
});

test('every way of writing a known technology lands on one name', () => {
  for (const written of ['PostgreSQL', 'postgres', 'PgSQL', 'Postgre SQL']) {
    assert.deepEqual(match(written), { name: 'PostgreSQL', version: null, known: true }, written);
  }
  assert.equal(match('MS SQL').name, 'Microsoft SQL Server');
  assert.equal(match('K8s').name, 'Kubernetes');
});

test('a version stuck on the end of a known name is split off', () => {
  assert.deepEqual(match('Windows Server 2019'), { name: 'Windows Server', version: '2019', known: true });
  assert.deepEqual(match('Oracle 19c'), { name: 'Oracle Database', version: '19c', known: true });
  // A version the model already gave separately is kept as given
  assert.deepEqual(match('Windows Server', '2022'), { name: 'Windows Server', version: '2022', known: true });
});

test('an unknown name is kept whole, never cut at a number', () => {
  assert.deepEqual(match('Acme Records 365'), { name: 'Acme Records 365', version: null, known: false });
  assert.equal(splitTrailingVersion('Acme Records 365').version, '365', 'the split itself works');
  // "Office 365" is safe because it is a known alias, matched before any split
  assert.equal(match('Office 365').name, 'Microsoft 365');
});

test('the starter list never gives one key to two technologies', () => {
  const seen = new Map();
  for (const { name, aliases } of STARTER_TECHNOLOGIES) {
    for (const key of [technologyKey(name), ...aliases.map(technologyKey)]) {
      assert.ok(!seen.has(key) || seen.get(key) === name, `"${key}" belongs to both ${seen.get(key)} and ${name}`);
      seen.set(key, name);
    }
  }
});
