import type { Lang, PriceVerdict, RiskLevel, ScopeSize, Status, Tor } from "../_data/tors";
import { priceDeltaPct } from "../_data/tors";
import type { TorInsightSummary, TorStatus } from "../_lib/api";

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

const STATUS_LABEL: Record<Status, Bi> = {
  Draft: { th: "ร่างประกาศ / วิจารณ์", en: "Draft TOR" },
  Open: { th: "เปิดรับข้อเสนอ", en: "Open" },
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
  return (
    <svg viewBox="0 0 10 10" className={`h-2.5 w-2.5 shrink-0 ${className}`} aria-hidden="true">
      <path
        d="M2.5 5.2 L4.2 7 L7.8 3"
        stroke="currentColor"
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
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

const statusBadgeBase =
  "inline-flex items-center gap-1.5 rounded-[3px] border px-2.5 py-1 text-[12.5px] font-semibold leading-none whitespace-nowrap shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-all duration-150";

export function StatusBadge({
  status,
  lang,
  round,
  isAmended = false,
  size = "regular",
}: {
  status: Status;
  lang: Lang;
  /** e.g. "ครั้งที่ 2" — shown next to an amended status. */
  round?: string;
  isAmended?: boolean;
  size?: "regular" | "large";
}) {
  const toneKey = getStatusTone(status);
  const tone = status === "Draft"
    ? { bg: "bg-surface-2", border: "border-line", text: "text-ink-2", fill: "bg-ink-3" }
    : TONE[toneKey];
  const label = STATUS_LABEL[status] || { th: String(status), en: String(status) };
  const base =
    size === "large"
      ? "inline-flex items-center gap-2 rounded-[3px] border px-3 py-1.5 text-[13px] font-semibold leading-none whitespace-nowrap shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all duration-150"
      : statusBadgeBase;
  const iconClass = size === "large" ? "h-3.5 w-3.5" : "h-3 w-3";

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`${base} min-w-[82px] justify-center ${tone.bg} ${tone.border} ${tone.text}`}>
        <StatusGlyph status={status} className={iconClass} />
        <span className="transition-opacity duration-150">{say(label, lang)}</span>
        {round ? <span className="font-mono opacity-70">{round}</span> : null}
      </span>
      {isAmended ? (
        <span className={`${base} border-amend-line bg-amend-bg text-amend`}>
          <span className="text-[11px]">✎</span>
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

function PriceVerdictBadge({ verdict, delta, lang }: { verdict: PriceVerdict; delta: number; lang: Lang }) {
  const tone = TONE[PRICE_TONE[verdict]];
  const abs = Math.abs(Math.round(delta));
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

export function PriceBadge({ tor, lang }: { tor: Tor; lang: Lang }) {
  return <PriceVerdictBadge verdict={tor.price.verdict} delta={priceDeltaPct(tor)} lang={lang} />;
}

/** The API's price check: % from the historical median, read with the detail page's ±15% line. */
export function PriceDeltaBadge({ delta, lang }: { delta: number; lang: Lang }) {
  const verdict: PriceVerdict = delta > 15 ? "over" : delta < -15 ? "under" : "fair";
  return <PriceVerdictBadge verdict={verdict} delta={delta} lang={lang} />;
}

/** The API's 0–100 lock-spec score, on the detail page's 35/70 lines. */
export function riskLevel(score: number): RiskLevel {
  return score >= 70 ? "high" : score >= 35 ? "medium" : "low";
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

/**
 * The five statuses the API returns, with Amended as a separate flag. The
 * three dead ones share the grey hue but keep their own glyph, and Closed is
 * also drawn dashed and drained: it is the platform's inference from the
 * deadline, not something the agency announced.
 */
const LIFECYCLE: Record<TorStatus, { tone: Tone | null; label: Bi; hint?: Bi }> = {
  Draft: {
    tone: null,
    label: { th: "ร่าง TOR", en: "Draft" },
    hint: {
      th: "ร่างเพื่อรับฟังความเห็น ยังไม่เปิดรับข้อเสนอ",
      en: "Out for public hearing; bids are not open yet",
    },
  },
  Open: { tone: "open", label: { th: "เปิดรับข้อเสนอ", en: "Open" } },
  Awarded: { tone: "closed", label: { th: "ประกาศผู้ชนะแล้ว", en: "Awarded" } },
  Closed: {
    tone: "closed",
    label: { th: "ปิดรับแล้ว", en: "Closed" },
    hint: {
      th: "ประเมินจากวันปิดรับ หน่วยงานยังไม่แจ้งผล",
      en: "Inferred from the deadline; the agency hasn't reported an outcome",
    },
  },
  Cancelled: { tone: "closed", label: { th: "ยกเลิก", en: "Cancelled" } },
};

export const lifecycleLabel = (status: TorStatus, lang: Lang) => say(LIFECYCLE[status].label, lang);

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

export function LifecycleBadge({ status, lang }: { status: TorStatus; lang: Lang }) {
  const { tone, label, hint } = LIFECYCLE[status];
  const colours =
    status === "Closed"
      ? "border-dashed border-closed-line bg-surface text-ink-2"
      : tone
        ? `${TONE[tone].bg} ${TONE[tone].border} ${TONE[tone].text}`
        : "border-line-2 bg-surface text-ink-2";
  return (
    <span className={`${statusBadgeBase} min-w-[82px] justify-center ${colours}`} title={hint ? say(hint, lang) : undefined}>
      <LifecycleGlyph status={status} />
      <span>{say(label, lang)}</span>
      {hint ? <span className="sr-only"> ({say(hint, lang)})</span> : null}
    </span>
  );
}

/** Overlaid on whichever status applies: a TOR can be amended while it stays Open. */
export function AmendedFlag({ lang }: { lang: Lang }) {
  const tone = TONE.amend;
  return (
    <span className={`${statusBadgeBase} ${tone.bg} ${tone.border} ${tone.text}`}>
      <svg viewBox="0 0 10 10" className="h-3 w-3 shrink-0" aria-hidden="true">
        <rect x="0" y="2.2" width="7" height="1.8" fill="currentColor" />
        <rect x="3" y="6" width="7" height="1.8" fill="currentColor" />
      </svg>
      <span>{lang === "th" ? "แก้ไขแล้ว" : "Amended"}</span>
    </span>
  );
}

/** Who may bid is a category, not a verdict, so it stays monochrome. Decisive for freelancers. */
export function CompaniesOnlyBadge({ lang }: { lang: Lang }) {
  return (
    <span
      className={`${badgeBase} border-line bg-surface-2 text-ink-2`}
      title={lang === "th" ? "TOR กำหนดให้ผู้ยื่นเป็นนิติบุคคล" : "The TOR requires bidders to be a registered company"}
    >
      {lang === "th" ? "เฉพาะนิติบุคคล" : "Companies only"}
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
      ? tor.amendments[0].round.th.replace("ประกาศร่าง TOR ", "")
      : undefined;

  if (size === "compact") {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge status={tor.status} isAmended={tor.isAmended} lang={lang} round={round} />
        <LockSpecBadge level={tor.lockSpec.level} score={tor.lockSpec.score} lang={lang} />
        <PriceBadge tor={tor} lang={lang} />
      </div>
    );
  }

  const cells: { label: string; node: React.ReactNode }[] = [
    {
      label: lang === "th" ? "สถานะ" : "Status",
      node: <StatusBadge status={tor.status} isAmended={tor.isAmended} lang={lang} round={round} />,
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
          <Label>{cell.label}</Label>
          {cell.node}
        </div>
      ))}
    </div>
  );
}

