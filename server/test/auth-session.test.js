import assert from 'node:assert/strict';
import { test } from 'node:test';
import jwt from 'jsonwebtoken';

import { env } from '#common/config/env.js';
import {
  signSessionToken,
  readSessionToken,
  SESSION_TOKEN_ALGORITHM,
  SESSION_TOKEN_TYPE,
  SESSION_TOKEN_ISSUER,
  SESSION_TOKEN_AUDIENCE,
} from '#features/auth/session.js';

test('signSessionToken: produces token with ASVS Chapter 9 claims (algorithm, typ, iss, aud, exp)', () => {
  const user = { id: 'user-asvs-123', tokenVersion: 2 };
  const token = signSessionToken(user);
  assert.ok(token);

  // Decode unverified header and payload to check structure
  const decodedHeader = jwt.decode(token, { complete: true }).header;
  const decodedPayload = jwt.decode(token, { complete: true }).payload;

  // ASVS V9.1.2: Algorithm must be explicitly HS256
  assert.equal(decodedHeader.alg, SESSION_TOKEN_ALGORITHM);
  assert.equal(decodedHeader.alg, 'HS256');

  // ASVS V9.2.2: Token must indicate intended type/purpose
  assert.equal(decodedPayload.typ, SESSION_TOKEN_TYPE);
  assert.equal(decodedPayload.typ, 'session');

  // ASVS V9.1.3 & V9.2.4: Issuer must match expected service issuer
  assert.equal(decodedPayload.iss, SESSION_TOKEN_ISSUER);
  assert.equal(decodedPayload.iss, 'mjolnir-api');

  // ASVS V9.2.3 & V9.2.4: Audience must match expected service audience
  assert.equal(decodedPayload.aud, SESSION_TOKEN_AUDIENCE);
  assert.equal(decodedPayload.aud, 'mjolnir-web');

  // ASVS V9.2.1: Expiration must be set (within 24 hours)
  assert.ok(decodedPayload.exp);
  assert.ok(decodedPayload.exp > Math.floor(Date.now() / 1000));

  // Subject and token version preserved
  assert.equal(decodedPayload.sub, 'user-asvs-123');
  assert.equal(decodedPayload.v, 2);
});

test('readSessionToken: successfully validates and decodes genuine token', () => {
  const user = { id: 'user-valid-456', tokenVersion: 1 };
  const token = signSessionToken(user);

  const session = readSessionToken(token);
  assert.ok(session);
  assert.equal(session.userId, 'user-valid-456');
  assert.equal(session.tokenVersion, 1);
});

test('readSessionToken (ASVS V9.1.2): rejects token with unapproved algorithm or "none" algorithm', () => {
  // 1. None algorithm bypass attempt
  const noneToken = jwt.sign(
    { sub: 'attacker', typ: SESSION_TOKEN_TYPE },
    '',
    { algorithm: 'none' }
  );
  assert.equal(readSessionToken(noneToken), null, 'Tokens with "none" algorithm must be rejected');

  // 2. Algorithm confusion / mismatch (e.g. HS384 instead of HS256)
  const hs384Token = jwt.sign(
    { sub: 'attacker', typ: SESSION_TOKEN_TYPE },
    env.jwtSecret,
    {
      algorithm: 'HS384',
      issuer: SESSION_TOKEN_ISSUER,
      audience: SESSION_TOKEN_AUDIENCE,
    }
  );
  assert.equal(readSessionToken(hs384Token), null, 'Tokens signed with unapproved HS384 algorithm must be rejected');
});

