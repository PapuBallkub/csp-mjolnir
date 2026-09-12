"use client";

import Link from "next/link";
import { formatTHB, formatTHBCompact, matchScore, pick, type Tor } from "../_data/tors";
import { useLang, useProfile } from "./prefs";
import { Deadline } from "./deadline";
import { MatchScore, ScopeBadge, SignalRail, SmeBadge, VerdictStrip } from "./verdict";
import { Chip } from "./ui";

/**
 * One browse row. Tuned for scan-speed rather than breathing room: users
 * arrive here to reject most of the list quickly, so status rail, verdicts,
 * budget and time-left all sit on fixed positions the eye can learn once.
 *
 * Spacing inside a row is deliberately uneven — the id, agency and title are
 * one thought and sit tight together; the verdicts and the tech list are
 * separate groups and get visibly more air.
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
    <div className="group relative flex gap-3 border-b border-line bg-surface px-3 py-3.5 transition-colors last:border-b-0 hover:bg-surface-2">
      <SignalRail status={tor.status} />

      <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-3">
            <span className="font-mono tnum">{tor.id}</span>
            <span className="h-3 w-px bg-line" />
            <span className="truncate">{pick(tor.agency, lang)}</span>
            {tor.smeAdvantage ? (
              <>
                <span className="h-3 w-px bg-line" />
                <SmeBadge lang={lang} />
              </>
            ) : null}
          </div>

          <h3 className="mt-1 text-[15px] leading-thai font-medium text-ink">
            <Link
              href={`/tor/${tor.id}`}
              className="after:absolute after:inset-0 group-hover:underline underline-offset-2"
            >
              {pick(tor.title, lang)}
            </Link>
          </h3>

          <div className="mt-2.5">
            <VerdictStrip tor={tor} lang={lang} />
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1">
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

        <div className="flex shrink-0 flex-row items-end justify-between gap-4 sm:w-[176px] sm:flex-col sm:items-end sm:justify-start sm:gap-2.5 sm:border-l sm:border-line sm:pl-4">
          <div className="flex flex-col items-start sm:items-end">
            <span
              className="font-mono tnum text-[17px] leading-none font-medium text-ink"
              title={formatTHB(tor.budget)}
            >
              {formatTHBCompact(tor.budget)}
            </span>
            <span className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
              {lang === "th" ? "ราคากลาง" : "reference price"}
            </span>
          </div>

          <Deadline deadline={tor.deadline} status={tor.status} lang={lang} />

          {showMatch ? <MatchScore score={matchScore(tor, profile)} lang={lang} /> : null}
          {trailing ? <div className="relative z-10">{trailing}</div> : null}
        </div>
      </div>
    </div>
  );
}
