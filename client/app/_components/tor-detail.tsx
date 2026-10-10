"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { TorInsightDetail } from "../_lib/api";
import type { Lang } from "../_data/tors";
import { getEgpAnnouncementUrl, getFiscalYear } from "../_lib/format";
import { useLang, useProfile } from "./prefs";
import { useAuth } from "./auth";
import { AmendedFlag, CompaniesOnlyBadge, isDead, LifecycleBadge } from "./verdict";
import { countdownText, daysLeft } from "./deadline";
import { announcementLabel, deadlineOf, stageOf } from "../_lib/stage";
import { AccentPanel, btn, Chip, Fact, Label, Panel, SectionHeading, Well } from "./ui";

function formatMoney(amount: number | null | undefined, lang: Lang = "th"): string {
  if (amount == null) return lang === "th" ? "ไม่ระบุใน TOR" : "Not specified in TOR";
  return `฿${amount.toLocaleString("en-US")}`;
}

function getScopeSize(budget: number | null): { th: string; en: string } {
  if (!budget) return { th: "ไม่ระบุขนาด", en: "Unspecified" };
  if (budget < 5_000_000) return { th: "ทำคนเดียว / ทีมเล็ก", en: "Solo / Small team" };
  if (budget <= 30_000_000) return { th: "ทีมขนาดกลาง (2–5 คน)", en: "Mid-size team" };
  return { th: "องค์กร / บริษัทขนาดใหญ่", en: "Firm-sized" };
}

function formatDateString(val: string | Date | null | undefined, lang: Lang): string {
  if (!val) return lang === "th" ? "ไม่ระบุใน TOR" : "Not specified in TOR";
  try {
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return String(val);
    const day = d.getDate();
    const monthTh = [
      "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
      "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
    ][d.getMonth()];
    const monthEn = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ][d.getMonth()];
    const yearTh = d.getFullYear() + 543;
    const yearEn = d.getFullYear();
    return lang === "th" ? `${day} ${monthTh} ${yearTh}` : `${day} ${monthEn} ${yearEn}`;
  } catch {
    return String(val);
  }
}

/**
 * Says what a summary is, before anyone reads it (ADR 0015). Demo data is made
 * up; an AI summary nobody has checked may be wrong. A checked one needs no note.
 */
function ReviewNotice({ review, webUrl, lang }: { review: TorInsightDetail["review"]; webUrl: string | null; lang: Lang }) {
  if (review.origin === "demo") {
    return (
      <p className="mt-3 max-w-4xl rounded-[3px] border border-amend-line bg-amend-bg px-3 py-2 text-[12.5px] leading-thai text-amend">
        {lang === "th"
          ? "ข้อมูลตัวอย่างสำหรับทดสอบหน้าจอ — เนื้อหาและผลวิเคราะห์ในหน้านี้สร้างขึ้นเอง ไม่ได้อ่านจากเอกสาร TOR จริง"
          : "Demo data for testing the page — the content and analysis here are made up, not read from the real TOR."}
      </p>
    );
  }
  if (review.checked) return null;

  return (
    <div className="mt-3 max-w-4xl rounded-[3px] border border-line bg-surface-2 px-3 py-2 text-[12.5px] leading-thai text-ink-2">
      <p className="font-medium text-ink">
        {lang === "th" ? "สรุปโดย AI จากเอกสาร TOR · ยังไม่มีเจ้าหน้าที่ตรวจสอบ" : "AI summary of the TOR · not yet checked by a person"}
      </p>
      <p className="mt-0.5">
        {review.score !== null
          ? lang === "th"
            ? `คะแนนความน่าเชื่อถือ ${review.score}/100`
            : `Confidence ${review.score}/100`
          : null}
        {review.failedChecks > 0
          ? lang === "th"
            ? ` · ระบบพบ ${review.failedChecks} จุดที่ควรตรวจซ้ำ`
            : ` · ${review.failedChecks} point(s) flagged for a second look`
          : null}
        {" · "}
        {lang === "th" ? "ตรวจสอบกับเอกสารต้นฉบับก่อนตัดสินใจ" : "Check against the original before deciding"}
        {webUrl ? (
          <>
            {" "}
            <a href={webUrl} target="_blank" rel="noreferrer" className="underline hover:text-ink">
              {lang === "th" ? "เปิดใน e-GP" : "Open on e-GP"}
            </a>
          </>
        ) : null}
      </p>
    </div>
  );
}

/** A decision-support section whose analysis hasn't been run: said plainly, never a 0. */
function NotAnalysed({ heading, lang }: { heading: string; lang: Lang }) {
  return (
    <Panel className="px-4 py-5 sm:px-6 sm:py-6">
      <SectionHeading>{heading}</SectionHeading>
      <p className="mt-2 text-[13.5px] leading-thai text-ink-3">
        {lang === "th"
          ? "ยังไม่ได้วิเคราะห์ส่วนนี้ — ระบบจะเปรียบเทียบกับโครงการในอดีตเมื่อมีข้อมูลเพียงพอ"
          : "Not analysed yet — this compares against past projects once there is enough data."}
      </p>
    </Panel>
  );
}

