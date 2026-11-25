import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computeAverage,
  computeMedian,
  formatMonthBucket,
  generateMonthRange,
  inferArchetypeFromCategory,
  mapApiTorToWatchdog,
  normalizeArchetype,
  normalizeCategory,
  normalizeComplexity,
} from "../app/(app)/watchdog/_lib/watchdog-helpers.ts";
import { calcPriceDeltaPct, type WatchdogProjectRecord } from "../app/_data/watchdog.ts";
import type { TorInsightSummary } from "../app/_lib/api.ts";

test("computeMedian: computes median accurately for odd, even, unsorted and empty lists", () => {
  assert.equal(computeMedian([]), 0);
  assert.equal(computeMedian([42]), 42);
  assert.equal(computeMedian([10, 30, 20]), 20);
  assert.equal(computeMedian([10, 40, 20, 30]), 25);
  assert.equal(computeMedian([100, 50, 10, 80]), 65);
});

test("computeAverage: computes rounded average and handles empty lists", () => {
  assert.equal(computeAverage([]), 0);
  assert.equal(computeAverage([10]), 10);
  assert.equal(computeAverage([10, 20, 30]), 20);
  assert.equal(computeAverage([10, 21]), 16); // 15.5 rounded to 16
});

test("formatMonthBucket: computes Thai BE and fiscal quarters correctly", () => {
  // October 2026 -> Thai FY 2570 Q1
  const oct2026 = formatMonthBucket("2026-10");
  assert.equal(oct2026.key, "2026-10");
  assert.equal(oct2026.labelTh, "ต.ค. 69");
  assert.equal(oct2026.quarter, "Q1/70");

  // January 2026 -> Thai FY 2569 Q2
  const jan2026 = formatMonthBucket("2026-01");
  assert.equal(jan2026.labelTh, "ม.ค. 69");
  assert.equal(jan2026.quarter, "Q2/69");

  // May 2026 -> Thai FY 2569 Q3
  const may2026 = formatMonthBucket("2026-05");
  assert.equal(may2026.quarter, "Q3/69");

  // August 2026 -> Thai FY 2569 Q4
  const aug2026 = formatMonthBucket("2026-08");
  assert.equal(aug2026.quarter, "Q4/69");
});

test("generateMonthRange: generates sequential month buckets inclusive and handles edge cases", () => {
  const range = generateMonthRange("2026-01", "2026-04");
  assert.equal(range.length, 4);
  assert.deepEqual(
    range.map((r) => r.key),
    ["2026-01", "2026-02", "2026-03", "2026-04"],
  );

  // Cross year
  const crossYear = generateMonthRange("2025-11", "2026-02");
  assert.equal(crossYear.length, 4);
  assert.deepEqual(
    crossYear.map((r) => r.key),
    ["2025-11", "2025-12", "2026-01", "2026-02"],
  );

  // Invalid: start after end
  assert.deepEqual(generateMonthRange("2026-05", "2026-02"), []);

  // Empty / missing inputs
  assert.deepEqual(generateMonthRange("", "2026-02"), []);
  assert.deepEqual(generateMonthRange("2026-02", ""), []);
});

test("normalizeCategory: returns valid category or defaults to software-development", () => {
  assert.equal(normalizeCategory("data-and-ai"), "data-and-ai");
  assert.equal(normalizeCategory("network-and-security"), "network-and-security");
  assert.equal(normalizeCategory("unknown-cat"), "software-development");
  assert.equal(normalizeCategory(null), "software-development");
  assert.equal(normalizeCategory(undefined), "software-development");
});

test("inferArchetypeFromCategory and normalizeArchetype: handles fallback resolution", () => {
  assert.equal(inferArchetypeFromCategory("data-and-ai"), "data-analytics");
  assert.equal(inferArchetypeFromCategory("network-and-security"), "cybersecurity");
  assert.equal(inferArchetypeFromCategory("systems-integration"), "enterprise-erp");

  assert.equal(normalizeArchetype("mobile-app", "software-development"), "mobile-app");
  // Falls back to inferArchetypeFromCategory when raw archetype is missing or unrecognized
  assert.equal(normalizeArchetype(null, "data-and-ai"), "data-analytics");
  assert.equal(normalizeArchetype("invalid-arch", "network-and-security"), "cybersecurity");
});

test("normalizeComplexity: respects tier or infers from reference price", () => {
  assert.equal(normalizeComplexity("enterprise", 1_000_000), "enterprise");
  assert.equal(normalizeComplexity("basic", 50_000_000), "basic");

  // Inferred from price when tier is null
  assert.equal(normalizeComplexity(null, 25_000_000), "enterprise");
  assert.equal(normalizeComplexity(null, 5_000_000), "standard");
  assert.equal(normalizeComplexity(null, 1_000_000), "basic");
});

