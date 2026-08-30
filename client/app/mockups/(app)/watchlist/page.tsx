"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { daysUntil, formatDate, isDead, pick, tors, type Tor } from "../../_data/tors";
import { useLang, useProfile } from "../../_components/prefs";
import { TorList, TorRow } from "../../_components/tor-row";
import { btn, EmptyState, SectionHeading } from "../../_components/ui";

type Alert = {
  tor: Tor;
  kind: "amended" | "closing" | "settled" | "cancelled";
  date: string;
  text: { th: string; en: string };
};

/**
 * Tone follows the same rule as everywhere else: amber = look at this, crimson
 * = it cost you something, grey = dead. Each alert also wears its own left
 * rail, so the feed can be sorted by eye before a single line is read.
 */
const ALERT_TONE: Record<Alert["kind"], string> = {
  amended: "border-l-amend bg-amend-bg",
  closing: "border-l-amend bg-amend-bg",
  settled: "border-l-closed bg-closed-bg",
  cancelled: "border-l-risk bg-risk-bg",
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
      const revision = tor.amendments.find((a) => a.kind === "revision");
      if (tor.amended && revision) {
        list.push({
          tor,
          kind: "amended",
          date: revision.date,
          text: revision.headline,
        });
      }
      if (tor.status === "awarded") {
        list.push({
          tor,
          kind: "settled",
          date: tor.amendments[0].date,
          text: {
            th: `ประกาศผู้ชนะแล้ว ผู้ชนะคือ ${tor.awardedTo ? tor.awardedTo.th : "-"}`,
            en: `Awarded to ${tor.awardedTo ? tor.awardedTo.en : "-"}.`,
          },
        });
      }
      if (tor.status === "closed") {
        list.push({
          tor,
          kind: "settled",
          date: tor.deadline,
          text: {
            th: "เลยกำหนดยื่นแล้ว และหน่วยงานยังไม่ประกาศผล เราจะแจ้งอีกครั้งถ้ามีประกาศตามมา",
            en: "The deadline passed with no result posted. We will tell you if one appears.",
          },
        });
      }
      if (tor.status === "cancelled") {
        list.push({
          tor,
          kind: "cancelled",
          date: tor.amendments[0].date,
          text: tor.cancelReason ?? {
            th: "หน่วยงานยกเลิกประกาศนี้แล้ว",
            en: "The agency withdrew this notice.",
          },
        });
      }
      const left = daysUntil(tor.deadline);
      if (!isDead(tor.status) && left >= 0 && left <= 7) {
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
              <span className="font-mono text-[13px] text-ink-3">
                {lang === "th" ? `${alerts.length} รายการใหม่` : `${alerts.length} new`}
              </span>
            }
          >
            {lang === "th" ? "เปลี่ยนแปลงตั้งแต่ครั้งที่แล้ว" : "Changed since you last looked"}
          </SectionHeading>

          <ul className="flex flex-col gap-3">
            {alerts.map((alert) => (
              <li
                key={`${alert.tor.id}-${alert.kind}`}
                className={`flex flex-wrap items-start gap-x-4 gap-y-2 rounded-[3px] border border-l-[3px] border-line px-4 py-4 ${ALERT_TONE[alert.kind]}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-2.5 font-mono text-[13px] text-ink-2">
                    <span className="tnum">{alert.tor.id}</span>
                    <span className="tnum">{formatDate(alert.date, lang)}</span>
                  </p>
                  <p className="mt-1.5 text-[15px] leading-thai font-semibold text-ink">
                    {pick(alert.text, lang)}
                  </p>
                  <Link
                    href={`/mockups/tor/${alert.tor.id}`}
                    className="mt-1.5 inline-block text-[14px] leading-thai text-ink-2 underline underline-offset-2 hover:text-ink"
                  >
                    {pick(alert.tor.title, lang)}
                  </Link>
                </div>
                <button
                  type="button"
                  onClick={() => setDismissed([...dismissed, `${alert.tor.id}-${alert.kind}`])}
                  className="shrink-0 font-mono text-[13px] text-ink-2 underline underline-offset-2 hover:text-ink"
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
          <span className="font-mono text-[13px] text-ink-3">
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
              <Link href="/mockups/catalog" className={btn.secondary}>
                {lang === "th" ? "ไปดูประกาศทั้งหมด" : "Browse the catalog"}
              </Link>
            }
          />
        ) : (
          <TorList>
            {savedTors.map((tor) => (
              <TorRow
                key={tor.id}
                tor={tor}
                trailing={
                  <button
                    type="button"
                    onClick={() => setSaved(saved.filter((id) => id !== tor.id))}
                    className="font-mono text-[13px] text-ink-2 underline underline-offset-2 hover:text-ink"
                  >
                    {lang === "th" ? "เอาออก" : "Remove"}
                  </button>
                }
              />
            ))}
          </TorList>
        )}
      </div>
    </div>
  );
}
