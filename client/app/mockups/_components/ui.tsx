import type { ReactNode } from "react";

/**
 * Generic chrome. Everything here is deliberately monochrome — saturated
 * colour belongs to the verdict layer (see `verdict.tsx`) so that colour
 * anywhere on a screen reads as a signal rather than decoration.
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

/** Small caps label over a hairline rule — the recurring section marker. */
export function SectionLabel({
  children,
  right,
  className = "",
}: {
  children: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-baseline gap-3 ${className}`}>
      <h2 className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-ink-3 whitespace-nowrap">
        {children}
      </h2>
      <span className="h-px flex-1 bg-line" />
      {right ? <div className="text-[12px] text-ink-3">{right}</div> : null}
    </div>
  );
}

/** Field label used inside key-fact tables and forms. */
export function Label({ children }: { children: ReactNode }) {
  return (
    <span className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-ink-3">
      {children}
    </span>
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
