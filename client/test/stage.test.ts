import assert from "node:assert/strict";
import { test } from "node:test";

import { STATUS_GROUPS, announcementLabel, deadlineOf, stageOf } from "../app/_lib/stage.ts";

const announced = (code: "15" | "B0" | "D0" | "D2" | "D1" | "W0" | "W2" | "W1") => ({ code, publishedAt: "2026-10-07" });

test("the badge names e-GP's stage, not just the status", () => {
  assert.equal(stageOf({ status: "Draft", latestAnnouncement: announced("B0") }).label.th, "ร่าง TOR · รับฟังความเห็น");
  assert.equal(stageOf({ status: "Open", latestAnnouncement: announced("D0") }).label.th, "เปิดรับข้อเสนอ");
  assert.equal(stageOf({ status: "Cancelled", latestAnnouncement: announced("D1") }).label.th, "ยกเลิกประกาศเชิญชวน");
  assert.equal(stageOf({ status: "Cancelled", latestAnnouncement: announced("W1") }).label.th, "ยกเลิกประกาศผู้ชนะ");
  assert.equal(stageOf({ status: "Awarded", latestAnnouncement: announced("W2") }).label.th, "เปลี่ยนแปลงผู้ชนะ");
});

test("a changed invitation says so in the badge, so the Amended flag isn't repeated", () => {
  const stage = stageOf({ status: "Open", latestAnnouncement: announced("D2") });
  assert.equal(stage.label.th, "เปลี่ยนแปลงประกาศเชิญชวน");
  assert.equal(stage.saysChanged, true);
  assert.equal(stageOf({ status: "Open", latestAnnouncement: announced("D0") }).saysChanged, false);
});

test("a signed contract is the last word, and Closed says it is inferred", () => {
  assert.equal(stageOf({ status: "Awarded", latestAnnouncement: announced("W0"), contractSigned: true }).label.th, "ลงนามสัญญาแล้ว");

  const closed = stageOf({ status: "Closed", latestAnnouncement: announced("D0") });
  assert.equal(closed.label.th, "ปิดรับข้อเสนอแล้ว");
  assert.match(closed.hint?.th ?? "", /ประเมินจากวันปิดรับ/);
});

test("words never contradict the colour: a stage that disagrees with the status falls back to it", () => {
  // The status (which sets the colour) says Awarded; a stale D0 must not say "open"
  assert.equal(stageOf({ status: "Awarded", latestAnnouncement: announced("D0") }).label.th, "ประกาศผู้ชนะแล้ว");
  // Not announced by the feed at all: the status alone
  assert.equal(stageOf({ status: "Open", latestAnnouncement: null }).label.th, "เปิดรับข้อเสนอ");
  // A reference price fits any status
  assert.equal(stageOf({ status: "Open", latestAnnouncement: announced("15") }).label.th, "ประกาศราคากลาง");
});

test("a draft's deadline is for comments; everything else is for bids", () => {
  const draft = deadlineOf("Draft", { submissionDeadline: null, commentDeadline: "2026-10-20" });
  assert.deepEqual([draft.kind, draft.date, draft.label.th], ["comment", "2026-10-20", "ส่งความเห็นร่าง TOR ภายใน"]);

  const open = deadlineOf("Open", { submissionDeadline: "2026-10-25", commentDeadline: null });
  assert.deepEqual([open.kind, open.date, open.label.th], ["submission", "2026-10-25", "ยื่นข้อเสนอภายใน"]);
});

test("a deadline the TOR doesn't state is said to be missing, never guessed", () => {
  // A draft's bid date is not its deadline, even when one is there
  assert.equal(deadlineOf("Draft", { submissionDeadline: "2026-10-25" }).date, null);
  assert.equal(deadlineOf("Draft", { submissionDeadline: null }).missing.th, "TOR ไม่ระบุวันรับฟังความเห็น");
  assert.equal(deadlineOf("Open", { submissionDeadline: null }).missing.th, "TOR ไม่ระบุวันยื่นข้อเสนอ");
});

test("an announcement keeps its own name, whatever the badge says", () => {
  assert.equal(announcementLabel("D0").th, "เปิดรับข้อเสนอ");
  assert.equal(announcementLabel("W1").en, "Winner announcement cancelled");
});

test("every badge a card can show is findable under its status filter", () => {
  // Each status, with every way a card in it can be labelled
  const cards = {
    Draft: [stageOf({ status: "Draft", latestAnnouncement: announced("B0") }), stageOf({ status: "Draft" })],
    Open: [
      stageOf({ status: "Open", latestAnnouncement: announced("D0") }),
      stageOf({ status: "Open", latestAnnouncement: announced("D2") }),
    ],
    Closed: [stageOf({ status: "Closed", latestAnnouncement: announced("D0") })],
    Awarded: [
      stageOf({ status: "Awarded", latestAnnouncement: announced("W0") }),
      stageOf({ status: "Awarded", latestAnnouncement: announced("W2") }),
      stageOf({ status: "Awarded", contractSigned: true }),
    ],
    Cancelled: [
      stageOf({ status: "Cancelled", latestAnnouncement: announced("D1") }),
      stageOf({ status: "Cancelled", latestAnnouncement: announced("W1") }),
    ],
  } as const;

  for (const [status, stages] of Object.entries(cards)) {
    const group = STATUS_GROUPS[status as keyof typeof STATUS_GROUPS];
    for (const lang of ["th", "en"] as const) {
      // The group's name and its bullets, each a badge's exact words
      const shown = [group.label, ...(group.members ?? [])].map((words) => words[lang]);
      for (const stage of stages) {
        assert.ok(shown.includes(stage.label[lang]), `${status}: "${stage.label[lang]}" missing from its filter`);
      }
    }
  }
});
