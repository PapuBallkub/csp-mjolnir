import { daysUntil, formatDate, type Lang, type Status } from "../_data/tors";
import type { TorStatus } from "../_lib/api";
import { deadlineOf } from "../_lib/stage";
import { isDead } from "./verdict";

/* ------------------------- real dates, from the API ------------------------ */

// Deadlines are set in Thai time, so "days left" counts Bangkok calendar days
const DAY = 24 * 60 * 60 * 1000;
const BANGKOK = 7 * 60 * 60 * 1000;
const bangkokDay = (time: number) => Math.floor((time + BANGKOK) / DAY);

export function daysLeft(deadline: string, now: Date): number {
  return bangkokDay(new Date(deadline).getTime()) - bangkokDay(now.getTime());
}

/** e.g. "19 ต.ค. 2569" / "19 Oct 2026", in Thai time; the Thai year is the Buddhist one */
export function formatThaiDate(iso: string, lang: Lang): string {
  const date = new Date(new Date(iso).getTime() + BANGKOK);
  // formatDate reads the date part, so only the Bangkok calendar date goes in
  return formatDate(date.toISOString().slice(0, 10), lang);
}

/**
 * Time left on a real TOR, and what it is left for: a draft asks for comments
 * by a date, an invitation for bids (deadlineOf). `now` comes from when the
 * list arrived, the same moment the API worked out which TORs are Closed.
 */
export function TorDeadline({
  status,
  facts,
  now,
  lang,
}: {
  status: TorStatus;
  facts: { submissionDeadline: string | null; commentDeadline?: string | null };
  now: Date;
  lang: Lang;
}) {
  const info = deadlineOf(status, facts);
  const say = (text: { th: string; en: string }) => (lang === "th" ? text.th : text.en);

  // Nothing left to do: say so, and keep the date it closed for the record
  if (isDead(status)) {
    const over =
      status === "Closed"
        ? { th: "ปิดรับข้อเสนอแล้ว", en: "Bidding closed" }
        : { th: "ไม่รับข้อเสนอแล้ว", en: "No longer taking bids" };
    return (
      <span className="flex flex-col items-end gap-0.5 whitespace-nowrap">
        <span className="text-[12.5px] font-medium text-ink-3">{say(over)}</span>
        {info.date ? <span className="tnum text-[11.5px] text-ink-3">{formatThaiDate(info.date, lang)}</span> : null}
      </span>
    );
  }

  let text: string;
  let tone = "text-ink-3";
  if (!info.date) {
    text = say(info.missing);
  } else {
    const days = daysLeft(info.date, now);
    // Only a draft can still be past it: the API turns a late Open into Closed
    if (days < 0) text = say({ th: "ปิดรับความเห็นแล้ว", en: "Comment period over" });
    else if (days === 0) text = say({ th: "ครบกำหนดวันนี้", en: "Due today" });
    else if (days === 1) text = say({ th: "เหลืออีก 1 วัน", en: "1 day left" });
    else text = lang === "th" ? `เหลืออีก ${days} วัน` : `${days} days left`;
    if (days >= 0) tone = days <= 2 ? "text-risk" : days <= 7 ? "text-amend" : "text-ink-2";
  }

  return (
    <span className="flex flex-col items-end gap-0.5 whitespace-nowrap">
      {/* What the deadline is for, so "5 days left" never stands alone */}
      <span className="text-[11px] leading-thai text-ink-3">{say(info.label)}</span>
      <span className={`tnum text-[12.5px] font-medium ${tone}`}>{text}</span>
      {info.date ? <span className="tnum text-[11.5px] text-ink-3">{formatThaiDate(info.date, lang)}</span> : null}
    </span>
  );
}

/* ------------------------- fixture dates (mockup) ------------------------- */

/**
 * Time pressure is a verdict too, so it follows the same colour rule:
 * amber once a week is left, crimson inside two days, drained once it's dead.
 */
export function deadlineTone(deadline: string | null | undefined, status: Status): string {
  if (status === "Closed" || status === "Awarded" || status === "Cancelled") {
    return "text-ink-3";
  }
  if (!deadline) return "text-ink-3";
  const days = daysUntil(deadline);
  if (days < 0) return "text-ink-3";
  if (days <= 2) return "text-risk";
  if (days <= 7) return "text-amend";
  return "text-ink-2";
}

export function deadlineText(deadline: string | null | undefined, status: Status, lang: Lang): string {
  if (status === "Awarded") return lang === "th" ? "ประกาศผู้ชนะแล้ว" : "Awarded";
  if (status === "Cancelled") return lang === "th" ? "ยกเลิกแล้ว" : "Cancelled";
  if (status === "Closed") return lang === "th" ? "ปิดรับแล้ว" : "Closed";
  if (!deadline) return lang === "th" ? "ไม่ระบุวันปิดรับ" : "No deadline";
  const days = daysUntil(deadline);
  if (days < 0) return lang === "th" ? "เลยกำหนดแล้ว" : "Deadline passed";
  if (days === 0) return lang === "th" ? "ปิดรับวันนี้" : "Closes today";
  if (days === 1) return lang === "th" ? "เหลืออีก 1 วัน" : "1 day left";
  return lang === "th" ? `เหลืออีก ${days} วัน` : `${days} days left`;
}

export function Deadline({
  deadline,
  status,
  lang,
  showDate = true,
}: {
  deadline?: string | null;
  status: Status;
  lang: Lang;
  showDate?: boolean;
}) {
  return (
    <span className="flex flex-col items-end gap-0.5 whitespace-nowrap transition-opacity duration-150">
      <span className={`font-mono tnum text-[12px] font-medium ${deadlineTone(deadline, status)}`}>
        {deadlineText(deadline, status, lang)}
      </span>
      {showDate && deadline ? (
        <span className="font-mono tnum text-[11px] text-ink-3">
          {formatDate(deadline, lang)}
        </span>
      ) : null}
    </span>
  );
}

