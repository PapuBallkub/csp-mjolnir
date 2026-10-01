import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  GeminiResponseError,
  generateJson,
  isRetryable,
  readGeminiConfig,
} from '#pipeline/extraction/gemini.js';

// A stand-in for the SDK client: it plays back the given outcomes in order, so
// these tests never reach Google Cloud (R15).
function fakeClient(outcomes) {
  const calls = [];
  return {
    calls,
    models: {
      async generateContent(request) {
        calls.push(request);
        const next = outcomes[calls.length - 1];
        if (next instanceof Error) throw next;
        return next;
      },
    },
  };
}

const ok = (data) => ({
  text: JSON.stringify(data),
  candidates: [{ finishReason: 'STOP' }],
  usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
});

const apiError = (status) => Object.assign(new Error(`HTTP ${status}`), { status });

const request = (client, delays = []) =>
  generateJson({
    client,
    model: 'gemini-3.7-flash',
    contents: 'อ่าน TOR นี้',
    responseSchema: {},
    sleep: async (ms) => delays.push(ms),
  });

test('readGeminiConfig names every missing setting and defaults the region to global', () => {
  assert.throws(() => readGeminiConfig({}), /GOOGLE_CLOUD_PROJECT and GEMINI_MODEL/);
  assert.deepEqual(
    readGeminiConfig({ GOOGLE_CLOUD_PROJECT: 'p', GEMINI_MODEL: 'gemini-3.7-flash' }),
    { project: 'p', location: 'global', model: 'gemini-3.7-flash' },
  );
});

test('isRetryable waits out rate limits and server errors, nothing else', () => {
  for (const status of [429, 500, 503]) assert.equal(isRetryable(apiError(status)), true);
  for (const status of [400, 403, 404]) assert.equal(isRetryable(apiError(status)), false);
  assert.equal(isRetryable(new Error('no status')), false);
});

test('generateJson returns the parsed answer and asks for JSON at temperature 0', async () => {
  const client = fakeClient([ok({ isIT: true })]);
  const result = await request(client);

  assert.deepEqual(result.data, { isIT: true });
  assert.equal(result.usage.promptTokenCount, 10);
  assert.equal(client.calls[0].config.temperature, 0);
  assert.equal(client.calls[0].config.responseMimeType, 'application/json');
  // Our loop is the only retry policy; the SDK's own retries stay off
  assert.equal(client.calls[0].config.httpOptions.retryOptions.attempts, 1);
});

test('generateJson retries a rate limit with growing waits, then succeeds', async () => {
  const delays = [];
  const client = fakeClient([apiError(429), apiError(503), ok({ reply: 'OK' })]);

  assert.deepEqual((await request(client, delays)).data, { reply: 'OK' });
  assert.deepEqual(delays, [2000, 4000]);
});

test('generateJson gives up after four attempts', async () => {
  const delays = [];
  const client = fakeClient([apiError(429), apiError(429), apiError(429), apiError(429)]);

  await assert.rejects(request(client, delays), { status: 429 });
  assert.equal(client.calls.length, 4);
});

test('generateJson does not retry a request that will fail the same way again', async () => {
  const client = fakeClient([apiError(403)]);

  await assert.rejects(request(client), { status: 403 });
  assert.equal(client.calls.length, 1);
});

test('generateJson never returns an answer that was cut off', async () => {
  const cutOff = { ...ok({}), text: '{"facts": {"budget', candidates: [{ finishReason: 'MAX_TOKENS' }] };

  await assert.rejects(request(fakeClient([cutOff])), (error) => {
    assert.ok(error instanceof GeminiResponseError);
    assert.equal(error.finishReason, 'MAX_TOKENS');
    return true;
  });
});
