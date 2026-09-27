// Node 24 strips TypeScript types natively, so these run with no Vitest, no
// jsdom and no config file — which is the only reason the client can have
// tests at all without going from three dependencies to seven. Keep anything
// tested here free of JSX and of path aliases, neither of which type-stripping
// resolves.

import assert from "node:assert/strict";
import { test } from "node:test";

import { safeNext } from "../app/_lib/safe-next.ts";

test("a path on this site is returned unchanged", () => {
  assert.equal(safeNext("/watchlist"), "/watchlist");
  assert.equal(safeNext("/tor/BMA-2569-0142"), "/tor/BMA-2569-0142");
  assert.equal(safeNext("/search?mode=match"), "/search?mode=match");
});

test("an absolute URL is refused", () => {
  assert.equal(safeNext("https://evil.com"), null);
  assert.equal(safeNext("http://evil.com"), null);
  assert.equal(safeNext("javascript:alert(1)"), null);
});

test("a protocol-relative URL is refused, backslashes included", () => {
  // The whole reason this function exists: every one of these navigates
  // off-site while looking like a path. The backslash is written by code
  // point so that the escaping in this file is never the thing under test —
  // getting that wrong once already turned this case into a check that
  // "/evil.com", a perfectly ordinary path, was allowed.
  const bs = String.fromCharCode(92);

  assert.equal(safeNext("//evil.com"), null);
  assert.equal(safeNext("//evil.com/watchlist"), null);
  assert.equal(safeNext(`/${bs}evil.com`), null);
  assert.equal(safeNext(`${bs}${bs}evil.com`), null);

  // ...while a single leading slash followed by an ordinary name stays valid.
  assert.equal(safeNext("/evil.com"), "/evil.com");
});

test("a relative path is refused, since it resolves against the current page", () => {
  assert.equal(safeNext("watchlist"), null);
  assert.equal(safeNext("../admin"), null);
});

test("control characters are refused", () => {
  assert.equal(safeNext("/watchlist\nLocation: https://evil.com"), null);
  assert.equal(safeNext("/watch\u0000list"), null);
});

test("anything that is not a non-empty string is refused", () => {
  assert.equal(safeNext(""), null);
  assert.equal(safeNext(undefined), null);
  assert.equal(safeNext(null), null);
  // Next hands back an array when the parameter appears twice.
  assert.equal(safeNext(["/watchlist", "/admin"]), null);
});
