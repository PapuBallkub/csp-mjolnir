"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  formatTHB,
  formatTHBCompact,
  pick,
  priceDeltaPct,
  tors,
  type Tor,
} from "../../_data/tors";
import { useLang } from "../../_components/prefs";
import { AmendmentModule } from "../../_components/modules";
import { Panel, SectionHeading } from "../../_components/ui";
import { StatusBadge } from "../../_components/verdict";

/** Deviations inside this band are ordinary and are drawn in neutral grey. */
const NORMAL_BAND = 15;

/**
 * Deviation from the historical median, as a diverging bar around a zero line
 * (FR12 read from the investigative end rather than the bidder's).
 *
 * Direction carries the polarity — right of the line is over the median, left
 * is under — so the status hues only reinforce a distinction the geometry has
 * already made. That matters because amber and crimson are a weak pair under
 * deuteranopia, and here neither is doing the work alone.
 */
function DeviationChart({ rows, lang }: { rows: Tor[]; lang: "th" | "en" }) {
  const deltas = rows.map((tor) => priceDeltaPct(tor));
  const domain = Math.max(20, Math.ceil(Math.max(...deltas.map(Math.abs)) / 10) * 10);
  const halfWidth = (delta: number) => (Math.abs(delta) / domain) * 50;
  const bandHalf = (NORMAL_BAND / domain) * 50;

  return (
    <figure className="m-0 flex flex-col gap-1.5">
      {/* No row gap: the per-row band segments stack into one continuous zone. */}
      <div className="grid grid-cols-[minmax(0,1fr)] sm:grid-cols-[minmax(0,240px)_minmax(0,1fr)_54px]">
        <span className="hidden sm:block" />
        <div className="relative hidden h-4 sm:block">
          <span className="absolute left-0 font-mono tnum text-[10px] text-ink-3">−{domain}%</span>
          <span className="absolute left-1/2 -translate-x-1/2 font-mono text-[10px] text-ink-3">
            {lang === "th" ? "ค่ากลาง" : "median"}
          </span>
          <span className="absolute right-0 font-mono tnum text-[10px] text-ink-3">+{domain}%</span>
        </div>
        <span className="hidden sm:block" />

        {rows.map((tor) => {
          const delta = priceDeltaPct(tor);
          const inBand = Math.abs(delta) <= NORMAL_BAND;
          const fill = inBand ? "bg-ink-3" : delta > 0 ? "bg-amend" : "bg-risk";
          const valueTone = inBand ? "text-ink-3" : delta > 0 ? "text-amend" : "text-risk";

          return (
            <div key={tor.id} className="contents">
              <Link
                href={`/mockups/tor/${tor.id}`}
                className="min-w-0 truncate py-1 pr-3 text-[12px] text-ink-2 hover:text-ink hover:underline"
                title={pick(tor.title, lang)}
              >
                <span className="font-mono tnum text-ink-3">{tor.id.slice(-4)}</span>{" "}
                {pick(tor.title, lang)}
              </Link>

              <div className="relative h-7">
                {/* What "ordinary" looks like, drawn rather than described. */}
                <span
                  className="absolute inset-y-0 bg-surface-2"
                  style={{ left: `${50 - bandHalf}%`, width: `${bandHalf * 2}%` }}
                />
                <span className="absolute inset-y-0 left-1/2 w-px bg-line-2" />
                <span
                  className={`absolute top-1/2 h-[10px] -translate-y-1/2 ${fill} ${
                    delta >= 0 ? "rounded-r-[3px]" : "rounded-l-[3px]"
                  }`}
                  style={
                    delta >= 0
                      ? { left: "50%", width: `${halfWidth(delta)}%` }
                      : { right: "50%", width: `${halfWidth(delta)}%` }
                  }
                  title={`${formatTHB(tor.budget)} ${lang === "th" ? "เทียบค่ากลาง" : "vs median"} ${formatTHB(
                    tor.price.median,
                  )}`}
                />
              </div>

              <span
                className={`self-center py-1 text-right font-mono tnum text-[12px] font-medium ${valueTone}`}
              >
                {delta >= 0 ? "+" : ""}
                {delta}%
              </span>
            </div>
          );
        })}
      </div>

      <figcaption className="text-[11px] leading-thai text-ink-3">
        {lang === "th"
          ? `แถบเทาตรงกลางคือช่วง ±${NORMAL_BAND}% ซึ่งถือว่าปกติ ค่ากลางคำนวณจากโครงการที่มีขอบเขตใกล้เคียงกันย้อนหลัง 3 ปีงบประมาณ`
          : `The grey band is ±${NORMAL_BAND}%, which counts as ordinary. Medians are computed from comparable scopes over the last three fiscal years.`}
      </figcaption>
    </figure>
  );
}

