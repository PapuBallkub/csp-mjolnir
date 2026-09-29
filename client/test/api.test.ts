// Drives the real request() by swapping global fetch, so what is under test is
// the actual path every call in the app takes — including the parts that are
// easy to get wrong once and never notice: credentials, the content-type rule,
// 204 with no body, and a failure that never produced a response at all.

import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { login, logout, me } from "../app/_lib/api.ts";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

type Call = { url: string; init: RequestInit };

/** Replaces fetch with one that answers `response` and records what it was given. */
function stubFetch(response: Response | (() => never)): Call[] {
  const calls: Call[] = [];

  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    if (typeof response === "function") response();
    return response;
  }) as typeof fetch;

  return calls;
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("a validation error keeps its per-field details", async () => {
  stubFetch(
    json(400, {
      error: {
        message: "Check the details you entered.",
        details: { email: "That does not look like an email address." },
      },
    }),
  );

  const result = await login({ email: "nope", password: "correct horse battery" });

  assert.equal(result.ok, false);
  if (result.ok) return;

  assert.equal(result.error.status, 400);
  assert.equal(result.error.details?.email, "That does not look like an email address.");
});

test("an error without details does not invent any", async () => {
  stubFetch(json(401, { error: { message: "Invalid email or password." } }));

  const result = await login({ email: "a@b.com", password: "correct horse battery" });

  assert.equal(result.ok, false);
  if (result.ok) return;

  assert.equal(result.error.message, "Invalid email or password.");
  assert.equal(result.error.details, undefined);
});

test("a 429 arrives as prose, since CORS hides the Retry-After header", async () => {
  stubFetch(json(429, { error: { message: "Too many attempts. Try again in 15 minutes." } }));

  const result = await login({ email: "a@b.com", password: "correct horse battery" });

  assert.equal(result.ok, false);
  if (result.ok) return;

  assert.match(result.error.message, /15 minutes/);
});

test("a non-JSON error body still yields a usable message", async () => {
  // What a proxy in front of the API returns when it gives up.
  stubFetch(new Response("<html>502 Bad Gateway</html>", { status: 502 }));

  const result = await me();

  assert.equal(result.ok, false);
  if (result.ok) return;

  assert.equal(result.error.status, 502);
  assert.match(result.error.message, /502/);
});

test("a server that cannot be reached becomes status 0, not a thrown error", async () => {
  stubFetch(() => {
    // Exactly what fetch does for a dead server or a refused CORS preflight.
    throw new TypeError("Failed to fetch");
  });

  const result = await me();

  assert.equal(result.ok, false);
  if (result.ok) return;

  assert.equal(result.error.status, 0);
  assert.match(result.error.message, /Cannot reach the server/);
});

test("logout tolerates a 204 with no body", async () => {
  stubFetch(new Response(null, { status: 204 }));

  const result = await logout();

  // Calling .json() on a 204 throws, so this passing is the whole point.
  assert.equal(result.ok, true);
});

test("every request sends credentials, and only a request with a body sends content-type", async () => {
  const posts = stubFetch(json(200, { user: {} }));
  await login({ email: "a@b.com", password: "correct horse battery" });

  assert.equal(posts[0].init.credentials, "include", "without this the cookie never goes");
  assert.equal(
    (posts[0].init.headers as Record<string, string>)["content-type"],
    "application/json",
  );

  const gets = stubFetch(json(200, { user: {} }));
  await me();

  assert.equal(gets[0].init.credentials, "include");
  assert.equal(
    (gets[0].init.headers as Record<string, string>)["content-type"],
    undefined,
    "a content-type on a GET forces a CORS preflight for nothing",
  );
  assert.equal(gets[0].init.cache, "no-store", "a cached /me outlives logout");
});

test("paths carry the /api prefix themselves, so the base stays a bare origin", async () => {
  const calls = stubFetch(json(200, { user: {} }));
  await me();

  assert.match(calls[0].url, /\/api\/auth\/me$/);
});
