"use client";

import { formatTHB, formatTHBCompact, pick, type Lang, type Tor } from "../_data/tors";

/**
 * Price reality check (FR12), drawn as an emphasis plot rather than a
 * categorical one: the comparable projects are context in grey, and the single
 * mark that matters — this project's ราคากลาง — is the only coloured thing on
 * the axis. The median rides its own dashed reference line.
 *
 * Colour is never the sole carrier: this project is a diamond, comparables are
 * circles, and both permanent labels are direct-written on the plot, so the
 * chart survives greyscale printing and colour-blind reading.
 */

const VERDICT_MARK: Record<Tor["price"]["verdict"], string> = {
  fair: "bg-open",
  over: "bg-amend",
  under: "bg-risk",
};
const VERDICT_TEXT: Record<Tor["price"]["verdict"], string> = {
  fair: "text-open",
  over: "text-amend",
  under: "text-risk",
};

/** Keeps a direct label from running off either end of the plot. */
function anchor(pct: number): string {
  if (pct < 12) return "translate-x-0";
  if (pct > 88) return "-translate-x-full";
  return "-translate-x-1/2";
}

export function PriceScale({ tor, lang }: { tor: Tor; lang: Lang }) {
  const { median, comparables, verdict } = tor.price;
  const values = [...comparables.map((c) => c.budget), tor.budget, median];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = (hi - lo) * 0.16 || hi * 0.1;
  const min = lo - pad;
  const max = hi + pad;
  const pos = (value: number) => ((value - min) / (max - min)) * 100;

  const projectPos = pos(tor.budget);
  const medianPos = pos(median);

  return (
    <figure className="m-0">
      <div className="relative h-[128px] px-1">
        {/* This project — the point of the chart, so it is labelled above. */}
        <div
          className={`absolute top-0 flex flex-col items-start gap-1 ${anchor(projectPos)}`}
          style={{ left: `${projectPos}%` }}
        >
          <span className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
            {lang === "th" ? "โครงการนี้" : "This project"}
          </span>
          <span
            className={`whitespace-nowrap font-mono tnum text-[15px] font-semibold ${VERDICT_TEXT[verdict]}`}
          >
            {formatTHBCompact(tor.budget)}
          </span>
        </div>

        {/* Axis */}
        <div className="absolute inset-x-1 top-[62px] h-px bg-line-2" />

        {/* Median reference line */}
        <div
          className="absolute top-[46px] h-[32px] border-l border-dashed border-ink-3"
          style={{ left: `${medianPos}%` }}
        />

        {/* Comparable projects — context, in grey, tooltip on hover or focus. */}
        {comparables.map((comparable) => (
          <div
            key={comparable.id}
            tabIndex={0}
            className="group absolute top-[62px] -translate-x-1/2 -translate-y-1/2 rounded-full outline-none"
            style={{ left: `${pos(comparable.budget)}%` }}
          >
            <span className="block h-[10px] w-[10px] rounded-full bg-ink-3 ring-2 ring-surface transition-colors group-hover:bg-ink group-focus:bg-ink" />
            <span className="pointer-events-none absolute bottom-[18px] left-1/2 z-20 hidden w-max max-w-[240px] -translate-x-1/2 rounded-[3px] border border-line-2 bg-surface px-2 py-1.5 text-left shadow-sm group-hover:block group-focus:block">
              <span className="block text-[12px] leading-snug text-ink">
                {pick(comparable.title, lang)}
              </span>
              <span className="mt-0.5 block font-mono tnum text-[11px] text-ink-2">
                {formatTHB(comparable.budget)} · {comparable.year}
              </span>
              <span className="block text-[11px] text-ink-3">{pick(comparable.agency, lang)}</span>
            </span>
          </div>
        ))}

        {/* This project's mark: a diamond, so shape carries it too. */}
        <div
          className="absolute top-[62px] -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${projectPos}%` }}
          title={formatTHB(tor.budget)}
        >
          <span
            className={`block h-[13px] w-[13px] rotate-45 ring-2 ring-surface ${VERDICT_MARK[verdict]}`}
          />
        </div>

        {/* Median — labelled below, so it can never collide with the label above. */}
        <div
          className={`absolute top-[82px] flex flex-col gap-0.5 ${anchor(medianPos)}`}
          style={{ left: `${medianPos}%` }}
        >
          <span className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
            {lang === "th" ? "ค่ากลาง" : "Median"}
          </span>
          <span className="whitespace-nowrap font-mono tnum text-[13px] font-medium text-ink-2">
            {formatTHBCompact(median)}
          </span>
        </div>

        {/* Anchored to the real extremes, not the padded ends of the track. */}
        {[lo, hi].map((value) => (
          <span
            key={value}
            className={`absolute top-[112px] font-mono tnum text-[10px] text-ink-3 ${anchor(
              pos(value),
            )}`}
            style={{ left: `${pos(value)}%` }}
          >
            {formatTHBCompact(value)}
          </span>
        ))}
      </div>

      <figcaption className="mt-1 text-[11px] leading-thai text-ink-3">
        {lang === "th"
          ? `จุดสีเทาคือโครงการที่เทียบเคียงได้ ${tor.price.sampleSize} โครงการ ย้อนหลัง 3 ปีงบประมาณ`
          : `Grey dots are the ${tor.price.sampleSize} comparable projects from the last three fiscal years.`}
      </figcaption>
    </figure>
  );
}
