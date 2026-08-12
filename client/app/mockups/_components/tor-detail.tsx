"use client";

import Link from "next/link";
import { useState } from "react";
import {
  formatDate,
  formatTHB,
  matchFactors,
  matchScore,
  pick,
  type Tor,
} from "../_data/tors";
import { useLang, useProfile } from "./prefs";
import { Deadline, deadlineText } from "./deadline";
import { AmendmentModule, LockSpecModule, PriceModule, SourceModule } from "./modules";
import {
  MatchScore,
  PRICE_TONE,
  RISK_TONE,
  ScopeBadge,
  SmeBadge,
  VerdictStrip,
} from "./verdict";
import { AccentPanel, btn, Chip, Eyebrow, Fact, Label, Panel, SectionHeading } from "./ui";

/**
 * The "never open the PDF" screen, and the one that gets the most design
 * effort.
 *
 * Structure carries the reading order. The normalized summary is one clean
 * sheet — the thing that replaces the document. Each risk module is then its
 * own panel wearing its verdict hue on the left edge, the same rail the
 * catalog rows use, so a verdict attached to content always looks the same.
 * Provenance sits last and quietest, on no surface at all.
 */
export function TorDetail({ tor }: { tor: Tor }) {
  const { lang } = useLang();
  const { profile } = useProfile();
  const [saved, setSaved] = useState(profile.watchlist.includes(tor.id));

  const secondaryTitle = lang === "th" ? tor.title.en : tor.title.th;
  const latestAmendment = tor.amendments.find((a) => a.changes.length > 0);
  const score = matchScore(tor, profile);
  const factors = matchFactors(tor, profile);
  const matchedTech = tor.techStack.filter((t) => profile.skills.includes(t));

  return (
    <article>
      <header className="relative border-b border-line bg-surface">
        <div className="scanlines pointer-events-none absolute inset-0 opacity-50" aria-hidden />

        <div className="relative mx-auto max-w-[1240px] px-4 py-6">
          <nav className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-ink-3">
            <Link href="/mockups/catalog" className="hover:text-ink hover:underline">
              {lang === "th" ? "ประกาศทั้งหมด" : "Browse"}
            </Link>
            <span>/</span>
            <span className="tnum text-ink-2">{tor.id}</span>
            <span className="h-3 w-px bg-line" />
            <span>e-GP {tor.egpRef}</span>
          </nav>

          <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-2">
            <span className="font-medium">{pick(tor.agency, lang)}</span>
            {tor.unit ? (
              <>
                <span className="h-3 w-px bg-line" />
                <span className="text-ink-3">{pick(tor.unit, lang)}</span>
              </>
            ) : null}
          </p>

          <h1 className="mt-1.5 max-w-4xl text-[28px] leading-thai font-semibold tracking-tight text-ink">
            {pick(tor.title, lang)}
          </h1>
          {/* Both languages, always — the source is Thai and the gloss is ours. */}
          <p className="mt-1.5 max-w-4xl text-[14px] leading-thai text-ink-3">{secondaryTitle}</p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <ScopeBadge size={tor.scopeSize} lang={lang} />
            {tor.smeAdvantage ? <SmeBadge lang={lang} /> : null}
          </div>

          <div className="mt-5">
            <VerdictStrip tor={tor} lang={lang} size="full" />
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1240px] gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_312px]">
        {/* Key facts lead on mobile, but the reading column leads on desktop. */}
        <aside className="order-1 flex flex-col gap-4 lg:order-2 lg:sticky lg:top-[70px] lg:self-start">
          <Panel className="px-4 pt-4 pb-1">
            <Label>{lang === "th" ? "ราคากลาง" : "Reference price"}</Label>
            <p className="mt-1.5 font-mono tnum text-[28px] leading-none font-medium text-ink">
              {formatTHB(tor.budget)}
            </p>

            <div className="mt-4 flex flex-col">
              <Fact label={lang === "th" ? "กำหนดยื่นข้อเสนอ" : "Submission deadline"}>
                <span className="flex flex-col sm:items-end">
                  <span className="font-mono tnum">{formatDate(tor.deadline, lang)}</span>
                  <span className="font-mono tnum text-[11px] text-ink-3">
                    {deadlineText(tor.deadline, tor.status, lang)}
                  </span>
                </span>
              </Fact>
              <Fact label={lang === "th" ? "ค่าปรับความล่าช้า" : "Delay penalty"}>
                {pick(tor.penalty, lang)}
              </Fact>
              <Fact label={lang === "th" ? "ประกาศเมื่อ" : "Posted"} mono>
                {formatDate(tor.postedAt, lang)}
              </Fact>
              <Fact label={lang === "th" ? "ที่มา" : "Source"} mono>
                {tor.source.portal}
              </Fact>
            </div>
          </Panel>

          <Panel className="p-4">
            <button
              type="button"
              onClick={() => setSaved(!saved)}
              className={saved ? `${btn.secondary} w-full` : `${btn.primary} w-full`}
              aria-pressed={saved}
            >
              {saved
                ? lang === "th"
                  ? "✓ บันทึกไว้ติดตามแล้ว"
                  : "✓ On your watchlist"
                : lang === "th"
                  ? "บันทึกไว้ติดตาม"
                  : "Save to watchlist"}
            </button>
            <p className="mt-2.5 text-[12px] leading-thai text-ink-3">
              {saved
                ? lang === "th"
                  ? "เราจะส่งอีเมลแจ้งคุณทันทีที่เอกสารนี้ถูกแก้ไข หรือเมื่อประกาศผู้ชนะ"
                  : "We will email you the moment this document is amended or awarded."
                : lang === "th"
                  ? "บันทึกไว้แล้วจะได้รับแจ้งเตือนเมื่อ TOR ถูกแก้ไข"
                  : "Saved projects alert you when the TOR changes."}
            </p>
          </Panel>

          <Panel className="p-4">
            <div className="flex items-center justify-between gap-2">
              <Label>{lang === "th" ? "ตรงกับโปรไฟล์คุณ" : "Match with you"}</Label>
              <MatchScore score={score} lang={lang} />
            </div>
            <ul className="mt-3 flex flex-col gap-2 border-t border-line pt-3 text-[12px] leading-thai text-ink-2">
              {factors.map((factor) => (
                <li key={factor.label.en} className="flex gap-2">
                  <span className={`font-mono ${factor.met ? "text-open" : "text-ink-3"}`}>
                    {factor.met ? "✓" : "✕"}
                  </span>
                  <span>{pick(factor.label, lang)}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/mockups/profile"
              className="mt-3 inline-block text-[12px] text-ink-2 underline underline-offset-2 hover:text-ink"
            >
              {lang === "th" ? "แก้ไขทักษะและเงื่อนไข" : "Edit your skills and limits"}
            </Link>
          </Panel>
        </aside>

        <div className="order-2 flex min-w-0 flex-col gap-5 lg:order-1">
          {tor.status === "closed" ? (
            <div className="rounded-[3px] border border-l-[3px] border-line border-l-closed bg-closed-bg px-4 py-3.5">
              <p className="text-[15px] leading-thai font-semibold text-ink">
                {lang === "th"
                  ? "โครงการนี้ปิดรับข้อเสนอแล้ว ไม่ต้องเสียเวลาอ่านต่อ"
                  : "This project is closed — you can stop reading here."}
              </p>
              <p className="mt-1 text-[13px] leading-thai text-ink-2">
                {lang === "th"
                  ? `ผู้ชนะคือ ${tor.awardedTo ? pick(tor.awardedTo, lang) : "-"} เสนอราคา ${
                      tor.awardedAmount ? formatTHB(tor.awardedAmount) : "-"
                    }`
                  : `Awarded to ${tor.awardedTo ? pick(tor.awardedTo, lang) : "-"} at ${
                      tor.awardedAmount ? formatTHB(tor.awardedAmount) : "-"
                    }.`}
              </p>
            </div>
          ) : null}

          {tor.status === "amended" && latestAmendment ? (
            <div className="rounded-[3px] border border-l-[3px] border-line border-l-amend bg-amend-bg px-4 py-3.5">
              <p className="text-[15px] leading-thai font-semibold text-amend">
                {lang === "th"
                  ? `เอกสารนี้ถูกแก้ไขเมื่อ ${formatDate(latestAmendment.date, lang)} หลังจากคุณอาจเคยอ่านฉบับเดิม`
                  : `This document changed on ${formatDate(latestAmendment.date, lang)} — after the version you may have read.`}
              </p>
              <p className="mt-1 text-[13px] leading-thai text-ink-2">
                {pick(latestAmendment.headline, lang)}{" "}
                <a href="#amendments" className="underline underline-offset-2 hover:text-ink">
                  {lang === "th" ? "ดูสิ่งที่เปลี่ยน" : "See exactly what changed"}
                </a>
              </p>
            </div>
          ) : null}

          {/* The normalized summary: one sheet, three sections, no boxes. */}
          <Panel className="px-4 py-5 sm:px-6 sm:py-6">
            <section>
              <SectionHeading
                sub={
                  lang === "th"
                    ? "สรุปจากเอกสารต้นฉบับ อ่านเท่านี้ก็ตัดสินใจได้"
                    : "Distilled from the source document — this is meant to be enough."
                }
              >
                {lang === "th" ? "งานนี้คืออะไร" : "What this project is"}
              </SectionHeading>
              <ul className="flex flex-col gap-2.5">
                {tor.summary.map((line) => (
                  <li key={line.th} className="flex gap-3 text-[15px] leading-thai text-ink">
                    <span className="mt-[10px] h-[3px] w-[3px] shrink-0 rounded-full bg-ink-3" />
                    <span>{pick(line, lang)}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="mt-9">
              <SectionHeading>
                {lang === "th" ? "สิ่งที่ต้องส่งมอบ" : "What you would deliver"}
              </SectionHeading>
              <ul className="flex flex-col gap-2">
                {tor.deliverables.map((line) => (
                  <li key={line.th} className="flex gap-3 text-[14px] leading-thai text-ink-2">
                    <span className="mt-[9px] h-[3px] w-[3px] shrink-0 rounded-full bg-ink-3" />
                    <span>{pick(line, lang)}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="mt-9">
              <SectionHeading
                sub={
                  lang === "th"
                    ? `ตรงกับทักษะที่คุณระบุไว้ ${matchedTech.length} จาก ${tor.techStack.length} รายการ`
                    : `${matchedTech.length} of ${tor.techStack.length} match the skills on your profile.`
                }
              >
                {lang === "th" ? "เทคโนโลยีที่ต้องใช้" : "Technologies required"}
              </SectionHeading>
              <div className="flex flex-wrap gap-1.5">
                {tor.techStack.map((term) => {
                  const known = profile.skills.includes(term);
                  return (
                    <Chip
                      key={term}
                      className={known ? "border-open-line bg-open-bg text-open" : ""}
                      title={
                        known
                          ? lang === "th"
                            ? "อยู่ในทักษะของคุณ"
                            : "On your skills list"
                          : undefined
                      }
                    >
                      {known ? <span className="mr-1">✓</span> : null}
                      {term}
                    </Chip>
                  );
                })}
              </div>
            </section>
          </Panel>

          <AccentPanel
            tone={RISK_TONE[tor.lockSpec.level]}
            className="px-4 py-5 sm:px-6 sm:py-6"
          >
            <LockSpecModule tor={tor} lang={lang} />
          </AccentPanel>

          <AccentPanel tone={PRICE_TONE[tor.price.verdict]} className="px-4 py-5 sm:px-6 sm:py-6">
            <PriceModule tor={tor} lang={lang} />
          </AccentPanel>

          <AccentPanel
            id="amendments"
            tone={tor.status === "amended" ? "amend" : "neutral"}
            className="scroll-mt-20 px-4 py-5 sm:px-6 sm:py-6"
          >
            <AmendmentModule tor={tor} lang={lang} />
          </AccentPanel>

          {/* Provenance is supporting material, so it gets no surface at all. */}
          <div className="mt-1 border-t border-line pt-5">
            <Eyebrow>{lang === "th" ? "ตรวจสอบย้อนกลับได้" : "Traceable"}</Eyebrow>
            <div className="mt-2">
              <SourceModule tor={tor} lang={lang} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <Link href="/mockups/catalog" className={btn.ghost}>
              ← {lang === "th" ? "กลับไปหน้าประกาศทั้งหมด" : "Back to browsing"}
            </Link>
            <span className="ml-auto">
              <Deadline deadline={tor.deadline} status={tor.status} lang={lang} />
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
