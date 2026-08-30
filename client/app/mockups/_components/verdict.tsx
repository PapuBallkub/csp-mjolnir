import type { Lang, PriceVerdict, RiskLevel, ScopeSize, Status, Tor } from "../_data/tors";
import { priceDeltaPct } from "../_data/tors";

/**
 * The verdict layer — the one thing this product has that a plain listing site
 * does not, so it is also the visual thread that runs through every screen.
 *
 * Three rules hold the system together:
 *
 *   1. Hue encodes a verdict, never a category. Green = go, amber = look
 *      closer, crimson = this will cost you, grey = dead. That is why a "low
 *      lock-spec risk" and an "open" status share a colour: both mean go.
 *   2. Colour is never the only carrier. Every badge pairs its hue with a
 *      glyph and a word, so the system survives greyscale printing and
 *      colour-blind readers.
 *   3. A dashed edge means *we* inferred it; a solid edge means the agency
 *      said it. Only `closed` is drawn dashed, because it is the one state we
 *      derive ourselves — the deadline passed and no result was ever posted.
 */

export type Tone = "open" | "amend" | "risk" | "closed" | "neutral";

/* Full class strings, never composed at runtime, so Tailwind can see them. */
const TONE: Record<Tone, { text: string; bg: string; border: string; fill: string }> = {
  open: { text: "text-open", bg: "bg-open-bg", border: "border-open-line", fill: "bg-open" },
  amend: { text: "text-amend", bg: "bg-amend-bg", border: "border-amend-line", fill: "bg-amend" },
  risk: { text: "text-risk", bg: "bg-risk-bg", border: "border-risk-line", fill: "bg-risk" },
  closed: {
    text: "text-closed",
    bg: "bg-closed-bg",
    border: "border-closed-line",
    fill: "bg-closed",
  },
  neutral: { text: "text-ink-2", bg: "bg-surface-3", border: "border-line-2", fill: "bg-ink-3" },
};

/* Exported so a whole panel can wear the same hue as the badge inside it. */
export const STATUS_TONE: Record<Status, Tone> = {
  draft: "neutral",
  open: "open",
  awarded: "closed",
  closed: "closed",
  cancelled: "risk",
};

/**
 * The badge skin per lifecycle state. Tone alone is not enough here: `awarded`
 * and `closed` share the drained grey, and the whole point of the distinction
 * is that one is the agency's word and the other is our inference — so the
 * inferred one is the only badge in the system with no fill and a dashed edge.
 */
const STATUS_SKIN: Record<Status, string> = {
  draft: "border-line-2 bg-surface-3 text-ink-2",
  open: "border-open-line bg-open-bg text-open",
  awarded: "border-closed-line bg-closed-bg text-closed",
  closed: "border-dashed border-closed-line bg-transparent text-closed",
  cancelled: "border-risk-line bg-risk-bg text-risk",
};

/** Left-edge rail colour for a card or row wearing this status. */
export const STATUS_RAIL: Record<Status, string> = {
  draft: "border-l-line-2",
  open: "border-l-open",
  awarded: "border-l-closed",
  closed: "border-l-closed-line",
  cancelled: "border-l-risk",
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
  draft: { th: "ร่าง TOR", en: "Draft" },
  open: { th: "เปิดรับข้อเสนอ", en: "Open" },
  awarded: { th: "ประกาศผู้ชนะแล้ว", en: "Awarded" },
  closed: { th: "เลยกำหนดยื่นแล้ว", en: "Closed" },
  cancelled: { th: "ยกเลิกประกาศ", en: "Cancelled" },
};

/** What each state means, in one sentence, wherever there is room to say it. */
export const STATUS_NOTE: Record<Status, Bi> = {
  draft: {
    th: "ยังเป็นร่าง อยู่ระหว่างรับฟังความคิดเห็น ยังยื่นข้อเสนอไม่ได้ และข้อกำหนดยังเปลี่ยนได้",
    en: "Still a draft under public comment — you cannot bid yet, and the requirements can still move.",
  },
  open: {
    th: "เปิดรับข้อเสนออยู่ ณ ขณะนี้",
    en: "Accepting proposals right now.",
  },
  awarded: {
    th: "หน่วยงานประกาศผู้ชนะแล้ว",
    en: "The agency has announced a winner.",
  },
  closed: {
    th: "เราสรุปเองว่าปิดแล้ว เพราะเลยกำหนดยื่นและหน่วยงานยังไม่ประกาศผล ควรยืนยันกับต้นทางก่อน",
    en: "Our inference, not the agency's word: the deadline passed and no result was posted. Worth confirming at the source.",
  },
  cancelled: {
    th: "หน่วยงานยกเลิกประกาศนี้แล้ว",
    en: "The agency withdrew this notice.",
  },
};

