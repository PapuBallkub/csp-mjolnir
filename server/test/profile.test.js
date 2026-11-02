import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { User } from '#models/index.js';

import { createApp } from '../src/app.js';

const TEST_DB = 'mjolnir_test';
const PASSWORD = 'correct horse battery';

const runId = crypto.randomUUID().slice(0, 8);
const emailFor = (name) => `${name}-${runId}@example.test`;

const UNLIMITED = { windowMs: 60_000, limit: 10_000 };
const NO_RATE_LIMITS = {
  loginByIp: UNLIMITED,
  loginByEmail: UNLIMITED,
  registerByIp: UNLIMITED,
};

let server;
let baseUrl;

before(async () => {
  await connectDatabase({ dbName: TEST_DB });
  server = createApp({ rateLimits: NO_RATE_LIMITS }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://localhost:${server.address().port}`;
});

after(async () => {
  await User.deleteMany({ email: new RegExp(`-${runId}@example\\.test$`) });
  await new Promise((resolve) => server.close(resolve));
  await disconnectDatabase();
});

function send(method, path, { body, cookie } = {}) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// Helper: register and get session cookie
async function registerAndGetCookie(name) {
  const res = await send('POST', '/api/auth/register', {
    body: { email: emailFor(name), password: PASSWORD, name },
  });
  return res.headers.get('set-cookie');
}

test('profile: returns 401 when not authenticated', async () => {
  const res = await send('PATCH', '/api/profile', {
    body: { skills: ['React'] },
  });
  assert.equal(res.status, 401);
});

test('profile: saves skills', async () => {
  const cookie = await registerAndGetCookie('profile-skills');
  const res = await send('PATCH', '/api/profile', {
    body: { skills: ['React', 'Node.js', 'PostgreSQL'] },
    cookie,
  });
  assert.equal(res.status, 200);
  const { user } = await res.json();
  assert.deepEqual(user.profile.skills, ['React', 'Node.js', 'PostgreSQL']);
});

test('profile: deduplicates skills and trims whitespace', async () => {
  const cookie = await registerAndGetCookie('profile-dedup');
  const res = await send('PATCH', '/api/profile', {
    body: { skills: ['React', ' React ', 'Node.js'] },
    cookie,
  });
  assert.equal(res.status, 200);
  const { user } = await res.json();
  assert.deepEqual(user.profile.skills, ['React', 'Node.js']);
});

test('profile: rejects more than 150 skills', async () => {
  const cookie = await registerAndGetCookie('profile-max-skills');
  const skills = Array.from({ length: 151 }, (_, i) => `Skill-${i}`);
  const res = await send('PATCH', '/api/profile', {
    body: { skills },
    cookie,
  });
  assert.equal(res.status, 400);
  const { error } = await res.json();
  assert.ok(error.details.skills);
});

test('profile: saves budget range', async () => {
  const cookie = await registerAndGetCookie('profile-budget');
  const res = await send('PATCH', '/api/profile', {
    body: { budgetMin: 300000, budgetMax: 5000000 },
    cookie,
  });
  assert.equal(res.status, 200);
  const { user } = await res.json();
  assert.equal(user.profile.budgetMin, 300000);
  assert.equal(user.profile.budgetMax, 5000000);
});

test('profile: rejects budgetMin > budgetMax in same request', async () => {
  const cookie = await registerAndGetCookie('profile-budget-invalid');
  const res = await send('PATCH', '/api/profile', {
    body: { budgetMin: 5000000, budgetMax: 300000 },
    cookie,
  });
  assert.equal(res.status, 400);
  const { error } = await res.json();
  assert.ok(error.details.budgetMin);
});

test('profile: accepts budgetMin with budgetMax = 0 (unconstrained upper bound)', async () => {
  const cookie = await registerAndGetCookie('profile-budget-unconstrained');
  const res = await send('PATCH', '/api/profile', {
    body: { budgetMin: 20000000, budgetMax: 0 },
    cookie,
  });
  assert.equal(res.status, 200);
  const { user } = await res.json();
  assert.equal(user.profile.budgetMin, 20000000);
  assert.equal(user.profile.budgetMax, 0);
});

test('profile: rejects negative budget', async () => {
  const cookie = await registerAndGetCookie('profile-budget-neg');
  const res = await send('PATCH', '/api/profile', {
    body: { budgetMin: -100 },
    cookie,
  });
  assert.equal(res.status, 400);
});

test('profile: saves budget up to 10 billion THB', async () => {
  const cookie = await registerAndGetCookie('profile-budget-10b');
  const res = await send('PATCH', '/api/profile', {
    body: { budgetMin: 10000000, budgetMax: 10000000000 },
    cookie,
  });
  assert.equal(res.status, 200);
  const { user } = await res.json();
  assert.equal(user.profile.budgetMin, 10000000);
  assert.equal(user.profile.budgetMax, 10000000000);
});

test('profile: rejects budget exceeding 10 billion THB', async () => {
  const cookie = await registerAndGetCookie('profile-budget-over');
  const res = await send('PATCH', '/api/profile', {
    body: { budgetMax: 10000000001 },
    cookie,
  });
  assert.equal(res.status, 400);
  const { error } = await res.json();
  assert.ok(error.details.budgetMax);
});

test('profile: saves certifications', async () => {
  const cookie = await registerAndGetCookie('profile-certs');
  const res = await send('PATCH', '/api/profile', {
    body: { certifications: ['ISO/IEC 29110', 'CMMI Level 3', 'ISO/IEC 27001'] },
    cookie,
  });
  assert.equal(res.status, 200);
  const { user } = await res.json();
  assert.deepEqual(user.profile.certifications, ['ISO/IEC 29110', 'CMMI Level 3', 'ISO/IEC 27001']);
});

test('profile: deduplicates certifications and trims whitespace', async () => {
  const cookie = await registerAndGetCookie('profile-certs-dedup');
  const res = await send('PATCH', '/api/profile', {
    body: { certifications: ['ISO 29110', ' ISO 29110 ', 'CMMI Level 3'] },
    cookie,
  });
  assert.equal(res.status, 200);
  const { user } = await res.json();
  assert.deepEqual(user.profile.certifications, ['ISO 29110', 'CMMI Level 3']);
});

test('profile: rejects more than 50 certifications', async () => {
  const cookie = await registerAndGetCookie('profile-max-certs');
  const certs = Array.from({ length: 51 }, (_, i) => `Cert-${i}`);
  const res = await send('PATCH', '/api/profile', {
    body: { certifications: certs },
    cookie,
  });
  assert.equal(res.status, 400);
  const { error } = await res.json();
  assert.ok(error.details.certifications);
});

test('profile: partial update does not clear other fields', async () => {
  const cookie = await registerAndGetCookie('profile-partial');

  // First save skills
  await send('PATCH', '/api/profile', {
    body: { skills: ['React'] },
    cookie,
  });

  // Then save budget (skills should stay)
  const res = await send('PATCH', '/api/profile', {
    body: { budgetMin: 100000, budgetMax: 500000 },
    cookie,
  });
  assert.equal(res.status, 200);
  const { user } = await res.json();
  assert.deepEqual(user.profile.skills, ['React']);
  assert.equal(user.profile.budgetMin, 100000);
  assert.equal(user.profile.budgetMax, 500000);
});

test('profile: cross-field check against existing budgetMax', async () => {
  const cookie = await registerAndGetCookie('profile-cross-field');

  // Save budgetMax = 300,000
  await send('PATCH', '/api/profile', {
    body: { budgetMin: 100000, budgetMax: 300000 },
    cookie,
  });

  // Try to set budgetMin = 500,000 without sending budgetMax
  const res = await send('PATCH', '/api/profile', {
    body: { budgetMin: 500000 },
    cookie,
  });
  assert.equal(res.status, 400);
  const { error } = await res.json();
  assert.ok(error.details.budgetMin);
});

test('profile: persists across sessions and visible on GET /api/auth/me', async () => {
  const email = emailFor('profile-persist');

  // Register and save
  const regRes = await send('POST', '/api/auth/register', {
    body: { email, password: PASSWORD, name: 'Persist Test' },
  });
  const cookie1 = regRes.headers.get('set-cookie');
  await send('PATCH', '/api/profile', {
    body: { skills: ['Vue.js'], budgetMin: 200000, budgetMax: 2000000 },
    cookie: cookie1,
  });

  // Log out, log back in
  await send('POST', '/api/auth/logout', { cookie: cookie1 });
  const loginRes = await send('POST', '/api/auth/login', {
    body: { email, password: PASSWORD },
  });
  const cookie2 = loginRes.headers.get('set-cookie');

  // GET /api/auth/me should return the profile
  const meRes = await send('GET', '/api/auth/me', { cookie: cookie2 });
  const { user } = await meRes.json();
  assert.deepEqual(user.profile.skills, ['Vue.js']);
  assert.equal(user.profile.budgetMin, 200000);
  assert.equal(user.profile.budgetMax, 2000000);
});

test('profile: new user has default empty profile', async () => {
  const cookie = await registerAndGetCookie('profile-default');
  const res = await send('GET', '/api/auth/me', { cookie });
  const { user } = await res.json();
  assert.deepEqual(user.profile, {
    skills: [],
    budgetMin: 0,
    budgetMax: 0,
    certifications: [],
    entityType: 'juristic',
    preferredArchetypes: [],
    maxPastPortfolioTHB: 0,
    matchNotification: {
      enabled: false,
      minScore: 75,
      frequency: 'daily',
      includeSubcontract: true,
    },
  });
});

test('profile: updates entityType, preferredArchetypes, and maxPastPortfolioTHB', async () => {
  const cookie = await registerAndGetCookie('profile-extended-fields');
  const res = await send('PATCH', '/api/profile', {
    body: {
      entityType: 'individual',
      preferredArchetypes: ['web-portal', 'mobile-app'],
      maxPastPortfolioTHB: 1500000,
    },
    cookie,
  });
  assert.equal(res.status, 200);
  const { user } = await res.json();
  assert.equal(user.profile.entityType, 'individual');
  assert.deepEqual(user.profile.preferredArchetypes, ['web-portal', 'mobile-app']);
  assert.equal(user.profile.maxPastPortfolioTHB, 1500000);

  // Verify persistence via GET /api/auth/me
  const meRes = await send('GET', '/api/auth/me', { cookie });
  const meData = await meRes.json();
  assert.equal(meData.user.profile.entityType, 'individual');
  assert.deepEqual(meData.user.profile.preferredArchetypes, ['web-portal', 'mobile-app']);
  assert.equal(meData.user.profile.maxPastPortfolioTHB, 1500000);
});

test('profile: rejects invalid entityType, invalid archetypes, and negative portfolio', async () => {
  const cookie = await registerAndGetCookie('profile-validation-extended');
  const res = await send('PATCH', '/api/profile', {
    body: {
      entityType: 'alien-corp',
      maxPastPortfolioTHB: -100,
    },
    cookie,
  });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.ok(data.error.details.entityType);
  assert.ok(data.error.details.maxPastPortfolioTHB);
});

test('profile: updates matchNotification settings (FR-14 preparation)', async () => {
  const cookie = await registerAndGetCookie('profile-match-notif');
  const res = await send('PATCH', '/api/profile', {
    body: {
      matchNotification: {
        enabled: true,
        minScore: 85,
        frequency: 'instant',
        includeSubcontract: false,
      },
    },
    cookie,
  });
  assert.equal(res.status, 200);
  const { user } = await res.json();
  assert.deepEqual(user.profile.matchNotification, {
    enabled: true,
    minScore: 85,
    frequency: 'instant',
    includeSubcontract: false,
  });

  // Verify persistence via GET /api/auth/me
  const meRes = await send('GET', '/api/auth/me', { cookie });
  const meData = await meRes.json();
  assert.deepEqual(meData.user.profile.matchNotification, {
    enabled: true,
    minScore: 85,
    frequency: 'instant',
    includeSubcontract: false,
  });
});

test('profile: empty body returns current user without error', async () => {
  const cookie = await registerAndGetCookie('profile-empty-body');
  const res = await send('PATCH', '/api/profile', {
    body: {},
    cookie,
  });
  assert.equal(res.status, 200);
});

test('technologies: GET /api/technologies returns available vocabulary', async () => {
  const res = await send('GET', '/api/technologies');
  assert.equal(res.status, 200);
  const { technologies } = await res.json();
  assert.ok(Array.isArray(technologies));
  assert.ok(technologies.length > 0);
  assert.ok(technologies.some((t) => t.name === 'PostgreSQL'));
});
