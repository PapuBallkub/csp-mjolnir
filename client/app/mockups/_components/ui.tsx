import type { ReactNode } from "react";

/**
 * Generic chrome. Everything here is deliberately monochrome — saturated
 * colour belongs to the verdict layer (see `verdict.tsx`) so that colour
 * anywhere on a screen reads as a signal rather than decoration.
 *
 * Structure is carried by three devices, in this order of preference:
 *   1. Typographic rank — a real heading, not a hairline rule with a caption.
 *   2. Spacing rhythm — tight inside a group, conspicuously loose between.
 *   3. Surface — a well or an accented panel, used only where a block really
 *      is a different kind of thing. Boxes are the last resort, not the first.
 */

export function Panel({
  children,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "aside" | "article";
}) {
  return (
    <Tag className={`rounded-[3px] border border-line bg-surface ${className}`}>{children}</Tag>
  );
}

const ACCENT: Record<string, string> = {
  open: "border-l-open",
  amend: "border-l-amend",
  risk: "border-l-risk",
  closed: "border-l-closed",
  neutral: "border-l-line-2",
};

/**
 * A panel wearing the signal rail on its edge. Used where a whole block *is* a
 * verdict about the content next to it — the same rail the catalog rows use,
 * so the device means one thing everywhere.
 */
export function AccentPanel({
  tone,
  children,
  className = "",
  id,
}: {
  tone: "open" | "amend" | "risk" | "closed" | "neutral";
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={`rounded-[3px] border border-l-[3px] border-line bg-surface ${ACCENT[tone]} ${className}`}
    >
      {children}
    </section>
  );
}

/**
 * A quiet inset for supporting material — a quoted clause, a chart, a diff.
 * It groups without adding another bordered card to the page.
 */
export function Well({
  children,
  className = "",
  bordered = true,
}: {
  children: ReactNode;
  className?: string;
  bordered?: boolean;
}) {
  return (
    <div
      className={`rounded-[3px] bg-surface-2 ${bordered ? "border border-line" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

/** The main section rank inside a reading column. */
export function SectionHeading({
  children,
  sub,
  right,
  id,
}: {
  children: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
  id?: string;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <div className="min-w-0">
        <h2 id={id} className="text-[17px] leading-snug font-semibold tracking-tight text-ink">
          {children}
        </h2>
        {sub ? <p className="mt-1 text-[12px] leading-thai text-ink-3">{sub}</p> : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

/** Field-level label: forms, key-fact rows, chart annotations. Never a section. */
export function Label({ children }: { children: ReactNode }) {
  return (
    <span className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-ink-3">
      {children}
    </span>
  );
}

/** Small caps eyebrow that sits above a heading to name a region. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-ink-3">
      {children}
    </p>
  );
}

/** A neutral, non-verdict tag: tech terms, scope size, categories. */
export function Chip({
  children,
  className = "",
  title,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-[2px] border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-ink-2 ${className}`}
    >
      {children}
    </span>
  );
}

export const btn = {
  primary:
    "inline-flex items-center justify-center gap-2 rounded-[3px] bg-ink px-3.5 h-9 text-[13px] font-medium text-surface transition-opacity hover:opacity-85 disabled:opacity-40",
  secondary:
    "inline-flex items-center justify-center gap-2 rounded-[3px] border border-line-2 bg-surface px-3.5 h-9 text-[13px] font-medium text-ink transition-colors hover:bg-surface-2",
  ghost:
    "inline-flex items-center justify-center gap-2 rounded-[3px] px-2.5 h-9 text-[13px] font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink",
};

export const input =
  "h-9 w-full rounded-[3px] border border-line-2 bg-surface px-2.5 text-[13px] text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none";

/** Key-value row used in the detail sidebar and admin tables. */
export function Fact({
  label,
  children,
  mono = false,
}: {
  label: ReactNode;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-line py-2.5 last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <Label>{label}</Label>
      <span
        className={`text-[13px] text-ink sm:text-right ${mono ? "font-mono tnum" : "leading-thai"}`}
      >
        {children}
      </span>
    </div>
  );
}

/**
 * Empty and error states say what happened and what to do next — never a bare
 * "No results found" (copy guideline §7).
 */
export function EmptyState({
  headline,
  body,
  action,
}: {
  headline: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[3px] border border-dashed border-line-2 bg-surface-2 px-6 py-12 text-center">
      <p className="max-w-md text-[15px] font-medium text-ink">{headline}</p>
      <p className="max-w-md text-[13px] leading-thai text-ink-2">{body}</p>
      {action}
    </div>
  );
}
