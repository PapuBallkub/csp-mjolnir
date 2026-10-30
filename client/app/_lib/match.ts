import type { Profile } from "../_data/tors";
import type { TorInsightDetail, TorInsightSummary } from "./api";

export type MatchTier = "strong" | "good" | "moderate" | "low";

export type MatchBreakdown = {
  score: number;
  tier: MatchTier;
  skills: {
    score: number;
    matched: string[];
    missing: string[];
    totalRequired: number;
  };
  archetype: {
    score: number;
    torArchetype: string | null;
    isPreferred: boolean;
  };
  budget: {
    score: number;
    status: "within_range" | "below_min" | "above_max" | "unknown";
    price: number | null;
  };
  portfolio: {
    score: number;
    userMax: number;
    estimatedRequired: number;
    meetsThreshold: boolean;
  };
  entity: {
    score: number;
    userEntityType: "juristic" | "individual";
    companiesOnly: boolean;
    disqualifiedDirectBid: boolean;
    noticeTh?: string;
    noticeEn?: string;
  };
  certifications: {
    score: number;
    matched: string[];
    missing: string[];
    totalRequired: number;
  };
  highlightsTh: string[];
  highlightsEn: string[];
  warningsTh: string[];
  warningsEn: string[];
};

export type Match = {
  /** 0–100 */
  score: number;
  /** The TOR's technologies the profile already lists */
  matched: string[];
  /** Missing required technologies */
  missing: string[];
  /** Match tier label */
  tier: MatchTier;
  /** True when direct bidding is blocked (e.g. freelancer on a companies-only TOR) */
  disqualifiedDirectBid: boolean;
  /** Detailed breakdown by dimension */
  breakdown: MatchBreakdown;
};

/**
 * Normalizes technology/skill names for resilient comparison (trims, collapses whitespace, lowercase).
 */
function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * FR-13: Comprehensive matchmaker scoring engine.
 * Computes a transparent 0-100 composite score combining:
 * 1. Technical Skills (40%)
 * 2. System Archetype (15%)
 * 3. Budget Range (20%)
 * 4. Experience & Portfolio (10%)
 * 5. Entity Compatibility (10%)
 * 6. Certifications & Standards (5%)
 */