const RISK_LABEL: Record<RiskLevel, Bi> = {
  low: { th: "ความเสี่ยงล็อกสเปกต่ำ", en: "Low lock-spec risk" },
  medium: { th: "ความเสี่ยงล็อกสเปกปานกลาง", en: "Medium lock-spec risk" },
  high: { th: "ความเสี่ยงล็อกสเปกสูง", en: "High lock-spec risk" },
};

const SCOPE_LABEL: Record<ScopeSize, Bi> = {
  "small-team": { th: "ทีมเล็ก 2–5 คน", en: "Small team" },
  firm: { th: "ต้องใช้บริษัท", en: "Firm-sized" },
};

type Bi = { th: string; en: string };
const say = (v: Bi, lang: Lang) => (lang === "th" ? v.th : v.en);

/* --------------------------------- glyphs --------------------------------- */

function StatusGlyph({ status }: { status: Status }) {
  return (
    <svg viewBox="0 0 10 10" className="h-3 w-3 shrink-0" aria-hidden="true">
      {/* Draft — an outline, because nothing is settled yet. */}
      {status === "draft" && (
        <circle cx="5" cy="5" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
      )}
      {status === "open" && <circle cx="5" cy="5" r="3.4" fill="currentColor" />}
      {/* Awarded — a decision was made and recorded. */}
      {status === "awarded" && (
        <path
          d="M1.4 5.4 L4 8 L8.8 2.2"
          stroke="currentColor"
          strokeWidth="1.8"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {status === "closed" && (
        <path
          d="M1.6 1.6 L8.4 8.4 M8.4 1.6 L1.6 8.4"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      )}
      {/* Cancelled — struck through, the way the notice itself is. */}
      {status === "cancelled" && (
        <>
          <circle cx="5" cy="5" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M2.5 7.5 L7.5 2.5" stroke="currentColor" strokeWidth="1.5" />
        </>
      )}
    </svg>
  );
}

/** Two offset bars — the same mark the amendment diff uses. */
function AmendGlyph() {
  return (
    <svg viewBox="0 0 10 10" className="h-3 w-3 shrink-0" aria-hidden="true">
      <rect x="0" y="2" width="7" height="2" fill="currentColor" />
      <rect x="3" y="6" width="7" height="2" fill="currentColor" />
    </svg>
  );
}

/** Ascending three-tick meter. Used only for lock-spec risk, never elsewhere. */
export function RiskMeter({ level, className = "" }: { level: RiskLevel; className?: string }) {
  const filled = { low: 1, medium: 2, high: 3 }[level];
  const tone = TONE[RISK_TONE[level]];
  const heights = ["h-[5px]", "h-[9px]", "h-[13px]"];

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
    <svg viewBox="0 0 10 10" className="h-3 w-3 shrink-0" aria-hidden="true">
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

/**
 * Badges run smaller than body copy on purpose — they are labels on an object,
 * not text to be read in sequence — but not so small that a glance costs
 * effort, so 12px with a real border is the floor.
 */
const badgeBase =
  "inline-flex items-center gap-1.5 rounded-[2px] border px-2 py-[3px] text-[12px] font-medium leading-none whitespace-nowrap";

export function StatusBadge({ status, lang }: { status: Status; lang: Lang }) {
  return (
    <span className={`${badgeBase} ${STATUS_SKIN[status]}`} title={say(STATUS_NOTE[status], lang)}>
      <StatusGlyph status={status} />
      {say(STATUS_LABEL[status], lang)}
    </span>
  );
}

/**
 * The revision flag. It is not a status — a TOR can be revised while it is a
 * draft, while it is open, or right up to the award — so it rides alongside
 * the lifecycle badge rather than replacing it (§5).
 */
export function AmendedFlag({
  lang,
  round,
  className = "",
}: {
  lang: Lang;
  /** e.g. "ครั้งที่ 2" — which revision this is. */
  round?: string;
  className?: string;
}) {
  return (
    <span
      className={`${badgeBase} border-amend-line bg-amend-bg text-amend ${className}`}
      title={
        lang === "th"
          ? "เอกสารฉบับนี้ถูกแก้ไขหลังประกาศครั้งแรก"
          : "This document was revised after it was first posted"
      }
    >
      <AmendGlyph />
      {lang === "th" ? "แก้ไขแล้ว" : "Amended"}
      {round ? <span className="font-mono opacity-80">{round}</span> : null}
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
      {say(RISK_LABEL[level], lang)}
      {showScore ? <span className="font-mono tnum opacity-80">{score}</span> : null}
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
      {say(label[tor.price.verdict], lang)}
    </span>
  );
}

/** Scope size and SME eligibility are categories, so they stay monochrome. */
export function ScopeBadge({ size, lang }: { size: ScopeSize; lang: Lang }) {
  return (
    <span className={`${badgeBase} border-line bg-surface-2 text-ink-2`}>
      <svg viewBox="0 0 14 10" className="h-3 w-4 shrink-0" aria-hidden="true">
        <circle cx="3" cy="5" r="2.4" fill="currentColor" />
        <circle cx="8" cy="5" r="2.4" fill="currentColor" />
        <circle cx="12.4" cy="5" r="1.4" fill="currentColor" opacity={size === "firm" ? 1 : 0.22} />
      </svg>
      {say(SCOPE_LABEL[size], lang)}
    </span>
  );
}

export function SmeBadge({ lang }: { lang: Lang }) {
  return (
    <span
      className={`${badgeBase} border-line bg-surface-2 text-ink-2`}
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

export function MatchScore({ score, lang }: { score: number; lang: Lang }) {
  const strong = score >= 80;
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span className="relative h-[4px] w-14 overflow-hidden rounded-full bg-line-2">
        <span
          className={`absolute inset-y-0 left-0 rounded-full ${strong ? "bg-open" : "bg-ink-2"}`}
          style={{ width: `${score}%` }}
        />
      </span>
      <span
        className={`font-mono tnum text-[14px] font-medium ${strong ? "text-open" : "text-ink-2"}`}
      >
        {score}
        <span className="text-ink-3">/100</span>
      </span>
      <span className="sr-only">{lang === "th" ? "คะแนนความเหมาะสม" : "match score"}</span>
    </span>
  );
}

/**
 * Which revision of the document we are on, if it has been revised at all.
 * Award and cancellation notices are skipped: they move the status, not the
 * requirements, and calling one of those "the amendment" would tell a reader
 * the spec changed when it did not.
 */
export function amendRound(tor: Tor): string | undefined {
  if (!tor.amended) return undefined;
  const latest = tor.amendments.find((a) => a.kind === "revision");
  return latest?.round.th.replace("ประกาศร่าง TOR ", "");
}

/**
 * The verdicts in a fixed order — status (with its revision flag), lock-spec,
 * price — so a reader learns the position once and can then read any screen at
 * a glance.
 */
export function VerdictStrip({
  tor,
  lang,
  size = "compact",
}: {
  tor: Tor;
  lang: Lang;
  size?: "compact" | "full";
}) {
  const round = amendRound(tor);

  if (size === "compact") {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge status={tor.status} lang={lang} />
        {tor.amended ? <AmendedFlag lang={lang} round={round} /> : null}
        <LockSpecBadge level={tor.lockSpec.level} score={tor.lockSpec.score} lang={lang} />
        <PriceBadge tor={tor} lang={lang} />
      </div>
    );
  }

  const cells: { label: string; node: React.ReactNode }[] = [
    {
      label: lang === "th" ? "สถานะ" : "Status",
      node: (
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status={tor.status} lang={lang} />
          {tor.amended ? <AmendedFlag lang={lang} round={round} /> : null}
        </div>
      ),
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
        <div key={cell.label} className="flex flex-col gap-2.5 px-4 py-3.5">
          <span className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-3">
            {cell.label}
          </span>
          {cell.node}
        </div>
      ))}
    </div>
  );
}
