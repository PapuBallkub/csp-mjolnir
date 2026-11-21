import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createApp } from '../src/app.js';
import {
  clearSessionCookie,
  getSessionTokenFromRequest,
  LEGACY_SESSION_COOKIE,
  SESSION_COOKIE,
  setSessionCookie,
} from '#features/auth/session.js';
import {
  clearState,
  getOAuthStateFromRequest,
  issueState,
  LEGACY_OAUTH_STATE_COOKIE,
  OAUTH_STATE_COOKIE,
} from '#features/auth/google.js';

test('API server registers ASVS Chapter 3 core security headers and disables framework banner', () => {
  const app = createApp();

  // ASVS V13.4.6: Server framework disclosure disabled
  assert.equal(app.disabled('x-powered-by'), true, 'x-powered-by must be disabled');

  // Verify the security headers middleware layer
  const headers = {};
  const mockRes = {
    set: (k, v) => {
      headers[k.toLowerCase()] = v;
    },
  };

  let nextCalled = false;
  const securityLayer = app.router.stack[0];
  assert.ok(securityLayer, 'security layer must exist in router stack');
  securityLayer.handle({}, mockRes, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true, 'security headers middleware must call next()');

  // ASVS V3.4.1: X-Content-Type-Options: nosniff
  assert.equal(headers['x-content-type-options'], 'nosniff');

  // ASVS V3.4.3: X-Frame-Options: DENY
  assert.equal(headers['x-frame-options'], 'DENY');

  // ASVS V3.4.5: Referrer-Policy: strict-origin-when-cross-origin
  assert.equal(headers['referrer-policy'], 'strict-origin-when-cross-origin');

  // ASVS V3.2.1, V3.4.6: Content-Security-Policy disallowing execution and framing on JSON API
  const csp = headers['content-security-policy'];
  assert.ok(csp, 'Content-Security-Policy header must be present on API');
  assert.ok(csp.includes("default-src 'none'"), "API CSP must include default-src 'none'");
  assert.ok(csp.includes("frame-ancestors 'none'"), "API CSP must include frame-ancestors 'none'");

  // ASVS V3.5.8: Cross-Origin-Resource-Policy: same-site
  assert.equal(headers['cross-origin-resource-policy'], 'same-site');

  // ASVS V3.4.8: Cross-Origin-Opener-Policy: same-origin-allow-popups
  assert.equal(headers['cross-origin-opener-policy'], 'same-origin-allow-popups');

  // ASVS V3.4.7: Permissions-Policy
  const permissionsPolicy = headers['permissions-policy'];
  assert.ok(permissionsPolicy, 'Permissions-Policy header must be present on API');
  assert.ok(permissionsPolicy.includes('camera=()'));
  assert.ok(permissionsPolicy.includes('payment=()'));
  assert.ok(permissionsPolicy.includes('usb=()'));
});

test('issueState sets oauth state cookie within 4096-byte limit (ASVS V3.3.5)', () => {
  let cookieName;
  let cookieValue;
  const mockRes = {
    cookie: (name, val) => {
      cookieName = name;
      cookieValue = val;
    },
  };
  const state = issueState(mockRes);
  assert.equal(cookieName, OAUTH_STATE_COOKIE);
  assert.equal(cookieValue, state);
  assert.ok(OAUTH_STATE_COOKIE.length + state.length <= 4096);
});

test('setSessionCookie enforces 4096-byte combined cookie size limit (ASVS V3.3.5)', () => {
  const mockRes = {
    cookie: () => {},
  };

  // Normal sized token succeeds
  const normalToken = 'a'.repeat(500);
  assert.doesNotThrow(() => {
    setSessionCookie(mockRes, normalToken);
  });

  // Oversized token (> 4096 bytes combined length) throws error
  const oversizedToken = 'a'.repeat(4096);
  assert.throws(
    () => {
      setSessionCookie(mockRes, oversizedToken);
    },
    {
      name: 'Error',
      message: /4096 bytes limit/,
    }
  );
});