test("mapApiTorToWatchdog: gracefully handles missing peerMedianTHB without inventing fake 0% delta", () => {
  const mockTorWithoutPeerMedian = {
    projectId: "PRJ-001",
    identification: {
      titleTh: "โครงการพัฒนาระบบคลังข้อมูล",
      titleEn: "Data Warehouse Project",
      agency: "สำนักงานส่งเสริมเศรษฐกิจดิจิทัล",
      department: null,
      categories: ["data-and-ai"],
      status: "Open",
    },
    facts: {
      budgetTHB: 12_000_000,
      referencePriceTHB: 10_000_000,
      agreedPriceTHB: null,
      submissionDeadline: null,
      procurementMethod: null,
      penaltyClause: null,
      postedDate: "2026-03-15T00:00:00Z",
      webUrl: null,
    },
    overview: {
      systemArchetype: "data-analytics",
      complexityTier: "standard",
    },
    analytics: {
      lockSpec: {
        riskScore: 25,
        verdictText: "ความเสี่ยงต่ำ",
        findings: [],
      },
      priceAnalysis: {
        diffPercentage: 0,
        historicalMedianTHB: null, // Missing historical data!
        historicalAverageTHB: null,
        sampleSize: 2,
        reliability: "low",
      },
    },
  } as unknown as TorInsightSummary;

  const record = mapApiTorToWatchdog(mockTorWithoutPeerMedian);
  assert.ok(record, "record should not be null");
  assert.equal(record.id, "PRJ-001");
  assert.equal(record.referencePriceTHB, 10_000_000);
  assert.equal(record.peerMedianTHB, undefined, "peerMedianTHB must be undefined when missing from API");
  assert.equal(record.peerAverageTHB, undefined, "peerAverageTHB must be undefined when missing from API");

  // calcPriceDeltaPct must return null when peerMedianTHB is undefined
  const delta = calcPriceDeltaPct(record);
  assert.equal(delta, null, "delta must be null when there is no peer median");
});

test("mapApiTorToWatchdog: correctly parses and maps populated peer comparison metrics", () => {
  const mockTorWithPeerMedian = {
    projectId: "PRJ-002",
    identification: {
      titleTh: "โครงการจัดหาอุปกรณ์เครือข่าย",
      titleEn: "Network Equipment Project",
      agency: "กรมการสื่อสาร",
      department: null,
      categories: ["network-and-security"],
      status: "Awarded",
    },
    facts: {
      budgetTHB: 15_000_000,
      referencePriceTHB: 12_000_000,
      agreedPriceTHB: 11_500_000,
      submissionDeadline: null,
      procurementMethod: null,
      penaltyClause: null,
      postedDate: "2026-04-10T00:00:00Z",
      webUrl: null,
    },
    overview: {
      systemArchetype: "cybersecurity",
      complexityTier: "standard",
    },
    analytics: {
      lockSpec: {
        riskScore: 75,
        verdictText: "พบเงื่อนไขล็อกสเปกหลายรายการ",
        findings: [
          {
            title: "ระบุยี่ห้อและรุ่นจำเพาะ",
            category: "Specification Tailoring",
            sourceExcerpt: "ข้อ 4.2 ระบุสเปกเฉพาะ Cisco Catalyst 9300",
          },
        ],
      },
      priceAnalysis: {
        diffPercentage: 20.0,
        historicalMedianTHB: 10_000_000,
        historicalAverageTHB: 10_500_000,
        sampleSize: 15,
        reliability: "sufficient",
      },
    },
  } as unknown as TorInsightSummary;

  const record = mapApiTorToWatchdog(mockTorWithPeerMedian);
  assert.ok(record, "record should not be null");
  assert.equal(record.peerMedianTHB, 10_000_000);
  assert.equal(record.peerAverageTHB, 10_500_000);
  assert.equal(record.lockSpecLevel, "high");
  assert.equal(record.triggers.length, 1);
  assert.equal(record.triggers[0].category, "Specification Tailoring");

  const delta = calcPriceDeltaPct(record);
  // (12,000,000 - 10,000,000) / 10,000,000 * 100 = +20.0%
  assert.equal(delta, 20.0);
});

test("calcPriceDeltaPct: returns null for 0 or negative peer medians", () => {
  const dummy: WatchdogProjectRecord = {
    id: "dummy",
    egpRef: "dummy",
    title: "dummy",
    agency: "dummy",
    category: "software-development",
    archetype: "web-portal",
    complexity: "basic",
    month: "2026-01",
    postedAt: "2026-01-01",
    status: "Open",
    referencePriceTHB: 5_000_000,
    lockSpecScore: 0,
    lockSpecLevel: "low",
    triggers: [],
  };

  assert.equal(calcPriceDeltaPct({ ...dummy, peerMedianTHB: undefined }), null);
  assert.equal(calcPriceDeltaPct({ ...dummy, peerMedianTHB: 0 }), null);
  assert.equal(calcPriceDeltaPct({ ...dummy, peerMedianTHB: 5_000_000 }), 0.0);
  assert.equal(calcPriceDeltaPct({ ...dummy, referencePriceTHB: 6_000_000, peerMedianTHB: 5_000_000 }), 20.0);
  assert.equal(calcPriceDeltaPct({ ...dummy, referencePriceTHB: 4_000_000, peerMedianTHB: 5_000_000 }), -20.0);
});

test("mapApiTorToWatchdog: marks null lockSpec as unanalyzed instead of low risk (0)", () => {
  const unanalyzedTor = {
    projectId: "PRJ-003",
    identification: {
      titleTh: "โครงการยังไม่ได้วิเคราะห์ล็อกสเปก",
      titleEn: null,
      agency: "กรมทดสอบ",
      department: null,
      categories: ["software-development"],
      status: "Draft",
    },
    facts: {
      budgetTHB: 3_000_000,
      referencePriceTHB: 3_000_000,
      agreedPriceTHB: null,
      submissionDeadline: null,
      procurementMethod: null,
      penaltyClause: null,
      postedDate: "2026-10-27T00:00:00Z",
      webUrl: null,
    },
    overview: {
      systemArchetype: "other",
      complexityTier: "standard",
    },
    analytics: {
      lockSpec: null,
      priceAnalysis: null,
    },
  } as unknown as TorInsightSummary;

  const record = mapApiTorToWatchdog(unanalyzedTor);
  assert.ok(record);
  assert.equal(record.lockSpecAnalyzed, false);
  assert.equal(record.lockSpecScore, null);
  assert.equal(record.lockSpecLevel, "unanalyzed");
  assert.deepEqual(record.triggers, []);
});