export function TorDetail({
  insight,
}: {
  insight: TorInsightDetail;
}) {
  const { lang } = useLang();
  const { profile, setProfile } = useProfile();
  const { user, status: authStatus, addToWatchlist, removeFromWatchlist } = useAuth();
  const isAuthenticated = authStatus === "authenticated" && !!user;

  const projectId = insight.projectId;
  const isSaved = user?.watchlist?.includes(projectId) ?? false;
  const [toggleLoading, setToggleLoading] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);

  useEffect(() => {
    if (!showAuthModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowAuthModal(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showAuthModal]);

  const handleWatchlistClick = async () => {
    if (!isAuthenticated) {
      setShowAuthModal(true);
      return;
    }
    setToggleLoading(true);
    if (isSaved) {
      await removeFromWatchlist(projectId);
    } else {
      await addToWatchlist(projectId);
    }
    setToggleLoading(false);
  };

  const iden = insight.identification;
  const facts = insight.facts;
  const overview = insight.overview;
  const deliverables = insight.deliverables;
  const tech = insight.technicalRequirements;
  const integration = insight.integrationEnvironment;
  const ops = insight.operationalRequirements;
  const elig = insight.eligibility;
  const conditions = insight.contractConditions;
  const lockSpec = insight.analytics.lockSpec;
  const price = insight.analytics.priceAnalysis;
  const amend = insight.amendmentInfo;
  const stage = stageOf({
    status: iden.status,
    latestAnnouncement: insight.latestAnnouncement,
    contractSigned: insight.contractSigned,
  });
  const deadline = deadlineOf(iden.status, facts);

  const scope = getScopeSize(facts.referencePriceTHB || facts.budgetTHB);
  const fiscalYear = getFiscalYear(facts.postedDate, insight.projectId);
  const officialEgpUrl =
    facts.webUrl && !facts.webUrl.includes("process3.gprocurement.go.th")
      ? facts.webUrl
      : getEgpAnnouncementUrl(projectId);

  // Match profile skills with required technologies only if signed in
  const requiredTechNames = Array.from(
    new Set(tech.requiredTechnologies?.map((t) => t.name).filter(Boolean) || []),
  );
  const matchedSkills = isAuthenticated
    ? requiredTechNames.filter((t) =>
        profile.skills.some((s) => s.toLowerCase() === t.toLowerCase() || t.toLowerCase().includes(s.toLowerCase()))
      )
    : [];

  // null: the analysis hasn't been run yet. Shown as such, never as a 0 that
  // reads like "measured, low risk" (ADR 0015)
  const lockScore = lockSpec?.riskScore ?? null;
  const lockTone: "open" | "amend" | "risk" =
    lockScore === null ? "open" : lockScore >= 70 ? "risk" : lockScore >= 35 ? "amend" : "open";

  const diffPct = price?.diffPercentage ?? null;
  const priceTone: "open" | "amend" | "risk" =
    diffPct === null ? "open" : diffPct > 15 ? "amend" : diffPct < -15 ? "risk" : "open";
  const notAnalysed = lang === "th" ? "ยังไม่ได้วิเคราะห์" : "Not analysed yet";

  return (
    <article className="pb-16">
      {/* ------------------------------------------------------------------ */}
      {/* 1. PROJECT IDENTIFICATION (Header)                                 */}
      {/* ------------------------------------------------------------------ */}
      <header className="relative border-b border-line bg-surface">
        <div className="scanlines pointer-events-none absolute inset-0 opacity-50" aria-hidden />

        <div className="relative mx-auto max-w-[1240px] px-4 py-6">
          <nav className="flex flex-wrap items-center gap-2 text-[11.5px] text-ink-3">
            <Link href="/search" className="hover:text-ink hover:underline">
              {lang === "th" ? "ค้นหาประกาศ" : "Search"}
            </Link>
            <span>/</span>
            <span className="font-mono tnum text-ink-2">{insight.projectId}</span>
            <span className="h-3 w-px bg-line" />
            <span className="font-mono">
              {iden.egpReference
                ? iden.egpReference.toLowerCase().startsWith("e-gp")
                  ? iden.egpReference
                  : `e-GP ${iden.egpReference}`
                : `e-GP ${insight.projectId}`}
            </span>
          </nav>

          <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-2">
            <span className="font-medium text-ink">{iden.agency}</span>
            {iden.department ? (
              <>
                <span className="h-3 w-px bg-line" />
                <span className="text-ink-3">{iden.department}</span>
              </>
            ) : null}
            {iden.category ? (
              <>
                <span className="h-3 w-px bg-line" />
                <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-ink-3">
                  {iden.category}
                </span>
              </>
            ) : null}
          </p>

          <h1 className="mt-2 max-w-4xl text-[26px] sm:text-[28px] leading-thai font-semibold tracking-tight text-ink">
            {iden.titleTh}
          </h1>

          {iden.titleEn ? (
            <p className="mt-1.5 max-w-4xl text-[14px] leading-thai text-ink-3">
              {iden.titleEn}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {/* e-GP's stage, coloured by status; Amended unless the stage already says so */}
            <LifecycleBadge status={iden.status} stage={stage} lang={lang} size="large" />
            {amend?.isAmended && !stage.saysChanged ? <AmendedFlag lang={lang} /> : null}

            {/* Deadline Countdown Pill in Header */}
            {deadline.date ? (() => {
              if (isDead(iden.status)) {
                return (
                  <span className="inline-flex items-center gap-1.5 rounded-[2px] border border-line bg-surface-2 px-2.5 py-[3px] text-[11px] font-medium text-ink-3">
                    <span>
                      {iden.status === "Closed"
                        ? (lang === "th" ? "ปิดรับข้อเสนอแล้ว" : "Bidding closed")
                        : (lang === "th" ? "สิ้นสุดแล้ว" : "Concluded")}
                    </span>
                  </span>
                );
              }
              const days = daysLeft(deadline.date, new Date());
              const cd = countdownText(days, lang);
              const pillStyle =
                days <= 2
                  ? "border-risk-line bg-risk-bg text-risk"
                  : days <= 7
                  ? "border-amend-line bg-amend-bg text-amend"
                  : "border-line bg-surface-2 text-ink";
              return (
                <span className={`inline-flex items-center gap-1.5 rounded-[2px] border px-2.5 py-[3px] text-[11.5px] font-semibold tnum ${pillStyle}`}>
                  <span>{cd.text}</span>
                  <span className="font-normal opacity-75">· {formatDateString(deadline.date, lang)}</span>
                </span>
              );
            })() : null}

            {/* Fiscal Year Badge */}
            {fiscalYear ? (
              <span className="inline-flex items-center rounded-[2px] border border-line bg-surface-2 px-2.5 py-[3px] text-[11px] font-medium text-ink-2 font-mono">
                {lang === "th" ? `ปีงบประมาณ ${fiscalYear}` : `FY ${fiscalYear}`}
              </span>
            ) : null}

            {/* Scope Badge */}
            <span className="inline-flex items-center rounded-[2px] border border-line bg-surface-2 px-2.5 py-[3px] text-[11px] font-medium text-ink-2">
              {lang === "th" ? scope.th : scope.en}
            </span>

            {/* Who may bid: decisive for freelancers, so it sits with the status */}
            {insight.companiesOnly ? <CompaniesOnlyBadge lang={lang} /> : null}
          </div>

          <ReviewNotice review={insight.review} webUrl={officialEgpUrl} lang={lang} />

          {/* Verdict Strip */}
          <div className="mt-5 flex flex-wrap items-center gap-3 rounded-[3px] border border-line bg-surface-2/60 p-2.5 sm:gap-6 sm:px-4">
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-ink-3">
                {lang === "th" ? "วิเคราะห์ล็อกสเปก:" : "Lock-spec:"}
              </span>
              {lockScore === null ? (
                <span className="text-[12px] text-ink-3">{notAnalysed}</span>
              ) : (
                <span
                  className={`font-mono text-[12px] font-semibold ${
                    lockTone === "risk"
                      ? "text-risk"
                      : lockTone === "amend"
                      ? "text-amend"
                      : "text-open"
                  }`}
                >
                  {lockScore}/100 (
                  {lockScore >= 70
                    ? lang === "th" ? "เสี่ยงสูง" : "High Risk"
                    : lockScore >= 35
                    ? lang === "th" ? "ปานกลาง" : "Medium"
                    : lang === "th" ? "เสี่ยงต่ำ" : "Low Risk"}
                  )
                </span>
              )}
            </div>

            <div className="hidden h-3 w-px bg-line sm:block" />

            <div className="flex items-center gap-2">
              <span className="text-[12px] text-ink-3">
                {lang === "th" ? "เทียบราคากลางในอดีต:" : "Price vs median:"}
              </span>
              {diffPct === null ? (
                <span className="text-[12px] text-ink-3">{notAnalysed}</span>
              ) : (
                <span
                  className={`font-mono text-[12px] font-semibold ${
                    diffPct > 15
                      ? "text-amend"
                      : diffPct < -15
                      ? "text-risk"
                      : "text-open"
                  }`}
                >
                  {diffPct > 0 ? `+${diffPct}%` : `${diffPct}%`}
                </span>
              )}
            </div>

            <div className="hidden h-3 w-px bg-line sm:block" />

            {/* Skill Match Section (Auth-aware) */}
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-ink-3">
                {lang === "th" ? "ตรงกับทักษะคุณ:" : "Skill match:"}
              </span>
              {isAuthenticated ? (
                <span className="font-mono text-[12px] font-semibold text-open">
                  {matchedSkills.length}/{requiredTechNames.length} {lang === "th" ? "รายการ" : "skills"}
                </span>
              ) : (
                <Link
                  href="/auth"
                  className="text-[12px] font-medium text-ink-2 hover:text-ink underline underline-offset-2"
                >
                  {lang === "th" ? "ลงชื่อเข้าใช้เพื่อดูความตรง" : "Sign in to view match"}
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>


      {/* ------------------------------------------------------------------ */}
      {/* 2. BODY LAYOUT (Aside Facts + Main 13 Sections)                   */}
      {/* ------------------------------------------------------------------ */}
      <div className="mx-auto grid max-w-[1240px] gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* ASIDE: Key Procurement Facts (Desktop right, mobile top) */}
        <aside className="order-1 flex flex-col gap-4 lg:order-2 lg:sticky lg:top-[70px] lg:self-start">
          <Panel className="px-4 pt-4 pb-2">
            <Label>{lang === "th" ? "ราคากลาง (Reference Price)" : "Reference price"}</Label>
            <p className="mt-1.5 font-mono tnum text-[28px] leading-none font-semibold text-ink">
              {formatMoney(facts.referencePriceTHB || facts.budgetTHB)}
            </p>

            {facts.budgetTHB && facts.budgetTHB !== facts.referencePriceTHB ? (
              <p className="mt-1 text-[12px] text-ink-3">
                {lang === "th" ? "วงเงินงบประมาณ:" : "Budget:"}{" "}
                <span className="font-mono">{formatMoney(facts.budgetTHB)}</span>
              </p>
            ) : null}

            <div className="mt-4 flex flex-col border-t border-line/60 pt-2">
              {/* Each deadline says what it is for: comments on a draft, or bids */}
              {deadline.kind === "comment" ? (
                <Fact label={lang === "th" ? deadline.label.th : deadline.label.en}>
                  {deadline.date ? (() => {
                    if (isDead(iden.status)) {
                      return (
                        <div className="flex flex-col sm:items-end gap-0.5">
                          <span className="tnum text-[14px] font-semibold text-ink">
                            {formatDateString(deadline.date, lang)}
                          </span>
                          <span className="tnum text-[12px] font-medium text-ink-3">
                            {lang === "th" ? "ปิดรับความเห็นแล้ว" : "Period ended"}
                          </span>
                        </div>
                      );
                    }
                    const days = daysLeft(deadline.date, new Date());
                    const cd = countdownText(days, lang);
                    return (
                      <div className="flex flex-col sm:items-end gap-0.5">
                        <span className="tnum text-[14px] font-semibold text-ink">
                          {formatDateString(deadline.date, lang)}
                        </span>
                        <span className={`tnum text-[12.5px] ${cd.tone}`}>
                          {cd.text}
                        </span>
                      </div>
                    );
                  })() : (
                    <span className="text-[13px] text-ink-3">
                      {lang === "th" ? deadline.missing.th : deadline.missing.en}
                    </span>
                  )}
                </Fact>
              ) : null}
              <Fact label={lang === "th" ? "ยื่นข้อเสนอภายใน" : "Bids due"}>
                {facts.submissionDeadline ? (() => {
                  if (isDead(iden.status)) {
                    return (
                      <div className="flex flex-col sm:items-end gap-0.5">
                        <span className="tnum text-[14px] font-semibold text-ink">
                          {formatDateString(facts.submissionDeadline, lang)}
                        </span>
                        <span className="tnum text-[12px] font-medium text-ink-3">
                          {iden.status === "Closed"
                            ? (lang === "th" ? "ปิดรับข้อเสนอแล้ว" : "Bidding closed")
                            : (lang === "th" ? "สิ้นสุดการรับข้อเสนอ" : "Ended")}
                        </span>
                      </div>
                    );
                  }
                  const days = daysLeft(facts.submissionDeadline, new Date());
                  const cd = countdownText(days, lang);
                  return (
                    <div className="flex flex-col sm:items-end gap-0.5">
                      <span className="tnum text-[14px] font-semibold text-ink">
                        {formatDateString(facts.submissionDeadline, lang)}
                      </span>
                      <span className={`tnum text-[13px] ${cd.tone}`}>
                        {cd.text}
                      </span>
                    </div>
                  );
                })() : (
                  <span className="tnum text-[13px] font-medium text-ink">
                    {deadline.kind === "comment"
                      ? (lang === "th" ? "ยังไม่เปิด: ร่าง TOR ยังไม่ประกาศเชิญชวน" : "Not yet: no invitation to bid so far")
                      : (lang === "th" ? "ไม่ระบุใน TOR" : "Not specified")}
                  </span>
                )}
              </Fact>

              {insight.latestAnnouncement ? (
                <Fact label={lang === "th" ? "ประกาศล่าสุดใน e-GP" : "Latest e-GP announcement"}>
                  <span className="text-[12px] text-ink-2">
                    {lang === "th"
                      ? announcementLabel(insight.latestAnnouncement.code).th
                      : announcementLabel(insight.latestAnnouncement.code).en}
                    {insight.latestAnnouncement.publishedAt ? (
                      <span className="tnum text-ink-3"> · {formatDateString(insight.latestAnnouncement.publishedAt, lang)}</span>
                    ) : null}
                  </span>
                </Fact>
              ) : null}

              <Fact label={lang === "th" ? "วิธีการจัดซื้อจัดจ้าง" : "Procurement method"}>
                <span className="text-[12px] text-ink-2">
                  {facts.procurementMethod || (lang === "th" ? "ไม่ระบุใน TOR" : "Not specified")}
                </span>
              </Fact>

              <Fact label={lang === "th" ? "ระยะเวลาส่งมอบ" : "Delivery period"}>
                <span className="tnum text-[12px] text-ink">
                  {facts.deliveryPeriodDays
                    ? `${facts.deliveryPeriodDays} ${lang === "th" ? "วัน" : "days"}`
                    : (lang === "th" ? "ไม่ระบุใน TOR" : "Not specified")}
                </span>
              </Fact>

              <Fact label={lang === "th" ? "ระยะเวลารับประกัน" : "Warranty"}>
                <span className="tnum text-[12px] text-ink">
                  {facts.warrantyYears
                    ? `${facts.warrantyYears} ${lang === "th" ? "ปี" : "years"}`
                    : (lang === "th" ? "ไม่ระบุใน TOR" : "Not specified")}
                </span>
              </Fact>

              <Fact label={lang === "th" ? "ค่าปรับความล่าช้า" : "Delay penalty"}>
                <span className="text-[12px] text-ink-2">
                  {facts.penaltyClause || (lang === "th" ? "ไม่ระบุใน TOR" : "Not specified")}
                </span>
              </Fact>

              <Fact label={lang === "th" ? "วันที่เผยแพร่" : "Posted date"}>
                <span className="tnum text-[12px]">
                  {formatDateString(facts.postedDate, lang)}
                </span>
              </Fact>

              <Fact label={lang === "th" ? "ปีงบประมาณ" : "Fiscal year"}>
                <span className="tnum text-[12.5px] font-semibold text-ink">
                  {fiscalYear
                    ? lang === "th"
                      ? `พ.ศ. ${fiscalYear}`
                      : `FY ${fiscalYear}`
                    : lang === "th"
                    ? "ไม่ระบุใน TOR"
                    : "Not specified"}
                </span>
              </Fact>
            </div>

            {/* Official e-GP Link */}
            {officialEgpUrl ? (
              <div className="mt-4 border-t border-line pt-3 pb-1">
                <a
                  href={officialEgpUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${btn.primary} flex w-full items-center justify-center gap-1.5 text-[12px]`}
                >
                  <span>{lang === "th" ? "เปิดดูบนระบบ e-GP ทางการ" : "Open on official e-GP"}</span>
                  <span>↗</span>
                </a>
                <p className="mt-1.5 text-center text-[11px] leading-thai text-ink-3">
                  {lang === "th" ? (
                    <>
                      การยื่นข้อเสนอและการประมูลทางการทำผ่าน e-GP เท่านั้น
                      <br />
                      (ระบบ e-GP ปิดปรับปรุงประจำวัน 00:00–04:00 น.)
                    </>
                  ) : (
                    "All official bids are submitted on e-GP."
                  )}
                </p>
              </div>
            ) : null}
          </Panel>

          {/* Watchlist Action */}
          <Panel className="p-4">
            <button
              type="button"
              onClick={handleWatchlistClick}
              disabled={toggleLoading}
              className={isSaved ? `${btn.secondary} w-full text-[13px]` : `${btn.primary} w-full text-[13px]`}
              aria-pressed={isSaved}
            >
              {toggleLoading
                ? lang === "th"
                  ? "กำลังอัปเดต…"
                  : "Updating…"
                : isSaved
                  ? lang === "th"
                    ? "✓ ติดตามประกาศนี้แล้ว"
                    : "✓ On your watchlist"
                  : lang === "th"
                    ? "★ บันทึกไว้ติดตามการเปลี่ยนแปลง"
                    : "★ Save to watchlist"}
            </button>
            <p className="mt-2 text-[11px] leading-thai text-ink-3">
              {isSaved
                ? lang === "th"
                  ? "ระบบจะแจ้งเตือนเมื่อมีการออกเอกสารแก้ไข (Amendment) หรือประกาศผู้ชนะ"
                  : "You will be alerted if amended or awarded."
                : lang === "th"
                  ? "บันทึกเพื่อรับการแจ้งเตือนทันทีเมื่อมีการแก้ไข TOR หรือเลื่อนวันยื่นข้อเสนอ"
                  : "Save to get alerted when this TOR is amended."}
            </p>
          </Panel>

          {/* Capability Matchbox (Auth-aware) */}
          <Panel className="p-4">
            <div className="flex items-center justify-between gap-2">
              <Label>{lang === "th" ? "ความตรงกับทักษะของคุณ" : "Skills match"}</Label>
              {isAuthenticated ? (
                <span className="font-mono text-[13px] font-semibold text-open">
                  {Math.round((matchedSkills.length / Math.max(requiredTechNames.length, 1)) * 100)}%
                </span>
              ) : null}
            </div>

            {isAuthenticated ? (
              <>
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-3">
                  {requiredTechNames.map((tName, idx) => {
                    const isMatch = matchedSkills.includes(tName);
                    return (
                      <span
                        key={`${tName}-${idx}`}
                        className={`inline-flex items-center gap-1 rounded-[2px] border px-1.5 py-0.5 text-[11px] ${
                          isMatch
                            ? "border-open-line bg-open-bg text-open font-medium"
                            : "border-line bg-surface-2 text-ink-3"
                        }`}
                      >
                        <span>{isMatch ? "✓" : "○"}</span>
                        <span>{tName}</span>
                      </span>
                    );
                  })}
                </div>

                <Link
                  href="/profile"
                  className="mt-3 inline-block text-[11px] text-ink-2 underline underline-offset-2 hover:text-ink"
                >
                  {lang === "th" ? "แก้ไขทักษะในโปรไฟล์ของคุณ →" : "Edit your skills profile →"}
                </Link>
              </>
            ) : (
              <div className="mt-2 border-t border-line pt-2.5">
                <p className="text-[12px] leading-thai text-ink-2">
                  {lang === "th"
                    ? "ลงชื่อเข้าใช้เพื่อดูว่าโครงการนี้ต้องใช้ทักษะที่คุณถนัดหรือไม่ และวิเคราะห์ความเหมาะสมกับทีมของคุณ"
                    : "Sign in to see how well this project matches your technical capabilities."}
                </p>
                <Link
                  href="/auth"
                  className={`${btn.secondary} mt-3 flex w-full items-center justify-center text-[12px]`}
                >
                  {lang === "th" ? "ลงชื่อเข้าใช้เพื่อดูผลจับคู่" : "Sign in to view match"}
                </Link>
              </div>
            )}
          </Panel>
        </aside>


        {/* MAIN COLUMN: 13 Modular Sections */}
        <div className="order-2 flex min-w-0 flex-col gap-6 lg:order-1">
          {/* Status Alert if Closed or Cancelled */}
          {iden.status === "Closed" || iden.status === "Cancelled" ? (
            <div className="rounded-[3px] border border-l-[4px] border-line border-l-closed bg-closed-bg px-4 py-3.5">
              <p className="text-[15px] font-semibold text-ink">
                {lang === "th"
                  ? "โครงการนี้สิ้นสุดการรับข้อเสนอแล้ว"
                  : "This procurement is closed."}
              </p>
              <p className="mt-1 text-[13px] text-ink-2">
                {lang === "th"
                  ? "โครงการนี้พ้นกำหนดยื่นข้อเสนอหรือมีการประกาศผลเรียบร้อยแล้ว ไม่จำเป็นต้องอ่านต่อเพื่อเตรียมยื่นซอง"
                  : "The submission deadline has passed or results have been awarded."}
              </p>
            </div>
          ) : null}

          {/* Amendment Alert Banner if Amended */}
          {amend.isAmended ? (
            <div className="rounded-[3px] border border-l-[4px] border-line border-l-amend bg-amend-bg px-4 py-3.5">
              <p className="text-[15px] font-semibold text-amend">
                {lang === "th"
                  ? `ประกาศนี้มีการแก้ไข TOR (ปรับปรุงล่าสุด ${formatDateString(amend.lastAmendedDate, lang)})`
                  : `This TOR has been amended (Last updated ${formatDateString(amend.lastAmendedDate, lang)})`}
              </p>
              {amend.amendmentSummary ? (
                <p className="mt-1 text-[13px] leading-thai text-ink-2">
                  {amend.amendmentSummary}
                </p>
              ) : null}
              {amend.changedSections && amend.changedSections.length > 0 ? (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-ink-3">
                    {lang === "th" ? "ส่วนที่มีการแก้ไข:" : "Changed sections:"}
                  </span>
                  {amend.changedSections.map((sec, idx) => (
                    <span key={`${sec}-${idx}`} className="rounded bg-surface px-1.5 py-0.5 text-[11px] font-medium text-amend border border-amend-line">
                      {sec}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* ---------------------------------------------------------------- */}
          {/* 3. PROJECT OVERVIEW                                              */}
          {/* ---------------------------------------------------------------- */}
          <Panel className="px-4 py-5 sm:px-6 sm:py-6">
            <SectionHeading
              sub={
                lang === "th"
                  ? "วัตถุประสงค์และขอบเขตภาพรวมของงานจ้างตามเอกสาร TOR"
                  : "Objective and high-level scope from the source TOR document"
              }
            >
              {lang === "th" ? "วัตถุประสงค์และขอบเขตโครงการ" : "Project Overview"}
            </SectionHeading>

            {!overview.objective && !overview.highLevelScope && (!overview.majorComponents || overview.majorComponents.length === 0) ? (
              <p className="mt-3 text-[14px] leading-thai text-ink-3">
                {lang === "th"
                  ? "ไม่มีรายละเอียดวัตถุประสงค์หรือขอบเขตระบุไว้ในเอกสาร TOR ฉบับนี้"
                  : "No objective or scope explicitly specified in this TOR document."}
              </p>
            ) : null}

            {overview.objective ? (
              <div className="mt-3">
                <Label>{lang === "th" ? "วัตถุประสงค์ (Objective)" : "Objective"}</Label>
                <p className="mt-1 text-[15px] leading-thai text-ink">
                  {overview.objective}
                </p>
              </div>
            ) : null}

            {overview.highLevelScope ? (
              <div className="mt-4">
                <Label>{lang === "th" ? "ขอบเขตภาพรวม (High-level Scope)" : "High-level Scope"}</Label>
                <p className="mt-1 text-[14px] leading-thai text-ink-2">
                  {overview.highLevelScope}
                </p>
              </div>
            ) : null}

            {overview.majorComponents && overview.majorComponents.length > 0 ? (
              <div className="mt-5 border-t border-line/60 pt-4">
                <Label>{lang === "th" ? "องค์ประกอบหลักของงาน (Major Components)" : "Major Components"}</Label>
                <ul className="mt-2 flex flex-col gap-2">
                  {overview.majorComponents.map((item, idx) => (
                    <li key={idx} className="flex gap-2.5 text-[14px] leading-thai text-ink">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ink-3" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Panel>

          {/* ---------------------------------------------------------------- */}
          {/* 4. CONTRACTOR DELIVERABLES                                       */}
          {/* ---------------------------------------------------------------- */}
          <Panel className="px-4 py-5 sm:px-6 sm:py-6">
            <SectionHeading
              sub={
                lang === "th"
                  ? "สิ่งที่ผู้รับจ้างต้องจัดทำและส่งมอบตามสัญญาเพื่อรับการตรวจรับ"
                  : "Everything required to deliver and pass official acceptance inspection"
              }
            >
              {lang === "th" ? "สิ่งที่ต้องส่งมอบ (Deliverables)" : "Deliverables"}
            </SectionHeading>

            {(!deliverables.system || deliverables.system.length === 0) &&
            (!deliverables.implementation || deliverables.implementation.length === 0) &&
            (!deliverables.validation || deliverables.validation.length === 0) &&
            (!deliverables.supportingWork || deliverables.supportingWork.length === 0) ? (
              <div className="mt-3 rounded-[3px] border border-line bg-surface-2/40 p-4 text-[13px] leading-thai text-ink-3">
                {lang === "th"
                  ? "ไม่มีการแจกแจงรายการสิ่งส่งมอบเฉพาะในเอกสาร TOR ฉบับนี้"
                  : "No specific itemized deliverables enumerated in this TOR document."}
              </div>
            ) : (
              <div className="mt-4 grid gap-5 sm:grid-cols-2">
                {deliverables.system && deliverables.system.length > 0 ? (
                  <div className="rounded-[3px] border border-line bg-surface-2/40 p-3.5">
                    <h3 className="text-[13px] font-semibold text-ink">
                      {lang === "th" ? "📦 ระบบซอฟต์แวร์และเอกสารระบบ" : "System & Documentation"}
                    </h3>
                    <ul className="mt-2 flex flex-col gap-1.5">
                      {deliverables.system.map((item, idx) => (
                        <li key={idx} className="flex gap-2 text-[13px] leading-thai text-ink-2">
                          <span className="text-ink-3">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {deliverables.implementation && deliverables.implementation.length > 0 ? (
                  <div className="rounded-[3px] border border-line bg-surface-2/40 p-3.5">
                    <h3 className="text-[13px] font-semibold text-ink">
                      {lang === "th" ? "⚙️ การติดตั้งและย้ายข้อมูล" : "Implementation & Migration"}
                    </h3>
                    <ul className="mt-2 flex flex-col gap-1.5">
                      {deliverables.implementation.map((item, idx) => (
                        <li key={idx} className="flex gap-2 text-[13px] leading-thai text-ink-2">
                          <span className="text-ink-3">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {deliverables.validation && deliverables.validation.length > 0 ? (
                  <div className="rounded-[3px] border border-line bg-surface-2/40 p-3.5">
                    <h3 className="text-[13px] font-semibold text-ink">
                      {lang === "th" ? "🔍 การทดสอบระบบและการตรวจรับ" : "Testing & Acceptance"}
                    </h3>
                    <ul className="mt-2 flex flex-col gap-1.5">
                      {deliverables.validation.map((item, idx) => (
                        <li key={idx} className="flex gap-2 text-[13px] leading-thai text-ink-2">
                          <span className="text-ink-3">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {deliverables.supportingWork && deliverables.supportingWork.length > 0 ? (
                  <div className="rounded-[3px] border border-line bg-surface-2/40 p-3.5">
                    <h3 className="text-[13px] font-semibold text-ink">
                      {lang === "th" ? "🎓 การฝึกอบรมและการสนับสนุน" : "Training & Support"}
                    </h3>
                    <ul className="mt-2 flex flex-col gap-1.5">
                      {deliverables.supportingWork.map((item, idx) => (
                        <li key={idx} className="flex gap-2 text-[13px] leading-thai text-ink-2">
                          <span className="text-ink-3">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            )}
          </Panel>

          {/* ---------------------------------------------------------------- */}
          {/* 5. TECHNICAL REQUIREMENTS                                        */}
          {/* ---------------------------------------------------------------- */}
          <Panel className="px-4 py-5 sm:px-6 sm:py-6">
            <SectionHeading
              sub={
                lang === "th"
                  ? "เทคโนโลยี สถาปัตยกรรมระบบ และข้อกำหนดประสิทธิภาพ"
                  : "Required technology stack, system architecture and performance metrics"
              }
            >
              {lang === "th" ? "ข้อกำหนดด้านเทคนิค (Technical Requirements)" : "Technical Requirements"}
            </SectionHeading>


            {/* Technologies */}
            <div className="mt-3">
              <Label>{lang === "th" ? "เทคโนโลยีที่กำหนดระบุไว้" : "Required Technologies"}</Label>
              {!tech.requiredTechnologies || tech.requiredTechnologies.length === 0 ? (
                <p className="mt-2 text-[13px] text-ink-3">
                  {lang === "th"
                    ? "TOR นี้ไม่ได้ระบุเทคโนโลยีเฉพาะเจาะจง (เทคโนโลยีเปิด / ขึ้นกับข้อเสนอของผู้ยื่นข้อเสนอ)"
                    : "No specific technologies mandated (vendor's choice)."}
                </p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  {tech.requiredTechnologies.map((t, idx) => {
                    const isMatch = matchedSkills.includes(t.name);
                    return (
                      <Chip
                        key={`${t.name}-${t.version ?? ""}-${idx}`}
                        className={isMatch ? "border-open-line bg-open-bg text-open" : ""}
                      >
                        {isMatch ? <span className="mr-1">✓</span> : null}
                        <span className="font-medium">{t.name}</span>
                        {t.version ? (
                          <span className="ml-1 opacity-70 font-mono text-[10px]">v{t.version}</span>
                        ) : null}
                      </Chip>
                    );
                  })}
                </div>
              )}
            </div>


            {/* Required Capabilities */}
            {tech.requiredCapabilities && tech.requiredCapabilities.length > 0 ? (
              <div className="mt-5 border-t border-line/60 pt-4">
                <Label>{lang === "th" ? "ขีดความสามารถที่ระบบต้องมี" : "System Capabilities"}</Label>
                <ul className="mt-2 flex flex-col gap-2">
                  {tech.requiredCapabilities.map((cap, idx) => (
                    <li key={idx} className="flex gap-2 text-[13.5px] leading-thai text-ink-2">
                      <span className="text-ink-3">✓</span>
                      <span>{cap}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* Infrastructure Specs */}
            {tech.infrastructureSpecifications && tech.infrastructureSpecifications.length > 0 ? (
              <div className="mt-5 border-t border-line/60 pt-4">
                <Label>{lang === "th" ? "ข้อกำหนดโครงสร้างพื้นฐานและฮาร์ดแวร์" : "Infrastructure Specs"}</Label>
                <div className="mt-2 divide-y divide-line rounded-[3px] border border-line bg-surface-2/30">
                  {tech.infrastructureSpecifications.map((spec, idx) => (
                    <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between px-3.5 py-2 text-[13px]">
                      <span className="font-medium text-ink">{spec.key}</span>
                      <span className="font-mono text-ink-2">{spec.spec}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </Panel>

          {/* ---------------------------------------------------------------- */}
          {/* 6. INTEGRATION & EXISTING ENVIRONMENT                            */}
          {/* ---------------------------------------------------------------- */}
          <Panel className="px-4 py-5 sm:px-6 sm:py-6">
            <SectionHeading
              sub={
                lang === "th"
                  ? "ระบบเดิมที่ต้องเชื่อมต่อ สภาพแวดล้อมเครือข่าย และสถานที่ติดตั้ง"
                  : "Legacy systems, interfaces, and host deployment environment"
              }
            >
              {lang === "th" ? "สภาพแวดล้อมและการเชื่อมต่อระบบเดิม" : "Integration & Environment"}
            </SectionHeading>

            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <Label>{lang === "th" ? "ระบบเดิมของหน่วยงานที่ต้องเชื่อมต่อ" : "Existing Systems"}</Label>
                <ul className="mt-1.5 flex flex-col gap-1.5">
                  {integration.existingSystems && integration.existingSystems.length > 0 ? (
                    integration.existingSystems.map((item, idx) => (
                      <li key={idx} className="flex gap-2 text-[13px] leading-thai text-ink-2">
                        <span className="text-ink-3">→</span>
                        <span>{item}</span>
                      </li>
                    ))
                  ) : (
                    <span className="text-[13px] text-ink-3">
                      {lang === "th" ? "ไม่ระบุใน TOR" : "Not specified in TOR"}
                    </span>
                  )}
                </ul>
              </div>

              <div>
                <Label>{lang === "th" ? "ช่องทางเชื่อมต่อ (APIs & Protocols)" : "Interfaces & APIs"}</Label>
                <ul className="mt-1.5 flex flex-col gap-1.5">
                  {integration.interfacesAndApis && integration.interfacesAndApis.length > 0 ? (
                    integration.interfacesAndApis.map((item, idx) => (
                      <li key={idx} className="flex gap-2 text-[13px] leading-thai text-ink-2">
                        <span className="text-ink-3">⇄</span>
                        <span>{item}</span>
                      </li>
                    ))
                  ) : (
                    <span className="text-[13px] text-ink-3">
                      {lang === "th" ? "ไม่ระบุใน TOR" : "Not specified in TOR"}
                    </span>
                  )}
                </ul>
              </div>
            </div>

            {integration.deploymentLocation ? (
              <div className="mt-4 border-t border-line/60 pt-3 text-[13px]">
                <span className="text-ink-3">{lang === "th" ? "สถานที่ติดตั้ง/โฮสต์:" : "Deployment location:"} </span>
                <span className="font-medium text-ink">{integration.deploymentLocation}</span>
              </div>
            ) : null}
          </Panel>

          {/* ---------------------------------------------------------------- */}
          {/* 7. IMPLEMENTATION & OPERATIONS                                   */}
          {/* ---------------------------------------------------------------- */}
          <Panel className="px-4 py-5 sm:px-6 sm:py-6">
            <SectionHeading
              sub={
                lang === "th"
                  ? "การฝึกอบรม การสนับสนุนทางเทคนิค และเงื่อนไขการบำรุงรักษา"
                  : "Training, SLA response times, and ongoing maintenance expectations"
              }
            >
              {lang === "th" ? "การดำเนินงานและการบำรุงรักษา" : "Operations & Maintenance"}
            </SectionHeading>

            <div className="mt-3 flex flex-col gap-4">
              {ops.technicalSupportAndSla ? (
                <div>
                  <Label>{lang === "th" ? "ระดับการให้บริการ (SLA) และการสนับสนุน" : "Technical Support & SLA"}</Label>
                  <p className="mt-1 text-[13.5px] leading-thai text-ink-2">
                    {ops.technicalSupportAndSla}
                  </p>
                </div>
              ) : null}

              {ops.training && ops.training.length > 0 ? (
                <div>
                  <Label>{lang === "th" ? "การจัดฝึกอบรมบุคลากร" : "Training Requirements"}</Label>
                  <ul className="mt-1 flex flex-col gap-1">
                    {ops.training.map((t, idx) => (
                      <li key={idx} className="flex gap-2 text-[13px] leading-thai text-ink-2">
                        <span className="text-ink-3">•</span>
                        <span>{t}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </Panel>

          {/* ---------------------------------------------------------------- */}
          {/* 8. BID ELIGIBILITY & QUALIFICATIONS                              */}
          {/* ---------------------------------------------------------------- */}
          <Panel className="px-4 py-5 sm:px-6 sm:py-6">
            <SectionHeading
              sub={
                lang === "th"
                  ? "เกณฑ์คุณสมบัติของผู้ยื่นข้อเสนอ มูลค่าผลงานขั้นต่ำ และมาตรฐานที่ต้องมี"
                  : "Qualifications, minimal prior contract value, and mandatory certifications"
              }
            >
              {lang === "th" ? "คุณสมบัติผู้ยื่นข้อเสนอ (Eligibility)" : "Bidder Eligibility"}
            </SectionHeading>

            <div className="mt-3 flex flex-col gap-4">
              {/* Previous Experience */}
              {elig.previousExperience || elig.previousExperienceMinTHB ? (
                <div className="rounded-[3px] border border-line bg-surface-2/40 p-3.5">
                  <Label>{lang === "th" ? "ผลงานในอดีตขั้นต่ำ (Previous Experience)" : "Prior Experience"}</Label>
                  <p className="mt-1 text-[14px] font-medium leading-thai text-ink">
                    {elig.previousExperience || (
                      `${lang === "th" ? "สัญญาเดียวไม่น้อยกว่า" : "Single contract at least"} ${formatMoney(elig.previousExperienceMinTHB)}`
                    )}
                  </p>
                </div>
              ) : null}

              {/* Company Requirements */}
              {elig.companyRequirements && elig.companyRequirements.length > 0 ? (
                <div>
                  <Label>{lang === "th" ? "คุณสมบัติทางนิติบุคคล" : "Corporate Requirements"}</Label>
                  <ul className="mt-1 flex flex-col gap-1.5">
                    {elig.companyRequirements.map((req, idx) => (
                      <li key={idx} className="flex gap-2 text-[13px] leading-thai text-ink-2">
                        <span className="text-ink-3">✓</span>
                        <span>{req}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {/* Certifications */}
              {elig.requiredCertifications && elig.requiredCertifications.length > 0 ? (
                <div>
                  <Label>{lang === "th" ? "ใบรับรองมาตรฐานสากล (ISO / CMMI)" : "Required Certifications"}</Label>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {elig.requiredCertifications.map((cert, idx) => (
                      <span key={idx} className="rounded border border-line bg-surface px-2 py-1 text-[12px] font-medium text-ink">
                        {cert}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Manufacturer Authorization */}
              {elig.manufacturerAuthorizations && elig.manufacturerAuthorizations.length > 0 ? (
                <div className="rounded-[3px] border border-amend-line bg-amend-bg/40 p-3">
                  <div className="flex items-center gap-1.5 text-[12px] font-semibold text-amend">
                    <span>⚠️</span>
                    <span>{lang === "th" ? "หนังสือแต่งตั้งตัวแทนจำหน่าย (Manufacturer Authorization)" : "Manufacturer Authorization"}</span>
                  </div>
                  <ul className="mt-1.5 flex flex-col gap-1">
                    {elig.manufacturerAuthorizations.map((auth, idx) => (
                      <li key={idx} className="text-[13px] leading-thai text-ink">
                        {auth}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </Panel>

          {/* ---------------------------------------------------------------- */}
          {/* 9. CONTRACT CONDITIONS                                           */}
          {/* ---------------------------------------------------------------- */}
          <Panel className="px-4 py-5 sm:px-6 sm:py-6">
            <SectionHeading
              sub={
                lang === "th"
                  ? "การแบ่งจ่ายเงินงวด การส่งมอบ และเกณฑ์การพิจารณาคัดเลือก"
                  : "Payment milestones, delivery conditions, and bid evaluation methodology"
              }
            >
              {lang === "th" ? "เงื่อนไขสัญญาและการส่งมอบ" : "Contract Conditions"}
            </SectionHeading>

            <div className="mt-3 flex flex-col gap-3 text-[13.5px]">
              <div>
                <Label>{lang === "th" ? "เงื่อนไขการจ่ายเงิน (Payment Terms)" : "Payment Terms"}</Label>
                <p className="mt-1 leading-thai text-ink-2">
                  {conditions.paymentTerms || (lang === "th" ? "ไม่ระบุใน TOR" : "Not specified")}
                </p>
              </div>

              <div>
                <Label>{lang === "th" ? "เกณฑ์การพิจารณาตัดสิน (Evaluation Method)" : "Evaluation Method"}</Label>
                <p className="mt-1 leading-thai text-ink-2">
                  {conditions.evaluationMethod || (lang === "th" ? "ไม่ระบุใน TOR" : "Not specified")}
                </p>
              </div>
            </div>
          </Panel>

          {/* ---------------------------------------------------------------- */}
          {/* 10. DECISION SUPPORT: LOCK-SPEC RISK (Analytical Layer)          */}
          {/* ---------------------------------------------------------------- */}
          {lockSpec ? (
          <AccentPanel tone={lockTone} className="px-4 py-5 sm:px-6 sm:py-6">
            <SectionHeading
              sub={
                lang === "th"
                  ? "วิเคราะห์โดยระบบ GIPDP เพื่อประเมินความเป็นไปได้ในการแข่งขันอย่างเป็นธรรม"
                  : "GIPDP analytical assessment of competition fairness and restrictive clauses"
              }
              right={
                <span className="flex items-center gap-2">
                  <span className="font-mono text-[16px] font-bold text-ink">
                    {lockScore}
                    <span className="text-ink-3 text-[12px]">/100</span>
                  </span>
                </span>
              }
            >
              {lang === "th" ? "วิเคราะห์ความเสี่ยงล็อกสเปก (Lock-Spec Risk)" : "Lock-Spec Risk Analysis"}
            </SectionHeading>

            <div className="mt-2">
              <p className="text-[15px] leading-thai font-semibold text-ink">
                {lockSpec.verdictText}
              </p>
            </div>

            {/* Modular Finding Cards */}
            {lockSpec.findings && lockSpec.findings.length > 0 ? (
              <div className="mt-5 flex flex-col gap-4">
                {lockSpec.findings.map((finding, idx) => (
                  <div
                    key={finding.id || idx}
                    className="rounded-[3px] border border-line bg-surface p-4 shadow-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[12px] font-bold text-ink-3">
                          #{String(idx + 1).padStart(2, "0")}
                        </span>
                        <span className="rounded bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-2 border border-line">
                          {finding.category}
                        </span>
                      </div>

                      <span
                        className={`rounded px-2 py-0.5 text-[11px] font-semibold uppercase ${
                          finding.severity === "high"
                            ? "bg-risk-bg text-risk border border-risk-line"
                            : "bg-amend-bg text-amend border border-amend-line"
                        }`}
                      >
                        {finding.severity}
                      </span>
                    </div>

                    <h4 className="mt-2.5 text-[14.5px] leading-thai font-semibold text-ink">
                      {finding.title}
                    </h4>

                    <div className="mt-2 text-[13px] leading-thai text-ink-2">
                      <span className="font-medium text-ink">{lang === "th" ? "ข้อกำหนดใน TOR:" : "Requirement:"} </span>
                      {finding.requirementText}
                    </div>

                    {finding.normalBenchmark ? (
                      <div className="mt-1 text-[13px] leading-thai text-ink-3">
                        <span className="font-medium text-ink-2">{lang === "th" ? "เกณฑ์มาตรฐานทั่วไป:" : "Normal Benchmark:"} </span>
                        {finding.normalBenchmark}
                      </div>
                    ) : null}

                    {finding.sourceExcerpt ? (
                      <Well className="mt-3 border-l-2 border-l-line-2 px-3 py-2 text-[12.5px] text-ink-2">
                        <p>“{finding.sourceExcerpt}”</p>
                        {finding.sourceLocation ? (
                          <p className="mt-1 font-mono text-[11px] text-ink-3">
                            📍 {finding.sourceLocation}
                          </p>
                        ) : null}
                      </Well>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-[3px] border border-open-line bg-open-bg/40 p-4 text-[13.5px] leading-thai text-open">
                {lang === "th"
                  ? "✓ ไม่พบเงื่อนไขล็อกสเปกที่ผิดปกติ ข้อกำหนดเป็นไปตามมาตรฐานการเปิดกว้างสำหรับผู้ยื่นข้อเสนอทั่วไป"
                  : "✓ No abnormal lock-spec criteria found. Standard open requirements."}
              </div>
            )}
          </AccentPanel>
          ) : (
            <NotAnalysed
              heading={lang === "th" ? "วิเคราะห์ความเสี่ยงล็อกสเปก (Lock-Spec Risk)" : "Lock-Spec Risk Analysis"}
              lang={lang}
            />
          )}

          {/* ---------------------------------------------------------------- */}
          {/* 11. DECISION SUPPORT: PRICE REALITY CHECK                        */}
          {/* ---------------------------------------------------------------- */}
          {price ? (
          <AccentPanel tone={priceTone} className="px-4 py-5 sm:px-6 sm:py-6">
            <SectionHeading
              sub={
                lang === "th"
                  ? "เปรียบเทียบราคากลางกับโครงการเทคโนโลยีลักษณะเดียวกันในอดีต (FR-19)"
                  : "Comparison against historical median of similar past projects"
              }
              right={
                <span className="font-mono text-[14px] font-bold">
                  {price.diffPercentage > 0 ? `+${price.diffPercentage}%` : `${price.diffPercentage}%`}
                </span>
              }
            >
              {lang === "th" ? "ตรวจสอบความสมเหตุสมผลของราคา (Price Reality Check)" : "Price Reality Check"}
            </SectionHeading>

            <p className="mt-2 text-[14.5px] leading-thai text-ink">
              {price.interpretation}
            </p>

            <div className="mt-4 grid grid-cols-2 gap-4 rounded-[3px] border border-line bg-surface p-3.5 sm:grid-cols-3">
              <div>
                <Label>{lang === "th" ? "ราคากลางโครงการนี้" : "Reference Price"}</Label>
                <p className="mt-1 font-mono text-[16px] font-semibold text-ink">
                  {formatMoney(price.referencePriceTHB || facts.referencePriceTHB)}
                </p>
              </div>

              <div>
                <Label>{lang === "th" ? "ค่ามัธยฐานในอดีต" : "Historical Median"}</Label>
                <p className="mt-1 font-mono text-[16px] font-semibold text-ink-2">
                  {formatMoney(price.historicalMedianTHB)}
                </p>
              </div>

              <div className="col-span-2 sm:col-span-1">
                <Label>{lang === "th" ? "ส่วนต่างเทียบมัธยฐาน" : "Diff vs Median"}</Label>
                <p className={`mt-1 font-mono text-[16px] font-bold ${
                  price.diffPercentage > 10 ? "text-amend" : price.diffPercentage < -10 ? "text-risk" : "text-open"
                }`}>
                  {price.diffPercentage > 0 ? `+${price.diffPercentage}%` : `${price.diffPercentage}%`}
                </p>
              </div>
            </div>

            {/* Comparable Projects Table */}
            {price.comparableProjects && price.comparableProjects.length > 0 ? (
              <div className="mt-5">
                <Label>{lang === "th" ? "โครงการในอดีตที่ใช้เปรียบเทียบอ้างอิง" : "Comparable Reference Projects"}</Label>
                <div className="mt-2 overflow-x-auto rounded-[3px] border border-line">
                  <table className="w-full text-left text-[12.5px]">
                    <thead className="border-b border-line bg-surface-2 text-ink-3">
                      <tr>
                        <th className="px-3 py-2 font-medium">{lang === "th" ? "ชื่อโครงการ" : "Project"}</th>
                        <th className="px-3 py-2 font-medium">{lang === "th" ? "ปีงบ" : "Year"}</th>
                        <th className="px-3 py-2 text-right font-medium">{lang === "th" ? "ราคากลาง" : "Price"}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line bg-surface">
                      {price.comparableProjects.map((p, idx) => (
                        <tr key={idx}>
                          <td className="px-3 py-2 font-medium text-ink">{p.title}</td>
                          <td className="px-3 py-2 font-mono text-ink-2">{p.year}</td>
                          <td className="px-3 py-2 text-right font-mono text-ink">
                            {formatMoney(p.referencePriceTHB)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-[3px] border border-line bg-surface/50 p-3 text-[12.5px] leading-thai text-ink-3">
                {lang === "th"
                  ? "ยังไม่มีข้อมูลโครงการจัดซื้อที่เทียบเคียงได้โดยตรงในฐานข้อมูลเพื่อแสดงตารางเปรียบเทียบ"
                  : "No direct historical comparable projects currently registered in database."}
              </div>
            )}
          </AccentPanel>
          ) : (
            <NotAnalysed
              heading={lang === "th" ? "ตรวจสอบความสมเหตุสมผลของราคา (Price Reality Check)" : "Price Reality Check"}
              lang={lang}
            />
          )}

          {/* ---------------------------------------------------------------- */}
          {/* 12. AMENDMENT / STATUS INFORMATION                               */}
          {/* ---------------------------------------------------------------- */}
          {amend.isAmended ? (
            <AccentPanel tone="amend" className="px-4 py-5 sm:px-6 sm:py-6">
              <SectionHeading
                sub={
                  lang === "th"
                    ? "ประวัติและสาระสำคัญที่มีการแก้ไขเปลี่ยนแปลงจากประกาศเดิม"
                    : "Summary of changes made since original announcement"
                }
              >
                {lang === "th" ? "ประวัติการแก้ไขเอกสาร TOR" : "Amendment History"}
              </SectionHeading>

              <div className="mt-2">
                <p className="text-[14px] leading-thai text-ink">
                  {amend.amendmentSummary || (lang === "th" ? "มีการแก้ไขเอกสารแนบท้าย" : "Attachments amended.")}
                </p>

                <p className="mt-2 font-mono text-[12px] text-ink-3">
                  {lang === "th" ? "วันที่ประกาศแก้ไข:" : "Amended on:"} {formatDateString(amend.lastAmendedDate, lang)}
                </p>
              </div>
            </AccentPanel>
          ) : null}

          <div className="flex items-center justify-between border-t border-line pt-4">
            <Link href="/search" className={btn.ghost}>
              ← {lang === "th" ? "กลับไปหน้ารายการค้นหา" : "Back to catalog"}
            </Link>
          </div>
        </div>
      </div>

      {/* Auth Modal for Watchlist */}
      {showAuthModal ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="watchlist-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-[2px] animate-in fade-in duration-150"
          onClick={() => setShowAuthModal(false)}
        >
          <div
            className="relative w-full max-w-md rounded-[4px] border border-line bg-surface p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setShowAuthModal(false)}
              className="absolute right-3.5 top-3.5 flex h-7 w-7 items-center justify-center rounded-[3px] text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
              aria-label={lang === "th" ? "ปิดหน้าต่าง" : "Close modal"}
            >
              ✕
            </button>

            <div className="flex h-11 w-11 items-center justify-center rounded-[3px] border border-line bg-surface-2 text-ink">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
              </svg>
            </div>

            <h3 id="watchlist-modal-title" className="mt-4 text-[17px] font-semibold text-ink">
              {lang === "th" ? "ลงชื่อเข้าใช้เพื่อบันทึกรายการที่ติดตาม" : "Sign in to save to your watchlist"}
            </h3>

            <p className="mt-2 text-[13px] leading-thai text-ink-2">
              {lang === "th"
                ? "เมื่อลงชื่อเข้าใช้ คุณจะสามารถติดตามประกาศนี้และรับการแจ้งเตือนทันทีเมื่อมีการออกเอกสารแก้ไข TOR (Amendment) หรือประกาศผู้ชนะ"
                : "Sign in to add this procurement to your watchlist and receive alerts whenever this TOR is amended or awarded."}
            </p>

            <div className="mt-6 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowAuthModal(false)}
                className={btn.secondary}
              >
                {lang === "th" ? "ยกเลิก" : "Cancel"}
              </button>
              <Link
                href={`/auth?next=${encodeURIComponent(`/tor/${projectId}`)}`}
                className={btn.primary}
              >
                {lang === "th" ? "ลงชื่อเข้าใช้" : "Sign in"}
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}