export default function WatchdogPage() {
  const { lang } = useLang();

  const byDeviation = useMemo(
    () => [...tors].sort((a, b) => priceDeltaPct(b) - priceDeltaPct(a)),
    [],
  );
  const amended = useMemo(
    () => tors.filter((tor) => tor.amendments.some((a) => a.changes.length > 0)),
    [],
  );
  const awarded = useMemo(() => tors.filter((tor) => tor.awardedAmount), []);

  const [selected, setSelected] = useState(amended[0]?.id ?? "");
  const selectedTor = amended.find((tor) => tor.id === selected) ?? amended[0];

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-6">
      <header className="mb-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
          {lang === "th" ? "มุมมองสำหรับผู้ตรวจสอบ" : "Watchdog view"}
        </p>
        <h1 className="mt-1 text-[26px] leading-tight font-semibold tracking-tight text-ink">
          {lang === "th" ? "ราคาและการแก้ไขเอกสาร" : "Prices and document changes"}
        </h1>
        <p className="mt-1 max-w-2xl text-[14px] leading-thai text-ink-2">
          {lang === "th"
            ? "ตัวเลขทุกตัวในหน้านี้อ้างอิงกลับไปยังเอกสารต้นฉบับได้ หน้านี้ไม่สรุปว่าใครผิด แต่แสดงว่าอะไรผิดปกติเมื่อเทียบกับงานลักษณะเดียวกัน"
            : "Every figure here traces back to a source document. This page does not allege wrongdoing; it shows what is unusual relative to comparable work."}
        </p>
      </header>

      <section className="mb-8">
        <SectionHeading
          right={
            <span className="font-mono text-[11px]">
              {lang === "th" ? `${tors.length} โครงการ` : `${tors.length} projects`}
            </span>
          }
        >
          {lang === "th" ? "ส่วนต่างจากค่ากลางย้อนหลัง" : "Deviation from historical median"}
        </SectionHeading>
        <Panel className="p-3.5">
          <DeviationChart rows={byDeviation} lang={lang} />
        </Panel>
      </section>

      <section className="mb-8">
        <SectionHeading
          right={
            <span className="font-mono text-[11px]">
              {lang === "th"
                ? `${amended.length} ฉบับมีการแก้ไข`
                : `${amended.length} documents changed`}
            </span>
          }
        >
          {lang === "th" ? "ตัวเปรียบเทียบฉบับแก้ไข" : "Amendment diff viewer"}
        </SectionHeading>

        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <Panel className="overflow-hidden">
            {amended.map((tor) => {
              const active = tor.id === selectedTor?.id;
              return (
                <button
                  key={tor.id}
                  type="button"
                  onClick={() => setSelected(tor.id)}
                  className={`flex w-full flex-col items-start gap-1.5 border-b border-line px-3 py-2.5 text-left transition-colors last:border-b-0 ${
                    active ? "bg-surface-3" : "hover:bg-surface-2"
                  }`}
                >
                  <span className="font-mono tnum text-[10px] text-ink-3">{tor.id}</span>
                  <span className="text-[13px] leading-thai text-ink">{pick(tor.title, lang)}</span>
                  <StatusBadge status={tor.status} lang={lang} />
                </button>
              );
            })}
          </Panel>

          <Panel className="p-3.5">
            {selectedTor ? (
              <>
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-3">
                  <Link
                    href={`/mockups/tor/${selectedTor.id}`}
                    className="text-[15px] leading-thai font-medium text-ink hover:underline"
                  >
                    {pick(selectedTor.title, lang)}
                  </Link>
                  <span className="font-mono tnum text-[11px] text-ink-3">
                    {formatTHB(selectedTor.budget)}
                  </span>
                </div>
                <AmendmentModule tor={selectedTor} lang={lang} />
              </>
            ) : null}
          </Panel>
        </div>
      </section>

      <section>
        <SectionHeading>
          {lang === "th" ? "ผลการประมูลที่ปิดแล้ว" : "Closed awards"}
        </SectionHeading>
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="border-b border-line bg-surface-2">
                {[
                  lang === "th" ? "โครงการ" : "Project",
                  lang === "th" ? "ผู้ชนะ" : "Winner",
                  lang === "th" ? "ราคากลาง" : "Reference",
                  lang === "th" ? "ราคาที่ชนะ" : "Awarded",
                  lang === "th" ? "คิดเป็น" : "Ratio",
                ].map((heading, index) => (
                  <th
                    key={heading}
                    className={`px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-ink-3 ${
                      index >= 2 ? "text-right" : ""
                    }`}
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {awarded.map((tor) => {
                const ratio = ((tor.awardedAmount! / tor.budget) * 100).toFixed(1);
                // A winning bid this close to the ceiling is the classic single-
                // bidder signature, so it gets the amber "look closer" treatment.
                const tight = Number(ratio) >= 98;
                return (
                  <tr key={tor.id} className="border-b border-line last:border-b-0">
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/mockups/tor/${tor.id}`}
                        className="text-[13px] leading-thai text-ink hover:underline"
                      >
                        {pick(tor.title, lang)}
                      </Link>
                      <span className="mt-0.5 block font-mono tnum text-[10px] text-ink-3">
                        {tor.id} · {pick(tor.agency, lang)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-[12px] leading-thai text-ink-2">
                      {tor.awardedTo ? pick(tor.awardedTo, lang) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tnum text-[12px] text-ink-2">
                      {formatTHBCompact(tor.budget)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tnum text-[12px] text-ink">
                      {formatTHBCompact(tor.awardedAmount!)}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right font-mono tnum text-[12px] font-medium ${
                        tight ? "text-amend" : "text-ink-2"
                      }`}
                    >
                      {ratio}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
        <p className="mt-3 text-[11px] leading-thai text-ink-3">
          {lang === "th"
            ? "ราคาที่ชนะซึ่งเข้าใกล้ราคากลางมาก มักพบในงานที่มีผู้เสนอราคารายเดียว ตัวเลขนี้เป็นข้อสังเกต ไม่ใช่ข้อกล่าวหา"
            : "Winning bids that sit within a couple of percent of the ceiling are typical of single-bidder rounds. This is an observation, not an accusation."}
        </p>
      </section>
    </div>
  );
}
