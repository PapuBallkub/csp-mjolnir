export type Lang = "th" | "en";

export const THAI_MONTHS = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

export const EN_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Calculates Thai fiscal year (ปีงบประมาณ).
 * Thai government fiscal year runs October 1 -> September 30.
 * October onward belongs to the next calendar year's budget.
 * Converted to Buddhist Era (พ.ศ. = ค.ศ. + 543).
 * Falls back to e-GP projectId prefix (e.g. "67..." -> 2567) if date is unavailable.
 */
export function getFiscalYear(dateStr?: string | null, projectId?: string | null): number | null {
  if (dateStr) {
    const d = new Date(dateStr);
    if (!Number.isNaN(d.getTime())) {
      const year = d.getFullYear();
      const month = d.getMonth(); // 0 = Jan, 8 = Sep, 9 = Oct
      const fyGregorian = month >= 9 ? year + 1 : year;
      return fyGregorian + 543;
    }
  }
  if (projectId && /^\d{2}/.test(projectId)) {
    return 2500 + parseInt(projectId.slice(0, 2), 10);
  }
  return null;
}

export function formatTHB(amount?: number | null): string {
  if (amount == null || Number.isNaN(amount)) return "ไม่ระบุงบประมาณ";
  return `฿${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

/** Compact form for dense rows: ฿12.4M, ฿890K. */
export function formatTHBCompact(amount?: number | null): string {
  if (amount == null || Number.isNaN(amount)) return "—";
  if (amount >= 1_000_000) {
    const millions = amount / 1_000_000;
    return `฿${millions % 1 === 0 ? millions : millions.toFixed(1)}M`;
  }
  if (amount >= 1000) {
    return `฿${Math.round(amount / 1000)}K`;
  }
  return `฿${amount.toLocaleString("en-US")}`;
}

/** Days until deadline. Negative once date has passed. */
export function daysUntil(iso?: string | null): number {
  if (!iso) return -1;
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return -1;
  return Math.ceil((target - Date.now()) / 86_400_000);
}

/** Formats ISO string into localized date string. */
export function formatDate(iso?: string | null, lang: Lang = "th"): string {
  if (!iso) return lang === "th" ? "ไม่ระบุ" : "Not specified";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const day = d.getDate();
  const month = d.getMonth();
  const year = d.getFullYear();
  return lang === "th"
    ? `${day} ${THAI_MONTHS[month]} ${year + 543}`
    : `${day} ${EN_MONTHS[month]} ${year}`;
}
