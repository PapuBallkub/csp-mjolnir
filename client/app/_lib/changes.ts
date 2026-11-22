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
import { formatDate, formatTHB } from "./format.ts";

/** The marker's words by where a change came from, and the line a change's entry says it with. */
export const CHANGE_SOURCE: Record<ChangeSource, { marker: string; hint: string; by: string }> = {
  feed: {
    marker: "แก้ไขแล้ว",
    hint: "หน่วยงานประกาศแก้ไขผ่าน e-GP",
    by: "หน่วยงานประกาศผ่าน e-GP",
  },
  package: {
    // "พบ": found by us, so it can't read as the agency's "แก้ไขแล้ว"
    marker: "พบการแก้ไข",
    hint: "ระบบพบว่าเอกสารบน e-GP ต่างจากที่บันทึกไว้ ยังไม่มีประกาศแก้ไขจากหน่วยงาน",
    by: "ระบบพบจากการตรวจเอกสาร",
  },
};

/** The note a found change carries (Q3): what was seen, and that no notice says so. */
export const FOUND_NOTE =
  "เอกสารบน e-GP ต่างจากฉบับที่ระบบบันทึกไว้ และยังไม่มีประกาศแก้ไขจากหน่วยงานใน e-GP";

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
export function changeHeading(stage: TorChange["stage"]): string {
  if (stage === "draft") return "ร่าง TOR เปลี่ยน";
  if (stage === "invitation") return "ประกาศเชิญชวนเปลี่ยน";
  return "เอกสาร TOR เปลี่ยน";
}

/**
 * When it changed. An announced change has its notice's date. A found one
 * happened between the last check that saw nothing new and the one that
 * found it, said as one day when both fall on it; the date its documents
 * state, if any, comes after.
 */
export function changeWhen(
  change: Pick<TorChange, "source" | "date" | "detectedAt" | "previousCheckAt">,
): string | null {
  const { source, date, detectedAt, previousCheckAt } = change;
  if (source === "feed") {
    if (date) return `ประกาศเมื่อ ${formatDate(date)}`;
    return detectedAt ? `ได้รับประกาศเมื่อ ${formatDate(detectedAt)}` : null;
  }
  if (!detectedAt) return null;
  const found = formatDate(detectedAt);
  const since = previousCheckAt ? formatDate(previousCheckAt) : null;
  const window =
    since && since !== found
      ? `เปลี่ยนระหว่าง ${since} ถึง ${found}`
      : `พบเมื่อ ${found}`;
  if (!date) return window;
  return `${window} · เอกสารลงวันที่ ${formatDate(date)}`;
}

type FieldKind = "date" | "price" | "days" | "years" | "list" | "document";

// The fields a change row can name (server: shared/amendments.js), as the page names them elsewhere
const FIELDS: Record<string, { label: string; kind: FieldKind }> = {
  document: { label: "เอกสาร TOR", kind: "document" },
  "facts.submissionDeadline": { label: "วันยื่นข้อเสนอ", kind: "date" },
  "facts.referencePriceTHB": { label: "ราคากลาง", kind: "price" },
  "facts.budgetTHB": { label: "วงเงินงบประมาณ", kind: "price" },
  "facts.deliveryPeriodDays": { label: "ระยะเวลาส่งมอบ", kind: "days" },
  "facts.contractDurationDays": { label: "ระยะเวลาสัญญา", kind: "days" },
  "facts.warrantyYears": { label: "ระยะเวลารับประกัน", kind: "years" },
  "eligibility.previousExperienceMinTHB": { label: "ผลงานในอดีตขั้นต่ำ", kind: "price" },
  "technicalRequirements.requiredTechnologies": { label: "เทคโนโลยีที่กำหนด", kind: "list" },
  "eligibility.standardConditions": { label: "คุณสมบัติผู้ยื่น", kind: "list" },
};

// The standard conditions stay off the page, but for the one that decides whether an individual may bid
const SHOWN_CONDITION = "juristic-person";

function formatValue(kind: FieldKind, value: string | null): string {
  if (value === null) return "ไม่ระบุ";
  if (kind === "date") return formatDate(value);
  if (kind === "price") return formatTHB(Number(value));
  if (kind === "days") return `${value} วัน`;
  if (kind === "years") return `${value} ปี`;
  return value;
}

/**
 * A change row as the page shows it, or null for one it doesn't: a field it
 * doesn't know, or a standard condition it doesn't show. The TOR file's row
 * says a new file came; the entry links both originals.
 */
export function describeRow(row: ChangeRow): { label: string; text: string } | null {
  const field = FIELDS[row.field];
  if (!field) return null;
  const label = field.label;
  if (field.kind === "document") return { label, text: "มีไฟล์ฉบับใหม่" };
  if (row.field === "eligibility.standardConditions") {
    if ((row.after ?? row.before) !== SHOWN_CONDITION) return null;
    const added = row.after !== null;
    return { label, text: added ? "เพิ่มเงื่อนไข เฉพาะนิติบุคคล" : "ยกเลิกเงื่อนไข เฉพาะนิติบุคคล" };
  }
  if (field.kind === "list") {
    if (row.kind === "added") return { label, text: `เพิ่ม ${row.after}` };
    return { label, text: `ตัด ${row.before} ออก` };
  }
  return { label, text: `${formatValue(field.kind, row.before)} → ${formatValue(field.kind, row.after)}` };
}

/** The changed fields' names for a short line, "ราคากลาง, วันยื่นข้อเสนอ"; the standard conditions left out. */
export function changedFields(fields: string[]): string {
  const named = fields
    .filter((field) => field !== "eligibility.standardConditions")
    .map((field) => FIELDS[field]?.label)
    .filter(Boolean);
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
export function pendingNotice(change: TorChange): { title: string; body: string } {
  const heading = changeHeading(change.stage);
  const title = `${heading} · สรุปด้านล่างมาจากฉบับก่อนหน้า`;
  if (!change.zipId) {
    return {
      title,
      body: "หน่วยงานประกาศแก้ไขแล้ว ระบบยังไม่ได้ดาวน์โหลดเอกสารฉบับใหม่ เนื้อหาสรุปจะถูกปรับหลังการประมวลผล",
    };
  }
  return {
    title,
    body: "ระบบยังไม่ได้อ่านเอกสาร TOR ฉบับใหม่ เนื้อหาสรุปจะถูกปรับหลังการประมวลผล ส่วนราคากลาง งบประมาณ และวันยื่นข้อเสนอแสดงตามประกาศล่าสุดแล้ว",
  };
}

/** Changed since it was saved (FR-17): found after the reader saved it. */
export function changedSinceSaved(tor: { lastChangeAt?: string | null; savedAt?: string | null }): boolean {
  if (!tor.lastChangeAt || !tor.savedAt) return false;
  return new Date(tor.lastChangeAt).getTime() > new Date(tor.savedAt).getTime();
}
