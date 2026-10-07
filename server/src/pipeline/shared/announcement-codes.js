/**
 * server/src/pipeline/shared/announcement-codes.js
 *
 * The e-GP announcement codes (FR-02), as กรมบัญชีกลาง defines them (ADR 0017).
 * Ingestion reads this table to know what each RSS item means; the status
 * engine reads it to work out a project's status.
 *
 * Source: กรมบัญชีกลาง, "คู่มือการเชื่อมโยงประกาศจัดซื้อจัดจ้างจากระบบ e-GP
 * ไปยังเว็บไซต์หน่วยงานของรัฐในรูปแบบ RSS". Each `nameTh` is written exactly
 * as the feed writes it in an item's description (checked on 2026-10-07).
 *
 * Not fetched: P0 (แผนการจัดซื้อจัดจ้าง). A plan carries a plan id, not a
 * project id, and isn't a project yet.
 *
 * `discovers`: whether an item of this type may add a project we don't follow
 * yet. Only the types of a project still to come or open do. A cancellation
 * or a winner only updates a project we already follow; for one we never saw,
 * it is past data.
 */

/**
 * @typedef {'reference_price' | 'draft_tor' | 'invitation' | 'amendment'
 *   | 'invitation_cancelled' | 'winner' | 'winner_changed' | 'winner_cancelled'} AnnouncementType
 */

/**
 * @type {Record<string, {
 *   type: AnnouncementType,
 *   nameTh: string,
 *   nameEn: string,
 *   impliedStatus: 'Draft' | 'Open' | 'Awarded' | 'Cancelled' | null,
 *   setsAmended: boolean,
 *   discovers: boolean,
 * }>}
 */
export const EGP_ANNOUNCEMENT_CODES = {
  15: {
    type: 'reference_price',
    nameTh: 'ประกาศราคากลาง',
    nameEn: 'Reference price',
    impliedStatus: null, // information only: the project's stage doesn't change
    setsAmended: false,
    discovers: true,
  },
  B0: {
    type: 'draft_tor',
    nameTh: 'ร่างเอกสารประกวดราคา (e-Bidding) และร่างเอกสารซื้อหรือจ้างด้วยวิธีสอบราคา',
    nameEn: 'Draft TOR',
    impliedStatus: 'Draft', // out for public comment; bids aren't open yet
    setsAmended: false,
    discovers: true,
  },
  D0: {
    type: 'invitation',
    nameTh: 'ประกาศเชิญชวน',
    nameEn: 'Invitation to bid',
    impliedStatus: 'Open',
    setsAmended: false,
    discovers: true,
  },
  D2: {
    type: 'amendment',
    nameTh: 'เปลี่ยนแปลงประกาศเชิญชวน',
    nameEn: 'Invitation changed',
    impliedStatus: 'Open', // still taking bids, on changed terms
    setsAmended: true,
    discovers: true,
  },
  D1: {
    type: 'invitation_cancelled',
    nameTh: 'ยกเลิกประกาศเชิญชวน',
    nameEn: 'Invitation cancelled',
    impliedStatus: 'Cancelled',
    setsAmended: false,
    discovers: false,
  },
  W0: {
    type: 'winner',
    nameTh: 'ประกาศรายชื่อผู้ชนะการเสนอราคา / ประกาศผู้ได้รับการคัดเลือก',
    nameEn: 'Winner announced',
    impliedStatus: 'Awarded',
    setsAmended: false,
    discovers: false,
  },
  W2: {
    type: 'winner_changed',
    nameTh: 'เปลี่ยนแปลงประกาศรายชื่อผู้ชนะการเสนอราคา',
    nameEn: 'Winner changed',
    impliedStatus: 'Awarded',
    setsAmended: false,
    discovers: false,
  },
  W1: {
    type: 'winner_cancelled',
    nameTh: 'ยกเลิกประกาศรายชื่อผู้ชนะการเสนอราคา / ประกาศผู้ได้รับการคัดเลือก',
    nameEn: 'Winner announcement cancelled',
    // A new invitation or winner announcement later sets the status again
    impliedStatus: 'Cancelled',
    setsAmended: false,
    discovers: false,
  },
};

/**
 * The codes to request from the feed, in the order a procurement goes
 * through them. Items one poll sees on the same day are recorded in this
 * order, so a cancellation lands after the invitation it cancels.
 */
export const FETCHABLE_CODES = ['15', 'B0', 'D0', 'D2', 'D1', 'W0', 'W2', 'W1'];

/** Codes that mean the TOR changed (FR-16). Only D2: D1 cancels, it doesn't amend. */
export const AMENDMENT_CODES = Object.entries(EGP_ANNOUNCEMENT_CODES)
  .filter(([, v]) => v.setsAmended)
  .map(([code]) => code);

/**
 * Look up a code. Returns undefined for unknown codes.
 * @param {string} code
 */
export function getAnnouncementInfo(code) {
  return EGP_ANNOUNCEMENT_CODES[String(code).trim()] ?? undefined;
}

/**
 * Returns the internal AnnouncementType string for a code, or null if unknown.
 * @param {string} code
 * @returns {AnnouncementType | null}
 */
export function classifyAnnouncement(code) {
  return getAnnouncementInfo(code)?.type ?? null;
}

/**
 * The code for a type name as the feed writes it, or null for a name this
 * table doesn't know.
 * @param {string} name
 * @returns {string | null}
 */
export function codeFromTypeName(name) {
  const wanted = String(name ?? '').replace(/\s+/g, ' ').trim();
  const match = Object.entries(EGP_ANNOUNCEMENT_CODES).find(([, info]) => info.nameTh === wanted);
  return match?.[0] ?? null;
}
