// The Google ID token checks and the key cache, with no network and no
// database. Every token here is signed with a key pair made for this run, and
// the key lookup or the fetch is handed in, so nothing calls Google.

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { describe, test } from 'node:test';

import jwt from 'jsonwebtoken';

import {
  createGoogleKeyStore,
  GOOGLE_CERTS_URL,
  verifyGoogleIdToken,
} from '../src/features/auth/google-id-token.js';

const CLIENT_ID = 'test-client.apps.googleusercontent.com';
const NONCE = crypto.randomBytes(32).toString('base64url');
const NOW = Date.UTC(2026, 10, 22, 12, 0, 0);
const NOW_SECONDS = Math.floor(NOW / 1000);
const KID = 'test-key-1';

const google = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const stranger = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });

const getKey = async (kid) => (kid === KID ? google.publicKey : null);

function claims(overrides = {}) {
  return {
    iss: 'https://accounts.google.com',
    aud: CLIENT_ID,
    sub: '110169484474386276334',
    email: 'somchai@example.test',
    email_verified: true,
    nonce: NONCE,
    iat: NOW_SECONDS - 10,
    exp: NOW_SECONDS + 3600,
    ...overrides,
  };
}

function without(...names) {
  const payload = claims();
  for (const name of names) delete payload[name];
  return payload;
}

function sign(payload, { key = google.privateKey, kid = KID } = {}) {
  return jwt.sign(payload, key, { algorithm: 'RS256', ...(kid ? { keyid: kid } : {}) });
}

// For tokens jsonwebtoken won't make: `alg: none`, and HS256 keyed with the
// public key, which is what an attacker would try.
const segment = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
function handMade(header, payload, secret) {
  const input = `${segment(header)}.${segment(payload)}`;
  const signature = secret ? crypto.createHmac('sha256', secret).update(input).digest('base64url') : '';
  return `${input}.${signature}`;
}

const verify = (token, options = {}) =>
  verifyGoogleIdToken(token, { clientId: CLIENT_ID, nonce: NONCE, getKey, now: NOW, ...options });

async function rejectsWith(token, reason, options) {
  await assert.rejects(verify(token, options), (error) => {
    assert.equal(error.status, 400);
    assert.equal(error.reason, reason);
    return true;
  });
}

