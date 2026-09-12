"use client";

import Link from "next/link";
import {
  formatDate,
  formatTHB,
  pick,
  priceDeltaPct,
  TODAY,
  type Lang,
  type RiskLevel,
  type Tor,
} from "../_data/tors";
import { PriceScale } from "./price-scale";
import { PriceBadge, RiskMeter } from "./verdict";
import { btn, Label, SectionHeading, Well } from "./ui";

/**
 * The three risk modules. Each is a self-contained block that states its
 * verdict first and its evidence second (copy §7), and each is wrapped by its
 * caller in a panel wearing its own verdict hue — which is what makes the
 * verdict layer legible as one system rather than three unrelated widgets.
 *
 * Inside a module the rank is: heading → verdict sentence → findings. A
 * finding leads with a number and a category tag so the whole module can be
 * skimmed by title alone before anyone reads a single quoted clause.
 */

const RISK_CHIP: Record<RiskLevel, string> = {
  low: "border-open-line bg-open-bg text-open",
  medium: "border-amend-line bg-amend-bg text-amend",
  high: "border-risk-line bg-risk-bg text-risk",
};

const RISK_HEADLINE: Record<RiskLevel, { th: string; en: string }> = {
  low: {
    th: "ไม่พบข้อกำหนดที่ผิดปกติ งานนี้เปิดกว้างพอสำหรับผู้เสนอราคารายใหม่",
    en: "Nothing here looks unusual — a first-time bidder has a real chance.",
  },
  medium: {
    th: "มีข้อกำหนดบางข้อที่แคบกว่างานลักษณะเดียวกัน ควรอ่านก่อนตัดสินใจลงแรง",
    en: "A few requirements are narrower than comparable projects — read these before you invest time.",
  },
  high: {
    th: "งานนี้มีสัญญาณว่าเขียนมาเพื่อผู้ขายรายใดรายหนึ่ง โอกาสของผู้เสนอราคารายใหม่ต่ำ",
    en: "This reads as written for one specific vendor. A new bidder's odds here are low.",
  },
};

