import assert from "node:assert/strict";
import { test } from "node:test";

import type { TorChange } from "../app/_lib/api.ts";
import {
  changedFields,
  changedSinceSaved,
  changeHeading,
  changeWhen,
  describeRow,
  markerSource,
  pendingChange,
  pendingNotice,
} from "../app/_lib/changes.ts";

// Noon in Bangkok: the same day wherever the tests run
const day = (d: number) => `2026-10-${String(d).padStart(2, "0")}T05:00:00.000Z`;

const change = (fields: Partial<TorChange>): TorChange => ({
  source: "package",
  stage: "invitation",
  rereadPending: false,
  round: null,
  date: null,
  headline: null,
  detectedAt: day(25),
  previousCheckAt: null,
  zipId: "zip-2",
  previousZipId: "zip-1",
  diff: "complete",
  changes: [],
  ...fields,
});

const latest = (source: "feed" | "package") => ({ source, date: null, detectedAt: day(25), previousCheckAt: null, fields: [] });

test("the marker says where the latest change came from, and never repeats the badge", () => {
  assert.equal(markerSource({ latestChange: latest("feed") }, false), "feed");
  assert.equal(markerSource({ latestChange: latest("package") }, false), "package");
  assert.equal(markerSource({ latestChange: null, amendmentInfo: { isAmended: true } }, false), "feed", "amended before changes were recorded");
  assert.equal(markerSource({ latestChange: null, amendmentInfo: { isAmended: false } }, false), null);

  // The badge already says "เปลี่ยนแปลงประกาศเชิญชวน": an announced marker would repeat it, a found one wouldn't
  assert.equal(markerSource({ latestChange: latest("feed") }, true), null);
  assert.equal(markerSource({ latestChange: latest("package") }, true), "package");
});

test("a change is worded by the stage that changed, as text", () => {
  assert.equal(changeHeading("draft").th, "ร่าง TOR เปลี่ยน");
  assert.equal(changeHeading("invitation").th, "ประกาศเชิญชวนเปลี่ยน");
  assert.equal(changeHeading(null).th, "เอกสาร TOR เปลี่ยน", "a stage that couldn't be read");
});

test("when it changed: the notice's date, or between the two checks", () => {
  assert.equal(changeWhen(change({ source: "feed", date: day(6) }), "th"), "ประกาศเมื่อ 6 ต.ค. 2569");
  assert.equal(changeWhen(change({ previousCheckAt: day(20) }), "th"), "เปลี่ยนระหว่าง 20 ต.ค. 2569 ถึง 25 ต.ค. 2569");
  assert.equal(changeWhen(change({ previousCheckAt: day(20) }), "en"), "Changed between 20 Oct 2026 and 25 Oct 2026");
  assert.equal(changeWhen(change({ previousCheckAt: day(25) }), "th"), "พบเมื่อ 25 ต.ค. 2569", "both on one day");
  assert.equal(changeWhen(change({}), "th"), "พบเมื่อ 25 ต.ค. 2569", "no check before it");
  assert.equal(
    changeWhen(change({ previousCheckAt: day(20), date: day(22) }), "th"),
    "เปลี่ยนระหว่าง 20 ต.ค. 2569 ถึง 25 ต.ค. 2569 · เอกสารลงวันที่ 22 ต.ค. 2569",
  );
  assert.equal(changeWhen(change({ detectedAt: null }), "th"), null);
});

test("a row is said in the page's own words and units", () => {
  const row = (field: string, before: string | null, after: string | null) => ({
    kind: before === null ? ("added" as const) : after === null ? ("removed" as const) : ("changed" as const),
    field,
    before,
    after,
  });

  assert.deepEqual(describeRow(row("facts.referencePriceTHB", "3000000", "3100000"), "th"), {
    label: "ราคากลาง",
    text: "฿3,000,000 → ฿3,100,000",
  });
  assert.equal(describeRow(row("facts.submissionDeadline", day(20), day(27)), "th")?.text, "20 ต.ค. 2569 → 27 ต.ค. 2569");
  assert.equal(describeRow(row("facts.deliveryPeriodDays", null, "120"), "th")?.text, "ไม่ระบุ → 120 วัน");
  assert.equal(describeRow(row("facts.warrantyYears", "1", "2"), "en")?.text, "1 year → 2 years");
  assert.equal(describeRow(row("technicalRequirements.requiredTechnologies", null, "NGINX Plus"), "th")?.text, "เพิ่ม NGINX Plus");
  assert.equal(describeRow(row("technicalRequirements.requiredTechnologies", "Redis", null), "en")?.text, "Removed Redis");
  assert.deepEqual(describeRow(row("document", "a.zip", "b.zip"), "th"), { label: "เอกสาร TOR", text: "มีไฟล์ฉบับใหม่" }, "not the zip names");

  // Of the standard conditions, only the one the page shows
  assert.equal(describeRow(row("eligibility.standardConditions", null, "juristic-person"), "th")?.text, "เพิ่มเงื่อนไข เฉพาะนิติบุคคล");
  assert.equal(describeRow(row("eligibility.standardConditions", null, "not-bankrupt"), "th"), null);
  assert.equal(describeRow(row("facts.somethingNew", "1", "2"), "th"), null, "a field the page doesn't know");
});

test("the changed fields, named once, for a short line", () => {
  assert.equal(
    changedFields(["facts.referencePriceTHB", "facts.submissionDeadline", "eligibility.standardConditions", "facts.unknown"], "th"),
    "ราคากลาง, วันยื่นข้อเสนอ",
  );
  assert.equal(changedFields([], "th"), "");
});

test("the banner follows the latest change the summary predates", () => {
  const read = change({ rereadPending: false });
  const fileChanged = change({ rereadPending: true, zipId: "zip-3" });
  const announced = change({ source: "feed", rereadPending: true, zipId: null });

  assert.equal(pendingChange([read]), null);
  assert.equal(pendingChange([read, fileChanged]), fileChanged);
  assert.equal(pendingChange([fileChanged, announced]), announced);

  assert.equal(pendingNotice(fileChanged).title.th, "ประกาศเชิญชวนเปลี่ยน · สรุปด้านล่างมาจากฉบับก่อนหน้า");
  assert.match(pendingNotice(fileChanged).body.th, /แสดงตามประกาศล่าสุดแล้ว$/, "the package came: its facts already show");
  assert.match(pendingNotice(announced).body.th, /ยังไม่ได้ดาวน์โหลด/, "no package yet: nothing new shows");
});

test("changed since you saved: found after the reader saved it", () => {
  assert.equal(changedSinceSaved({ lastChangeAt: day(25), savedAt: day(20) }), true);
  assert.equal(changedSinceSaved({ lastChangeAt: day(20), savedAt: day(25) }), false);
  assert.equal(changedSinceSaved({ lastChangeAt: null, savedAt: day(25) }), false);
  assert.equal(changedSinceSaved({ lastChangeAt: day(25) }), false);
});
