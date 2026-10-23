import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_STATUSES, STATUSES, showsEveryStatus, statusChanges } from "../app/_lib/catalog.ts";

test("the catalog starts with what can still be bid on: drafts and open invitations", () => {
  assert.deepEqual(DEFAULT_STATUSES, ["Draft", "Open"]);
  assert.ok(DEFAULT_STATUSES.every((status) => STATUSES.includes(status)));
});

test("only a status set away from the default counts as a filter", () => {
  assert.equal(statusChanges(["Draft", "Open"]), 0, "where the catalog starts");
  assert.equal(statusChanges(["Open", "Draft"]), 0, "in any order");
  assert.equal(statusChanges(["Open"]), 1, "drafts left out");
  assert.equal(statusChanges(["Draft", "Open", "Awarded"]), 1, "past projects ticked too");
  assert.equal(statusChanges(["Awarded"]), 3);
  assert.equal(statusChanges(STATUSES), 3, "every status: three more than the default");
});

test("no status ticked shows every status, the same as all of them ticked", () => {
  assert.equal(showsEveryStatus([]), true);
  assert.equal(showsEveryStatus(STATUSES), true);
  assert.equal(showsEveryStatus(DEFAULT_STATUSES), false);
});
