import { BANGKOK_OFFSET_MS, formatDate } from "./format.ts";

// Deadlines are set in Thai time, so "days left" counts Bangkok calendar days (UTC+7)
const DAY = 24 * 60 * 60 * 1000;
const BANGKOK = BANGKOK_OFFSET_MS;
const bangkokDay = (time: number) => Math.floor((time + BANGKOK) / DAY);

export function daysLeft(deadline: string, now: Date = new Date()): number {
  const targetNow = now instanceof Date && !isNaN(now.getTime()) ? now : new Date();
  return bangkokDay(new Date(deadline).getTime()) - bangkokDay(targetNow.getTime());
}

/** Returns the dynamic countdown text and urgency tone for a given days left count. */
export function countdownText(days: number): { text: string; tone: string } {
  if (days < 0) {
    return {
      text: "ปิดรับแล้ว",
      tone: "text-ink-3",
    };
  }
  if (days === 0) {
    return {
      text: "ครบกำหนดวันนี้",
      tone: "text-risk font-bold",
    };
  }
  if (days === 1) {
    return {
      text: "เหลืออีก 1 วัน",
      tone: "text-risk font-bold",
    };
  }
  return {
    text: `เหลืออีก ${days} วัน`,
    tone:
      days <= 2
        ? "text-risk font-semibold"
        : days <= 7
        ? "text-amend font-semibold"
        : "text-ink font-semibold",
  };
}

/** e.g. "19 ต.ค. 2569", in Thai time; the Thai year is the Buddhist one */
export function formatThaiDate(iso: string): string {
  return formatDate(iso);
}

/** Formats a date-time in Bangkok time (UTC+7) with Thai Buddhist year and HH:mm. e.g. "20 พ.ย. 2569 16:05" */
export function formatThaiDateTime(dateStr?: string | Date | null): string {
  if (!dateStr) return "-";
  const d = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
