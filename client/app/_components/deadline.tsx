import { daysUntil, formatDate, type Status } from "../_data/tors";
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
  now = new Date(),
  align = "end",
  hideLabel = false,
  className = "",
}: {
  status: TorStatus;
  facts: { submissionDeadline: string | null; commentDeadline?: string | null };
  now?: Date;
  align?: "start" | "end" | "center";
  hideLabel?: boolean;
  className?: string;
}) {
  const info = deadlineOf(status, facts);

  const alignClass =
    align === "start" ? "items-start" : align === "center" ? "items-center" : "items-end";

  // Nothing left to do: say so, and keep the date it closed for the record
  if (isDead(status)) {
    const over =
      status === "Closed"
        ? "ปิดรับข้อเสนอแล้ว"
        : "ไม่รับข้อเสนอแล้ว";
    return (
      <span className={`flex flex-col ${alignClass} gap-0.5 whitespace-nowrap ${className}`}>
        <span className="text-[13px] font-bold text-ink-3 leading-tight">{over}</span>
        {info.date ? <span className="tnum text-[10.5px] text-ink-3 font-mono leading-tight">{formatThaiDate(info.date)}</span> : null}
      </span>
    );
  }

  let text: string;
  let tone = "text-ink-3";
  if (!info.date) {
    text = info.missing;
  } else {
    const days = daysLeft(info.date, now);
    // Only a draft can still be past it: the API turns a late Open into Closed
    if (days < 0) {
      text = "ปิดรับความเห็นแล้ว";
    } else {
      const cd = countdownText(days);
      text = cd.text;
      tone = cd.tone;
    }
  }

  return (
    <span className={`flex flex-col ${alignClass} gap-0.5 whitespace-nowrap ${className}`}>
      {!hideLabel && (
        <span className="text-[11px] leading-thai text-ink-3">{info.label}</span>
      )}
      <span className={`tnum text-[13px] sm:text-[14px] leading-tight font-bold ${tone}`}>{text}</span>
      {info.date ? <span className="tnum text-[10.5px] text-ink-3 font-mono leading-tight">{formatThaiDate(info.date)}</span> : null}
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

export function deadlineText(deadline: string | null | undefined, status: Status): string {
  if (status === "Awarded") return "ประกาศผู้ชนะแล้ว";
  if (status === "Cancelled") return "ยกเลิกแล้ว";
  if (status === "Closed") return "ปิดรับแล้ว";
  if (!deadline) return "ไม่ระบุวันปิดรับ";
  const days = daysUntil(deadline);
  if (days < 0) return "เลยกำหนดแล้ว";
  if (days === 0) return "ปิดรับวันนี้";
  if (days === 1) return "เหลืออีก 1 วัน";
  return `เหลืออีก ${days} วัน`;
}

export function Deadline({
  deadline,
  status,
  showDate = true,
}: {
  deadline?: string | null;
  status: Status;
  showDate?: boolean;
}) {
  return (
    <span className="flex flex-col items-end gap-1 whitespace-nowrap transition-opacity duration-150">
      <span className={`font-mono tnum text-[15px] sm:text-[15.5px] leading-none font-semibold ${deadlineTone(deadline, status)}`}>
        {deadlineText(deadline, status)}
      </span>
      {showDate && deadline ? (
        <span className="font-mono tnum text-[13px] font-medium text-ink-2">
          {formatDate(deadline)}
        </span>
      ) : null}
    </span>
  );
}
