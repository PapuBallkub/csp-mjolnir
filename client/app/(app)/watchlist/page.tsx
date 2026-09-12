"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { daysUntil, formatDate, pick, tors, type Tor } from "../../_data/tors";
import { useLang, useProfile } from "../../_components/prefs";
import { TorRow } from "../../_components/tor-row";
import { btn, EmptyState, Panel, SectionHeading } from "../../_components/ui";

type Alert = {
  tor: Tor;
  kind: "amended" | "closing" | "closed";
  date: string;
  text: { th: string; en: string };
};

/** Tone follows the same rule as everywhere else: amber = look, grey = dead. */
const ALERT_TONE: Record<Alert["kind"], string> = {
  amended: "border-amend-line bg-amend-bg text-amend",
  closing: "border-amend-line bg-amend-bg text-amend",
  closed: "border-closed-line bg-closed-bg text-ink-2",
};

export default function WatchlistPage() {
  const { lang } = useLang();
  const { profile } = useProfile();
  const [saved, setSaved] = useState<string[]>(profile.watchlist);
  const [dismissed, setDismissed] = useState<string[]>([]);

  const savedTors = useMemo(() => tors.filter((t) => saved.includes(t.id)), [saved]);

  const alerts = useMemo(() => {
    const list: Alert[] = [];
    for (const tor of savedTors) {
      const amendment = tor.amendments.find((a) => a.changes.length > 0);
      if (tor.status === "amended" && amendment) {
        list.push({
          tor,
          kind: "amended",
          date: amendment.date,
          text: amendment.headline,
        });
      }
      if (tor.status === "closed") {
        list.push({
          tor,
          kind: "closed",
          date: tor.amendments[0].date,
          text: {
            th: `ปิดรับข้อเสนอแล้ว ผู้ชนะคือ ${tor.awardedTo ? tor.awardedTo.th : "-"}`,
            en: `Closed. Awarded to ${tor.awardedTo ? tor.awardedTo.en : "-"}.`,
          },
        });
      }
      const left = daysUntil(tor.deadline);
      if (tor.status !== "closed" && left >= 0 && left <= 7) {
        list.push({
          tor,
          kind: "closing",
          date: tor.deadline,
          text: {
            th: `เหลืออีก ${left} วันก่อนปิดรับข้อเสนอ`,
            en: `${left} days left before submissions close.`,
          },
        });
      }
    }
    return list
      .filter((alert) => !dismissed.includes(`${alert.tor.id}-${alert.kind}`))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [savedTors, dismissed]);

  return (
    <div className="mx-auto max-w-[1000px] px-4 py-6">
      <header className="mb-5">
        <h1 className="text-[26px] leading-tight font-semibold tracking-tight text-ink">
          {lang === "th" ? "รายการที่ติดตาม" : "Your watchlist"}
        </h1>
        <p className="mt-1 max-w-2xl text-[14px] leading-thai text-ink-2">
          {lang === "th"
            ? "เราเทียบไฟล์ต้นฉบับของทุกโครงการที่คุณบันทึกไว้ทุกเช้า ถ้าเอกสารถูกแก้ไขหรือสถานะเปลี่ยน คุณจะเห็นที่นี่ก่อน"
            : "We re-read the source file of every saved project each morning. If a document changes or a status moves, it shows up here first."}
        </p>
      </header>

      {alerts.length > 0 ? (
        <section className="mb-8">
          <SectionHeading
            sub={
              lang === "th"
                ? "รวมทั้งการแก้ไขเอกสาร การปิดรับ และกำหนดยื่นที่ใกล้เข้ามา"
                : "Amendments, closures and deadlines closing in."
            }
            right={
              <span className="font-mono text-[11px] text-ink-3">
                {lang === "th" ? `${alerts.length} รายการใหม่` : `${alerts.length} new`}
              </span>
            }
          >
            {lang === "th" ? "เปลี่ยนแปลงตั้งแต่ครั้งที่แล้ว" : "Changed since you last looked"}
          </SectionHeading>

          <ul className="flex flex-col gap-2">
            {alerts.map((alert) => (
              <li
                key={`${alert.tor.id}-${alert.kind}`}
                className={`flex flex-wrap items-start gap-x-3 gap-y-2 rounded-[3px] border px-3.5 py-3 ${ALERT_TONE[alert.kind]}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-2 font-mono text-[11px] opacity-80">
                    <span className="tnum">{alert.tor.id}</span>
                    <span className="tnum">{formatDate(alert.date, lang)}</span>
                  </p>
                  <p className="mt-1 text-[14px] leading-thai font-medium">
                    {pick(alert.text, lang)}
                  </p>
                  <Link
                    href={`/tor/${alert.tor.id}`}
                    className="mt-1 inline-block text-[13px] leading-thai text-ink-2 underline underline-offset-2 hover:text-ink"
                  >
                    {pick(alert.tor.title, lang)}
                  </Link>
                </div>
                <button
                  type="button"
                  onClick={() => setDismissed([...dismissed, `${alert.tor.id}-${alert.kind}`])}
                  className="shrink-0 font-mono text-[11px] text-ink-3 underline underline-offset-2 hover:text-ink"
                >
                  {lang === "th" ? "รับทราบ" : "Got it"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <SectionHeading
        right={
          <span className="font-mono text-[11px] text-ink-3">
            {savedTors.length} {lang === "th" ? "โครงการ" : "saved"}
          </span>
        }
      >
        {lang === "th" ? "โครงการที่บันทึกไว้" : "Saved projects"}
      </SectionHeading>

      <div>
        {savedTors.length === 0 ? (
          <EmptyState
            headline={
              lang === "th" ? "ยังไม่ได้บันทึกโครงการไว้" : "You have not saved anything yet"
            }
            body={
              lang === "th"
                ? "กดบันทึกจากหน้ารายละเอียดโครงการ แล้วเราจะคอยดูไฟล์ต้นฉบับให้ทุกวัน และแจ้งทันทีที่ TOR ถูกแก้ไข ปิดรับ หรือประกาศผู้ชนะ"
                : "Save a project from its detail page and we will watch the source file daily, then tell you the moment the TOR is amended, closed or awarded."
            }
            action={
              <Link href="/catalog" className={btn.secondary}>
                {lang === "th" ? "ไปดูประกาศทั้งหมด" : "Browse the catalog"}
              </Link>
            }
          />
        ) : (
          <Panel className="overflow-hidden">
            {savedTors.map((tor) => (
              <TorRow
                key={tor.id}
                tor={tor}
                trailing={
                  <button
                    type="button"
                    onClick={() => setSaved(saved.filter((id) => id !== tor.id))}
                    className="font-mono text-[11px] text-ink-3 underline underline-offset-2 hover:text-ink"
                  >
                    {lang === "th" ? "เอาออก" : "Remove"}
                  </button>
                }
              />
            ))}
          </Panel>
        )}
      </div>
    </div>
  );
}
