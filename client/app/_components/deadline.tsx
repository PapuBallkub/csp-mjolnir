import { daysUntil, formatDate, type Lang, type Status } from "../_data/tors";
import type { TorStatus } from "../_lib/api";
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
 * Time left on a real TOR. `now` comes from when the list arrived, the same
 * moment the API worked out which TORs are already Closed.
 */
export function TorDeadline({
  deadline,
  status,
  now,
  lang,
}: {
  deadline: string | null;
  status: TorStatus;
  now: Date;
  lang: Lang;
}) {
  let text: string;
  let tone = "text-ink-3";
  if (isDead(status)) {
    text = lang === "th" ? "ปิดรับแล้ว" : "Closed";
  } else if (!deadline) {
    text = lang === "th" ? "ไม่ระบุวันปิดรับ" : "No deadline given";
  } else {
    const days = daysLeft(deadline, now);
    // Only a Draft can still be past it: the API turns a late Open into Closed
    if (days < 0) text = lang === "th" ? "เลยกำหนดแล้ว" : "Deadline passed";
    else if (days === 0) text = lang === "th" ? "ปิดรับวันนี้" : "Closes today";
    else if (days === 1) text = lang === "th" ? "เหลืออีก 1 วัน" : "1 day left";
    else text = lang === "th" ? `เหลืออีก ${days} วัน` : `${days} days left`;
    if (days >= 0) tone = days <= 2 ? "text-risk" : days <= 7 ? "text-amend" : "text-ink-2";
  }

  return (
    <span className="flex flex-col items-end gap-0.5 whitespace-nowrap">
      <span className={`font-mono tnum text-[12px] font-medium ${tone}`}>{text}</span>
      {deadline ? (
        <span className="font-mono tnum text-[11px] text-ink-3">{formatThaiDate(deadline, lang)}</span>
      ) : null}
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

