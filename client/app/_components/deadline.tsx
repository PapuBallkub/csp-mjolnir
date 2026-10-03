import { daysUntil, formatDate, type Lang, type Status } from "../_data/tors";
import type { ApiStatus } from "./verdict";

/**
 * Time pressure is a verdict too, so it follows the same colour rule:
 * amber once a week is left, crimson inside two days, drained once it's dead.
 */
export function deadlineTone(deadline: string | null | undefined, status: Status | ApiStatus): string {
  if (status === "closed" || status === "Closed" || status === "Awarded" || status === "Cancelled") {
    return "text-ink-3";
  }
  if (!deadline) return "text-ink-3";
  const days = daysUntil(deadline);
  if (days < 0) return "text-ink-3";
  if (days <= 2) return "text-risk";
  if (days <= 7) return "text-amend";
  return "text-ink-2";
}

export function deadlineText(deadline: string | null | undefined, status: Status | ApiStatus, lang: Lang): string {
  if (status === "Awarded") return lang === "th" ? "ประกาศผู้ชนะแล้ว" : "Awarded";
  if (status === "Cancelled") return lang === "th" ? "ยกเลิกแล้ว" : "Cancelled";
  if (status === "closed" || status === "Closed") return lang === "th" ? "ปิดรับแล้ว" : "Closed";
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
  status: Status | ApiStatus;
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

