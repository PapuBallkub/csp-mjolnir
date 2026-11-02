import assert from "node:assert/strict";
import { test } from "node:test";

import type { Profile } from "../app/_data/tors.ts";
import type { TorInsightSummary } from "../app/_lib/api.ts";
import { matchFor } from "../app/_lib/match.ts";

function createMockTor(overrides: Partial<TorInsightSummary> = {}): TorInsightSummary {
  return {
    projectId: "TOR-TEST-001",
    identification: {
      titleTh: "โครงการพัฒนาระบบพอร์ทัลบริการประชาชน",
      titleEn: "Citizen Service Portal Development Project",
      agency: "สำนักงานพัฒนารัฐบาลดิจิทัล (องค์การมหาชน)",
      department: null,
      category: "Software Development",
      status: "Open",
    },
    facts: {
      budgetTHB: 2_000_000,
      referencePriceTHB: 2_000_000,
      submissionDeadline: "2026-12-31T09:00:00Z",
      procurementMethod: "e-bidding",
      penaltyClause: "0.20%/day",
      postedDate: "2026-10-01T00:00:00Z",
      webUrl: "https://example.go.th",
    },
    overview: {
      systemArchetype: "web-portal",
      objective: "พัฒนาพอร์ทัลกลาง",
    },
    technicalRequirements: {
      requiredTechnologies: [
        { name: "Next.js", version: "15" },
        { name: "React", version: "19" },
        { name: "Node.js", version: "22" },
        { name: "PostgreSQL", version: "16" },
      ],
    },
    eligibility: {
      requiredCertifications: ["ISO/IEC 29110"],
      previousExperienceMinTHB: 800_000,
    },
    analytics: {
      lockSpec: null,
      priceAnalysis: null,
    },
    companiesOnly: true,
    contractSigned: false,
    latestAnnouncement: {
      code: "D0",
      publishedAt: "2026-10-01T00:00:00Z",
    },
    review: {
      origin: "pipeline",
      status: "approved",
      checked: true,
      score: 95,
      failedChecks: 0,
      processedAt: "2026-10-01T00:00:00Z",
    },
    ...overrides,
  };
}

function createMockProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    name: "สมชาย ทดสอบ",
    role: { th: "ผู้ใช้ระบบ", en: "Platform User" },
    email: "user@example.com",
    skills: ["Next.js", "React", "Node.js", "PostgreSQL"],
    budgetMin: 500_000,
    budgetMax: 5_000_000,
    scopeSizes: [],
    smeRegistered: true,
    watchlist: [],
    certifications: ["ISO/IEC 29110"],
    entityType: "juristic",
    preferredArchetypes: ["web-portal", "mobile-app"],
    maxPastPortfolioTHB: 1_000_000,
    ...overrides,
  };
}

test("matchFor: returns strong match (>= 85) for an aligned juristic company", () => {
  const tor = createMockTor();
  const profile = createMockProfile();

  const match = matchFor(tor, profile);

  assert.ok(match.score >= 85, `Score ${match.score} should be >= 85`);
  assert.equal(match.tier, "strong");
  assert.equal(match.disqualifiedDirectBid, false);
  assert.equal(match.matched.length, 4);
  assert.equal(match.missing.length, 0);
  assert.equal(match.breakdown.entity.score, 100);
  assert.equal(match.breakdown.archetype.score, 100);
  assert.equal(match.breakdown.budget.status, "within_range");
  assert.equal(match.breakdown.portfolio.meetsThreshold, true);
});

test("matchFor: flags disqualifiedDirectBid and penalizes entity score when freelancer views companies-only TOR", () => {
  const tor = createMockTor({ companiesOnly: true });
  const profile = createMockProfile({ entityType: "individual" });

  const match = matchFor(tor, profile);

  assert.equal(match.disqualifiedDirectBid, true);
  assert.equal(match.breakdown.entity.score, 20);
  assert.ok(match.breakdown.entity.noticeTh?.includes("เฉพาะนิติบุคคล"));
  assert.ok(match.breakdown.warningsTh.some((w) => w.includes("เฉพาะนิติบุคคล")));
});

test("matchFor: gives full entity score to freelancer when TOR does not require companiesOnly", () => {
  const tor = createMockTor({ companiesOnly: false });
  const profile = createMockProfile({ entityType: "individual" });

  const match = matchFor(tor, profile);

  assert.equal(match.disqualifiedDirectBid, false);
  assert.equal(match.breakdown.entity.score, 100);
});

test("matchFor: applies smooth continuous penalties when project price is outside budget range", () => {
  const profile = createMockProfile({ budgetMin: 1_000_000, budgetMax: 3_000_000 });

  // 1. Below min (500k vs 1M min -> 50% score)
  const lowTor = createMockTor({
    facts: { ...createMockTor().facts, referencePriceTHB: 500_000, budgetTHB: 500_000 },
  });
  const lowMatch = matchFor(lowTor, profile);
  assert.equal(lowMatch.breakdown.budget.status, "below_min");
  assert.equal(lowMatch.breakdown.budget.score, 50);

  // 2. Above max (6M vs 3M max -> 100% overrun -> 0 score)
  const highTor = createMockTor({
    facts: { ...createMockTor().facts, referencePriceTHB: 6_000_000, budgetTHB: 6_000_000 },
  });
  const highMatch = matchFor(highTor, profile);
  assert.equal(highMatch.breakdown.budget.status, "above_max");
  assert.equal(highMatch.breakdown.budget.score, 0);

  // 3. Unspecified price -> neutral 50
  const noPriceTor = createMockTor({
    facts: { ...createMockTor().facts, referencePriceTHB: null, budgetTHB: null },
  });
  const noPriceMatch = matchFor(noPriceTor, profile);
  assert.equal(noPriceMatch.breakdown.budget.status, "unknown");
  assert.equal(noPriceMatch.breakdown.budget.score, 50);
});

