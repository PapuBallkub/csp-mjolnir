"use client";

import {
  formatDate,
  pick,
  TODAY,
  type Lang,
  type Tor,
} from "../_data/tors";
import { SectionHeading } from "./ui";

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
                          <span className="rounded-[2px] border border-amend-line bg-amend-bg px-1.5 py-[2px] text-[11px] font-medium text-amend">
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
