import type { RiskLevel, Status } from "../../../_data/tors";
import type {
  ComplexityTier,
  LockSpecTriggerId,
  ProjectCategory,
  SystemArchetype,
  WatchdogProjectRecord,
} from "../../../_data/watchdog";
import type { TorInsightSummary } from "../../../_lib/api";

export const THAI_MONTHS_SHORT = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

export const EN_MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function formatMonthBucket(monthKey: string): {
  key: string;
  labelTh: string;
  labelEn: string;
  quarter: string;
} {
  const [yStr, mStr] = monthKey.split("-");
  const year = Number(yStr);
  const monthIdx = Math.max(0, Math.min(11, Number(mStr) - 1));
  const beShort = String(year + 543).slice(-2);
  const enShort = String(year).slice(-2);

  // Thai Fiscal Year starts in October (month index 9 -> Q1 of next FY)
  const fyYearShort = String((monthIdx >= 9 ? year + 1 : year) + 543).slice(-2);
  const fyQuarter =
    monthIdx >= 9
      ? 1
      : monthIdx <= 2
        ? 2
        : monthIdx <= 5
          ? 3
          : 4;

  return {
    key: monthKey,
    labelTh: `${THAI_MONTHS_SHORT[monthIdx]} ${beShort}`,
    labelEn: `${EN_MONTHS_SHORT[monthIdx]} ${enShort}`,
    quarter: `Q${fyQuarter}/${fyYearShort}`,
  };
}

/**
 * Generate a continuous sequence of monthly buckets between start and end inclusive.
 * Capped at 72 months (6 years) to guarantee smooth charting performance.
 */
export function generateMonthRange(startMonthKey: string, endMonthKey: string): Array<{
  key: string;
  labelTh: string;
  labelEn: string;
  quarter: string;
}> {
  if (!startMonthKey || !endMonthKey || startMonthKey > endMonthKey) return [];
  const [startY, startM] = startMonthKey.split("-").map(Number);
  const [endY, endM] = endMonthKey.split("-").map(Number);
  if (!startY || !startM || !endY || !endM) return [];

  const months: Array<{ key: string; labelTh: string; labelEn: string; quarter: string }> = [];
  let curY = startY;
  let curM = startM;
  let count = 0;
  while ((curY < endY || (curY === endY && curM <= endM)) && count < 72) {
    const key = `${curY}-${String(curM).padStart(2, "0")}`;
    months.push(formatMonthBucket(key));
    curM += 1;
    if (curM > 12) {
      curM = 1;
      curY += 1;
    }
    count += 1;
  }
  return months;
}

export function normalizeCategory(raw: string | null | undefined): ProjectCategory {
  const valid: ProjectCategory[] = [
    "software-development",
    "systems-integration",
    "data-and-ai",
    "network-and-security",
    "maintenance-and-support",
    "software-licenses",
    "other-it",
  ];
  if (raw && valid.includes(raw as ProjectCategory)) {
    return raw as ProjectCategory;
  }
  return "software-development";
}

export function inferArchetypeFromCategory(cat: ProjectCategory): SystemArchetype {
  switch (cat) {
    case "network-and-security":
      return "cybersecurity";
    case "data-and-ai":
      return "data-analytics";
    case "maintenance-and-support":
    case "software-licenses":
      return "infra-networking";
    case "systems-integration":
      return "enterprise-erp";
    case "software-development":
      return "web-portal";
    default:
      return "other";
  }
}

export function normalizeArchetype(
  raw: string | null | undefined,
  cat: ProjectCategory,
): SystemArchetype {
  const valid: SystemArchetype[] = [
    "web-portal",
    "mobile-app",
    "enterprise-erp",
    "edoc-workflow",
    "data-analytics",
    "gis-mapping",
    "cybersecurity",
    "iot-telemetry",
    "infra-networking",
    "other",
  ];
  if (raw && valid.includes(raw as SystemArchetype)) {
    return raw as SystemArchetype;
  }
  return inferArchetypeFromCategory(cat);
}

export function normalizeComplexity(
  raw: string | null | undefined,
  priceTHB: number,
): ComplexityTier {
  if (raw === "basic" || raw === "standard" || raw === "enterprise") {
    return raw;
  }
  if (priceTHB >= 15_000_000) return "enterprise";
  if (priceTHB >= 2_500_000) return "standard";
  return "basic";
}

export function normalizeTriggerCategory(raw: string | undefined): LockSpecTriggerId {
  if (raw === "Specification Tailoring" || raw === "Hardware Lock-in") {
    return "Specification Tailoring";
  }
  if (raw === "Qualification Barrier") {
    return "Qualification Barrier";
  }
  return "Vendor Lock-in";
}