test('readSessionToken (ASVS V9.1.1 & V9.1.3): rejects tampered tokens or tokens signed with untrusted secret', () => {
  const user = { id: 'user-789', tokenVersion: 0 };
  const token = signSessionToken(user);

  // 1. Token signed with attacker key
  const rogueToken = jwt.sign(
    { sub: user.id, typ: SESSION_TOKEN_TYPE },
    'wrong-untrusted-secret-key-1234567890',
    {
      algorithm: 'HS256',
      issuer: SESSION_TOKEN_ISSUER,
      audience: SESSION_TOKEN_AUDIENCE,
      expiresIn: '1h',
    }
  );
  assert.equal(readSessionToken(rogueToken), null, 'Token signed with wrong key must be rejected');

  // 2. Tampered signature
  const tamperedToken = token.slice(0, -5) + 'xxxxx';
  assert.equal(readSessionToken(tamperedToken), null, 'Tampered token signature must be rejected');
});

test('readSessionToken (ASVS V9.2.1): rejects expired tokens', () => {
  const expiredToken = jwt.sign(
    {
      sub: 'expired-user',
      typ: SESSION_TOKEN_TYPE,
      v: 0,
    },
    env.jwtSecret,
    {
      algorithm: 'HS256',
      issuer: SESSION_TOKEN_ISSUER,
      audience: SESSION_TOKEN_AUDIENCE,
      expiresIn: '-10s', // expired 10 seconds ago
    }
  );

  assert.equal(readSessionToken(expiredToken), null, 'Expired tokens must be rejected');
});

test('readSessionToken (ASVS V9.2.2): rejects token with missing or mismatched token type / purpose', () => {
  // 1. Missing typ claim (e.g., legacy token or raw token)
  const noTypToken = jwt.sign(
    { sub: 'user-no-type', v: 0 },
    env.jwtSecret,
    {
      algorithm: 'HS256',
      issuer: SESSION_TOKEN_ISSUER,
      audience: SESSION_TOKEN_AUDIENCE,
      expiresIn: '1h',
    }
  );
  assert.equal(readSessionToken(noTypToken), null, 'Token without "session" typ must be rejected');

  // 2. Different purpose (e.g., ID token or password reset token)
  const idToken = jwt.sign(
    { sub: 'user-id-token', typ: 'id_token', v: 0 },
    env.jwtSecret,
    {
      algorithm: 'HS256',
      issuer: SESSION_TOKEN_ISSUER,
      audience: SESSION_TOKEN_AUDIENCE,
      expiresIn: '1h',
    }
  );
  assert.equal(readSessionToken(idToken), null, 'Token with purpose "id_token" must not be accepted for session auth');
});

test('readSessionToken (ASVS V9.2.3 & V9.2.4): rejects token with untrusted audience or issuer', () => {
  // 1. Wrong audience
  const wrongAudToken = jwt.sign(
    { sub: 'user-aud', typ: SESSION_TOKEN_TYPE, v: 0 },
    env.jwtSecret,
    {
      algorithm: 'HS256',
      issuer: SESSION_TOKEN_ISSUER,
      audience: 'rogue-external-app',
      expiresIn: '1h',
    }
  );
  assert.equal(readSessionToken(wrongAudToken), null, 'Token with untrusted audience must be rejected');

  // 2. Missing audience
  const missingAudToken = jwt.sign(
    { sub: 'user-aud', typ: SESSION_TOKEN_TYPE, v: 0 },
    env.jwtSecret,
    {
      algorithm: 'HS256',
      issuer: SESSION_TOKEN_ISSUER,
      expiresIn: '1h',
    }
  );
  assert.equal(readSessionToken(missingAudToken), null, 'Token without audience must be rejected');

  // 3. Wrong issuer
  const wrongIssToken = jwt.sign(
    { sub: 'user-iss', typ: SESSION_TOKEN_TYPE, v: 0 },
    env.jwtSecret,
    {
      algorithm: 'HS256',
      issuer: 'untrusted-issuer-service',
      audience: SESSION_TOKEN_AUDIENCE,
      expiresIn: '1h',
    }
  );
  assert.equal(readSessionToken(wrongIssToken), null, 'Token with untrusted issuer must be rejected');
});
