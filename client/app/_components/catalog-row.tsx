"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { formatTHB } from "../_data/tors";
import type { TorInsightSummary, TorReview } from "../_lib/api";
import type { Match } from "../_lib/match";
import { TorDeadline } from "./deadline";
import { getFiscalYear } from "../_lib/format";
import { stageOf } from "../_lib/stage";
import { markerSource } from "../_lib/changes";
import { getVisibleTechnologies, prioritizeMatchedTech } from "../_lib/catalog";
import { useBreakpoint } from "../_lib/breakpoints";
import {
  ChangeMarker,
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
 * ระบุสถานะของประกาศว่าผ่านการตรวจสอบโดยมนุษย์แล้วหรือเป็นข้อมูล AI/ตัวอย่าง
 */
function ReviewTag({ review }: { review: TorReview }) {
  if (review.origin === "demo") {
    return (
      <span className="rounded-[2px] border border-amend-line bg-amend-bg px-1.5 py-px text-[10.5px] font-medium text-amend">
        ข้อมูลตัวอย่าง
      </span>
    );
  }
  if (review.checked) return null;
  return (
    <span className="rounded-[2px] border border-line bg-surface-2 px-1.5 py-px text-[10.5px] text-ink-2">
      สรุปโดย AI · ยังไม่ตรวจ
    </span>
  );
}

function notAnalysedText(lockSpec: boolean, price: boolean): string | null {
  if (lockSpec && price) return "ยังไม่วิเคราะห์ล็อกสเปกและราคา";
  if (lockSpec) return "ยังไม่วิเคราะห์ล็อกสเปก";
  if (price) return "ยังไม่วิเคราะห์ราคา";
  return null;
}

/**
 * การ์ดแสดงรายการ TOR แต่ละโครงการ ปรับโครงสร้างแบบเป็นสัดส่วน (Card Layout)
 * เพื่อให้อ่านและสแกนข้อมูลสำคัญได้ทันที: สถานะ -> ชื่อโครงการ -> งบ/กำหนดเวลา/คะแนน -> เทคโนโลยี
 */
export function CatalogRow({
  tor,
  now,
  match,
  trailing,
}: {
  tor: TorInsightSummary;
  now: Date;
  match?: Match;
  trailing?: ReactNode;
}) {
  const { identification: iden, facts, analytics } = tor;

  const breakpoint = useBreakpoint();
  const rawTech = [...new Set((tor.technicalRequirements?.requiredTechnologies ?? []).map((t) => t.name))];
  const tech = prioritizeMatchedTech(rawTech, match?.matched);
  const { visibleTech, restTech } = getVisibleTechnologies(tech, breakpoint);

  const price = facts.referencePriceTHB ?? facts.budgetTHB;
  const priceLabel = facts.referencePriceTHB !== null ? "ราคากลาง" : "งบประมาณ";

  const title = iden.titleTh;
  const fiscalYear = getFiscalYear(facts.postedDate, tor.projectId);
  const missing = notAnalysedText(!analytics.lockSpec, !analytics.priceAnalysis);
  const isClosed = isDead(iden.status);
  const stage = stageOf({
    status: iden.status,
    latestAnnouncement: tor.latestAnnouncement,
    contractSigned: tor.contractSigned,
  });
  const change = markerSource(tor, stage.saysChanged);

  return (
    <article
      className={`group relative flex gap-2.5 sm:gap-3 rounded-lg border border-line p-2.5 sm:p-3 shadow-xs transition-all duration-150 hover:border-line-2 hover:shadow-sm ${
        isClosed ? "bg-surface-closed grayscale" : "bg-surface"
      }`}
    >
      <LifecycleRail status={iden.status} amended={tor.amendmentInfo?.isAmended} />

      <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:gap-2">
        {/* Tier 1: Metadata Bar */}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-ink-3">
          {fiscalYear ? (
            <span className="font-medium text-ink-2 bg-surface-2 px-1.5 py-0.5 rounded-[2px] border border-line">
              ปีงบฯ {fiscalYear}
            </span>
          ) : null}
          <span className="font-mono tnum text-[11px]">#{tor.projectId}</span>
          <span className="text-ink-4">·</span>
          <span className="font-medium text-ink-2">{iden.agency}</span>
          {iden.department ? (
            <>
              <span className="text-ink-4">/</span>
              <span className="text-ink-3">{iden.department}</span>
            </>
          ) : null}
          <ReviewTag review={tor.review} />
        </div>

        {/* Tier 2: Status & Risk Badges (always on left side) */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line/40 pb-1.5">
          <LifecycleBadge status={iden.status} stage={stage} lang="th" />
          {change ? <ChangeMarker source={change} lang="th" /> : null}
          {analytics.lockSpec ? (
            <LockSpecBadge
              level={riskLevel(analytics.lockSpec.riskScore)}
              score={analytics.lockSpec.riskScore}
              lang="th"
            />
          ) : null}
          {analytics.priceAnalysis ? (
            <PriceDeltaBadge delta={analytics.priceAnalysis.diffPercentage} lang="th" />
          ) : null}
          {missing ? <span className="text-[10.5px] text-ink-3">{missing}</span> : null}
        </div>

        {/* Tier 2: Title */}
        <h3 className="text-[14px] sm:text-[15px] leading-snug font-semibold text-ink">
          <Link
            href={`/tor/${tor.projectId}`}
            className="underline-offset-2 after:absolute after:inset-0 group-hover:underline"
          >
            {title}
          </Link>
        </h3>

        {/* Tier 3: Core Facts Grid (Budget, Deadline, Match) */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 rounded-[4px] bg-surface-2/60 border border-line/50 p-2 text-[12px]">
          {/* 1. Price */}
          <div className="flex flex-col justify-between">
            <span className="text-[10px] font-medium text-ink-3 uppercase tracking-wider">{priceLabel}</span>
            <div className="mt-1 flex flex-col justify-center">
              {price !== null ? (
                <span className="font-mono tnum text-[14px] sm:text-[15px] font-bold text-ink leading-tight" title={formatTHB(price)}>
                  {formatTHB(price)}
                </span>
              ) : (
                <span className="text-[12px] text-ink-3 leading-tight">ไม่ระบุใน TOR</span>
              )}
              <span className="mt-0.5 text-[10.5px] text-ink-4 leading-tight">วงเงินงบประมาณ</span>
            </div>
          </div>

          {/* 2. Deadline */}
          <div className="flex flex-col justify-between">
            <span className="text-[10px] font-medium text-ink-3 uppercase tracking-wider">กำหนดยื่นข้อเสนอ</span>
            <div className="mt-1">
              <TorDeadline status={iden.status} facts={facts} now={now} lang="th" align="start" hideLabel={true} />
            </div>
          </div>

          {/* 3. Match / Qualification Signal */}
          <div className="col-span-2 sm:col-span-1 flex flex-col justify-between">
            <span className="text-[10px] font-medium text-ink-3 uppercase tracking-wider">ความตรงกับคุณ</span>
            <div className="mt-1">
              {match ? (
                <Link
                  href={`/tor/${tor.projectId}#profile-match`}
                  className="relative z-10 flex flex-col gap-0.5 transition-opacity hover:opacity-80"
                  title={`คะแนนความตรง ${match.score}/100 — คลิกดูวิเคราะห์ฉบับเต็ม`}
                >
                  <MatchScore score={match.score} lang="th" match={match} />
                  <span className="text-[10.5px] text-ink-3 leading-tight truncate">
                    {match.score >= 70 ? "✓ ตรงกับทักษะของคุณ" : match.score >= 50 ? "ตรงบางส่วน" : "ตรงเล็กน้อย"}
                  </span>
                </Link>
              ) : (
                <div className="flex flex-col justify-center">
                  <span className="text-[11px] text-ink-3 leading-tight">ลงชื่อเข้าใช้เพื่อดูความตรง</span>
                  <span className="mt-0.5 text-[10.5px] text-ink-4 leading-tight">วิเคราะห์ 6 มิติ</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tier 4: Tech Stack Chips & Qualification Badges (Single line) */}
        <div className="flex items-center justify-between gap-2 pt-0.5 overflow-hidden">
          <div className="flex items-center gap-2 overflow-hidden flex-nowrap min-w-0">
            {/* Qualification Badge (single, prioritized) */}
            {match?.disqualifiedDirectBid ? (
              <span
                title="TOR กำหนดเฉพาะนิติบุคคล แต่คุณลงทะเบียนเป็นบุคคลธรรมดา (แนะนำเข้าร่วมในรูปแบบกิจการร่วมค้า หรือรับงานช่วง)"
                className="inline-flex shrink-0 items-center gap-1 rounded-[3px] border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10.5px] font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
              >
                <span aria-hidden="true">⚠️</span>
                <span>เฉพาะนิติบุคคล</span>
              </span>
            ) : tor.companiesOnly ? (
              <CompaniesOnlyBadge lang="th" />
            ) : null}

            {/* Divider between qualification badge and tech stack */}
            {(tor.companiesOnly || match?.disqualifiedDirectBid) && tech.length > 0 && (
              <span className="h-3 w-px bg-line/80 mx-0.5 shrink-0" aria-hidden="true" />
            )}

            {visibleTech.map((term, idx) => {
              const known = match?.matched.includes(term);
              return (
                <Chip key={`${term}-${idx}`} className={`shrink-0 ${known ? "border-open-line bg-open-bg text-open" : "border-line/60 bg-surface-2"}`}>
                  {known ? <span className="mr-1 text-open" aria-label="คุณมีทักษะนี้">✓</span> : null}
                  {term}
                </Chip>
              );
            })}
            {restTech > 0 ? <Chip className="text-ink-3 shrink-0">+{restTech}</Chip> : null}
            {tech.length === 0 ? (
              <span className="text-[11px] text-ink-3 shrink-0">TOR ไม่ระบุเทคโนโลยี</span>
            ) : null}
          </div>

          {trailing ? (
            <div className="relative z-10 flex shrink-0 justify-end">
              {trailing}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

/** Shaped like a row, so the page doesn't jump when the real ones arrive. */
export function CatalogRowSkeleton() {
  const bar = "rounded-[2px] bg-surface-3";
  return (
    <div className="flex gap-2.5 sm:gap-3 rounded-lg border border-line bg-surface p-2.5 sm:p-3" aria-hidden="true">
      <span className="w-[4px] shrink-0 rounded-full bg-line" />
      <div className="flex min-w-0 flex-1 animate-pulse flex-col gap-1.5 sm:gap-2">
        <div className={`h-3 w-48 ${bar}`} />
        <div className="flex gap-2 border-b border-line/40 pb-1.5">
          <div className={`h-4.5 w-20 ${bar}`} />
          <div className={`h-4.5 w-28 ${bar}`} />
        </div>
        <div className={`h-4 w-3/4 ${bar}`} />
        <div className={`h-9 w-full rounded-[4px] ${bar}`} />
        <div className="flex gap-2 pt-0.5">
          <div className={`h-3 w-16 ${bar}`} />
          <div className={`h-3 w-20 ${bar}`} />
          <div className={`h-3 w-14 ${bar}`} />
        </div>
      </div>
    </div>
  );
}