test('setSessionCookie configures essential security attributes (ASVS V3.3.1, V3.3.2, V3.3.3)', () => {
  let cookieName;
  let cookieValue;
  let cookieOpts;

  const mockRes = {
    cookie: (name, val, opts) => {
      cookieName = name;
      cookieValue = val;
      cookieOpts = opts;
    },
  };

  setSessionCookie(mockRes, 'valid-session-jwt');

  assert.equal(cookieName, SESSION_COOKIE);
  assert.equal(cookieValue, 'valid-session-jwt');
  assert.equal(cookieOpts.httpOnly, true, 'cookie must have HttpOnly: true');
  assert.equal(cookieOpts.path, '/', "cookie path must be explicitly '/'");
  assert.ok(cookieOpts.sameSite, 'cookie must define sameSite attribute');
  assert.equal(cookieOpts.domain, undefined, 'cookie must NOT define domain (for __Host- compatibility)');
});

test('getSessionTokenFromRequest correctly extracts token from active or legacy cookie', () => {
  // 1. From current SESSION_COOKIE
  const req1 = { cookies: { [SESSION_COOKIE]: 'token-from-active' } };
  assert.equal(getSessionTokenFromRequest(req1), 'token-from-active');

  // 2. Fallback to LEGACY_SESSION_COOKIE
  const req2 = { cookies: { [LEGACY_SESSION_COOKIE]: 'token-from-legacy' } };
  assert.equal(getSessionTokenFromRequest(req2), 'token-from-legacy');

  // 3. Null if neither exists
  const req3 = { cookies: {} };
  assert.equal(getSessionTokenFromRequest(req3), null);

  // 4. Null if req.cookies is undefined
  assert.equal(getSessionTokenFromRequest({}), null);
});

test('getOAuthStateFromRequest correctly extracts OAuth state from active or legacy cookie', () => {
  // 1. From current OAUTH_STATE_COOKIE
  const req1 = { cookies: { [OAUTH_STATE_COOKIE]: 'state-from-active' } };
  assert.equal(getOAuthStateFromRequest(req1), 'state-from-active');

  // 2. Fallback to LEGACY_OAUTH_STATE_COOKIE
  const req2 = { cookies: { [LEGACY_OAUTH_STATE_COOKIE]: 'state-from-legacy' } };
  assert.equal(getOAuthStateFromRequest(req2), 'state-from-legacy');

  // 3. Null if neither exists
  const req3 = { cookies: {} };
  assert.equal(getOAuthStateFromRequest(req3), null);

  // 4. Null if req.cookies is undefined
  assert.equal(getOAuthStateFromRequest({}), null);
});

test('clearSessionCookie clears active cookie and legacy cookie', () => {
  const cleared = [];
  const mockRes = {
    clearCookie: (name, opts) => {
      cleared.push({ name, opts });
    },
  };

  clearSessionCookie(mockRes);

  assert.ok(cleared.some((c) => c.name === SESSION_COOKIE), 'active session cookie must be cleared');
  if (SESSION_COOKIE !== LEGACY_SESSION_COOKIE) {
    assert.ok(cleared.some((c) => c.name === LEGACY_SESSION_COOKIE), 'legacy session cookie must be cleared');
  }
});

test('clearState clears active oauth cookie and legacy oauth cookie', () => {
  const cleared = [];
  const mockRes = {
    clearCookie: (name, opts) => {
      cleared.push({ name, opts });
    },
  };

  clearState(mockRes);

  assert.ok(cleared.some((c) => c.name === OAUTH_STATE_COOKIE), 'active oauth cookie must be cleared');
  if (OAUTH_STATE_COOKIE !== LEGACY_OAUTH_STATE_COOKIE) {
    assert.ok(cleared.some((c) => c.name === LEGACY_OAUTH_STATE_COOKIE), 'legacy oauth cookie must be cleared');
  }
});
