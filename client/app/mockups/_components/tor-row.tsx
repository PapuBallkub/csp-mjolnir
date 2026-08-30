"use client";

import Link from "next/link";
import { formatTHB, formatTHBCompact, matchScore, pick, type Tor } from "../_data/tors";
import { useLang, useProfile } from "./prefs";
import { Deadline } from "./deadline";
import { MatchScore, ScopeBadge, SmeBadge, STATUS_RAIL, VerdictStrip } from "./verdict";
import { Chip } from "./ui";

/**
 * One project in a list, drawn as a discrete card rather than a table row.
 *
 * The earlier version stacked rows inside a single panel divided by hairlines,
 * which made ten projects read as one continuous sheet — the eye had to find
 * the boundaries before it could compare anything. Each project now owns a
 * bordered card with real padding, and the list spaces them apart, so "where
 * does this project end" is answered before reading starts.
 *
 * Spacing *inside* a card stays deliberately uneven: the id, agency and title
 * are one thought and sit tight together; the verdicts and the tech list are
 * separate groups and get visibly more air. Density comes from the card being
 * compact, not from the type being small.
 */
export function TorRow({
  tor,
  showMatch = false,
  trailing,
}: {
  tor: Tor;
  /** Matched mode: rank shown, and the tech the user already has is marked. */
  showMatch?: boolean;
  /** Extra control on the right — e.g. the watchlist's remove button. */
  trailing?: React.ReactNode;
}) {
  const { lang } = useLang();
  const { profile } = useProfile();
  const visibleTech = tor.techStack.slice(0, 4);
  const restTech = tor.techStack.length - visibleTech.length;

  return (
    <article
      className={`group relative rounded-[3px] border border-l-[4px] border-line bg-surface transition-colors hover:border-line-2 ${
        STATUS_RAIL[tor.status]
      }`}
    >
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:gap-6 sm:p-6">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[13px] text-ink-3">
            <span className="font-mono tnum">{tor.id}</span>
            <span className="h-3.5 w-px bg-line-2" />
            <span className="truncate text-ink-2">{pick(tor.agency, lang)}</span>
            {tor.smeAdvantage ? <SmeBadge lang={lang} /> : null}
          </div>

          <h3 className="mt-2 text-[17px] leading-thai font-semibold text-ink">
            <Link
              href={`/mockups/tor/${tor.id}`}
              className="after:absolute after:inset-0 group-hover:underline underline-offset-[3px]"
            >
              {pick(tor.title, lang)}
            </Link>
          </h3>

          <div className="mt-4">
            <VerdictStrip tor={tor} lang={lang} />
          </div>

          <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
            <ScopeBadge size={tor.scopeSize} lang={lang} />
            {visibleTech.map((term) => {
              const known = showMatch && profile.skills.includes(term);
              return (
                <Chip key={term} className={known ? "border-open-line bg-open-bg text-open" : ""}>
                  {known ? <span className="mr-1">✓</span> : null}
                  {term}
                </Chip>
              );
            })}
            {restTech > 0 ? <Chip className="text-ink-3">+{restTech}</Chip> : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-row items-end justify-between gap-4 border-t border-line pt-4 sm:w-[200px] sm:flex-col sm:items-end sm:justify-start sm:gap-4 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-6">
          <div className="flex flex-col items-start sm:items-end">
            <span
              className="font-mono tnum text-[21px] leading-none font-semibold text-ink"
              title={formatTHB(tor.budget)}
            >
              {formatTHBCompact(tor.budget)}
            </span>
            <span className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-3">
              {lang === "th" ? "ราคากลาง" : "reference price"}
            </span>
          </div>

          <Deadline deadline={tor.deadline} status={tor.status} lang={lang} />

          {showMatch ? <MatchScore score={matchScore(tor, profile)} lang={lang} /> : null}
          {trailing ? <div className="relative z-10">{trailing}</div> : null}
        </div>
      </div>
    </article>
  );
}

/**
 * The list a set of cards sits in. Spacing between projects is the boundary —
 * it is wider than any gap inside a card, so the grouping is unambiguous.
 */
export function TorList({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-5">{children}</div>;
}
