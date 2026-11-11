import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatDate,
  formatTHB,
  formatTHBCompact,
  getEgpAnnouncementUrl,
  getFiscalYear,
} from "../app/_lib/format.ts";

test("getFiscalYear: calculates Thai Buddhist fiscal year correctly (Oct 1 start)", () => {
  // Before October (e.g. August 2026) -> FY 2569 (2026 + 543)
  assert.equal(getFiscalYear("2026-08-15T00:00:00Z"), 2569);

  // September 30 2026 (local daytime) -> FY 2569
  assert.equal(getFiscalYear("2026-09-30T10:00:00+07:00"), 2569);

  // October 1 2026 -> FY 2570 (next fiscal year: 2027 + 543)
  assert.equal(getFiscalYear("2026-10-01T00:00:00Z"), 2570);

  // December 2026 -> FY 2570
  assert.equal(getFiscalYear("2026-12-25T00:00:00Z"), 2570);

  // Fallback to projectId prefix when date is missing
  assert.equal(getFiscalYear(null, "68049322058"), 2568);
  assert.equal(getFiscalYear(null, "69109062251"), 2569);
  assert.equal(getFiscalYear(null, "invalid"), null);
});

test("formatTHB: formats currency with Thai Baht sign and comma separators", () => {
  assert.equal(formatTHB(1_796_185), "฿1,796,185");
  assert.equal(formatTHB(36_000_000), "฿36,000,000");
  assert.equal(formatTHB(null), "ไม่ระบุงบประมาณ");
  assert.equal(formatTHB(undefined), "ไม่ระบุงบประมาณ");
});

test("formatTHBCompact: compact notation for millions and thousands", () => {
  assert.equal(formatTHBCompact(1_796_185), "฿1.8M");
  assert.equal(formatTHBCompact(2_000_000), "฿2M");
  assert.equal(formatTHBCompact(450_000), "฿450K");
  assert.equal(formatTHBCompact(500), "฿500");
  assert.equal(formatTHBCompact(null), "—");
});

test("formatDate: localizes dates into Thai Buddhist format", () => {
  const dateStr = formatDate("2026-11-20T00:00:00Z", "th");
  assert.ok(dateStr.includes("20"));
  assert.ok(dateStr.includes("พ.ย."));
  assert.ok(dateStr.includes("2569"));

  const dateEn = formatDate("2026-11-20T00:00:00Z", "en");
  assert.ok(dateEn.includes("20"));
  assert.ok(dateEn.includes("Nov"));
  assert.ok(dateEn.includes("2026"));
});

test("getEgpAnnouncementUrl: generates search URL on process5", () => {
  const url = getEgpAnnouncementUrl("68049322058");
  assert.ok(url.startsWith("https://process5.gprocurement.go.th/"));
  assert.ok(url.includes("68049322058"));
});
