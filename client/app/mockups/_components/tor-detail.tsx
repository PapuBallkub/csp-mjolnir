"use client";

import Link from "next/link";
import { useState } from "react";
import {
  demoProfile,
  formatDate,
  formatTHB,
  pick,
  type Tor,
} from "../_data/tors";
import { useLang } from "./prefs";
import { Deadline, deadlineText } from "./deadline";
import { AmendmentModule, LockSpecModule, PriceModule, SourceModule } from "./modules";
import { MatchScore, ScopeBadge, SmeBadge, VerdictStrip } from "./verdict";
import { btn, Chip, Fact, Label, Panel, SectionLabel } from "./ui";

/**
 * The "never open the PDF" screen, and the one that gets the most design
 * effort. It can afford more air than the catalog because this is a considered
 * read — but the three risk modules stay inline in the main column rather than
 * behind tabs, since burying them would reproduce exactly the problem the
 * product exists to fix.
 */
export function TorDetail({ tor }: { tor: Tor }) {
  const { lang } = useLang();
  const [saved, setSaved] = useState(demoProfile.watchlist.includes(tor.id));

  const secondaryTitle = lang === "th" ? tor.title.en : tor.title.th;
  const latestAmendment = tor.amendments.find((a) => a.changes.length > 0);

  const matchedSkills = tor.techStack.filter((t) => demoProfile.skills.includes(t));
  const budgetInRange =
    tor.budget >= demoProfile.budgetMin && tor.budget <= demoProfile.budgetMax;
  const scopeFits = demoProfile.scopeSizes.includes(tor.scopeSize);

  return (
    <article>
      <header className="relative border-b border-line bg-surface">
        <div className="scanlines pointer-events-none absolute inset-0 opacity-50" aria-hidden />

        <div className="relative mx-auto flex max-w-[1240px] flex-col gap-4 px-4 py-6">
          <nav className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-ink-3">
            <Link href="/mockups/catalog" className="hover:text-ink hover:underline">
              {lang === "th" ? "ประกาศทั้งหมด" : "Catalog"}
            </Link>
            <span>/</span>
            <span className="tnum text-ink-2">{tor.id}</span>
            <span className="h-3 w-px bg-line" />
            <span>e-GP {tor.egpRef}</span>
          </nav>

          <div className="flex flex-col gap-2">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-2">
              <span>{pick(tor.agency, lang)}</span>
              {tor.unit ? (
                <>
                  <span className="h-3 w-px bg-line" />
                  <span className="text-ink-3">{pick(tor.unit, lang)}</span>
                </>
              ) : null}
            </p>

            <h1 className="max-w-4xl text-[27px] leading-thai font-semibold tracking-tight text-ink">
              {pick(tor.title, lang)}
            </h1>
            {/* Both languages, always — the source is Thai and the gloss is ours. */}
            <p className="max-w-4xl text-[14px] leading-thai text-ink-3">{secondaryTitle}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ScopeBadge size={tor.scopeSize} lang={lang} />
            {tor.smeAdvantage ? <SmeBadge lang={lang} /> : null}
            {tor.techStack.map((term) => (
              <Chip key={term}>{term}</Chip>
            ))}
          </div>

          <VerdictStrip tor={tor} lang={lang} size="full" />
        </div>
      </header>

      <div className="mx-auto grid max-w-[1240px] gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_312px]">
        {/* Key facts lead on mobile, but the reading column leads on desktop. */}
        <aside className="order-1 flex flex-col gap-4 lg:order-2 lg:sticky lg:top-[70px] lg:self-start">
          <Panel className="p-3.5">
            <Label>{lang === "th" ? "ราคากลาง" : "Reference price"}</Label>
            <p className="mt-1 font-mono tnum text-[28px] leading-none font-medium text-ink">
              {formatTHB(tor.budget)}
            </p>

            <div className="mt-3 flex flex-col">
              <Fact label={lang === "th" ? "กำหนดยื่นข้อเสนอ" : "Submission deadline"}>
                <span className="flex flex-col items-end">
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

          <Panel className="flex flex-col gap-2.5 p-3.5">
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
            <p className="text-[12px] leading-thai text-ink-3">
              {saved
                ? lang === "th"
                  ? "เราจะส่งอีเมลแจ้งคุณทันทีที่เอกสารนี้ถูกแก้ไข หรือเมื่อประกาศผู้ชนะ"
                  : "We will email you the moment this document is amended or awarded."
                : lang === "th"
                  ? "บันทึกไว้แล้วจะได้รับแจ้งเตือนเมื่อ TOR ถูกแก้ไข"
                  : "Saved projects alert you when the TOR changes."}
            </p>
          </Panel>

          <Panel className="flex flex-col gap-2.5 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <Label>{lang === "th" ? "ตรงกับโปรไฟล์คุณ" : "Match with you"}</Label>
              <MatchScore score={tor.matchScore} lang={lang} />
            </div>
            <ul className="flex flex-col gap-1.5 text-[12px] leading-thai text-ink-2">
              <li className="flex gap-2">
                <span className="font-mono text-ink-3">
                  {matchedSkills.length > 0 ? "✓" : "✕"}
                </span>
                <span>
                  {lang === "th"
                    ? `ทักษะตรง ${matchedSkills.length} จาก ${tor.techStack.length} รายการ`
                    : `${matchedSkills.length} of ${tor.techStack.length} technologies match your skills`}
                </span>
              </li>
              <li className="flex gap-2">
                <span className="font-mono text-ink-3">{budgetInRange ? "✓" : "✕"}</span>
                <span>
                  {budgetInRange
                    ? lang === "th"
                      ? "งบอยู่ในช่วงที่คุณรับงาน"
                      : "Budget sits inside your stated range"
                    : lang === "th"
                      ? "งบสูงกว่าช่วงที่คุณตั้งไว้"
                      : "Budget is outside your stated range"}
                </span>
              </li>
              <li className="flex gap-2">
                <span className="font-mono text-ink-3">{scopeFits ? "✓" : "✕"}</span>
                <span>
                  {scopeFits
                    ? lang === "th"
                      ? "ขนาดงานอยู่ในกำลังของคุณ"
                      : "Scope is within your team size"
                    : lang === "th"
                      ? "ขนาดงานใหญ่เกินกำลังทีมเดี่ยว"
                      : "Scope needs a bigger team than yours"}
                </span>
              </li>
            </ul>
            <Link
              href="/mockups/matchmaker"
              className="text-[12px] text-ink-2 underline underline-offset-2 hover:text-ink"
            >
              {lang === "th" ? "แก้ไขโปรไฟล์และทักษะ" : "Edit your skills profile"}
            </Link>
          </Panel>
        </aside>

        <div className="order-2 flex min-w-0 flex-col gap-8 lg:order-1">
          {tor.status === "closed" ? (
            <div className="rounded-[3px] border border-closed-line bg-closed-bg px-3.5 py-3">
              <p className="text-[14px] leading-thai font-medium text-ink">
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
            <div className="rounded-[3px] border border-amend-line bg-amend-bg px-3.5 py-3">
              <p className="text-[14px] leading-thai font-medium text-amend">
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

          <section className="flex flex-col gap-3">
            <SectionLabel>{lang === "th" ? "งานนี้คืออะไร" : "What this project is"}</SectionLabel>
            <ul className="flex flex-col gap-2">
              {tor.summary.map((line) => (
                <li key={line.th} className="flex gap-2.5 text-[15px] leading-thai text-ink">
                  <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-ink-3" />
                  <span>{pick(line, lang)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="flex flex-col gap-3">
            <SectionLabel>
              {lang === "th" ? "สิ่งที่ต้องส่งมอบ" : "What you would deliver"}
            </SectionLabel>
            <ul className="flex flex-col gap-2">
              {tor.deliverables.map((line) => (
                <li key={line.th} className="flex gap-2.5 text-[14px] leading-thai text-ink-2">
                  <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-ink-3" />
                  <span>{pick(line, lang)}</span>
                </li>
              ))}
            </ul>
          </section>

          <LockSpecModule tor={tor} lang={lang} />
          <PriceModule tor={tor} lang={lang} />
          <div id="amendments" className="scroll-mt-20">
            <AmendmentModule tor={tor} lang={lang} />
          </div>
          <SourceModule tor={tor} lang={lang} />

          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <Link href="/mockups/catalog" className={btn.ghost}>
              ← {lang === "th" ? "กลับไปหน้าประกาศทั้งหมด" : "Back to the catalog"}
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