export function matchFor(
  tor: TorInsightSummary | TorInsightDetail,
  profile: Profile
): Match {
  const highlightsTh: string[] = [];
  const highlightsEn: string[] = [];
  const warningsTh: string[] = [];
  const warningsEn: string[] = [];

  // -------------------------------------------------------------
  // 1. Technical Skills Fit (40% Weight)
  // -------------------------------------------------------------
  const userSkillSet = new Set((profile.skills ?? []).map(normalizeName));
  const rawRequired = (tor.technicalRequirements?.requiredTechnologies ?? []).map((t) => t.name.trim());
  const requiredUnique = [...new Set(rawRequired.filter(Boolean))];

  const matched = requiredUnique.filter((name) => userSkillSet.has(normalizeName(name)));
  const missing = requiredUnique.filter((name) => !userSkillSet.has(normalizeName(name)));

  let skillScore = 0;
  if (requiredUnique.length === 0) {
    // Neutral baseline if TOR requires no specific software tech stack
    skillScore = 75;
  } else if (profile.skills.length === 0) {
    skillScore = 0;
  } else {
    skillScore = Math.round((matched.length / requiredUnique.length) * 100);
  }

  if (requiredUnique.length > 0 && matched.length === requiredUnique.length) {
    highlightsTh.push(`ทักษะตรงครบทุกรายการ (${matched.length}/${requiredUnique.length})`);
    highlightsEn.push(`All ${matched.length} required technologies match your skills`);
  } else if (matched.length > 0) {
    highlightsTh.push(`ทักษะตรง ${matched.length} จาก ${requiredUnique.length} รายการ`);
    highlightsEn.push(`${matched.length} of ${requiredUnique.length} required technologies match your skills`);
  }

  // -------------------------------------------------------------
  // 2. Deliverable System Archetype Fit (15% Weight)
  // -------------------------------------------------------------
  const torArchetype = tor.overview?.systemArchetype?.trim().toLowerCase() ?? null;
  const userArchetypes = (profile.preferredArchetypes ?? []).map((a) => a.trim().toLowerCase());

  let archetypeScore = 100;
  let isPreferred = true;

  if (userArchetypes.length > 0) {
    if (torArchetype && userArchetypes.includes(torArchetype)) {
      archetypeScore = 100;
      isPreferred = true;
      highlightsTh.push("ตรงกับประเภทสถาปัตยกรรมระบบที่คุณถนัด");
      highlightsEn.push("Matches your preferred deliverable system architecture");
    } else if (!torArchetype || torArchetype === "other") {
      archetypeScore = 60;
      isPreferred = false;
    } else {
      archetypeScore = 15;
      isPreferred = false;
    }
  }

  // -------------------------------------------------------------
  // 3. Financial Budget Fit (20% Weight)
  // -------------------------------------------------------------
  const price = tor.facts.referencePriceTHB ?? tor.facts.budgetTHB ?? null;
  let budgetScore = 50;
  let budgetStatus: "within_range" | "below_min" | "above_max" | "unknown" = "unknown";

  if (price === null) {
    budgetScore = 50;
    budgetStatus = "unknown";
  } else {
    const min = profile.budgetMin ?? 0;
    const max = profile.budgetMax ?? 0;

    if (min <= price && (max === 0 || price <= max)) {
      budgetScore = 100;
      budgetStatus = "within_range";
      highlightsTh.push("ราคากลางอยู่ในช่วงงบประมาณที่คุณรับงาน");
      highlightsEn.push("Reference price is within your preferred budget range");
    } else if (price < min) {
      budgetScore = Math.max(20, Math.round((price / Math.max(min, 1)) * 100));
      budgetStatus = "below_min";
      warningsTh.push("งบประมาณโครงการต่ำกว่าเกณฑ์ขั้นต่ำที่คุณรับงาน");
      warningsEn.push("Project budget is below your minimum preferred threshold");
    } else {
      // price > max
      const overrunPct = ((price - max) / Math.max(max, 1)) * 100;
      budgetScore = Math.max(0, Math.round(100 - overrunPct));
      budgetStatus = "above_max";
      warningsTh.push("งบประมาณโครงการสูงกว่าเพดานที่คุณรับงาน");
      warningsEn.push("Project budget exceeds your maximum preferred threshold");
    }
  }

  // -------------------------------------------------------------
  // 4. Past Experience & Portfolio Gate (10% Weight)
  // -------------------------------------------------------------
  const userPortfolio = profile.maxPastPortfolioTHB ?? 0;
  const torExpMin = tor.eligibility?.previousExperienceMinTHB ?? null;
  // Thai procurement standard: single past project of 30% - 50% (default 40%) of reference price
  const estimatedRequired = torExpMin ?? (price !== null ? Math.round(price * 0.4) : 0);

  let portfolioScore = 60;
  let meetsThreshold = true;

  if (estimatedRequired <= 0) {
    portfolioScore = 100;
    meetsThreshold = true;
  } else if (userPortfolio <= 0) {
    portfolioScore = 60; // neutral, user has not declared past portfolio
    meetsThreshold = true;
  } else if (userPortfolio >= estimatedRequired) {
    portfolioScore = 100;
    meetsThreshold = true;
    highlightsTh.push("มูลค่าผลงานในอดีตครอบคลุมเกณฑ์ขั้นต่ำ");
    highlightsEn.push("Past single contract value covers the qualification threshold");
  } else {
    portfolioScore = Math.max(10, Math.round((userPortfolio / estimatedRequired) * 100));
    meetsThreshold = false;
    warningsTh.push("มูลค่าผลงานในสัญญาเดียวอาจไม่ถึงเกณฑ์ประเมินทั่วไป (~40% ของราคากลาง)");
    warningsEn.push("Past single contract value may be below standard procurement threshold (~40%)");
  }

  // -------------------------------------------------------------
  // 5. Entity Compatibility (10% Weight)
  // -------------------------------------------------------------
  const userEntity = profile.entityType ?? "juristic";
  const isCompaniesOnly = Boolean(tor.companiesOnly);

  let entityScore = 100;
  let disqualifiedDirectBid = false;
  let noticeTh: string | undefined;
  let noticeEn: string | undefined;

  if (isCompaniesOnly && userEntity === "individual") {
    entityScore = 20;
    disqualifiedDirectBid = true;
    noticeTh = "TOR กำหนดเฉพาะนิติบุคคล — คุณลงทะเบียนเป็นบุคคลธรรมดา/ฟรีแลนซ์ (สามารถเข้าร่วมในรูปแบบกิจการร่วมค้า หรือรับงานช่วง)";
    noticeEn = "Requires a registered company — you are registered as an individual/freelancer (consider Joint Venture or subcontracting)";
    warningsTh.push(noticeTh);
    warningsEn.push(noticeEn);
  } else {
    entityScore = 100;
  }

  // -------------------------------------------------------------
  // 6. Standards & Certifications Fit (5% Weight)
  // -------------------------------------------------------------
  const userCerts = new Set((profile.certifications ?? []).map(normalizeName));
  const requiredCerts = tor.eligibility?.requiredCertifications ?? [];

  let certScore = 80;
  const matchedCerts: string[] = [];
  const missingCerts: string[] = [];

  if (requiredCerts.length > 0) {
    for (const c of requiredCerts) {
      if (userCerts.has(normalizeName(c))) {
        matchedCerts.push(c);
      } else {
        missingCerts.push(c);
      }
    }
    certScore = Math.round((matchedCerts.length / requiredCerts.length) * 100);
    if (matchedCerts.length > 0) {
      highlightsTh.push(`มีมาตรฐานตามเกณฑ์ ${matchedCerts.length}/${requiredCerts.length} รายการ`);
      highlightsEn.push(`Matches ${matchedCerts.length}/${requiredCerts.length} required certifications`);
    }
    if (missingCerts.length > 0) {
      warningsTh.push(`ขาดมาตรฐานที่ TOR กำหนด: ${missingCerts.join(", ")}`);
      warningsEn.push(`Missing required certifications: ${missingCerts.join(", ")}`);
    }
  } else {
    // Quality bonus if user holds ISO 29110 or ISO 27001
    const hasSmeStandard = [...userCerts].some(
      (c) => c.includes("29110") || c.includes("27001") || c.includes("cmmi")
    );
    certScore = hasSmeStandard ? 100 : 80;
  }

  // -------------------------------------------------------------
  // Aggregate Composite Score (0–100)
  // -------------------------------------------------------------
  const composite =
    skillScore * 0.4 +
    archetypeScore * 0.15 +
    budgetScore * 0.2 +
    portfolioScore * 0.1 +
    entityScore * 0.1 +
    certScore * 0.05;

  const score = Math.max(0, Math.min(100, Math.round(composite)));

  const tier: MatchTier =
    score >= 85 ? "strong" : score >= 70 ? "good" : score >= 50 ? "moderate" : "low";

  const breakdown: MatchBreakdown = {
    score,
    tier,
    skills: {
      score: skillScore,
      matched,
      missing,
      totalRequired: requiredUnique.length,
    },
    archetype: {
      score: archetypeScore,
      torArchetype,
      isPreferred,
    },
    budget: {
      score: budgetScore,
      status: budgetStatus,
      price,
    },
    portfolio: {
      score: portfolioScore,
      userMax: userPortfolio,
      estimatedRequired,
      meetsThreshold,
    },
    entity: {
      score: entityScore,
      userEntityType: userEntity,
      companiesOnly: isCompaniesOnly,
      disqualifiedDirectBid,
      noticeTh,
      noticeEn,
    },
    certifications: {
      score: certScore,
      matched: matchedCerts,
      missing: missingCerts,
      totalRequired: requiredCerts.length,
    },
    highlightsTh,
    highlightsEn,
    warningsTh,
    warningsEn,
  };

  return {
    score,
    matched,
    missing,
    tier,
    disqualifiedDirectBid,
    breakdown,
  };
}