describe('verifyGoogleIdToken', () => {
  test('a token Google signed for us, for this sign-in, gives its claims', async () => {
    const verified = await verify(sign(claims()));

    assert.equal(verified.sub, '110169484474386276334');
    assert.equal(verified.email, 'somchai@example.test');
    assert.equal(verified.email_verified, true);
  });

  test('both issuer spellings Google uses are accepted', async () => {
    const verified = await verify(sign(claims({ iss: 'accounts.google.com' })));
    assert.equal(verified.iss, 'accounts.google.com');
  });

  test('a token that expired within the minute of clock tolerance still passes', async () => {
    await verify(sign(claims({ exp: NOW_SECONDS - 30 })));
  });

  test('two audiences pass only when azp names us', async () => {
    await verify(sign(claims({ aud: [CLIENT_ID, 'another-app'], azp: CLIENT_ID })));
  });

  test('the failure says why in a word, and carries nothing from the token', async () => {
    await assert.rejects(verify(sign(claims({ nonce: 'other' }))), (error) => {
      assert.equal(error.reason, 'nonce');
      assert.doesNotMatch(error.message, /somchai|example\.test|110169484474386276334/);
      return true;
    });
  });

  describe('refused', () => {
    test('another issuer', () => rejectsWith(sign(claims({ iss: 'https://evil.example' })), 'issuer'));

    test('a token for another app', () => rejectsWith(sign(claims({ aud: 'another-app' })), 'audience'));

    test('an audience list without us', () =>
      rejectsWith(sign(claims({ aud: ['another-app', 'a-third-app'] })), 'audience'));

    test('two audiences and no azp', () =>
      rejectsWith(sign(claims({ aud: [CLIENT_ID, 'another-app'] })), 'azp'));

    test('an azp that is not us', () => rejectsWith(sign(claims({ azp: 'another-app' })), 'azp'));

    test('expired beyond the tolerance', () =>
      rejectsWith(sign(claims({ exp: NOW_SECONDS - 120 })), 'expired'));

    // jsonwebtoken checks exp only when it's present.
    test('no exp at all', () => rejectsWith(sign(without('exp')), 'expired'));

    test('no nonce', () => rejectsWith(sign(without('nonce')), 'nonce'));

    test('a nonce from another sign-in', () =>
      rejectsWith(sign(claims({ nonce: crypto.randomBytes(32).toString('base64url') })), 'nonce'));

    test('an unknown kid', () => rejectsWith(sign(claims(), { kid: 'rotated-away' }), 'unknown-key'));

    test('no kid', () => rejectsWith(sign(claims(), { kid: null }), 'unknown-key'));

    test('a payload changed after signing', async () => {
      const [header, , signature] = sign(claims()).split('.');
      const forged = `${header}.${segment(claims({ email: 'attacker@example.test' }))}.${signature}`;
      await rejectsWith(forged, 'signature');
    });

    test('signed by a key that is not Google’s', () =>
      rejectsWith(sign(claims(), { key: stranger.privateKey }), 'signature'));

    test('alg none', () => rejectsWith(handMade({ alg: 'none', kid: KID }, claims()), 'algorithm'));

    test('HS256 with Google’s public key as the secret', () => {
      const publicPem = google.publicKey.export({ type: 'spki', format: 'pem' });
      return rejectsWith(handMade({ alg: 'HS256', typ: 'JWT', kid: KID }, claims(), publicPem), 'algorithm');
    });

    test('no sub', () => rejectsWith(sign(without('sub')), 'claims'));

    test('no email', () => rejectsWith(sign(without('email')), 'claims'));

    test('an email that is not a string', () => rejectsWith(sign(claims({ email: ['a@b.test'] })), 'claims'));

    test('not a JWT', () => rejectsWith('not-a-token', 'malformed'));

    test('no token', () => rejectsWith(undefined, 'missing'));

    // Fail closed: jsonwebtoken skips the audience check for an empty audience.
    test('any token, when our client ID is empty', () =>
      rejectsWith(sign(claims({ aud: '' })), 'no-client-id', { clientId: '' }));

    // An empty nonce in the token must not match an empty one on our side.
    test('any token, when our nonce is empty', () =>
      rejectsWith(sign(claims({ nonce: '' })), 'nonce', { nonce: '' }));
  });
});

