"use client";

import Link from "next/link";
import { formatTHB, formatTHBCompact, pick, type Tor } from "../_data/tors";
import { useLang } from "./prefs";
import { Deadline } from "./deadline";
import { MatchScore, ScopeBadge, SignalRail, SmeBadge, VerdictStrip } from "./verdict";
import { Chip } from "./ui";

/**
 * One catalog row. Tuned for scan-speed rather than breathing room: users
 * arrive here to reject most of the list quickly, so status rail, verdicts,
 * budget and time-left all sit on fixed positions the eye can learn once.
 */
export function TorRow({
  tor,
  showMatch = false,
  trailing,
}: {
  tor: Tor;
  showMatch?: boolean;
  /** Extra control on the right — e.g. the watchlist's remove button. */
  trailing?: React.ReactNode;
}) {
  const { lang } = useLang();
  const visibleTech = tor.techStack.slice(0, 4);
  const restTech = tor.techStack.length - visibleTech.length;

  return (
    <div className="group relative flex gap-3 border-b border-line bg-surface px-3 py-3 transition-colors last:border-b-0 hover:bg-surface-2">
      <SignalRail status={tor.status} />

      <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
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

          <h3 className="text-[15px] leading-thai font-medium text-ink">
            <Link
              href={`/mockups/tor/${tor.id}`}
              className="after:absolute after:inset-0 group-hover:underline underline-offset-2"
            >
              {pick(tor.title, lang)}
            </Link>
          </h3>

          <VerdictStrip tor={tor} lang={lang} />

          <div className="flex flex-wrap items-center gap-1">
            <ScopeBadge size={tor.scopeSize} lang={lang} />
            {visibleTech.map((term) => (
              <Chip key={term}>{term}</Chip>
            ))}
            {restTech > 0 ? <Chip className="text-ink-3">+{restTech}</Chip> : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-row items-end justify-between gap-4 sm:w-[176px] sm:flex-col sm:items-end sm:justify-start sm:gap-2 sm:border-l sm:border-line sm:pl-4">
          <div className="flex flex-col items-start sm:items-end">
            <span
              className="font-mono tnum text-[17px] leading-none font-medium text-ink"
              title={formatTHB(tor.budget)}
            >
              {formatTHBCompact(tor.budget)}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
              {lang === "th" ? "ราคากลาง" : "reference price"}
            </span>
          </div>

          <Deadline deadline={tor.deadline} status={tor.status} lang={lang} />

          {showMatch ? <MatchScore score={tor.matchScore} lang={lang} /> : null}
          {trailing ? <div className="relative z-10">{trailing}</div> : null}
        </div>
      </div>
    </div>
  );
}