export function LockSpecModule({ tor, lang }: { tor: Tor; lang: Lang }) {
  const { level, score, reasons } = tor.lockSpec;

  return (
    <>
      <SectionHeading
        sub={
          lang === "th"
            ? `เทียบกับ TOR ลักษณะเดียวกัน ${tor.price.sampleSize} ฉบับ ย้อนหลัง 3 ปีงบประมาณ`
            : `Measured against ${tor.price.sampleSize} similar TORs from the last three fiscal years.`
        }
        right={
          <span className="flex items-center gap-2">
            <RiskMeter level={level} />
            <span className="font-mono tnum text-[13px] font-medium text-ink">
              {score}
              <span className="text-ink-3">/100</span>
            </span>
          </span>
        }
      >
        {lang === "th" ? "ความเสี่ยงล็อกสเปก" : "Lock-spec risk"}
      </SectionHeading>

      <p className="text-[16px] leading-thai font-medium text-ink">
        {pick(RISK_HEADLINE[level], lang)}
      </p>

      <ol className="mt-5 divide-y divide-line border-t border-line">
        {reasons.map((reason, index) => (
          <li key={reason.source} className="py-5 last:pb-0">
            {/* Tier one: everything needed to skim, before any evidence. */}
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <span className="font-mono tnum text-[11px] text-ink-3">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span
                className={`rounded-[2px] border px-1.5 py-[2px] text-[11px] font-medium ${RISK_CHIP[level]}`}
              >
                {pick(reason.tag, lang)}
              </span>
            </div>
            <h3 className="mt-2 text-[15px] leading-thai font-semibold text-ink">
              {pick(reason.verdict, lang)}
            </h3>

            {/* Tier two: the clause itself, in the source language — it is
                evidence, not copy, so it is never translated away. */}
            <Well className="mt-3 border-l-2 border-l-line-2 px-3 py-2.5">
              <p className="text-[13px] leading-thai text-ink-2">“{reason.clauseTh}”</p>
              <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
                {reason.source}
              </p>
            </Well>

            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 sm:flex-nowrap">
              <span className="shrink-0 pt-[3px]">
                <Label>{lang === "th" ? "ปกติแล้ว" : "Normally"}</Label>
              </span>
              <p className="text-[13px] leading-thai text-ink-2">{pick(reason.baseline, lang)}</p>
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}

export function PriceModule({ tor, lang }: { tor: Tor; lang: Lang }) {
  const delta = priceDeltaPct(tor);

  return (
    <>
      <SectionHeading
        sub={
          lang === "th"
            ? `ราคากลางที่ประกาศ ${formatTHB(tor.budget)}`
            : `Reference price as posted: ${formatTHB(tor.budget)}`
        }
        right={<PriceBadge tor={tor} lang={lang} />}
      >
        {lang === "th" ? "ตรวจสอบราคากลาง" : "Price reality check"}
      </SectionHeading>

      <p className="text-[16px] leading-thai font-medium text-ink">{pick(tor.price.note, lang)}</p>

      <Well className="mt-4 px-3 pt-3 pb-2">
        <PriceScale tor={tor} lang={lang} />
      </Well>

      <div className="mt-6">
        <h3 className="mb-1 text-[13px] font-semibold text-ink">
          {lang === "th" ? "โครงการที่ใช้เทียบ" : "The projects it was measured against"}
        </h3>
        <div className="overflow-x-auto">
          {/* Narrow enough to avoid a sideways scroll on a phone, where the
              price column would otherwise be the part that gets clipped. */}
          <table className="w-full min-w-[320px] border-collapse text-left">
            <thead>
              <tr className="border-b border-line">
                {[
                  lang === "th" ? "โครงการ" : "Project",
                  lang === "th" ? "ปี" : "Year",
                  lang === "th" ? "ราคากลาง" : "Reference price",
                ].map((heading, index) => (
                  <th
                    key={heading}
                    className={`py-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-ink-3 ${
                      index > 0 ? "text-right" : ""
                    }`}
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tor.price.comparables.map((comparable) => (
                <tr key={comparable.id} className="border-b border-line">
                  <td className="py-2 pr-3">
                    <span className="block text-[13px] leading-thai text-ink">
                      {pick(comparable.title, lang)}
                    </span>
                    <span className="block text-[11px] text-ink-3">
                      {pick(comparable.agency, lang)}
                      {comparable.note ? ` · ${pick(comparable.note, lang)}` : ""}
                    </span>
                  </td>
                  <td className="py-2 text-right align-top font-mono tnum text-[12px] text-ink-2">
                    {comparable.year}
                  </td>
                  <td className="py-2 text-right align-top font-mono tnum text-[13px] text-ink">
                    {formatTHB(comparable.budget)}
                  </td>
                </tr>
              ))}
              <tr className="bg-surface-2">
                <td className="py-2.5 pr-3 pl-2 text-[13px] font-semibold text-ink">
                  {lang === "th" ? "โครงการนี้" : "This project"}
                </td>
                <td className="py-2.5 text-right font-mono tnum text-[12px] text-ink-2">2026</td>
                <td className="py-2.5 pr-2 text-right font-mono tnum text-[13px] font-semibold text-ink">
                  {formatTHB(tor.budget)}
                  <span className="ml-1.5 font-normal text-ink-3">
                    {delta >= 0 ? "+" : ""}
                    {delta}%
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {tor.awardedAmount ? (
        <p className="mt-4 text-[13px] leading-thai text-ink-2">
          {lang === "th"
            ? `ผู้ชนะเสนอราคาที่ ${formatTHB(tor.awardedAmount)} ต่ำกว่าราคากลาง ${(
                ((tor.budget - tor.awardedAmount) / tor.budget) *
                100
              ).toFixed(1)}%`
            : `Awarded at ${formatTHB(tor.awardedAmount)}, ${(
                ((tor.budget - tor.awardedAmount) / tor.budget) *
                100
              ).toFixed(1)}% under the reference price.`}
        </p>
      ) : null}
    </>
  );
}

const KIND_LABEL = {
  added: { th: "เพิ่ม", en: "Added" },
  removed: { th: "ตัดออก", en: "Removed" },
  changed: { th: "แก้ไข", en: "Changed" },
} as const;

export function AmendmentModule({ tor, lang }: { tor: Tor; lang: Lang }) {
  const amended = tor.amendments.filter((a) => a.changes.length > 0);

  return (
    <>
      <SectionHeading
        sub={
          lang === "th"
            ? `เทียบไฟล์ต้นฉบับทุกวัน ตรวจล่าสุด ${formatDate(TODAY, lang)}`
            : `The source file is re-hashed daily. Last checked ${formatDate(TODAY, lang)}.`
        }
      >
        {lang === "th" ? "ประวัติการแก้ไข" : "Amendment history"}
      </SectionHeading>

      {amended.length === 0 ? (
        <p className="text-[16px] leading-thai font-medium text-ink">
          {lang === "th"
            ? `ยังไม่มีการแก้ไขนับจากประกาศครั้งแรกเมื่อ ${formatDate(tor.postedAt, lang)}`
            : `Nothing has changed since it was first posted on ${formatDate(tor.postedAt, lang)}.`}
        </p>
      ) : null}

      <ol className="mt-4 flex flex-col">
        {tor.amendments.map((amendment, index) => {
          const last = index === tor.amendments.length - 1;
          const substantive = amendment.changes.length > 0;

          return (
            <li key={amendment.date} className="relative flex gap-3.5 pb-6 last:pb-0">
              <div className="flex flex-col items-center">
                <span
                  className={`mt-[5px] h-2.5 w-2.5 shrink-0 rounded-full ${
                    substantive ? "bg-amend" : "border border-line-2 bg-surface"
                  }`}
                />
                {!last ? <span className="mt-1.5 w-px flex-1 bg-line" /> : null}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                  <h3 className="text-[14px] font-semibold text-ink">
                    {pick(amendment.round, lang)}
                  </h3>
                  <span className="font-mono tnum text-[11px] text-ink-3">
                    {formatDate(amendment.date, lang)}
                  </span>
                </div>
                <p className="mt-1 text-[14px] leading-thai text-ink-2">
                  {pick(amendment.headline, lang)}
                </p>

                {substantive ? (
                  <ul className="mt-3 flex flex-col gap-2">
                    {amendment.changes.map((change) => (
                      <li
                        key={`${change.kind}-${change.field.th}`}
                        className="rounded-[3px] border border-line bg-surface-2 px-3 py-2.5"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-[2px] border border-amend-line bg-amend-bg px-1 py-[1px] font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-amend">
                            {pick(KIND_LABEL[change.kind], lang)}
                          </span>
                          <span className="text-[13px] font-medium text-ink">
                            {pick(change.field, lang)}
                          </span>
                        </div>

                        {change.before ? (
                          <p className="mt-2 flex gap-2 text-[13px] leading-thai text-ink-3">
                            <span className="shrink-0 font-mono">−</span>
                            <span>{change.before}</span>
                          </p>
                        ) : null}
                        {change.after ? (
                          <p className="mt-1 flex gap-2 border-l-2 border-amend pl-2 text-[13px] leading-thai text-ink">
                            <span className="shrink-0 font-mono">+</span>
                            <span>{change.after}</span>
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}

/**
 * Provenance. Extraction confidence itself is admin-only (§5), so applicants
 * get the honest consequence instead of the number: how the document was read,
 * whether a human has checked it, and a way to report what we got wrong.
 */
export function SourceModule({ tor, lang }: { tor: Tor; lang: Lang }) {
  const unreviewed = tor.confidence.extraction < 0.8;
  const formatLabel: Record<string, { th: string; en: string }> = {
    "scanned-pdf": { th: "ไฟล์ PDF สแกน", en: "scanned PDF" },
    image: { th: "ไฟล์ภาพ", en: "image file" },
    html: { th: "หน้าเว็บ", en: "web page" },
    json: { th: "ข้อมูลจาก e-GP API", en: "e-GP API record" },
  };

  return (
    <>
      <SectionHeading>{lang === "th" ? "ที่มาของข้อมูล" : "Where this came from"}</SectionHeading>

      <p className="text-[13px] leading-thai text-ink-2">
        {lang === "th"
          ? `ถอดความจาก${pick(formatLabel[tor.source.format], lang)} จำนวน ${tor.source.pages} หน้า จาก ${tor.source.portal} ดึงข้อมูลเมื่อ ${formatDate(tor.postedAt, lang)}`
          : `Read from a ${pick(formatLabel[tor.source.format], lang)} of ${tor.source.pages} pages on ${tor.source.portal}, ingested ${formatDate(tor.postedAt, lang)}.`}
      </p>

      {unreviewed ? (
        <p className="mt-3 rounded-[3px] border border-amend-line bg-amend-bg px-3 py-2.5 text-[13px] leading-thai text-amend">
          {lang === "th"
            ? "ต้นฉบับเป็นไฟล์สแกนคุณภาพต่ำ ตัวเลขงบประมาณและรายการเทคโนโลยียังไม่ผ่านการตรวจทานโดยเจ้าหน้าที่ ควรยืนยันกับไฟล์ต้นฉบับก่อนตัดสินใจ"
            : "The source scan is poor quality. The budget figure and tech stack have not been checked by a human yet — confirm against the original before you commit."}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <a href={tor.source.url} target="_blank" rel="noreferrer" className={btn.secondary}>
          {lang === "th" ? "เปิดไฟล์ต้นฉบับ" : "Open the original"}
          <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden="true">
            <path
              d="M4 2h6v6M10 2 2.5 9.5"
              stroke="currentColor"
              strokeWidth="1.4"
              fill="none"
              strokeLinecap="round"
            />
          </svg>
        </a>
        <Link href="/notifications" className={btn.ghost}>
          {lang === "th" ? "แจ้งข้อมูลผิดพลาด" : "Report an error"}
        </Link>
      </div>
    </>
  );
}
