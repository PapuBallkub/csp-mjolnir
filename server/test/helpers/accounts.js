// Accounts for tests that need someone signed in. Outside the *.test.js glob,
// so npm test doesn't run it as a test file.
//
// Registering no longer signs anyone in: it sends a confirm link, and the
// account exists only once the link is opened with the password (0041). Tests
// about something else don't need that journey, so they get a confirmed
// account straight from the database, then sign in through the real /login.

import assert from 'node:assert/strict';

import { hashPassword } from '#features/auth/password.js';
import { User } from '#models/index.js';

/**
 * A user whose address is confirmed, as if they had opened their link.
 *
 * @param {{ email: string, password: string, name?: string, role?: 'user' | 'admin' }} account
 * @returns {Promise<object>} The saved user document
 */
export async function createVerifiedUser({ email, password, name = 'ทดสอบ', role = 'user', ...fields }) {
  return User.create({
    email,
    passwordHash: await hashPassword(password),
    name,
    role,
    emailVerifiedAt: new Date(),
    ...fields,
  });
}

/**
 * Signs in through POST /api/auth/login and returns the session cookie as a
 * request sends it: `mjolnir_session=…`.
 */
export async function signInCookie(baseUrl, email, password) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(response.status, 200, `sign-in for ${email}`);
  const header = response.headers.getSetCookie().find((cookie) => cookie.includes('mjolnir_session='));
  assert.ok(header, 'sign-in sets a session cookie');
  return header.split(';')[0];
}

/** Both at once: a confirmed account, and its session cookie. */
export async function signedInAccount(baseUrl, account) {
  const user = await createVerifiedUser(account);
  return { user, cookie: await signInCookie(baseUrl, account.email, account.password) };
}

/**
 * A mailer for createApp({ mail }) that sends nothing and keeps every message,
 * so a test can read the link a person would have been emailed. Mail goes out
 * after the response, so waitFor waits for it.
 */
export function createMailRecorder() {
  const sent = [];
  return {
    configured: true,
    sent,
    async send(message) {
      sent.push(message);
    },
    /** The `count`-th message to `to` (1 = the first), once it has been sent. */
    async waitFor(to, { count = 1, timeoutMs = 3000 } = {}) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const mine = sent.filter((message) => message.to === to);
        if (mine.length >= count) return mine[count - 1];
        if (Date.now() > deadline) throw new Error(`no email number ${count} to ${to} within ${timeoutMs} ms`);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    },
    /** Every message to `to` so far. */
    to(address) {
      return sent.filter((message) => message.to === address);
    },
  };
}

/** The token in a confirm email's link, or null. */
export function tokenFrom(message) {
  return /#token=([A-Za-z0-9_-]{43})/.exec(message?.text ?? '')?.[1] ?? null;
}
