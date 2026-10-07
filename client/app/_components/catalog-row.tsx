"use client";

import Link from "next/link";
import { formatTHB, formatTHBCompact, type Lang } from "../_data/tors";
import type { TorInsightSummary, TorReview } from "../_lib/api";
import type { Match } from "../_lib/match";
import { useLang } from "./prefs";
import { TorDeadline } from "./deadline";
import { getFiscalYear } from "../_lib/format";
import { stageOf } from "../_lib/stage";
import {
  AmendedFlag,
  CompaniesOnlyBadge,
  isDead,
  LifecycleBadge,
  LifecycleRail,
  LockSpecBadge,
  MatchScore,
  PriceDeltaBadge,
  riskLevel,
} from "./verdict";
import { Chip } from "./ui";

/**
 * Says what a row is before anyone trusts it (ADR 0015): demo data is made up,
 * and an AI summary nobody has checked may be wrong. A checked one needs no tag.
 */
function ReviewTag({ review, lang }: { review: TorReview; lang: Lang }) {
  if (review.origin === "demo") {
    return (
      <span className="rounded-[2px] border border-amend-line bg-amend-bg px-1.5 py-px text-[10.5px] font-medium text-amend">
        {lang === "th" ? "ข้อมูลตัวอย่าง" : "Demo data"}
      </span>
    );
  }
  if (review.checked) return null;
  return (
    <span className="rounded-[2px] border border-line bg-surface-2 px-1.5 py-px text-[10.5px] text-ink-2">
      {lang === "th" ? "สรุปโดย AI · ยังไม่ตรวจ" : "AI summary · unchecked"}
    </span>
  );
}

/** Analysis nobody ran is said once, plainly, rather than shown as a reassuring badge. */
function notAnalysedText(lockSpec: boolean, price: boolean, lang: Lang): string | null {
  if (lockSpec && price) return lang === "th" ? "ยังไม่วิเคราะห์ล็อกสเปกและราคา" : "Lock-spec and price not analysed yet";
  if (lockSpec) return lang === "th" ? "ยังไม่วิเคราะห์ล็อกสเปก" : "Lock-spec not analysed yet";
  if (price) return lang === "th" ? "ยังไม่วิเคราะห์ราคา" : "Price not analysed yet";
  return null;
}

/**
 * One catalog row, from the API. Tuned for scan speed: users come here to
 * reject most of the list quickly, so the status rail, verdicts, price and
 * time left sit in fixed places the eye learns once.
 */
