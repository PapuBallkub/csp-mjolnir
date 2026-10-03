import type { Lang, PriceVerdict, RiskLevel, ScopeSize, Status, Tor } from "../_data/tors";
import { priceDeltaPct } from "../_data/tors";
import type { TorInsightSummary } from "../_lib/api";

export type ApiStatus = "Draft" | "Open" | "Awarded" | "Closed" | "Cancelled";

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

export function getStatusTone(status: Status | ApiStatus): Tone {
  switch (status) {
    case "open":
    case "Open":
      return "open";
    case "amended":
      return "amend";
    case "Cancelled":
      return "risk";
    case "closed":
    case "Closed":
    case "Awarded":
    case "Draft":
    default:
      return "closed";
  }
}

/* Exported so a whole panel can wear the same hue as the badge inside it. */
export const STATUS_TONE: Record<Status, Tone> = {
  open: "open",
  amended: "amend",
  closed: "closed",
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

const STATUS_LABEL: Record<Status | ApiStatus, Bi> = {
  open: { th: "เปิดรับข้อเสนอ", en: "Open" },
  amended: { th: "แก้ไขแล้ว", en: "Amended" },
  closed: { th: "ประกาศผู้ชนะแล้ว", en: "Closed — awarded" },
  Open: { th: "เปิดรับข้อเสนอ", en: "Open" },
  Draft: { th: "ร่างประกาศ / วิจารณ์", en: "Draft TOR" },
  Awarded: { th: "ประกาศผู้ชนะแล้ว", en: "Awarded" },
  Closed: { th: "ปิดรับข้อเสนอ", en: "Closed" },
  Cancelled: { th: "ยกเลิกประกาศ", en: "Cancelled" },
};

const RISK_LABEL: Record<RiskLevel, Bi> = {
  low: { th: "ความเสี่ยงล็อกสเปกต่ำ", en: "Low lock-spec risk" },
  medium: { th: "ความเสี่ยงล็อกสเปกปานกลาง", en: "Medium lock-spec risk" },
  high: { th: "ความเสี่ยงล็อกสเปกสูง", en: "High lock-spec risk" },
};

const SCOPE_LABEL: Record<ScopeSize, Bi> = {
  solo: { th: "ทำคนเดียวไหว", en: "Solo-sized" },
  "small-team": { th: "ทีมเล็ก 2–5 คน", en: "Small team" },
  firm: { th: "ต้องใช้บริษัท", en: "Firm-sized" },
};

type Bi = { th: string; en: string };
const say = (v: Bi, lang: Lang) => (lang === "th" ? v.th : v.en);

/* --------------------------------- glyphs --------------------------------- */

function StatusGlyph({ status, className = "" }: { status: Status | ApiStatus; className?: string }) {
  if (status === "open" || status === "Open") {
    return (
      <svg viewBox="0 0 10 10" className={`h-2.5 w-2.5 shrink-0 ${className}`} aria-hidden="true">
        <circle cx="5" cy="5" r="3.2" fill="currentColor" />
      </svg>
    );
  }
  if (status === "amended") {
    return (
      <svg viewBox="0 0 10 10" className={`h-2.5 w-2.5 shrink-0 ${className}`} aria-hidden="true">
        <rect x="0" y="2.2" width="7" height="1.8" fill="currentColor" />
        <rect x="3" y="6" width="7" height="1.8" fill="currentColor" />
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
  if (status === "Cancelled") {
    return (
      <svg viewBox="0 0 10 10" className={`h-2.5 w-2.5 shrink-0 ${className}`} aria-hidden="true">
        <path d="M2 2 L8 8 M8 2 L2 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 10 10" className={`h-2.5 w-2.5 shrink-0 ${className}`} aria-hidden="true">
      <path
        d="M1.5 1.5 L8.5 8.5 M8.5 1.5 L1.5 8.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Ascending three-tick meter. Used only for lock-spec risk, never elsewhere. */
export function RiskMeter({ level, className = "" }: { level: RiskLevel; className?: string }) {
  const filled = { low: 1, medium: 2, high: 3 }[level];
  const tone = TONE[RISK_TONE[level]];
  const heights = ["h-[5px]", "h-[8px]", "h-[11px]"];

  return (
    <span className={`inline-flex items-end gap-[2px] ${className}`} aria-hidden="true">
      {heights.map((h, i) => (
        <span
          key={h}
          className={`w-[3px] rounded-[1px] ${h} ${i < filled ? tone.fill : "bg-line-2"}`}
        />
      ))}
    </span>
  );
}

function DirectionGlyph({ verdict }: { verdict: PriceVerdict }) {
  return (
    <svg viewBox="0 0 10 10" className="h-2.5 w-2.5 shrink-0" aria-hidden="true">
      {verdict === "over" && <path d="M5 1.5 L9 8 L1 8 Z" fill="currentColor" />}
      {verdict === "under" && <path d="M5 8.5 L1 2 L9 2 Z" fill="currentColor" />}
      {verdict === "fair" && (
        <path
          d="M1 3.6 C3 2.2, 4 5, 6 3.6 S8.6 2.6, 9 3.6 M1 6.8 C3 5.4, 4 8.2, 6 6.8 S8.6 5.8, 9 6.8"
          stroke="currentColor"
          strokeWidth="1.1"
          fill="none"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

/* --------------------------------- badges --------------------------------- */

const badgeBase =
  "inline-flex items-center gap-1.5 rounded-[2px] border px-2 py-[3px] text-[11px] font-medium leading-none whitespace-nowrap transition-all duration-150";

export function StatusBadge({
  status,
  lang,
  round,
  isAmended = false,
}: {
  status: Status | ApiStatus;
  lang: Lang;
  /** e.g. "ครั้งที่ 2" — shown next to an amended status. */
  round?: string;
  isAmended?: boolean;
}) {
  const toneKey = getStatusTone(status);
  const tone = status === "Draft"
    ? { bg: "bg-surface-2", border: "border-line", text: "text-ink-2", fill: "bg-ink-3" }
    : TONE[toneKey];
  const label = STATUS_LABEL[status] || { th: String(status), en: String(status) };

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`${badgeBase} min-w-[74px] justify-center ${tone.bg} ${tone.border} ${tone.text}`}>
        <StatusGlyph status={status} />
        <span className="transition-opacity duration-150">{say(label, lang)}</span>
        {round ? <span className="font-mono opacity-70">{round}</span> : null}
      </span>
      {isAmended ? (
        <span className={`${badgeBase} border-amend-line bg-amend-bg text-amend`}>
          <span>✎</span>
          <span>{lang === "th" ? "แก้ไขแล้ว" : "Amended"}</span>
        </span>
      ) : null}
    </span>
  );
}

export function LockSpecBadge({
  level,
  score,
  lang,
  showScore = true,
}: {
  level: RiskLevel;
  score: number;
  lang: Lang;
  showScore?: boolean;
}) {
  const tone = TONE[RISK_TONE[level]];
  return (
    <span className={`${badgeBase} ${tone.bg} ${tone.border} ${tone.text}`}>
      <RiskMeter level={level} />
      <span className="transition-opacity duration-150">{say(RISK_LABEL[level], lang)}</span>
      {showScore ? <span className="font-mono tnum opacity-70">{score}</span> : null}
    </span>
  );
}

export function PriceBadge({ tor, lang }: { tor: Tor; lang: Lang }) {
  const delta = priceDeltaPct(tor);
  const tone = TONE[PRICE_TONE[tor.price.verdict]];
  const abs = Math.abs(delta);
  const label: Record<PriceVerdict, Bi> = {
    fair: { th: "ราคาอยู่ในเกณฑ์ปกติ", en: "Budget looks normal" },
    over: { th: `สูงกว่าค่ากลาง ${abs}%`, en: `${abs}% above median` },
    under: { th: `ต่ำกว่าค่ากลาง ${abs}%`, en: `${abs}% below median` },
  };
  return (
    <span className={`${badgeBase} ${tone.bg} ${tone.border} ${tone.text}`}>
      <DirectionGlyph verdict={tor.price.verdict} />
      <span className="transition-opacity duration-150">{say(label[tor.price.verdict], lang)}</span>
    </span>
  );
}

export function InsightPriceBadge({
  diffPercentage,
  lang,
}: {
  diffPercentage?: number | null;
  lang: Lang;
}) {
  if (diffPercentage == null || Number.isNaN(diffPercentage)) {
    return (
      <span className={`${badgeBase} border-line bg-surface-2 text-ink-3`}>
        <span>—</span>
        <span>{lang === "th" ? "ไม่มีราคาเปรียบเทียบ" : "No price comp"}</span>
      </span>
    );
  }

  const verdict: PriceVerdict =
    diffPercentage > 15 ? "over" : diffPercentage < -15 ? "under" : "fair";
  const tone = TONE[PRICE_TONE[verdict]];
  const abs = Math.abs(Math.round(diffPercentage * 10) / 10);
  const label: Record<PriceVerdict, Bi> = {
    fair: { th: "ราคาอยู่ในเกณฑ์ปกติ", en: "Budget looks normal" },
    over: { th: `สูงกว่าค่ากลาง ${abs}%`, en: `${abs}% above median` },
    under: { th: `ต่ำกว่าค่ากลาง ${abs}%`, en: `${abs}% below median` },
  };

  return (
    <span className={`${badgeBase} ${tone.bg} ${tone.border} ${tone.text}`}>
      <DirectionGlyph verdict={verdict} />
      <span className="transition-opacity duration-150">{say(label[verdict], lang)}</span>
    </span>
  );
}

/** Scope size and SME eligibility are categories, so they stay monochrome. */
export function ScopeBadge({ size, lang }: { size: ScopeSize; lang: Lang }) {
  return (
    <span className={`${badgeBase} min-w-[84px] justify-center border-line bg-surface-2 text-ink-2`}>
      <svg viewBox="0 0 12 10" className="h-2.5 w-3 shrink-0" aria-hidden="true">
        <circle cx="3" cy="5" r="2.2" fill="currentColor" />
        <circle cx="7.5" cy="5" r="2.2" fill="currentColor" opacity={size === "solo" ? 0.2 : 1} />
        <circle cx="11" cy="5" r="1" fill="currentColor" opacity={size === "firm" ? 1 : 0.2} />
      </svg>
      <span className="transition-opacity duration-150">{say(SCOPE_LABEL[size], lang)}</span>
    </span>
  );
}

export function SmeBadge({ lang }: { lang: Lang }) {
  return (
    <span
      className={`${badgeBase} min-w-[74px] justify-center border-line bg-surface-2 text-ink-2`}
      title={
        lang === "th"
          ? "เข้าเกณฑ์แต้มต่อ SME ตามกฎกระทรวง"
          : "Eligible for the government's SME bidding advantage"
      }
    >
      {lang === "th" ? "แต้มต่อ SME" : "SME advantage"}
    </span>
  );
}

/** Left-edge rail. In a dense list the rails form a scannable column of status. */
export function SignalRail({ status, className = "" }: { status: Status | ApiStatus; className?: string }) {
  const toneKey = getStatusTone(status);
  const fill = status === "Draft" ? "bg-ink-3" : TONE[toneKey].fill;
  const isMuted = status === "closed" || status === "Closed" || status === "Draft" || status === "Awarded";
  return (
    <span
      aria-hidden="true"
      className={`w-[3px] shrink-0 rounded-full ${fill} ${isMuted ? "opacity-50" : ""} ${className}`}
    />
  );
}

export function MatchScore({ score, lang }: { score: number; lang: Lang }) {
  const strong = score >= 80;
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span className="relative h-[3px] w-12 overflow-hidden rounded-full bg-line">
        <span
          className={`absolute inset-y-0 left-0 rounded-full ${strong ? "bg-open" : "bg-ink-2"}`}
          style={{ width: `${score}%` }}
        />
      </span>
      <span
        className={`font-mono tnum text-[12px] font-medium ${strong ? "text-open" : "text-ink-2"}`}
      >
        {score}
        <span className="text-ink-3">/100</span>
      </span>
      <span className="sr-only">{lang === "th" ? "คะแนนความเหมาะสม" : "match score"}</span>
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
  lang,
  size = "compact",
}: {
  tor?: Tor;
  insight?: TorInsightSummary;
  lang: Lang;
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
          <StatusBadge status={status} lang={lang} isAmended={isAmended} />
          <LockSpecBadge level={lockLevel} score={lockScore} lang={lang} />
          <InsightPriceBadge diffPercentage={diffPct} lang={lang} />
        </div>
      );
    }

    const cells: { label: string; node: React.ReactNode }[] = [
      {
        label: lang === "th" ? "สถานะ" : "Status",
        node: <StatusBadge status={status} lang={lang} isAmended={isAmended} />,
      },
      {
        label: lang === "th" ? "ความเสี่ยงล็อกสเปก" : "Lock-spec risk",
        node: <LockSpecBadge level={lockLevel} score={lockScore} lang={lang} />,
      },
      {
        label: lang === "th" ? "ตรวจสอบราคา" : "Price reality check",
        node: <InsightPriceBadge diffPercentage={diffPct} lang={lang} />,
      },
    ];

    return (
      <div className="grid grid-cols-1 divide-y divide-line rounded-[3px] border border-line bg-surface-2 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {cells.map((cell) => (
          <div key={cell.label} className="flex flex-col gap-2 px-3.5 py-3">
            <span className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-ink-3">
              {cell.label}
            </span>
            {cell.node}
          </div>
        ))}
      </div>
    );
  }

  if (!tor) return null;

  const round =
    tor.status === "amended" ? tor.amendments[0].round.th.replace("ประกาศร่าง TOR ", "") : undefined;

  if (size === "compact") {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge status={tor.status} lang={lang} round={round} />
        <LockSpecBadge level={tor.lockSpec.level} score={tor.lockSpec.score} lang={lang} />
        <PriceBadge tor={tor} lang={lang} />
      </div>
    );
  }

  const cells: { label: string; node: React.ReactNode }[] = [
    {
      label: lang === "th" ? "สถานะ" : "Status",
      node: <StatusBadge status={tor.status} lang={lang} round={round} />,
    },
    {
      label: lang === "th" ? "ความเสี่ยงล็อกสเปก" : "Lock-spec risk",
      node: <LockSpecBadge level={tor.lockSpec.level} score={tor.lockSpec.score} lang={lang} />,
    },
    {
      label: lang === "th" ? "ตรวจสอบราคา" : "Price reality check",
      node: <PriceBadge tor={tor} lang={lang} />,
    },
  ];

  return (
    <div className="grid grid-cols-1 divide-y divide-line rounded-[3px] border border-line bg-surface-2 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      {cells.map((cell) => (
        <div key={cell.label} className="flex flex-col gap-2 px-3.5 py-3">
          <span className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-ink-3">
            {cell.label}
          </span>
          {cell.node}
        </div>
      ))}
    </div>
  );
}

