"use client";

import Link from "next/link";
import { formatTHB, formatTHBCompact, getFiscalYear } from "../_lib/format";
import { matchScore, pick, type Profile, type ScopeSize, type Tor } from "../_data/tors";

import type { TorInsightSummary } from "../_lib/api";
import { useLang, useProfile } from "./prefs";
import { useAuth } from "./auth";
import { Deadline } from "./deadline";
import { isDead, MatchScore, ScopeBadge, SignalRail, SmeBadge, VerdictStrip } from "./verdict";
import { Chip } from "./ui";

function computeInsightScore(techStack: string[], budget: number, profile: Profile): number {
  if (!techStack.length) return 50;
  const matched = techStack.filter((t) =>
    profile.skills.some((s) => s.toLowerCase() === t.toLowerCase() || t.toLowerCase().includes(s.toLowerCase())),
  ).length;
  const skillFit = matched / techStack.length;
  const budgetFit = budget >= profile.budgetMin && budget <= profile.budgetMax ? 1 : 0.2;
  const scopeCategory: ScopeSize =
    budget < 5_000_000 ? "solo" : budget <= 30_000_000 ? "small-team" : "firm";
  const scopeFit = profile.scopeSizes.includes(scopeCategory) ? 1 : 0.2;
  return Math.min(100, Math.round(skillFit * 60 + budgetFit * 25 + scopeFit * 15));
}

function getScopeCategory(budget: number): ScopeSize {
  if (budget < 5_000_000) return "solo";
  if (budget <= 30_000_000) return "small-team";
  return "firm";
}

/**
 * One browse row. Tuned for scan-speed rather than breathing room: users
 * arrive here to reject most of the list quickly, so status rail, verdicts,
 * budget and time-left all sit on fixed positions the eye can learn once.
 */
export function TorRow({
  tor,
  insight,
  showMatch = false,
  trailing,
}: {
  tor?: Tor;
  insight?: TorInsightSummary;
  /** Matched mode: rank shown, and the tech the user already has is marked. */
  showMatch?: boolean;
  /** Extra control on the right — e.g. the watchlist's remove button. */
  trailing?: React.ReactNode;
}) {
  const { lang } = useLang();
  const { profile } = useProfile();
  const { user, status: authStatus } = useAuth();
  const isAuthenticated = authStatus === "authenticated" && !!user;

  // Normalize data across API TorInsightSummary and fixture Tor
  const id = insight ? insight.projectId : tor?.id || "";
  const title = insight
    ? (lang === "en" && insight.identification.titleEn) || insight.identification.titleTh
    : tor ? pick(tor.title, lang) : "";
  const agency = insight ? insight.identification.agency : tor ? pick(tor.agency, lang) : "";
  const department = insight?.identification.department || null;
  const status = insight ? insight.identification.status : tor?.status || "Open";
  const budget = insight
    ? insight.facts.referencePriceTHB || insight.facts.budgetTHB || 0
    : tor?.budget || 0;
  const deadline = insight ? insight.facts.submissionDeadline : tor?.deadline;
  const postedDate = insight ? insight.facts.postedDate : tor?.postedAt;
  const fiscalYear = getFiscalYear(postedDate, id);
  const techStack = insight
    ? insight.technicalRequirements?.requiredTechnologies.map((t) => t.name) || []
    : tor?.techStack || [];
  const scopeSize = insight ? getScopeCategory(budget) : tor?.scopeSize || "small-team";
  const smeAdvantage = tor?.smeAdvantage || false;

  const visibleTech = techStack.slice(0, 4);
  const restTech = techStack.length - visibleTech.length;

  const score = insight
    ? computeInsightScore(techStack, budget, profile)
    : tor ? matchScore(tor, profile) : 0;
  const isClosed = isDead(status);

  return (
    <article
      className={`group relative flex gap-3.5 sm:gap-4 rounded-lg border border-line px-4 py-3.5 sm:px-5 sm:py-4 shadow-xs transition-all duration-150 hover:border-line-2 hover:shadow-sm ${
        isClosed ? "bg-surface-closed grayscale" : "bg-surface"
      }`}
    >
      <SignalRail status={status} />

      <div className="flex min-w-0 flex-1 flex-col gap-3.5 sm:flex-row sm:gap-5">
        <div className="min-w-0 flex-1">
          {/* 1. Project Title — First (matches price size) */}
          <h3 className="text-[19px] sm:text-[20px] leading-[1.45] font-semibold text-ink">
            <Link
              href={`/tor/${id}`}
              className="after:absolute after:inset-0 group-hover:underline underline-offset-2"
            >
              {title}
            </Link>
          </h3>

          {/* 2. Agency & Key Metadata — Directly below title */}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px] text-ink-2">
            <span className="font-medium text-ink-2">{agency}</span>
            {department ? (
              <>
                <span className="h-3 w-px bg-line" />
                <span className="text-ink-3 text-[12px]">{department}</span>
              </>
            ) : null}
            {fiscalYear ? (
              <>
                <span className="h-3 w-px bg-line" />
                <span className="tnum text-ink-3 text-[12px]">
                  {lang === "th" ? `ปีงบฯ ${fiscalYear}` : `FY ${fiscalYear}`}
                </span>
              </>
            ) : null}
            <span className="h-3 w-px bg-line" />
            <span className="font-mono tnum text-[11px] text-ink-3">#{id}</span>
            {smeAdvantage ? (
              <>
                <span className="h-3 w-px bg-line" />
                <SmeBadge lang={lang} />
              </>
            ) : null}
          </div>

          {/* 3. Verdict Strip */}
          <div className="mt-3">
            <VerdictStrip tor={tor} insight={insight} lang={lang} />
          </div>

          {/* 4. Tech Chips & Scope */}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <ScopeBadge size={scopeSize} lang={lang} />
            {visibleTech.map((term) => {
              const known = showMatch && isAuthenticated && profile.skills.some((s) => s.toLowerCase() === term.toLowerCase());
              return (
                <Chip key={term} className={known ? "border-open-line bg-open-bg text-open font-medium" : ""}>
                  {known ? <span className="mr-1">✓</span> : null}
                  {term}
                </Chip>
              );
            })}
            {restTech > 0 ? <Chip className="text-ink-3">+{restTech}</Chip> : null}
          </div>
        </div>

        {/* Right Column: Budget & Deadline */}
        <div className="flex shrink-0 flex-row items-end justify-between gap-4 border-t border-line/60 pt-3 sm:w-[184px] sm:flex-col sm:items-end sm:justify-start sm:gap-3 sm:border-t-0 sm:border-l sm:border-line sm:pt-0 sm:pl-5">
          <div className="flex flex-col items-start sm:items-end">
            <span
              className="font-mono tnum text-[19px] sm:text-[20px] leading-none font-semibold text-ink"
              title={formatTHB(budget)}
            >
              {formatTHBCompact(budget)}
            </span>
            <span className="mt-1 text-[11px] font-medium text-ink-3">
              {lang === "th" ? "ราคากลาง" : "reference price"}
            </span>
          </div>

          <Deadline deadline={deadline} status={status} lang={lang} />

          {showMatch ? (
            isAuthenticated ? (
              <MatchScore score={score} lang={lang} />
            ) : (
              <span className="text-[11px] text-ink-3" title="ลงชื่อเข้าใช้เพื่อดูคะแนนความตรง">
                {lang === "th" ? "คะแนนเฉพาะสมาชิก" : "Member match"}
              </span>
            )
          ) : null}
          {trailing ? <div className="relative z-10">{trailing}</div> : null}
        </div>
      </div>
    </article>
  );
}
