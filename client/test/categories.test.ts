import assert from "node:assert/strict";
import { test } from "node:test";

import { MAX_CATEGORIES, PROJECT_CATEGORIES, categoryLabel, toggleCategory } from "../app/_lib/categories.ts";

test("toggleCategory: the order of ticking is the order saved", () => {
  let selected: string[] = [];
  selected = toggleCategory(selected, "maintenance-and-support");
  selected = toggleCategory(selected, "software-development");

  assert.deepEqual(selected, ["maintenance-and-support", "software-development"]);
});

test("toggleCategory: unticking moves the rest up, so the next one becomes the main one", () => {
  assert.deepEqual(toggleCategory(["data-and-ai", "other-it", "software-licenses"], "data-and-ai"), ["other-it", "software-licenses"]);
});

test("toggleCategory: a tick past the limit changes nothing", () => {
  const full = ["data-and-ai", "other-it", "software-licenses"];
  assert.equal(full.length, MAX_CATEGORIES);
  assert.deepEqual(toggleCategory(full, "software-development"), full);
});

test("toggleCategory: changes a new list, never the one it was given", () => {
  const selected = ["data-and-ai"];
  toggleCategory(selected, "other-it");
  toggleCategory(selected, "data-and-ai");
  assert.deepEqual(selected, ["data-and-ai"]);
});

test("PROJECT_CATEGORIES: the same seven the server stores, each named in both languages", async () => {
  // A computed path, so the Docker build, which has only client/, doesn't try to
  // resolve it when it type-checks this file. The server's list imports nothing.
  const serverList = new URL("../../server/src/models/project-categories.js", import.meta.url).href;
  const server = await import(serverList);

  assert.deepEqual(PROJECT_CATEGORIES.map((category) => category.key), server.PROJECT_CATEGORIES);
  assert.equal(MAX_CATEGORIES, server.MAX_CATEGORIES);
  for (const category of PROJECT_CATEGORIES) {
    assert.ok(category.th);
    assert.ok(category.en);
  }
});

test("categoryLabel: names a category in the reader's language, and falls back to the key", () => {
  assert.equal(categoryLabel("software-development", "th"), "พัฒนาซอฟต์แวร์");
  assert.equal(categoryLabel("software-development", "en"), "Software development");
  assert.equal(categoryLabel("something-new", "th"), "something-new");
});
