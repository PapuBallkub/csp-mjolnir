/**
 * What a TOR's status badge and deadline say (ADR 0017).
 *
 * The five statuses colour the badge, so a dense list still scans by colour.
 * e-GP's own stage names it: "Cancelled" says whether the invitation or the
 * award was cancelled, "Awarded" whether a winner was announced, changed, or
 * signed a contract. Kept apart from the components so it's tested without
 * rendering anything.
 */

import type { AnnouncementCode, LatestAnnouncement, TorStatus } from "./api";

export type Bi = string;

const STAGE_BY_CODE: Record<AnnouncementCode, string> = {
  "15": "ประกาศราคากลาง",
  B0: "ร่าง TOR · รับฟังความเห็น",
  D0: "เปิดรับข้อเสนอ",
  D2: "เปลี่ยนแปลงประกาศเชิญชวน",
  D1: "ยกเลิกประกาศเชิญชวน",
  W0: "ประกาศผู้ชนะแล้ว",
  W2: "เปลี่ยนแปลงผู้ชนะ",
  W1: "ยกเลิกประกาศผู้ชนะ",
};

// The status each code gives, as the server's status engine works it out
const STATUS_OF_CODE: Record<AnnouncementCode, TorStatus | null> = {
  "15": null, // information only: fits any status
  B0: "Draft",
  D0: "Open",
  D2: "Open",
  D1: "Cancelled",
  W0: "Awarded",
  W2: "Awarded",
  W1: "Cancelled",
};

const CONTRACT_SIGNED = "ลงนามสัญญาแล้ว";
// The one stage e-GP's own pages don't show: it comes from the contract records
// the government publishes on data.go.th (ADR 0028), so the badge says where
const CONTRACT_SIGNED_HINT = "จากข้อมูลสัญญาที่รัฐเผยแพร่ใน data.go.th";

/**
 * The status filter's groups: one per badge colour, named the way the badges
 * in it are. `members` are the other badges a group holds, shown as bullets
 * in the badges' own words, so any badge seen in the list can be found again
 * in the filter. `notes` explain a group, one sentence a line.
 */
export const STATUS_GROUPS: Record<TorStatus, { label: string; members?: string[]; notes?: string[] }> = {
  Draft: { label: STAGE_BY_CODE.B0 },
  Open: { label: STAGE_BY_CODE.D0, members: [STAGE_BY_CODE.D2] },
  Closed: {
    label: "ปิดรับข้อเสนอแล้ว",
    notes: [
      "ประเมินจากวันปิดรับ",
      "หน่วยงานยังไม่แจ้งผล",
    ],
  },
  Awarded: { label: STAGE_BY_CODE.W0, members: [STAGE_BY_CODE.W2, CONTRACT_SIGNED] },
  Cancelled: { label: "ยกเลิกแล้ว", members: [STAGE_BY_CODE.D1, STAGE_BY_CODE.W1] },
};

// A badge with no stage to name says its group's name
const STAGE_BY_STATUS = Object.fromEntries(
  Object.entries(STATUS_GROUPS).map(([status, group]) => [status, group.label]),
) as Record<TorStatus, string>;

const HINTS: Partial<Record<TorStatus, string>> = {
  Draft: "ร่างเพื่อรับฟังความเห็น ยังไม่เปิดรับข้อเสนอ",
  Closed: "ประเมินจากวันปิดรับ หน่วยงานยังไม่แจ้งผล",
};

/** The name of an e-GP announcement, as a person would say it. */
export function announcementLabel(code: AnnouncementCode): string {
  return STAGE_BY_CODE[code];
}

export type Stage = {
  label: string;
  hint?: string;
  /** The label already says the invitation changed, so an Amended flag would repeat it */
  saysChanged: boolean;
};

type StageInput = {
  status: TorStatus;
  latestAnnouncement?: LatestAnnouncement;
  contractSigned?: boolean;
};

/**
 * The badge's words, in this order:
 * 1. A signed contract (data.go.th) is the last word.
 * 2. Closed is the platform's inference from the deadline, and says so.
 * 3. e-GP's latest announcement, when the feed announced the TOR and its stage
 *    agrees with the status. The status sets the colour, so the words must
 *    never contradict it.
 * 4. Otherwise, the status.
 */
export function stageOf({ status, latestAnnouncement, contractSigned }: StageInput): Stage {
  if (contractSigned) return { label: CONTRACT_SIGNED, hint: CONTRACT_SIGNED_HINT, saysChanged: false };
  if (status === "Closed") return { label: STAGE_BY_STATUS.Closed, hint: HINTS.Closed, saysChanged: false };

  const code = latestAnnouncement?.code;
  if (code && code in STAGE_BY_CODE) {
    const implied = STATUS_OF_CODE[code];
    if (implied === null || implied === status) {
      return { label: STAGE_BY_CODE[code], hint: HINTS[status], saysChanged: code === "D2" };
    }
  }
  return { label: STAGE_BY_STATUS[status], hint: HINTS[status], saysChanged: false };
}

export type DeadlineInfo = {
  kind: "comment" | "submission";
  /** ISO date, or null when the TOR doesn't state it */
  date: string | null;
  /** What the deadline is for, e.g. "ยื่นข้อเสนอภายใน" */
  label: string;
  /** Said when the TOR doesn't state the date */
  missing: string;
};

type DeadlineFacts = { submissionDeadline: string | null; commentDeadline?: string | null };

/**
 * The deadline that matters now. A draft out for public hearing asks for
 * comments by a date and has no bid date yet; everything else is about bids.
 */
export function deadlineOf(status: TorStatus, facts: DeadlineFacts): DeadlineInfo {
  if (status === "Draft") {
    return {
      kind: "comment",
      date: facts.commentDeadline ?? null,
      label: "ส่งความเห็นร่าง TOR ภายใน",
      missing: "อยู่ระหว่างรับฟังความเห็น",
    };
  }
  return {
    kind: "submission",
    date: facts.submissionDeadline,
    label: "ยื่นข้อเสนอภายใน",
    missing: "ไม่ระบุวันปิดรับข้อเสนอ",
  };
}
