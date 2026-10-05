/**
 * server/src/pipeline/shared/announcement-codes.js
 *
 * Canonical mapping of e-GP RSS announcement codes to internal types (FR-02).
 * Every code the system recognises lives here. The ingestion pipeline reads
 * this map to decide what each RSS item means; the status engine reads it to
 * decide what status a project should have.
 *
 * Source: e-GP RSS feed at process3.gprocurement.go.th/EPROCRssFeedWeb/
 *         announceType parameter values observed in production feeds.
 */

/**
 * @typedef {'draft_tor' | 'invitation' | 'amendment' | 'reference_price'} AnnouncementType
 */

/**
 * Each entry describes one e-GP announceType code.
 *
 * @type {Record<string, {
 *   type: AnnouncementType,
 *   nameTh: string,
 *   nameEn: string,
 *   description: string,
 *   impliedStatus: 'Draft' | 'Open' | null,
 *   setsAmended: boolean,
 * }>}
 */
export const EGP_ANNOUNCEMENT_CODES = {
  B0: {
    type: 'draft_tor',
    nameTh: 'ร่างประกาศและร่างเอกสารประกวดราคา',
    nameEn: 'Draft TOR',
    description: 'Draft TOR published for public comment before formal bidding opens.',
    impliedStatus: 'Draft',
    setsAmended: false,
  },
  D0: {
    type: 'invitation',
    nameTh: 'ประกาศเชิญชวน',
    nameEn: 'Invitation to Bid',
    description: 'Formal invitation to bid — the TOR is final and the submission window is open.',
    impliedStatus: 'Open',
    setsAmended: false,
  },
  D1: {
    type: 'amendment',
    nameTh: 'แก้ไขประกาศเชิญชวน',
    nameEn: 'Amendment to Invitation',
    description: 'Amendment to the invitation to bid. The TOR or conditions changed after D0.',
    impliedStatus: null, // does not change the lifecycle status
    setsAmended: true,
  },
  D2: {
    type: 'amendment',
    nameTh: 'แก้ไขประกาศเชิญชวน (ครั้งที่ 2+)',
    nameEn: 'Amendment to Invitation (round 2+)',
    description: 'Second or subsequent amendment to the invitation.',
    impliedStatus: null,
    setsAmended: true,
  },
  15: {
    type: 'reference_price',
    nameTh: 'ราคากลาง',
    nameEn: 'Reference Price',
    description: 'Publication of the official reference price (ราคากลาง) for the project.',
    impliedStatus: null, // reference price doesn't change lifecycle status
    setsAmended: false,
  },
};

/** All codes the ingestion pipeline should request from the RSS feed. */
export const FETCHABLE_CODES = Object.keys(EGP_ANNOUNCEMENT_CODES);

/** Codes that represent an amendment event. */
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
