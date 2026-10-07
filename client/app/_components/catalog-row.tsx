"use client";

import Link from "next/link";
import { formatTHB, formatTHBCompact, type Lang } from "../_data/tors";
import type { TorInsightSummary, TorReview } from "../_lib/api";
import type { Match } from "../_lib/match";
import { useLang } from "./prefs";
import { TorDeadline } from "./deadline";
import { getFiscalYear } from "../_lib/format";
import {
  AmendedFlag,
  CompaniesOnlyBadge,
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

  return (
    <div className="group relative flex gap-3 border-b border-line bg-surface px-3 py-3.5 transition-colors last:border-b-0 hover:bg-surface-2">
      <LifecycleRail status={iden.status} amended={tor.amendmentInfo?.isAmended} />

      <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-3">
            <span className="font-mono tnum">{tor.projectId}</span>
            <span className="h-3 w-px bg-line" />
            <span className="min-w-0 truncate">{iden.agency}</span>
            {fiscalYear ? (
              <>
                <span className="h-3 w-px bg-line" />
                <span className="font-mono text-ink-2">{lang === "th" ? `ปีงบฯ ${fiscalYear}` : `FY ${fiscalYear}`}</span>
              </>
            ) : null}
            <ReviewTag review={tor.review} lang={lang} />
          </div>

          <h3 className="mt-1 text-[15px] leading-thai font-medium text-ink">
            <Link
              href={`/tor/${tor.projectId}`}
              className="underline-offset-2 after:absolute after:inset-0 group-hover:underline"
            >
              {title}
            </Link>
          </h3>

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <LifecycleBadge status={iden.status} lang={lang} />
            {tor.amendmentInfo?.isAmended ? <AmendedFlag lang={lang} /> : null}
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

          <div className="mt-2 flex flex-wrap items-center gap-1">
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
              <span className="text-[11px] text-ink-3">
                {lang === "th" ? "TOR ไม่ระบุเทคโนโลยี" : "No technologies named in the TOR"}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-row items-end justify-between gap-4 sm:w-[176px] sm:flex-col sm:items-end sm:justify-start sm:gap-2.5 sm:border-l sm:border-line sm:pl-4">
          <div className="flex flex-col items-start sm:items-end">
            {price !== null ? (
              <span
                className="font-mono tnum text-[17px] leading-none font-medium text-ink"
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

          <TorDeadline deadline={facts.submissionDeadline} status={iden.status} now={now} lang={lang} />

          {match ? <MatchScore score={match.score} lang={lang} /> : null}
        </div>
      </div>
    </div>
  );
}

/** Shaped like a row, so the page doesn't jump when the real ones arrive. */
export function CatalogRowSkeleton() {
  const bar = "rounded-[2px] bg-surface-3";
  return (
    <div className="flex gap-3 border-b border-line bg-surface px-3 py-3.5 last:border-b-0" aria-hidden="true">
      <span className="w-[3px] shrink-0 rounded-full bg-line" />
      <div className="flex min-w-0 flex-1 animate-pulse flex-col gap-3 sm:flex-row sm:gap-4">
        <div className="min-w-0 flex-1">
          <div className={`h-3 w-48 ${bar}`} />
          <div className={`mt-2 h-4 w-11/12 ${bar}`} />
          <div className="mt-3 flex gap-1.5">
            <div className={`h-5 w-20 ${bar}`} />
            <div className={`h-5 w-40 ${bar}`} />
          </div>
          <div className="mt-2 flex gap-1">
            <div className={`h-4 w-14 ${bar}`} />
            <div className={`h-4 w-16 ${bar}`} />
            <div className={`h-4 w-12 ${bar}`} />
          </div>
        </div>
        <div className="flex shrink-0 flex-row justify-between gap-4 sm:w-[176px] sm:flex-col sm:items-end sm:border-l sm:border-line sm:pl-4">
          <div className={`h-5 w-16 ${bar}`} />
          <div className={`h-4 w-20 ${bar}`} />
        </div>
      </div>
    </div>
  );
}
