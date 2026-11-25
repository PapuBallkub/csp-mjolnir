import type { PriceVerdict, RiskLevel, ScopeSize, Status, Tor } from "../_data/tors";
import { priceDeltaPct } from "../_data/tors";
import type { ChangeSource, TorInsightSummary, TorStatus } from "../_lib/api";
import { CHANGE_SOURCE } from "../_lib/changes";
import { stageOf, type Stage } from "../_lib/stage";
import type { Match } from "../_lib/match";

// Re-export Status and keep backward-compat alias
export type { Status };
export type ApiStatus = Status;
import { Label } from "./ui";

/**
 * The verdict layer — the one thing this product has that a plain listing site
 * does not, so it is also the visual thread that runs through every screen.
 *
 * Two rules hold the system together:
 *
 *   1. Hue encodes a verdict, never a category. Green = go, amber = look
 *      closer, crimson = this will cost you, grey = dead. That is why a "low
 *      lock-spec risk" and an "open" status share a colour: both mean go.
 *   2. Colour is never the only carrier. Every badge pairs its hue with a
 *      glyph and a word, so the system survives greyscale printing and
 *      colour-blind readers.
 */

export type Tone = "open" | "amend" | "risk" | "closed";

/* Full class strings, never composed at runtime, so Tailwind can see them. */
export const TONE: Record<Tone, { text: string; bg: string; border: string; fill: string }> = {
  open: { text: "text-open", bg: "bg-open-bg", border: "border-open-line", fill: "bg-open" },
  amend: { text: "text-amend", bg: "bg-amend-bg", border: "border-amend-line", fill: "bg-amend" },
  risk: { text: "text-risk", bg: "bg-risk-bg", border: "border-risk-line", fill: "bg-risk" },
  closed: {
    text: "text-closed",
    bg: "bg-closed-bg",
    border: "border-closed-line",
    fill: "bg-closed",
  },
};

export function getStatusTone(status: Status): Tone {
  switch (status) {
    case "Open":
      return "open";
    case "Cancelled":
      return "risk";
    case "Draft":
    case "Closed":
    case "Awarded":
    default:
      return "closed";
  }
}

/* Exported so a whole panel can wear the same hue as the badge inside it. */
export const STATUS_TONE: Record<Status, Tone> = {
  Draft: "closed",
  Open: "open",
  Awarded: "closed",
  Closed: "closed",
  Cancelled: "risk",
};
export const RISK_TONE: Record<RiskLevel, Tone> = { low: "open", medium: "amend", high: "risk" };
/**
 * An over-median budget is not the applicant's problem — a *below*-median one
 * is, because it is the contract that loses money the day it is signed. So
 * "under" carries the strongest warning here, while the watchdog screen reads
 * the same fact from the opposite end.
 */
export const PRICE_TONE: Record<PriceVerdict, Tone> = {
  fair: "open",
  over: "amend",
  under: "risk",
};

const STATUS_LABEL: Record<Status, string> = {
  Draft: "ร่างประกาศ / วิจารณ์",
  Open: "เปิดรับข้อเสนอ",
  Awarded: "ประกาศผู้ชนะแล้ว",
  Closed: "ปิดรับข้อเสนอ",
  Cancelled: "ยกเลิกประกาศ",
};

const RISK_LABEL: Record<RiskLevel, string> = {
  low: "ความเสี่ยงล็อกสเปกต่ำ",
  medium: "ความเสี่ยงล็อกสเปกปานกลาง",
  high: "ความเสี่ยงล็อกสเปกสูง",
};

const SCOPE_LABEL: Record<ScopeSize, string> = {
  solo: "ทำคนเดียวไหว",
  "small-team": "ทีมเล็ก 2–5 คน",
  firm: "ต้องใช้บริษัท",
};

/* --------------------------------- glyphs --------------------------------- */

