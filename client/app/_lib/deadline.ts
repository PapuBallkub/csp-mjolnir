import { formatDate, type Lang } from "./format.ts";

// Deadlines are set in Thai time, so "days left" counts Bangkok calendar days (UTC+7)
const DAY = 24 * 60 * 60 * 1000;
const BANGKOK = 7 * 60 * 60 * 1000;
const bangkokDay = (time: number) => Math.floor((time + BANGKOK) / DAY);

export function daysLeft(deadline: string, now: Date = new Date()): number {
  const targetNow = now instanceof Date && !isNaN(now.getTime()) ? now : new Date();
  return bangkokDay(new Date(deadline).getTime()) - bangkokDay(targetNow.getTime());
}

/** Returns the dynamic countdown text and urgency tone for a given days left count. */
export function countdownText(
  days: number,
  lang: Lang = "th"
): { text: string; tone: string } {
  if (days < 0) {
    return {
      text: lang === "th" ? "ปิดรับแล้ว" : "Closed",
      tone: "text-ink-3",
    };
  }
  if (days === 0) {
    return {
      text: lang === "th" ? "ครบกำหนดวันนี้" : "Due today",
      tone: "text-risk font-bold",
    };
  }
  if (days === 1) {
    return {
      text: lang === "th" ? "เหลืออีก 1 วัน" : "1 day left",
      tone: "text-risk font-bold",
    };
  }
  return {
    text: lang === "th" ? `เหลืออีก ${days} วัน` : `${days} days left`,
    tone:
      days <= 2
        ? "text-risk font-semibold"
        : days <= 7
        ? "text-amend font-semibold"
        : "text-ink font-semibold",
  };
}

/** e.g. "19 ต.ค. 2569" / "19 Oct 2026", in Thai time; the Thai year is the Buddhist one */
export function formatThaiDate(iso: string, lang: Lang): string {
  const date = new Date(new Date(iso).getTime() + BANGKOK);
  return formatDate(date.toISOString().slice(0, 10), lang);
}
