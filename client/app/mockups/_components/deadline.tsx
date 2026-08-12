import { daysUntil, formatDate, type Lang, type Status } from "../_data/tors";

/**
 * Time pressure is a verdict too, so it follows the same colour rule:
 * amber once a week is left, crimson inside two days, drained once it's dead.
 */
export function deadlineTone(deadline: string, status: Status): string {
  if (status === "closed") return "text-ink-3";
  const days = daysUntil(deadline);
  if (days < 0) return "text-ink-3";
  if (days <= 2) return "text-risk";
  if (days <= 7) return "text-amend";
  return "text-ink-2";
}

export function deadlineText(deadline: string, status: Status, lang: Lang): string {
  if (status === "closed") return lang === "th" ? "ปิดรับแล้ว" : "Closed";
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
  deadline: string;
  status: Status;
  lang: Lang;
  showDate?: boolean;
}) {
  return (
    <span className="flex flex-col items-end gap-0.5 whitespace-nowrap">
      <span className={`font-mono tnum text-[12px] font-medium ${deadlineTone(deadline, status)}`}>
        {deadlineText(deadline, status, lang)}
      </span>
      {showDate ? (
        <span className="font-mono tnum text-[11px] text-ink-3">
          {formatDate(deadline, lang)}
        </span>
      ) : null}
    </span>
  );
}
