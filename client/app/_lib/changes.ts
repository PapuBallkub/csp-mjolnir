/**
 * What the page says about a TOR's changes (FR-16, FR-17, ADR 0032).
 *
 * A change comes from one of two places, never told apart by colour alone:
 * the agency announced it on e-GP (a D2), or the platform found a new package
 * whose contents differ. The second is an inference and says so, the way
 * Closed does. Describe, don't accuse: the words say what changed and when,
 * never why.
 *
 * Kept apart from the components so it's tested without rendering anything.
 */

import type { ChangeRow, ChangeSource, LatestChange, TorChange } from "./api";
import { formatDate, formatTHB, type Lang } from "./format.ts";
import type { Bi } from "./stage";

const say = (text: Bi, lang: Lang) => (lang === "th" ? text.th : text.en);

/** The marker's words by where a change came from, and the line a change's entry says it with. */
export const CHANGE_SOURCE: Record<ChangeSource, { marker: Bi; hint: Bi; by: Bi }> = {
  feed: {
    marker: { th: "แก้ไขแล้ว", en: "Amended" },
    hint: { th: "หน่วยงานประกาศแก้ไขผ่าน e-GP", en: "The agency announced a change on e-GP" },
    by: { th: "หน่วยงานประกาศผ่าน e-GP", en: "Announced by the agency on e-GP" },
  },
  package: {
    // "พบ": found by us, so it can't read as the agency's "แก้ไขแล้ว"
    marker: { th: "พบการแก้ไข", en: "Change found" },
    hint: {
      th: "ระบบพบว่าเอกสารบน e-GP ต่างจากที่บันทึกไว้ ยังไม่มีประกาศแก้ไขจากหน่วยงาน",
      en: "We found the documents on e-GP differ from the ones we saved; no change notice from the agency yet",
    },
    by: { th: "ระบบพบจากการตรวจเอกสาร", en: "Found when we checked the documents" },
  },
};

/** The note a found change carries (Q3): what was seen, and that no notice says so. */
export const FOUND_NOTE: Bi = {
  th: "เอกสารบน e-GP ต่างจากฉบับที่ระบบบันทึกไว้ และยังไม่มีประกาศแก้ไขจากหน่วยงานใน e-GP",
  en: "The documents on e-GP differ from the ones we saved, and there's no change notice from the agency on e-GP yet.",
};

/**
 * The marker a TOR shows, if any: where its latest change came from. A TOR
 * the feed marked amended before changes were recorded counts as announced.
 * When the status badge already says the invitation changed, an announced
 * marker would only repeat it.
 */
export function markerSource(
  tor: { latestChange?: LatestChange; amendmentInfo?: { isAmended: boolean } },
  badgeSaysChanged: boolean,
): ChangeSource | null {
  const source = tor.latestChange?.source ?? (tor.amendmentInfo?.isAmended ? "feed" : null);
  return source === "feed" && badgeSaysChanged ? null : source;
}

/** A change's heading, by the stage that changed: words, not a badge (Q7). */
export function changeHeading(stage: TorChange["stage"]): Bi {
  if (stage === "draft") return { th: "ร่าง TOR เปลี่ยน", en: "Draft TOR changed" };
  if (stage === "invitation") return { th: "ประกาศเชิญชวนเปลี่ยน", en: "Invitation changed" };
  return { th: "เอกสาร TOR เปลี่ยน", en: "TOR documents changed" };
}

/**
 * When it changed. An announced change has its notice's date. A found one
 * happened between the last check that saw nothing new and the one that
 * found it, said as one day when both fall on it; the date its documents
 * state, if any, comes after.
 */
export function changeWhen(
  change: Pick<TorChange, "source" | "date" | "detectedAt" | "previousCheckAt">,
  lang: Lang,
): string | null {
  const { source, date, detectedAt, previousCheckAt } = change;
  if (source === "feed") {
    if (date) return lang === "th" ? `ประกาศเมื่อ ${formatDate(date, lang)}` : `Announced ${formatDate(date, lang)}`;
    return detectedAt ? (lang === "th" ? `ได้รับประกาศเมื่อ ${formatDate(detectedAt, lang)}` : `Notice received ${formatDate(detectedAt, lang)}`) : null;
  }
  if (!detectedAt) return null;
  const found = formatDate(detectedAt, lang);
  const since = previousCheckAt ? formatDate(previousCheckAt, lang) : null;
  const window =
    since && since !== found
      ? lang === "th" ? `เปลี่ยนระหว่าง ${since} ถึง ${found}` : `Changed between ${since} and ${found}`
      : lang === "th" ? `พบเมื่อ ${found}` : `Found ${found}`;
  if (!date) return window;
  return `${window} · ${lang === "th" ? "เอกสารลงวันที่" : "documents dated"} ${formatDate(date, lang)}`;
}

type FieldKind = "date" | "price" | "days" | "years" | "list" | "document";