test("matchFor: evaluates archetype alignment correctly", () => {
  const profile = createMockProfile({ preferredArchetypes: ["web-portal"] });

  // Mismatch archetype
  const infraTor = createMockTor({
    overview: { systemArchetype: "infra-networking", objective: "ติดตั้งเครือข่าย" },
  });
  const infraMatch = matchFor(infraTor, profile);
  assert.equal(infraMatch.breakdown.archetype.isPreferred, false);
  assert.equal(infraMatch.breakdown.archetype.score, 15);

  // Open profile (no preferred archetypes selected) -> full 100
  const openProfile = createMockProfile({ preferredArchetypes: [] });
  const openMatch = matchFor(infraTor, openProfile);
  assert.equal(openMatch.breakdown.archetype.score, 100);
});

test("matchFor: verifies past single-contract portfolio threshold", () => {
  // TOR reference price 2M -> standard 40% threshold = 800k
  const tor = createMockTor({
    facts: { ...createMockTor().facts, referencePriceTHB: 2_000_000 },
    eligibility: { previousExperienceMinTHB: 800_000, requiredCertifications: [] },
  });

  // User has 400k (below 800k -> 50% score)
  const smallProfile = createMockProfile({ maxPastPortfolioTHB: 400_000 });
  const smallMatch = matchFor(tor, smallProfile);
  assert.equal(smallMatch.breakdown.portfolio.meetsThreshold, false);
  assert.equal(smallMatch.breakdown.portfolio.score, 50);
  assert.ok(smallMatch.breakdown.warningsTh.some((w) => w.includes("ผลงานในสัญญาเดียว")));

  // User undeclared (0) -> neutral 60
  const undeclaredProfile = createMockProfile({ maxPastPortfolioTHB: 0 });
  const undeclaredMatch = matchFor(tor, undeclaredProfile);
  assert.equal(undeclaredMatch.breakdown.portfolio.score, 60);
});

test("matchFor: score is strictly bounded between 0 and 100", () => {
  const worstTor = createMockTor({
    overview: { systemArchetype: "iot-telemetry", objective: "เซ็นเซอร์" },
    technicalRequirements: {
      requiredTechnologies: [{ name: "Rust", version: null }, { name: "C++", version: null }],
    },
    facts: { ...createMockTor().facts, referencePriceTHB: 100_000_000 },
    companiesOnly: true,
    eligibility: { requiredCertifications: ["CMMI Level 5"], previousExperienceMinTHB: 50_000_000 },
  });
  const worstProfile = createMockProfile({
    skills: ["PHP"],
    preferredArchetypes: ["web-portal"],
    budgetMin: 100_000,
    budgetMax: 500_000,
    entityType: "individual",
    maxPastPortfolioTHB: 50_000,
    certifications: [],
  });

  const match = matchFor(worstTor, worstProfile);
  assert.ok(match.score >= 0 && match.score <= 100);
  assert.equal(match.tier, "low");
});

test("sort by match: Highest match (match-desc) and Lowest match (match-asc) correctly orders TORs", () => {
  const profile = createMockProfile({
    skills: ["React", "Next.js"],
    preferredArchetypes: ["web-portal"],
    budgetMin: 1_000_000,
    budgetMax: 5_000_000,
    entityType: "juristic",
  });

  const highMatchTor = createMockTor({
    projectId: "HIGH-MATCH",
    technicalRequirements: {
      requiredTechnologies: [{ name: "React", version: null }, { name: "Next.js", version: null }],
    },
    overview: { systemArchetype: "web-portal", objective: "พอร์ทัล" },
    facts: { ...createMockTor().facts, referencePriceTHB: 2_000_000 },
  });

  const lowMatchTor = createMockTor({
    projectId: "LOW-MATCH",
    technicalRequirements: {
      requiredTechnologies: [{ name: "Rust", version: null }, { name: "COBOL", version: null }],
    },
    overview: { systemArchetype: "hardware-iot", objective: "อุปกรณ์" },
    facts: { ...createMockTor().facts, referencePriceTHB: 50_000_000 },
  });

  const tors = [lowMatchTor, highMatchTor];

  // Highest match: score descending
  const highestFirst = [...tors].sort((a, b) => matchFor(b, profile).score - matchFor(a, profile).score);
  assert.equal(highestFirst[0].projectId, "HIGH-MATCH");
  assert.equal(highestFirst[1].projectId, "LOW-MATCH");

  // Lowest match: score ascending
  const lowestFirst = [...tors].sort((a, b) => matchFor(a, profile).score - matchFor(b, profile).score);
  assert.equal(lowestFirst[0].projectId, "LOW-MATCH");
  assert.equal(lowestFirst[1].projectId, "HIGH-MATCH");
});

