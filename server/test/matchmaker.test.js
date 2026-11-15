import assert from 'node:assert/strict';
import { test } from 'node:test';

import { calculateMatchScore, isProfileBaseline } from '#features/match/index.js';

function createMockTor(overrides = {}) {
  return {
    projectId: 'TOR-TEST-001',
    identification: {
      titleTh: 'โครงการพัฒนาระบบพอร์ทัลบริการประชาชน',
      status: 'Open',
    },
    facts: {
      budgetTHB: 2_000_000,
      referencePriceTHB: 2_000_000,
    },
    overview: {
      systemArchetype: 'web-portal',
    },
    technicalRequirements: {
      requiredTechnologies: [
        { name: 'Next.js' },
        { name: 'React' },
        { name: 'Node.js' },
        { name: 'PostgreSQL' },
      ],
    },
    eligibility: {
      requiredCertifications: ['ISO/IEC 29110'],
      previousExperienceMinTHB: 800_000,
      standardConditions: ['juristic-person'],
    },
    companiesOnly: true,
    ...overrides,
  };
}

function createMockProfile(overrides = {}) {
  return {
    skills: ['Next.js', 'React', 'Node.js', 'PostgreSQL'],
    budgetMin: 500_000,
    budgetMax: 5_000_000,
    certifications: ['ISO/IEC 29110'],
    entityType: 'juristic',
    preferredArchetypes: ['web-portal', 'mobile-app'],
    maxPastPortfolioTHB: 1_000_000,
    ...overrides,
  };
}

test('calculateMatchScore: returns strong match (>= 85) for an aligned juristic company', () => {
  const tor = createMockTor();
  const profile = createMockProfile();

  const match = calculateMatchScore(tor, profile);

  assert.ok(match.score >= 85, `Score ${match.score} should be >= 85`);
  assert.equal(match.tier, 'strong');
  assert.equal(match.disqualifiedDirectBid, false);
  assert.equal(match.matched.length, 4);
  assert.equal(match.missing.length, 0);
  assert.equal(match.breakdown.entity.score, 100);
});

test('calculateMatchScore: flags disqualifiedDirectBid and penalizes entity score when freelancer views companies-only TOR', () => {
  const tor = createMockTor({ companiesOnly: true });
  const profile = createMockProfile({ entityType: 'individual' });

  const match = calculateMatchScore(tor, profile);

  assert.equal(match.disqualifiedDirectBid, true);
  assert.equal(match.breakdown.entity.score, 20);
  assert.ok(match.breakdown.entity.noticeTh?.includes('เฉพาะนิติบุคคล'));
});

test('calculateMatchScore: evaluates continuous budget curves', () => {
  const profile = createMockProfile({ budgetMin: 1_000_000, budgetMax: 3_000_000 });

  const lowTor = createMockTor({
    facts: { referencePriceTHB: 500_000, budgetTHB: 500_000 },
  });
  const lowMatch = calculateMatchScore(lowTor, profile);
  assert.equal(lowMatch.breakdown.budget.status, 'below_min');
  assert.equal(lowMatch.breakdown.budget.score, 50);

  const highTor = createMockTor({
    facts: { referencePriceTHB: 6_000_000, budgetTHB: 6_000_000 },
  });
  const highMatch = calculateMatchScore(highTor, profile);
  assert.equal(highMatch.breakdown.budget.status, 'above_max');
  assert.equal(highMatch.breakdown.budget.score, 0);
});

test('isProfileBaseline: accurately detects fresh unconfigured profiles', () => {
  assert.equal(isProfileBaseline(null), true);
  assert.equal(isProfileBaseline(undefined), true);
  assert.equal(
    isProfileBaseline({
      skills: [],
      budgetMin: 0,
      budgetMax: 0,
      preferredArchetypes: [],
      maxPastPortfolioTHB: 0,
      certifications: [],
    }),
    true
  );
  // Setting skills marks it as configured
  assert.equal(
    isProfileBaseline({
      skills: ['React'],
      budgetMin: 0,
      budgetMax: 0,
      preferredArchetypes: [],
      maxPastPortfolioTHB: 0,
      certifications: [],
    }),
    false
  );
  // Setting budget marks it as configured
  assert.equal(
    isProfileBaseline({
      skills: [],
      budgetMin: 1_000_000,
      budgetMax: 5_000_000,
      preferredArchetypes: [],
      maxPastPortfolioTHB: 0,
      certifications: [],
    }),
    false
  );
});

test('calculateMatchScore: evaluates pure multi-factor calculation when skills list is empty', () => {
  const tor = createMockTor();
  const profile = createMockProfile({ skills: [] });

  const match = calculateMatchScore(tor, profile);

  assert.equal(match.breakdown.skills.score, 0);
  assert.equal(match.matched.length, 0);
  assert.ok(match.score > 0, 'calculates composite score from other 5 dimensions');
});

