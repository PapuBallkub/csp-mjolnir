import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BREAKPOINT_TECH_BUDGET,
  DEFAULT_STATUSES,
  STATUSES,
  getVisibleTechnologies,
  prioritizeMatchedTech,
  prioritizeMatchedTechObjects,
  showsEveryStatus,
  statusChanges,
} from "../app/_lib/catalog.ts";

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

test("prioritizeMatchedTech: moves matching skills to the front", () => {
  const techs = ["Windows Server 2022", "Linux", "Oracle", "Docker", "Node.js"];
  const prioritized = prioritizeMatchedTech(techs, ["Docker", "Linux"]);
  assert.deepEqual(prioritized.slice(0, 2), ["Linux", "Docker"]);
  assert.ok(prioritized.includes("Windows Server 2022"));
  assert.ok(prioritized.includes("Oracle"));
  assert.ok(prioritized.includes("Node.js"));
});

test("prioritizeMatchedTech: preserves order if no matched skills or undefined", () => {
  const techs = ["Vue", "React", "Angular"];
  assert.deepEqual(prioritizeMatchedTech(techs, undefined), techs);
  assert.deepEqual(prioritizeMatchedTech(techs, []), techs);
  assert.deepEqual(prioritizeMatchedTech(techs, ["Python"]), techs);
});

test("prioritizeMatchedTechObjects: moves matching technology objects to the front", () => {
  const techObjs = [
    { name: "Windows Server 2022", version: "2022" },
    { name: "PostgreSQL", version: "15" },
    { name: "Docker" },
  ];
  const sorted = prioritizeMatchedTechObjects(techObjs, ["Docker"]);
  assert.equal(sorted[0].name, "Docker");
  assert.equal(sorted[1].name, "Windows Server 2022");
  assert.equal(sorted[2].name, "PostgreSQL");
});

test("getVisibleTechnologies: fits short tech names cleanly without unnecessary truncation", () => {
  const shortTechs = ["Linux", "PostgreSQL 15", "Docker", "Node.js"];
  const res = getVisibleTechnologies(shortTechs);
  assert.deepEqual(res.visibleTech, ["Linux", "PostgreSQL 15", "Docker", "Node.js"]);
  assert.equal(res.restTech, 0);
});

test("getVisibleTechnologies: budgets characters for very long names to avoid layout clipping", () => {
  const veryLongTechs = [
    "Microsoft Windows Server 2022 Datacenter Edition",
    "Oracle Database Enterprise Edition 19c",
    "Red Hat Enterprise Linux Server 9.2",
    "VMware vSphere Enterprise Plus 8.0",
  ];
  const res = getVisibleTechnologies(veryLongTechs);
  assert.equal(res.visibleTech.length, 2);
  assert.equal(res.restTech, 2);
});

test("getVisibleTechnologies: avoids lone +1 badge when final item fits comfortably", () => {
  const techs = ["Go", "Git", "PHP", "SQL", "CSS", "HTML", "Bash"];
  const res = getVisibleTechnologies(techs);
  // 7 short items easily fit within maxChars + 15 allowance rather than showing 6 items + '+1'
  assert.equal(res.visibleTech.length, 7);
  assert.equal(res.restTech, 0);
});

test("getVisibleTechnologies: caps and reports restTech when items exceed capacity", () => {
  const manyTechs = [
    "Tech A",
    "Tech B",
    "Tech C",
    "Tech D",
    "Tech E",
    "Tech F",
    "Tech G",
    "Tech H",
    "Tech I",
  ];
  const res = getVisibleTechnologies(manyTechs);
  assert.equal(res.visibleTech.length, 6);
  assert.equal(res.restTech, 3);
});

test("getVisibleTechnologies: adapts budget dynamically for mobile breakpoint", () => {
  assert.deepEqual(BREAKPOINT_TECH_BUDGET.mobile, { maxChars: 36, maxCount: 2 });
  const techs = ["Windows Server 2022", "Linux", "PostgreSQL 15", "Docker"];
  const res = getVisibleTechnologies(techs, "mobile");
  assert.equal(res.visibleTech.length, 2);
  assert.equal(res.restTech, 2);
});

test("getVisibleTechnologies: adapts budget dynamically for tablet breakpoint", () => {
  assert.deepEqual(BREAKPOINT_TECH_BUDGET.tablet, { maxChars: 56, maxCount: 4 });
  const techs = ["Linux", "Docker", "Node.js", "PostgreSQL", "React", "Next.js"];
  const res = getVisibleTechnologies(techs, "tablet");
  assert.equal(res.visibleTech.length, 4);
  assert.equal(res.restTech, 2);
});