// The fields a change row can name (server: shared/amendments.js), as the page names them elsewhere
const FIELDS: Record<string, { label: Bi; kind: FieldKind }> = {
  document: { label: { th: "เอกสาร TOR", en: "TOR document" }, kind: "document" },
  "facts.submissionDeadline": { label: { th: "วันยื่นข้อเสนอ", en: "Bid deadline" }, kind: "date" },
  "facts.referencePriceTHB": { label: { th: "ราคากลาง", en: "Reference price" }, kind: "price" },
  "facts.budgetTHB": { label: { th: "วงเงินงบประมาณ", en: "Budget" }, kind: "price" },
  "facts.deliveryPeriodDays": { label: { th: "ระยะเวลาส่งมอบ", en: "Delivery period" }, kind: "days" },
  "facts.contractDurationDays": { label: { th: "ระยะเวลาสัญญา", en: "Contract duration" }, kind: "days" },
  "facts.warrantyYears": { label: { th: "ระยะเวลารับประกัน", en: "Warranty" }, kind: "years" },
  "eligibility.previousExperienceMinTHB": { label: { th: "ผลงานในอดีตขั้นต่ำ", en: "Minimum prior contract" }, kind: "price" },
  "technicalRequirements.requiredTechnologies": { label: { th: "เทคโนโลยีที่กำหนด", en: "Required technologies" }, kind: "list" },
  "eligibility.standardConditions": { label: { th: "คุณสมบัติผู้ยื่น", en: "Who may bid" }, kind: "list" },
};

// The standard conditions stay off the page, but for the one that decides whether an individual may bid
const SHOWN_CONDITION = "juristic-person";

function formatValue(kind: FieldKind, value: string | null, lang: Lang): string {
  if (value === null) return lang === "th" ? "ไม่ระบุ" : "Not stated";
  if (kind === "date") return formatDate(value, lang);
  if (kind === "price") return formatTHB(Number(value));
  if (kind === "days") return lang === "th" ? `${value} วัน` : `${value} ${value === "1" ? "day" : "days"}`;
  if (kind === "years") return lang === "th" ? `${value} ปี` : `${value} ${value === "1" ? "year" : "years"}`;
  return value;
}

/**
 * A change row as the page shows it, or null for one it doesn't: a field it
 * doesn't know, or a standard condition it doesn't show. The TOR file's row
 * says a new file came; the entry links both originals.
 */
export function describeRow(row: ChangeRow, lang: Lang): { label: string; text: string } | null {
  const field = FIELDS[row.field];
  if (!field) return null;
  const label = say(field.label, lang);
  if (field.kind === "document") return { label, text: lang === "th" ? "มีไฟล์ฉบับใหม่" : "A new file" };
  if (row.field === "eligibility.standardConditions") {
    if ((row.after ?? row.before) !== SHOWN_CONDITION) return null;
    const added = row.after !== null;
    if (lang === "th") return { label, text: added ? "เพิ่มเงื่อนไข เฉพาะนิติบุคคล" : "ยกเลิกเงื่อนไข เฉพาะนิติบุคคล" };
    return { label, text: added ? "Now companies only" : "No longer companies only" };
  }
  if (field.kind === "list") {
    if (row.kind === "added") return { label, text: lang === "th" ? `เพิ่ม ${row.after}` : `Added ${row.after}` };
    return { label, text: lang === "th" ? `ตัด ${row.before} ออก` : `Removed ${row.before}` };
  }
  return { label, text: `${formatValue(field.kind, row.before, lang)} → ${formatValue(field.kind, row.after, lang)}` };
}

/** The changed fields' names for a short line, "ราคากลาง, วันยื่นข้อเสนอ"; the standard conditions left out. */
export function changedFields(fields: string[], lang: Lang): string {
  const named = fields
    .filter((field) => field !== "eligibility.standardConditions")
    .map((field) => FIELDS[field])
    .filter(Boolean)
    .map((field) => say(field.label, lang));
  return [...new Set(named)].join(", ");
}

/** The latest change whose new document the summary on the page hasn't been read from yet. */
export function pendingChange(changes: TorChange[]): TorChange | null {
  return changes.filter((change) => change.rereadPending).at(-1) ?? null;
}

/**
 * What the banner says while the summary predates a change: the TOR changed,
 * and the summary below is from the previous version. The facts the Tor holds
 * are read live, so once the package came, they're already the new ones.
 */
export function pendingNotice(change: TorChange): { title: Bi; body: Bi } {
  const heading = changeHeading(change.stage);
  const title = {
    th: `${heading.th} · สรุปด้านล่างมาจากฉบับก่อนหน้า`,
    en: `${heading.en} · the summary below is from the previous version`,
  };
  if (!change.zipId) {
    return {
      title,
      body: {
        th: "หน่วยงานประกาศแก้ไขแล้ว ระบบยังไม่ได้ดาวน์โหลดเอกสารฉบับใหม่ เนื้อหาสรุปจะถูกปรับหลังการประมวลผล",
        en: "The agency has announced a change. We haven't downloaded the new documents yet; the summary will be updated once they're processed.",
      },
    };
  }
  return {
    title,
    body: {
      th: "ระบบยังไม่ได้อ่านเอกสาร TOR ฉบับใหม่ เนื้อหาสรุปจะถูกปรับหลังการประมวลผล ส่วนราคากลาง งบประมาณ และวันยื่นข้อเสนอแสดงตามประกาศล่าสุดแล้ว",
      en: "We haven't read the new TOR yet; the summary will be updated once it's processed. The reference price, budget and bid deadline already follow the latest announcement.",
    },
  };
}

/** Changed since it was saved (FR-17): found after the reader saved it. */
export function changedSinceSaved(tor: { lastChangeAt?: string | null; savedAt?: string | null }): boolean {
  if (!tor.lastChangeAt || !tor.savedAt) return false;
  return new Date(tor.lastChangeAt).getTime() > new Date(tor.savedAt).getTime();
}
