import type { ReactNode } from "react";

/**
 * Profile-screen chrome. The shared `Panel`/`btn`/`input` in `_components/ui`
 * hard-code a 3px radius, and a second `rounded-*` class can't reliably
 * override it (both set `border-radius`; stylesheet order decides, not class
 * order), so this screen carries its own primitives.
 *
 * Radius steps down as surfaces nest, so corners stay visually concentric:
 *   card 16px  →  inset 12px  →  tile 8px  →  pills & buttons fully round
 */

export function Card({
  children,
  className = "",
  as: Tag = "section",
  labelledBy,
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "header";
  labelledBy?: string;
}) {
  return (
    <Tag
      aria-labelledby={labelledBy}
      className={`rounded-2xl border border-line bg-surface shadow-xs ${className}`}
    >
      {children}
    </Tag>
  );
}

/** Card title row: heading + one-line purpose, with an optional right slot. */
export function CardHeader({
  title,
  sub,
  right,
  id,
}: {
  title: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
  id?: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0 flex-1">
        <h2 id={id} className="text-[15px] font-semibold leading-snug text-ink">
          {title}
        </h2>
        {sub ? <p className="mt-1 text-[12px] leading-thai text-ink-3">{sub}</p> : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

/** A quieter surface nested inside a card. */
export function Inset({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-line/70 bg-surface-2/60 ${className}`}>
      {children}
    </div>
  );
}

/** Third nesting level: a small tile inside an inset. */
export function Tile({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-lg border border-line/70 bg-surface p-3 ${className}`}>
      {children}
    </div>
  );
}

/** Neutral tag for a saved value (skill, certification, archetype). */
export function Pill({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11.5px] text-ink ${className}`}
    >
      {children}
    </span>
  );
}

/** On/off state: a dot *and* the words, so it never relies on colour alone. */
export function StatusPill({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
        on ? "border-open-line bg-open-bg text-open" : "border-line bg-surface-2 text-ink-3"
      }`}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full ${on ? "bg-open" : "border border-ink-3"}`}
      />
      {children}
    </span>
  );
}

/** Selectable chip: presets, archetypes, skill and certification banks. */
export function toggleChip(active: boolean, size: "sm" | "md" = "md") {
  const pad = size === "sm" ? "px-2.5 py-0.5 text-[11px]" : "px-3 py-1 text-[11.5px]";
  return `inline-flex cursor-pointer items-center gap-1.5 rounded-full border font-medium transition-colors ${pad} ${
    active
      ? "border-ink bg-ink text-surface"
      : "border-line bg-surface-2 text-ink-2 hover:border-ink/40 hover:bg-surface-3 hover:text-ink"
  }`;
}

const btnBase =
  "inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-full px-4 text-[12.5px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40";

export const pbtn = {
  primary: `${btnBase} bg-ink text-surface hover:opacity-85`,
  secondary: `${btnBase} border border-line-2 bg-surface text-ink hover:bg-surface-2`,
  danger: `${btnBase} bg-red-600 text-white hover:bg-red-700`,
  /** Small text action inside a card header ("clear all"). */
  quiet:
    "cursor-pointer rounded-full px-2.5 py-1 text-[11.5px] text-ink-3 transition-colors hover:bg-surface-2 hover:text-red-600",
};

export const field =
  "h-10 w-full rounded-[10px] border border-line-2 bg-surface px-3 text-[13px] text-ink placeholder:text-ink-3 transition-colors focus:border-ink focus:outline-none";
