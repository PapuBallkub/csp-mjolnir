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
 * Bangkok is permanently UTC+7 (Asia/Bangkok) with no Daylight Saving Time.
 */
export const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

export interface BangkokDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/**
 * Resolves calendar date components in Bangkok time (UTC+7).
 * Ensures dates display Bangkok's calendar day, not the visitor's local day.
 */
export function getBangkokDateParts(val?: string | Date | null): BangkokDateParts | null {
  if (!val) return null;

  // Exact calendar date string YYYY-MM-DD (e.g. e-GP date strings)
  if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
    const [y, m, d] = val.split("-").map(Number);
    return { year: y, month: m - 1, day: d, hour: 0, minute: 0 };
  }

  const date = typeof val === "string" ? new Date(val) : val;
  if (Number.isNaN(date.getTime())) return null;

  const bkk = new Date(date.getTime() + BANGKOK_OFFSET_MS);
  return {
    year: bkk.getUTCFullYear(),
    month: bkk.getUTCMonth(),
    day: bkk.getUTCDate(),
    hour: bkk.getUTCHours(),
    minute: bkk.getUTCMinutes(),
  };
}

/**
 * Calculates Thai fiscal year (ปีงบประมาณ) in Bangkok time.
 * Thai government fiscal year runs October 1 -> September 30.
 * October onward belongs to the next calendar year's budget.
 * Converted to Buddhist Era (พ.ศ. = ค.ศ. + 543).
 * Falls back to e-GP projectId prefix (e.g. "67..." -> 2567) if date is unavailable.
 */
export function getFiscalYear(dateStr?: string | Date | null, projectId?: string | null): number | null {
  if (dateStr) {
    const parts = getBangkokDateParts(dateStr);
    if (parts) {
      const { year, month } = parts; // 0 = Jan, 8 = Sep, 9 = Oct
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

/** Days until deadline in Bangkok calendar days. Negative once date has passed. */
export function daysUntil(iso?: string | null): number {
  if (!iso) return -1;
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return -1;
  const DAY = 24 * 60 * 60 * 1000;
  const bangkokDay = (time: number) => Math.floor((time + BANGKOK_OFFSET_MS) / DAY);
  return bangkokDay(target) - bangkokDay(Date.now());
}

/** Formats ISO string or Date into localized date string in Bangkok time (UTC+7). */
export function formatDate(iso?: string | Date | null, lang: Lang = "th"): string {
  if (!iso) return lang === "th" ? "ไม่ระบุ" : "Not specified";
  const parts = getBangkokDateParts(iso);
  if (!parts) return String(iso);
  const { day, month, year } = parts;
  return lang === "th"
    ? `${day} ${THAI_MONTHS[month]} ${year + 543}`
    : `${day} ${EN_MONTHS[month]} ${year}`;
}

/**
 * Builds the official public e-GP search URL for a project ID on process5.
 * process5 is the public portal that resolves project announcements without session cookies or WAF rejection.
 */
export function getEgpAnnouncementUrl(projectId: string): string {
  return `https://process5.gprocurement.go.th/egp-agpc01-web/announcement?keywordSearch=${encodeURIComponent(String(projectId).trim())}`;
}

/** An e-GP package's own download, the original a change cites: the zip as e-GP serves it. */
export function getEgpPackageUrl(zipId: string): string {
  return `https://process5.gprocurement.go.th/egp-upload-service/v1/downloadFileTest?fileId=${encodeURIComponent(zipId)}`;
}

