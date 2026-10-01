import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Type } from '@google/genai';

import { STANDARD_CONDITION_KEYS } from '#models/standard-conditions.js';
import { PROJECT_CATEGORIES, classifySchema, extractSchema } from '#pipeline/extraction/schema.js';

// Visits every object schema in the tree, with a readable path for messages.
function* objects(schema, at = '$') {
  if (schema.type === Type.OBJECT) {
    yield [at, schema];
    for (const [name, child] of Object.entries(schema.properties ?? {})) {
      yield* objects(child, `${at}.${name}`);
    }
  }
  if (schema.type === Type.ARRAY) yield* objects(schema.items, `${at}[]`);
}

for (const [name, schema] of Object.entries({ classifySchema, extractSchema })) {
  test(`${name}: every field is required, so Gemini says null rather than leaving it out`, () => {
    for (const [at, object] of objects(schema)) {
      const properties = Object.keys(object.properties ?? {});
      assert.deepEqual(
        [...(object.required ?? [])].sort(),
        [...properties].sort(),
        `${at} must require exactly its own properties`,
      );
    }
  });

  test(`${name}: a quote is always written before the value it supports`, () => {
    for (const [at, object] of objects(schema)) {
      if (!object.properties?.quote) continue;
      const order = object.propertyOrdering ?? [];
      assert.equal(order[0], 'quote', `${at} must write its quote first`);
    }
  });
}

test('classifySchema: the category is one of the fixed project kinds, and null for non-IT', () => {
  const { category, isIT } = classifySchema.properties;
  assert.equal(isIT.type, Type.BOOLEAN);
  assert.deepEqual(category.enum, PROJECT_CATEGORIES);
  assert.equal(category.nullable, true);
});

test('extractSchema: offers exactly the standard condition keys the model stores', () => {
  const { standardConditions } = extractSchema.properties.eligibility.properties;
  assert.deepEqual(standardConditions.items.enum, STANDARD_CONDITION_KEYS);
});

test('extractSchema: money is copied as written, for code to parse', () => {
  // parseThaiAmount reads it, so a misread digit becomes null, not a wrong price
  for (const field of ['budget', 'referencePrice']) {
    assert.equal(extractSchema.properties.facts.properties[field].properties.value.type, Type.STRING);
  }
});