export function inferTriggerFromTechAndVerdict(tor: TorInsightSummary): LockSpecTriggerId {
  const techs = tor.technicalRequirements?.requiredTechnologies ?? [];
  const hasLockedOsOrDb = techs.some((t) => {
    const n = t.name.toLowerCase();
    return (
      (n.includes("windows server") ||
        n.includes("red hat") ||
        n.includes("rhel") ||
        n.includes("oracle")) &&
      Boolean(t.version)
    );
  });
  if (hasLockedOsOrDb) return "Specification Tailoring";
  return "Vendor Lock-in";
}

/**
 * Converts a live API `TorInsightSummary` record into a `WatchdogProjectRecord`.
 */
export function mapApiTorToWatchdog(tor: TorInsightSummary): WatchdogProjectRecord | null {
  const refPrice = tor.facts.referencePriceTHB ?? tor.facts.budgetTHB ?? 0;
  if (refPrice <= 0) return null;

  const rawDate = tor.facts.postedDate || tor.createdAt || "2026-10-01";
  const parsedDate = new Date(rawDate);
  const isoDate = !Number.isNaN(parsedDate.getTime())
    ? parsedDate.toISOString().slice(0, 10)
    : "2026-10-01";
  const month = isoDate.slice(0, 7);

  const category = normalizeCategory(tor.identification.categories?.[0]);
  const archetype = normalizeArchetype(tor.overview?.systemArchetype, category);
  const complexity = normalizeComplexity(tor.overview?.complexityTier, refPrice);

  const peerMedian =
    tor.analytics.priceAnalysis?.historicalMedianTHB &&
    tor.analytics.priceAnalysis.historicalMedianTHB > 0
      ? Math.round(tor.analytics.priceAnalysis.historicalMedianTHB)
      : refPrice;

  const peerAverage =
    tor.analytics.priceAnalysis?.historicalAverageTHB &&
    tor.analytics.priceAnalysis.historicalAverageTHB > 0
      ? Math.round(tor.analytics.priceAnalysis.historicalAverageTHB)
      : peerMedian;

  const lockSpecScore = tor.analytics.lockSpec?.riskScore ?? 0;
  const lockSpecLevel: RiskLevel =
    lockSpecScore >= 70 ? "high" : lockSpecScore >= 35 ? "medium" : "low";

  const apiFindings = tor.analytics.lockSpec?.findings ?? [];
  const triggers: WatchdogProjectRecord["triggers"] = [];

  if (apiFindings.length > 0) {
    const seen = new Set<LockSpecTriggerId>();
    for (const f of apiFindings) {
      const cat = normalizeTriggerCategory(f.category);
      if (seen.has(cat)) continue;
      seen.add(cat);
      triggers.push({
        category: cat,
        summary: { th: f.title, en: f.title },
        clauseExcerpt: f.sourceExcerpt || f.requirementText || "",
      });
    }
  } else if (lockSpecScore > 0) {
    // Fallback when `/api/tors` summary projection omits `findings` array
    const primaryCat = inferTriggerFromTechAndVerdict(tor);
    triggers.push({
      category: primaryCat,
      summary: {
        th: tor.analytics.lockSpec?.verdictText || "พบเงื่อนไขที่อาจจำกัดการแข่งขัน",
        en: tor.analytics.lockSpec?.verdictText || "Potential competition barrier",
      },
      clauseExcerpt: "",
    });
    if (lockSpecScore >= 70) {
      const secondCat: LockSpecTriggerId =
        primaryCat === "Specification Tailoring"
          ? "Vendor Lock-in"
          : "Specification Tailoring";
      triggers.push({
        category: secondCat,
        summary: {
          th: "พบเงื่อนไขจำกัดการแข่งขันเพิ่มเติมตามเกณฑ์ ว 214",
          en: "Additional Circular ว 214 barrier detected",
        },
        clauseExcerpt: "",
      });
    }
  }

  return {
    id: tor.projectId,
    egpRef: tor.projectId,
    title: {
      th: tor.identification.titleTh,
      en: tor.identification.titleEn || tor.identification.titleTh,
    },
    agency: {
      th: tor.identification.agency,
      en: tor.identification.agency,
    },
    category,
    archetype,
    complexity,
    month,
    postedAt: isoDate,
    status: tor.identification.status as Status,
    referencePriceTHB: Math.round(refPrice),
    peerMedianTHB: peerMedian,
    peerAverageTHB: peerAverage,
    agreedPriceTHB:
      tor.facts.agreedPriceTHB && tor.facts.agreedPriceTHB > 0
        ? Math.round(tor.facts.agreedPriceTHB)
        : undefined,
    lockSpecScore,
    lockSpecLevel,
    triggers,
  };
}

export function computeMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export function computeAverage(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((s, v) => s + v, 0) / values.length);
}
