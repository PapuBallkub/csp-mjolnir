import { daysUntil, formatDate, type Lang, type Status } from "../_data/tors";
import type { TorStatus } from "../_lib/api";
import { deadlineOf } from "../_lib/stage";
import { isDead } from "./verdict";
import { countdownText, daysLeft, formatThaiDate } from "../_lib/deadline";

export { countdownText, daysLeft, formatThaiDate };

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
  align = "end",
  hideLabel = false,
  className = "",
}: {
  status: TorStatus;
  facts: { submissionDeadline: string | null; commentDeadline?: string | null };
  now: Date;
  lang: Lang;
  align?: "start" | "end" | "center";
  hideLabel?: boolean;
  className?: string;
}) {
  const info = deadlineOf(status, facts);
  const say = (text: { th: string; en: string }) => (lang === "th" ? text.th : text.en);

  const alignClass =
    align === "start" ? "items-start" : align === "center" ? "items-center" : "items-end";

  // Nothing left to do: say so, and keep the date it closed for the record
  if (isDead(status)) {
    const over =
      status === "Closed"
        ? { th: "ปิดรับข้อเสนอแล้ว", en: "Bidding closed" }
        : { th: "ไม่รับข้อเสนอแล้ว", en: "No longer taking bids" };
    return (
      <span className={`flex flex-col ${alignClass} gap-0.5 whitespace-nowrap ${className}`}>
        <span className="text-[13px] font-bold text-ink-3 leading-tight">{say(over)}</span>
        {info.date ? <span className="tnum text-[10.5px] text-ink-3 font-mono leading-tight">{formatThaiDate(info.date, lang)}</span> : null}
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
    if (days < 0) {
      text = say({ th: "ปิดรับความเห็นแล้ว", en: "Comment period over" });
    } else {
      const cd = countdownText(days, lang);
      text = cd.text;
      tone = cd.tone;
    }
  }

  return (
    <span className={`flex flex-col ${alignClass} gap-0.5 whitespace-nowrap ${className}`}>
      {!hideLabel && (
        <span className="text-[11px] leading-thai text-ink-3">{say(info.label)}</span>
      )}
      <span className={`tnum text-[13px] sm:text-[14px] leading-tight font-bold ${tone}`}>{text}</span>
      {info.date ? <span className="tnum text-[10.5px] text-ink-3 font-mono leading-tight">{formatThaiDate(info.date, lang)}</span> : null}
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
  return "text-ink font-semibold";
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
    <span className="flex flex-col items-end gap-1 whitespace-nowrap transition-opacity duration-150">
      <span className={`font-mono tnum text-[15px] sm:text-[15.5px] leading-none font-semibold ${deadlineTone(deadline, status)}`}>
        {deadlineText(deadline, status, lang)}
      </span>
      {showDate && deadline ? (
        <span className="font-mono tnum text-[13px] font-medium text-ink-2">
          {formatDate(deadline, lang)}
        </span>
      ) : null}
    </span>
  );
}