export function CatalogRow({
  tor,
  now,
  match,
}: {
  tor: TorInsightSummary;
  /** When the list arrived: the moment the API decided what is Closed */
  now: Date;
  /** Matched mode: the score, and the technologies the user already has */
  match?: Match;
}) {
  const { lang } = useLang();
  const { identification: iden, facts, analytics } = tor;

  const tech = [...new Set((tor.technicalRequirements?.requiredTechnologies ?? []).map((t) => t.name))];
  const visibleTech = tech.slice(0, 4);
  const restTech = tech.length - visibleTech.length;

  // The reference price is what the catalog filters on; the budget stands in only when it's missing
  const price = facts.referencePriceTHB ?? facts.budgetTHB;
  const priceLabel =
    facts.referencePriceTHB !== null
      ? lang === "th" ? "ราคากลาง" : "reference price"
      : lang === "th" ? "งบประมาณ" : "budget";

  const title = lang === "en" && iden.titleEn ? iden.titleEn : iden.titleTh;
  const fiscalYear = getFiscalYear(facts.postedDate, tor.projectId);
  const missing = notAnalysedText(!analytics.lockSpec, !analytics.priceAnalysis, lang);
  const isClosed = isDead(iden.status);
  const stage = stageOf({
    status: iden.status,
    latestAnnouncement: tor.latestAnnouncement,
    contractSigned: tor.contractSigned,
  });

  return (
    <article
      className={`group relative flex gap-3.5 sm:gap-4 rounded-lg border border-line px-4 py-3.5 sm:px-5 sm:py-4 shadow-xs transition-all duration-150 hover:border-line-2 hover:shadow-sm ${
        isClosed ? "bg-surface-closed grayscale" : "bg-surface"
      }`}
    >
      <LifecycleRail status={iden.status} amended={tor.amendmentInfo?.isAmended} />

      <div className="flex min-w-0 flex-1 flex-col gap-3.5 sm:flex-row sm:gap-5">
        {/* Main Content Column: JobsDB hierarchy (Title -> Agency -> Badges -> Tech) */}
        <div className="min-w-0 flex-1">
          {/* 1. Job / Project Title — Prominent, First (matches price size) */}
          <h3 className="text-[19px] sm:text-[20px] leading-[1.45] font-semibold text-ink">
            <Link
              href={`/tor/${tor.projectId}`}
              className="underline-offset-2 after:absolute after:inset-0 group-hover:underline"
            >
              {title}
            </Link>
          </h3>

          {/* 2. Agency & Key Metadata — Directly below title */}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px] text-ink-2">
            <span className="font-medium text-ink-2">{iden.agency}</span>
            {iden.department ? (
              <>
                <span className="h-3 w-px bg-line" />
                <span className="text-ink-3 text-[12px]">{iden.department}</span>
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
            <span className="font-mono tnum text-[11px] text-ink-3">#{tor.projectId}</span>
            <ReviewTag review={tor.review} lang={lang} />
          </div>

          {/* 3. Decision Signals & Status Badges */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <LifecycleBadge status={iden.status} stage={stage} lang={lang} />
            {tor.amendmentInfo?.isAmended && !stage.saysChanged ? <AmendedFlag lang={lang} /> : null}
            {analytics.lockSpec ? (
              <LockSpecBadge
                level={riskLevel(analytics.lockSpec.riskScore)}
                score={analytics.lockSpec.riskScore}
                lang={lang}
              />
            ) : null}
            {analytics.priceAnalysis ? (
              <PriceDeltaBadge delta={analytics.priceAnalysis.diffPercentage} lang={lang} />
            ) : null}
            {missing ? <span className="px-1 text-[11px] leading-thai text-ink-3">{missing}</span> : null}
          </div>

          {/* 4. Tech Stack Tags / Capabilities */}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {tor.companiesOnly ? <CompaniesOnlyBadge lang={lang} /> : null}
            {visibleTech.map((term) => {
              const known = match?.matched.includes(term);
              return (
                <Chip key={term} className={known ? "border-open-line bg-open-bg text-open" : ""}>
                  {known ? <span className="mr-1" aria-label={lang === "th" ? "คุณมีทักษะนี้" : "you have this skill"}>✓</span> : null}
                  {term}
                </Chip>
              );
            })}
            {restTech > 0 ? <Chip className="text-ink-3">+{restTech}</Chip> : null}
            {tech.length === 0 ? (
              <span className="text-[11.5px] text-ink-3">
                {lang === "th" ? "TOR ไม่ระบุเทคโนโลยี" : "No technologies named in the TOR"}
              </span>
            ) : null}
          </div>
        </div>

        {/* Right Column: Price & Urgency */}
        <div className="flex shrink-0 flex-row items-end justify-between gap-4 border-t border-line/60 pt-3 sm:w-[184px] sm:flex-col sm:items-end sm:justify-start sm:gap-3 sm:border-t-0 sm:border-l sm:border-line sm:pt-0 sm:pl-5">
          <div className="flex flex-col items-start sm:items-end">
            {price !== null ? (
              <span
                className="font-mono tnum text-[19px] sm:text-[20px] leading-none font-semibold text-ink"
                title={formatTHB(price)}
              >
                {formatTHBCompact(price)}
              </span>
            ) : (
              <span className="text-[13px] leading-none text-ink-3">
                {lang === "th" ? "ไม่ระบุใน TOR" : "Not in the TOR"}
              </span>
            )}
            <span className="mt-1 text-[11px] font-medium text-ink-3">
              {priceLabel}
            </span>
          </div>

          <TorDeadline status={iden.status} facts={facts} now={now} lang={lang} />

          {match ? <MatchScore score={match.score} lang={lang} /> : null}
        </div>
      </div>
    </article>
  );
}

/** Shaped like a row, so the page doesn't jump when the real ones arrive. */
export function CatalogRowSkeleton() {
  const bar = "rounded-[2px] bg-surface-3";
  return (
    <div className="flex gap-3.5 sm:gap-4 rounded-lg border border-line bg-surface px-4 py-3.5 sm:px-5 sm:py-4" aria-hidden="true">
      <span className="w-[5px] shrink-0 rounded-full bg-line" />
      <div className="flex min-w-0 flex-1 animate-pulse flex-col gap-3.5 sm:flex-row sm:gap-5">
        <div className="min-w-0 flex-1">
          <div className={`h-6 sm:h-7 w-4/5 ${bar}`} />
          <div className={`mt-2 h-3.5 w-60 ${bar}`} />
          <div className="mt-3 flex gap-1.5">
            <div className={`h-5 w-24 ${bar}`} />
            <div className={`h-5 w-36 ${bar}`} />
            <div className={`h-5 w-28 ${bar}`} />
          </div>
          <div className="mt-2.5 flex gap-1">
            <div className={`h-4 w-14 ${bar}`} />
            <div className={`h-4 w-16 ${bar}`} />
            <div className={`h-4 w-12 ${bar}`} />
          </div>
        </div>
        <div className="flex shrink-0 flex-row justify-between gap-4 sm:w-[184px] sm:flex-col sm:items-end sm:border-l sm:border-line sm:pl-5">
          <div className={`h-6 w-20 ${bar}`} />
          <div className={`h-4 w-24 ${bar}`} />
        </div>
      </div>
    </div>
  );
}
