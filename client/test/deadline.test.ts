import assert from "node:assert/strict";
import { test } from "node:test";
import { countdownText, daysLeft, formatThaiDate } from "../app/_lib/deadline.ts";

test("daysLeft: calculates calendar day delta in Bangkok timezone (UTC+7)", () => {
  // 2026-11-10 10:00:00 UTC = 17:00:00 Bangkok
  const now = new Date("2026-11-10T10:00:00Z");

  // Due on the exact same Bangkok calendar day
  assert.equal(daysLeft("2026-11-10T02:00:00Z", now), 0);

  // Due tomorrow in Bangkok time
  assert.equal(daysLeft("2026-11-11T02:00:00Z", now), 1);

  // Due in 5 days
  assert.equal(daysLeft("2026-11-15T12:00:00Z", now), 5);

  // Overdue / past deadline
  assert.equal(daysLeft("2026-11-09T00:00:00Z", now), -1);
});

test("countdownText: assigns correct urgency tone and localized copy", () => {
  // Overdue
  const past = countdownText(-2, "th");
  assert.equal(past.text, "ปิดรับแล้ว");
  assert.ok(past.tone.includes("text-ink-3"));

  // Due today (risk)
  const today = countdownText(0, "th");
  assert.equal(today.text, "ครบกำหนดวันนี้");
  assert.ok(today.tone.includes("text-risk"));

  // 1 day left (risk)
  const oneDay = countdownText(1, "th");
  assert.equal(oneDay.text, "เหลืออีก 1 วัน");
  assert.ok(oneDay.tone.includes("text-risk"));

  // 2 days left (risk boundary)
  const twoDays = countdownText(2, "th");
  assert.equal(twoDays.text, "เหลืออีก 2 วัน");
  assert.ok(twoDays.tone.includes("text-risk"));

  // 5 days left (amend / warning tone)
  const fiveDays = countdownText(5, "th");
  assert.equal(fiveDays.text, "เหลืออีก 5 วัน");
  assert.ok(fiveDays.tone.includes("text-amend"));

  // 15 days left (normal / ink tone)
  const normal = countdownText(15, "th");
  assert.equal(normal.text, "เหลืออีก 15 วัน");
  assert.ok(normal.tone.includes("text-ink"));

  // English localization
  const todayEn = countdownText(0, "en");
  assert.equal(todayEn.text, "Due today");
  const pastEn = countdownText(-1, "en");
  assert.equal(pastEn.text, "Closed");
});

test("formatThaiDate: formats date with Thai Buddhist year", () => {
  // 2026-11-20 -> พ.ศ. 2569
  const formatted = formatThaiDate("2026-11-20T09:00:00Z", "th");
  assert.ok(formatted.includes("2569"));
  assert.ok(formatted.includes("พ.ย."));
});

test("daysLeft: safely defaults now to current date when omitted or undefined", () => {
  // Should not throw TypeError: Cannot read properties of undefined (reading 'getTime')
  const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
  const days = daysLeft(future);
  assert.ok(days >= 4 && days <= 6);
});