function StatusGlyph({ status, className = "" }: { status: Status; className?: string }) {
  if (status === "Open") {
    return (
      <svg viewBox="0 0 10 10" className={`h-2.5 w-2.5 shrink-0 ${className}`} aria-hidden="true">
        <circle cx="5" cy="5" r="3.2" fill="currentColor" />
      </svg>
    );
  }
  if (status === "Draft") {
    return (
      <svg viewBox="0 0 10 10" className={`h-2.5 w-2.5 shrink-0 ${className}`} aria-hidden="true">
        <circle cx="5" cy="5" r="3" stroke="currentColor" strokeWidth="1.4" fill="none" strokeDasharray="2 1.5" />
      </svg>
    );
  }
  if (status === "Awarded") {
    return (
      <svg viewBox="0 0 10 10" className={`h-2.5 w-2.5 shrink-0 ${className}`} aria-hidden="true">
        <path d="M2 5 L4.2 7.2 L8 3" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (status === "Cancelled" || status === "Closed") {
    return (
      <svg viewBox="0 0 10 10" className={`h-2.5 w-2.5 shrink-0 ${className}`} aria-hidden="true">
        <path d="M2 2 L8 8 M8 2 L2 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  return null;
}

function DirectionGlyph({ verdict }: { verdict: PriceVerdict }) {
  if (verdict === "fair") {
    return (
      <svg viewBox="0 0 10 10" className="h-2.5 w-2.5 shrink-0" aria-hidden="true">
        <path d="M2 5 L8 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  if (verdict === "over") {
    return (
      <svg viewBox="0 0 10 10" className="h-2.5 w-2.5 shrink-0" aria-hidden="true">
        <path d="M5 8 L5 2 M2.5 4.5 L5 2 L7.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 10 10" className="h-2.5 w-2.5 shrink-0" aria-hidden="true">
      <path d="M5 2 L5 8 M2.5 5.5 L5 8 L7.5 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function RiskMeter({ level }: { level: RiskLevel }) {
  const bars = level === "low" ? 1 : level === "medium" ? 2 : 3;
  return (
    <svg viewBox="0 0 12 10" className="h-2.5 w-3 shrink-0" aria-hidden="true">
      <rect x="1" y="6.5" width="2.2" height="3.5" rx="0.5" fill="currentColor" />
      <rect x="4.8" y="3.5" width="2.2" height="6.5" rx="0.5" fill="currentColor" opacity={bars >= 2 ? 1 : 0.2} />
      <rect x="8.6" y="0.5" width="2.2" height="9.5" rx="0.5" fill="currentColor" opacity={bars >= 3 ? 1 : 0.2} />
    </svg>
  );
}

/* --------------------------------- badges --------------------------------- */

const badgeBase =
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px] font-medium whitespace-nowrap leading-tight transition-colors duration-150";

const statusBadgeBase =
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px] font-semibold whitespace-nowrap leading-tight transition-all duration-150";

const largeStatusBadgeBase =
  "inline-flex items-center gap-2 rounded-full border px-3.5 py-1 text-[13px] font-semibold whitespace-nowrap leading-tight transition-all duration-150";

export function StatusBadge({
  status,
  round,
  isAmended = false,
  size = "regular",
}: {
  status: Status;
  /** e.g. "ครั้งที่ 2" — shown next to an amended status. */
  round?: string;
  isAmended?: boolean;
  size?: "regular" | "large";
}) {
  const toneKey = getStatusTone(status);
  const tone = status === "Draft"
    ? { bg: "bg-surface-2", border: "border-line", text: "text-ink-2", fill: "bg-ink-3" }
    : TONE[toneKey];
  const label = STATUS_LABEL[status] || String(status);
  const base =
    size === "large"
      ? "inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold leading-none whitespace-nowrap shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all duration-150"
      : statusBadgeBase;
  const iconClass = size === "large" ? "h-3.5 w-3.5" : "h-3 w-3";

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`${base} min-w-[82px] justify-center ${tone.bg} ${tone.border} ${tone.text}`}>
        <StatusGlyph status={status} className={iconClass} />
        <span className="transition-opacity duration-150">{label}</span>
        {round ? <span className="font-mono opacity-70">{round}</span> : null}
      </span>
      {isAmended ? (
        <span className={`${base} border-amend-line bg-amend-bg text-amend`}>
          <span className="text-[11px]">✎</span>
          <span>แก้ไขแล้ว</span>
        </span>
      ) : null}
    </span>
  );
}

export function LockSpecBadge({
  level,
  score,
  showScore = true,
  outOf100 = false,
}: {
  level: RiskLevel;
  score: number;
  showScore?: boolean;
  outOf100?: boolean;
}) {
  const tone = TONE[RISK_TONE[level]];
  return (
    <span className={`${badgeBase} ${tone.bg} ${tone.border} ${tone.text}`}>
      <RiskMeter level={level} />
      <span className="transition-opacity duration-150">{RISK_LABEL[level]}</span>
      {showScore ? <span className="font-mono tnum opacity-70">{score}{outOf100 ? "/100" : ""}</span> : null}
    </span>
  );
}

function PriceVerdictBadge({ verdict, delta }: { verdict: PriceVerdict; delta: number }) {
  const tone = TONE[PRICE_TONE[verdict]];
  const abs = Math.abs(Math.round(delta));
  const label: Record<PriceVerdict, string> = {
    fair: "ราคาอยู่ในเกณฑ์ปกติ",
    over: `สูงกว่าค่ากลาง ${abs}%`,
    under: `ต่ำกว่าค่ากลาง ${abs}%`,
  };

  return (
    <span className={`${badgeBase} ${tone.bg} ${tone.border} ${tone.text}`}>
      <DirectionGlyph verdict={verdict} />
      <span className="transition-opacity duration-150">{label[verdict]}</span>
    </span>
  );
}

export function InsightPriceBadge({
  diffPercentage,
  sampleSize,
  historicalMedianTHB,
}: {
  diffPercentage?: number | null;
  sampleSize?: number | null;
  historicalMedianTHB?: number | null;
}) {
  if (historicalMedianTHB != null && historicalMedianTHB <= 0) {
    return (
      <span className={`${badgeBase} border-line bg-surface-2 text-ink-3`}>
        <span>—</span>
        <span>ไม่มีราคาเปรียบเทียบ</span>
      </span>
    );
  }

  if (sampleSize != null && sampleSize < 5) {
    return (
      <span className={`${badgeBase} border-line bg-surface-2 text-ink-3`}>
        <span>ℹ</span>
        <span>ข้อมูลไม่เพียงพอ (&lt;5 โครงการ)</span>
      </span>
    );
  }

  if (diffPercentage == null || Number.isNaN(diffPercentage)) {
    return (
      <span className={`${badgeBase} border-line bg-surface-2 text-ink-3`}>
        <span>—</span>
        <span>ไม่มีราคาเปรียบเทียบ</span>
      </span>
    );
  }

  const verdict: PriceVerdict =
    diffPercentage > 15 ? "over" : diffPercentage < -15 ? "under" : "fair";
  const tone = TONE[PRICE_TONE[verdict]];
  const abs = Math.abs(Math.round(diffPercentage * 10) / 10);
  const label: Record<PriceVerdict, string> = {
    fair: "ราคาอยู่ในเกณฑ์ปกติ",
    over: `สูงกว่าค่ากลาง ${abs}%`,
    under: `ต่ำกว่าค่ากลาง ${abs}%`,
  };

  return (
    <span className={`${badgeBase} ${tone.bg} ${tone.border} ${tone.text}`}>
      <DirectionGlyph verdict={verdict} />
      <span className="transition-opacity duration-150">{label[verdict]}</span>
    </span>
  );
}

export function PriceBadge({ tor }: { tor: Tor }) {
  return <PriceVerdictBadge verdict={tor.price.verdict} delta={priceDeltaPct(tor)} />;
}

/** The API's price check: % from the historical median, read with the detail page's ±15% line. */
export function PriceDeltaBadge({
  delta,
}: {
  delta: number | null | undefined;
}) {
  if (delta == null || Number.isNaN(delta)) {
    return (
      <span className={`${badgeBase} border-line bg-surface-2 text-ink-3`}>
        <span>—</span>
        <span>ไม่มีราคาเปรียบเทียบ</span>
      </span>
    );
  }
  const verdict: PriceVerdict = delta > 15 ? "over" : delta < -15 ? "under" : "fair";
  return <PriceVerdictBadge verdict={verdict} delta={delta} />;
}

/** The API's 0–100 lock-spec score, on the detail page's 35/70 lines. */
export function riskLevel(score: number): RiskLevel {
  return score >= 70 ? "high" : score >= 35 ? "medium" : "low";
}

/** Scope size and SME eligibility are categories, so they stay monochrome. */
export function ScopeBadge({ size }: { size: ScopeSize }) {
  return (
    <span className={`${badgeBase} min-w-[84px] justify-center border-line bg-surface-2 text-ink-2`}>
      <svg viewBox="0 0 12 10" className="h-2.5 w-3 shrink-0" aria-hidden="true">
        <circle cx="3" cy="5" r="2.2" fill="currentColor" />
        <circle cx="7.5" cy="5" r="2.2" fill="currentColor" opacity={size === "solo" ? 0.2 : 1} />
        <circle cx="11" cy="5" r="1" fill="currentColor" opacity={size === "firm" ? 1 : 0.2} />
      </svg>
      <span className="transition-opacity duration-150">{SCOPE_LABEL[size]}</span>
    </span>
  );
}

export function SmeBadge() {
  return (
    <span
      className={`${badgeBase} min-w-[74px] justify-center border-line bg-surface-2 text-ink-2`}
      title="เข้าเกณฑ์แต้มต่อ SME ตามกฎกระทรวง"
    >
      แต้มต่อ SME
    </span>
  );
}

/** Left-edge rail. In a dense list the rails form a scannable column of status. */
export function SignalRail({ status, className = "" }: { status: Status; className?: string }) {
  const toneKey = getStatusTone(status);
  const fill = status === "Draft" ? "bg-ink-3" : TONE[toneKey].fill;
  return (
    <span
      aria-hidden="true"
      className={`w-[5px] shrink-0 rounded-full ${fill} ${className}`}
    />
  );
}

/* -------------------------- lifecycle (FR-15) -------------------------- */

const LIFECYCLE_TONE: Record<TorStatus, Tone | null> = {
  Draft: null,
  Open: "open",
  Awarded: "closed",
  Closed: "closed",
  Cancelled: "closed",
};

const DEAD: TorStatus[] = ["Awarded", "Closed", "Cancelled"];
export const isDead = (status: TorStatus) => DEAD.includes(status);

function LifecycleGlyph({ status, className = "h-3 w-3 shrink-0" }: { status: TorStatus; className?: string }) {
  return (
    <svg viewBox="0 0 10 10" className={className} aria-hidden="true">
      {status === "Draft" && <circle cx="5" cy="5" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.4" />}
      {status === "Open" && <circle cx="5" cy="5" r="3.2" fill="currentColor" />}
      {status === "Awarded" && (
        <path d="M1.5 5.2 L4 7.6 L8.6 2.4" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      )}
      {status === "Closed" && (
        <path d="M1.5 1.5 L8.5 8.5 M8.5 1.5 L1.5 8.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      )}
      {status === "Cancelled" && (
        <>
          <circle cx="5" cy="5" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <path d="M2.5 7.5 L7.5 2.5" stroke="currentColor" strokeWidth="1.3" />
        </>
      )}
    </svg>
  );
}

/**
 * The status badge. The status sets the colour and the glyph, so a dense list
 * scans by colour; `stage` (from stageOf) names what e-GP announced, e.g.
 * "ยกเลิกประกาศเชิญชวน" rather than just "ยกเลิก".
 */
export function LifecycleBadge({
  status,
  stage,
  size = "regular",
}: {
  status: TorStatus;
  stage?: Stage;
  size?: "regular" | "large";
}) {
  const tone = LIFECYCLE_TONE[status];
  const { label, hint } = stage ?? stageOf({ status });
  const colours =
    status === "Closed"
      ? "border-dashed border-closed-line bg-surface text-ink-2"
      : tone
        ? `${TONE[tone].bg} ${TONE[tone].border} ${TONE[tone].text}`
        : "border-line-2 bg-surface text-ink-2";
  return (
    <span
      className={`${size === "large" ? largeStatusBadgeBase : statusBadgeBase} min-w-[82px] justify-center ${colours}`}
      title={hint}
    >
      <LifecycleGlyph status={status} className={size === "large" ? "h-3.5 w-3.5 shrink-0" : undefined} />
      <span>{label}</span>
      {hint ? <span className="sr-only"> ({hint})</span> : null}
    </span>
  );
}

/**
 * Overlaid on whichever status applies: the status says the stage, this says
 * the document changed (ADR 0032). Two looks, told apart by glyph and words
 * as well as colour: the agency announced it, or the platform found it,
 * muted and dashed like Closed because it is an inference.
 */
export function ChangeMarker({ source }: { source: ChangeSource }) {
  const { marker, hint } = CHANGE_SOURCE[source];
  const colours =
    source === "feed"
      ? `${TONE.amend.bg} ${TONE.amend.border} ${TONE.amend.text}`
      : "border-dashed border-closed-line bg-surface text-ink-2";
  return (
    <span className={`${statusBadgeBase} ${colours}`} title={hint}>
      <svg viewBox="0 0 10 10" className="h-3 w-3 shrink-0" aria-hidden="true">
        {source === "feed" ? (
          <>
            <rect x="0" y="2.2" width="7" height="1.8" fill="currentColor" />
            <rect x="3" y="6" width="7" height="1.8" fill="currentColor" />
          </>
        ) : (
          // ≠: what e-GP has differs from what was saved
          <>
            <rect x="0.5" y="2.6" width="9" height="1.5" fill="currentColor" />
            <rect x="0.5" y="5.9" width="9" height="1.5" fill="currentColor" />
            <path d="M7 0.8 3 9.2" stroke="currentColor" strokeWidth="1.4" />
          </>
        )}
      </svg>
      <span>{marker}</span>
      <span className="sr-only"> ({hint})</span>
    </span>
  );
}

/** Who may bid is a category, not a verdict, so it stays monochrome. Decisive for freelancers. */
export function CompaniesOnlyBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-line-2/70 bg-surface-3 px-2.5 py-0.5 text-[11px] font-medium text-ink-2 whitespace-nowrap leading-tight ${className}`}
      title="TOR กำหนดให้ผู้ยื่นเป็นนิติบุคคล"
    >
      <span className="text-[10px] opacity-75" aria-hidden="true">🏢</span>
      <span>เฉพาะนิติบุคคล</span>
    </span>
  );
}

/** The status column for API rows. An amended TOR still taking bids reads "look closer". */
export function LifecycleRail({ status, amended = false }: { status: TorStatus; amended?: boolean }) {
  const fill = isDead(status)
    ? TONE.closed.fill
    : amended
      ? TONE.amend.fill
      : status === "Open"
        ? TONE.open.fill
        : "bg-line-2";
  return (
    <span
      aria-hidden="true"
      className={`w-[5px] shrink-0 rounded-full ${fill}`}
    />
  );
}

export function MatchScore({
  score,
}: {
  score: number;
  match?: Match;
}) {
  const strong = score >= 70;
  return (
    <span
      className="inline-flex items-center gap-2 whitespace-nowrap"
      title={`คะแนนความเหมาะสมกับทักษะของคุณ ${score}/100 — ดูการวิเคราะห์ 6 มิติฉบับเต็มในหน้ารายละเอียด`}
    >
      <span
        className={`font-mono tnum text-[13px] sm:text-[14px] font-bold leading-tight ${
          strong ? "text-open" : "text-ink"
        }`}
      >
        {score}
        <span className="text-[10.5px] font-normal text-ink-3">/100</span>
      </span>
      <span className="relative h-[4px] w-12 sm:w-14 overflow-hidden rounded-full bg-line shrink-0">
        <span
          className={`absolute inset-y-0 left-0 rounded-full ${strong ? "bg-open" : "bg-ink-2"}`}
          style={{ width: `${score}%` }}
        />
      </span>
      <span className="sr-only">คะแนนความเหมาะสมกับทักษะของคุณ</span>
    </span>
  );
}

/**
 * The three verdicts in a fixed order — status, lock-spec, price — so a reader
 * learns the position once and can then read any screen at a glance.
 */
export function VerdictStrip({
  tor,
  insight,
  size = "compact",
}: {
  tor?: Tor;
  insight?: TorInsightSummary;
  size?: "compact" | "full";
}) {
  if (insight) {
    const status = insight.identification.status;
    const isAmended = insight.amendmentInfo?.isAmended || false;
    const lockScore = insight.analytics?.lockSpec?.riskScore ?? 0;
    const lockLevel: RiskLevel = lockScore >= 70 ? "high" : lockScore >= 35 ? "medium" : "low";
    const diffPct = insight.analytics?.priceAnalysis?.diffPercentage;

    if (size === "compact") {
      return (
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status={status} isAmended={isAmended} />
          <LockSpecBadge level={lockLevel} score={lockScore} />
          <InsightPriceBadge diffPercentage={diffPct} />
        </div>
      );
    }

    const cells: { label: string; node: React.ReactNode }[] = [
      {
        label: "สถานะ",
        node: <StatusBadge status={status} isAmended={isAmended} />,
      },
      {
        label: "ความเสี่ยงล็อกสเปก",
        node: <LockSpecBadge level={lockLevel} score={lockScore} />,
      },
      {
        label: "ตรวจสอบราคา",
        node: <InsightPriceBadge diffPercentage={diffPct} />,
      },
    ];

    return (
      <div className="grid grid-cols-1 divide-y divide-line rounded-xl border border-line bg-surface-2 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {cells.map((cell) => (
          <div key={cell.label} className="flex flex-col gap-2 px-3.5 py-3">
            <Label>{cell.label}</Label>
            {cell.node}
          </div>
        ))}
      </div>
    );
  }

  if (!tor) return null;

  const round =
    tor.isAmended && tor.amendments?.[0]
      ? tor.amendments[0].round.replace("ประกาศร่าง TOR ", "")
      : undefined;

  if (size === "compact") {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge status={tor.status} isAmended={tor.isAmended} round={round} />
        <LockSpecBadge level={tor.lockSpec.level} score={tor.lockSpec.score} />
        <PriceBadge tor={tor} />
      </div>
    );
  }

  const cells: { label: string; node: React.ReactNode }[] = [
    {
      label: "สถานะ",
      node: <StatusBadge status={tor.status} isAmended={tor.isAmended} round={round} />,
    },
    {
      label: "ความเสี่ยงล็อกสเปก",
      node: <LockSpecBadge level={tor.lockSpec.level} score={tor.lockSpec.score} />,
    },
    {
      label: "ตรวจสอบราคา",
      node: <PriceBadge tor={tor} />,
    },
  ];

  return (
    <div className="grid grid-cols-1 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface-2 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      {cells.map((cell) => (
        <div key={cell.label} className="flex flex-col gap-2 px-3.5 py-3">
          <Label>{cell.label}</Label>
          {cell.node}
        </div>
      ))}
    </div>
  );
}