describe('createGoogleKeyStore', () => {
  const jwkFor = (publicKey, kid, extra = {}) => ({
    ...publicKey.export({ format: 'jwk' }),
    kid,
    use: 'sig',
    alg: 'RS256',
    ...extra,
  });

  // A fake Google: answers each fetch with the next reply in the list, the last
  // one repeating, and counts the calls.
  function fakeFetch(...replies) {
    const calls = [];
    const fetch = async (url) => {
      calls.push(url);
      const reply = replies[Math.min(calls.length - 1, replies.length - 1)];
      if (reply instanceof Error) throw reply;
      const { status = 200, keys, cacheControl = 'public, max-age=3600' } = reply;
      return new Response(JSON.stringify({ keys }), {
        status,
        headers: cacheControl ? { 'cache-control': cacheControl } : {},
      });
    };
    return { fetch, calls };
  }

  function clock() {
    let t = NOW;
    return { now: () => t, advance: (ms) => (t += ms) };
  }

  const keysUnavailable = (error) => error.status === 502 && error.reason === 'keys-unavailable';

  test('fetches the key set from Google’s fixed URL, and the key verifies a token', async () => {
    const google1 = fakeFetch({ keys: [jwkFor(google.publicKey, KID)] });
    const store = createGoogleKeyStore({ fetch: google1.fetch, now: clock().now });

    const verified = await verify(sign(claims()), { getKey: store });

    assert.equal(verified.sub, '110169484474386276334');
    assert.deepEqual(google1.calls, [GOOGLE_CERTS_URL]);
  });

  test('keys are cached for as long as max-age says', async () => {
    const time = clock();
    const google1 = fakeFetch({ keys: [jwkFor(google.publicKey, KID)], cacheControl: 'max-age=600' });
    const store = createGoogleKeyStore({ fetch: google1.fetch, now: time.now });

    await store(KID);
    time.advance(599_000);
    await store(KID);
    assert.equal(google1.calls.length, 1, 'two lookups within max-age, one fetch');

    time.advance(2_000);
    await store(KID);
    assert.equal(google1.calls.length, 2, 'past max-age, fetched again');
  });

  test('without Cache-Control the keys are kept for an hour', async () => {
    const time = clock();
    const google1 = fakeFetch({ keys: [jwkFor(google.publicKey, KID)], cacheControl: null });
    const store = createGoogleKeyStore({ fetch: google1.fetch, now: time.now });

    await store(KID);
    time.advance(59 * 60_000);
    await store(KID);
    assert.equal(google1.calls.length, 1);

    time.advance(2 * 60_000);
    await store(KID);
    assert.equal(google1.calls.length, 2);
  });

  test('a new kid (Google rotated) refetches and finds the new key', async () => {
    const time = clock();
    const google1 = fakeFetch(
      { keys: [jwkFor(google.publicKey, 'old')] },
      { keys: [jwkFor(google.publicKey, 'old'), jwkFor(stranger.publicKey, 'new')] },
    );
    const store = createGoogleKeyStore({ fetch: google1.fetch, now: time.now });

    await store('old');
    time.advance(61_000);

    const rotated = await store('new');
    assert.ok(rotated, 'the rotated key is found after one refetch');
    assert.equal(rotated.export({ format: 'jwk' }).n, stranger.publicKey.export({ format: 'jwk' }).n);
    assert.equal(google1.calls.length, 2);
  });

  test('unknown kids refetch at most once a minute', async () => {
    const time = clock();
    const google1 = fakeFetch({ keys: [jwkFor(google.publicKey, KID)] });
    const store = createGoogleKeyStore({ fetch: google1.fetch, now: time.now });

    await store(KID);
    time.advance(61_000);

    assert.equal(await store('made-up-1'), null);
    assert.equal(google1.calls.length, 2, 'one refetch for the first unknown kid');

    assert.equal(await store('made-up-2'), null);
    assert.equal(await store('made-up-3'), null);
    assert.equal(google1.calls.length, 2, 'no more within the minute');

    time.advance(61_000);
    assert.equal(await store('made-up-4'), null);
    assert.equal(google1.calls.length, 3, 'one more after the minute');
  });

  test('lookups that arrive during a fetch share it', async () => {
    const google1 = fakeFetch({ keys: [jwkFor(google.publicKey, KID)] });
    const store = createGoogleKeyStore({ fetch: google1.fetch, now: clock().now });

    const keys = await Promise.all([store(KID), store(KID), store(KID)]);

    assert.ok(keys.every(Boolean));
    assert.equal(google1.calls.length, 1);
  });

  test('a fetch that fails is keys-unavailable, and is not retried within the minute', async () => {
    const time = clock();
    const google1 = fakeFetch(new TypeError('fetch failed'), { keys: [jwkFor(google.publicKey, KID)] });
    const store = createGoogleKeyStore({ fetch: google1.fetch, now: time.now });

    await assert.rejects(store(KID), keysUnavailable);
    await assert.rejects(store(KID), keysUnavailable);
    assert.equal(google1.calls.length, 1, 'the second lookup did not ask Google again');

    time.advance(61_000);
    assert.ok(await store(KID), 'tried again after the minute, and it worked');
    assert.equal(google1.calls.length, 2);
  });

  test('a non-200 answer is keys-unavailable', async () => {
    const google1 = fakeFetch({ status: 503, keys: [] });
    const store = createGoogleKeyStore({ fetch: google1.fetch, now: clock().now });

    await assert.rejects(store(KID), keysUnavailable);
  });

  test('only RSA signing keys for RS256 are kept', async () => {
    const google1 = fakeFetch({
      keys: [
        jwkFor(google.publicKey, 'for-encryption', { use: 'enc' }),
        jwkFor(google.publicKey, 'for-rs512', { alg: 'RS512' }),
        { kty: 'oct', kid: 'symmetric', k: 'c2VjcmV0', use: 'sig', alg: 'HS256' },
        jwkFor(google.publicKey, 'good'),
      ],
    });
    const store = createGoogleKeyStore({ fetch: google1.fetch, now: clock().now });

    assert.ok(await store('good'));
    assert.equal(await store('for-encryption'), null);
    assert.equal(await store('for-rs512'), null);
    assert.equal(await store('symmetric'), null);
  });

  test('a key set with no usable key is keys-unavailable', async () => {
    const google1 = fakeFetch({ keys: [{ kty: 'oct', kid: 'x', k: 'c2VjcmV0', use: 'sig', alg: 'HS256' }] });
    const store = createGoogleKeyStore({ fetch: google1.fetch, now: clock().now });

    await assert.rejects(store(KID), keysUnavailable);
  });
});
