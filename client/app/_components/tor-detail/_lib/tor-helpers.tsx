import type { ChangeRow, TorChange } from "../../../_lib/api";
import {
  CHANGE_SOURCE,
  changeHeading,
  changeWhen,
  describeRow,
  FOUND_NOTE,
  pendingNotice,
} from "../../../_lib/changes";
import { getEgpPackageUrl } from "../../../_lib/format";
import { Panel, SectionHeading } from "../../ui";

export function formatMoney(amount: number | null | undefined): string {
  if (amount == null) return "ไม่ระบุใน TOR";
  return `฿${amount.toLocaleString("en-US")}`;
}

export function formatBenchmarkMoney(amount: number | null | undefined): string {
  if (amount == null) return "ไม่มีข้อมูลอ้างอิง";
  return `฿${amount.toLocaleString("en-US")}`;
}

export function formatSignedDiff(
  amount: number | null | undefined,
  percentage: number | null | undefined,
): { text: string; hasValue: boolean; isPositive: boolean; isNegative: boolean } {
  if (percentage == null || Number.isNaN(percentage)) {
    return { text: "—", hasValue: false, isPositive: false, isNegative: false };
  }
  const sign = percentage > 0 ? "+" : "";
  const pctStr = `${sign}${percentage}%`;
  if (amount != null && !Number.isNaN(amount)) {
    const amtSign = amount > 0 ? "+" : amount < 0 ? "-" : "";
    const amtStr = `${amtSign}฿${Math.abs(amount).toLocaleString("en-US")}`;
    return {
      text: `${pctStr} (${amtStr})`,
      hasValue: true,
      isPositive: percentage > 0,
      isNegative: percentage < 0,
    };
  }
  return {
    text: pctStr,
    hasValue: true,
    isPositive: percentage > 0,
    isNegative: percentage < 0,
  };
}

export function getScopeSize(budget: number | null): { th: string; en: string } {
  if (!budget) return { th: "ไม่ระบุขนาด", en: "Unspecified" };
  if (budget < 5_000_000) return { th: "ทำคนเดียว / ทีมเล็ก", en: "Solo / Small team" };
  if (budget <= 30_000_000) return { th: "ทีมขนาดกลาง (2–5 คน)", en: "Mid-size team" };
  return { th: "องค์กร / บริษัทขนาดใหญ่", en: "Firm-sized" };
}

export function formatDateString(val: string | Date | null | undefined): string {
  if (!val) return "ไม่ระบุใน TOR";
  try {
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return String(val);
    const day = d.getDate();
    const monthTh = [
      "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
      "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
    ][d.getMonth()];
    const yearTh = d.getFullYear() + 543;
    return `${day} ${monthTh} ${yearTh}`;
  } catch {
    return String(val);
  }
}

export function formatCategoryLabel(category: string): string {
  if (category === "Qualification Barrier") {
    return "คุณสมบัติผู้ยื่นข้อเสนอ";
  }
  if (category === "Specification Tailoring") {
    return "กำหนดสเปกเจาะจง";
  }
  if (category === "Vendor Lock-in") {
    return "ผูกขาดผู้ขาย / MAF";
  }
  return category;
}

/** A decision-support section whose analysis hasn't been run: said plainly, never a 0. */
export function NotAnalysed({ heading }: { heading: string }) {
  return (
    <Panel className="px-4 py-5 sm:px-6 sm:py-6">
      <SectionHeading>{heading}</SectionHeading>
      <p className="mt-2 text-[13.5px] leading-thai text-ink-3">
        ยังไม่ได้วิเคราะห์ส่วนนี้ — ระบบจะเปรียบเทียบกับโครงการในอดีตเมื่อมีข้อมูลเพียงพอ
      </p>
    </Panel>
  );
}

/** What changed, in the page's words; the rows it doesn't show are left out. */
export function ChangeRows({ rows }: { rows: ChangeRow[] }) {
  const shown = rows.flatMap((row) => describeRow(row, "th") ?? []);
  if (shown.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-col gap-1 text-[13px] leading-thai">
      {shown.map((row, idx) => (
        <li key={`${row.label}-${idx}`} className="flex flex-wrap gap-x-2">
          <span className="text-ink-3">{row.label}</span>
          <span className="tnum text-ink">{row.text}</span>
        </li>
      ))}
    </ul>
  );
}

/** Both originals a change cites, downloaded from e-GP itself: the original stays the authority. */
export function OriginalLinks({ change }: { change: TorChange }) {
  if (!change.zipId && !change.previousZipId) return null;
  const link = "underline text-ink-2 hover:text-ink";
  return (
    <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] leading-thai">
      <span className="text-ink-3">เอกสารต้นฉบับจาก e-GP:</span>
      {change.previousZipId ? (
        <a href={getEgpPackageUrl(change.previousZipId)} target="_blank" rel="noreferrer" className={link}>
          ดาวน์โหลดฉบับก่อน
        </a>
      ) : null}
      {change.zipId ? (
        <a href={getEgpPackageUrl(change.zipId)} target="_blank" rel="noreferrer" className={link}>
          ดาวน์โหลดฉบับใหม่
        </a>
      ) : null}
    </p>
  );
}

/** Who said it changed: the agency's notice, or the platform's finding, muted like Closed. */
export function ChangeSourceLine({ change }: { change: TorChange }) {
  const when = changeWhen(change, "th");
  const by = CHANGE_SOURCE[change.source]?.by?.th ?? "";
  return (
    <p className="mt-0.5 text-[12px] leading-thai text-ink-3">
      {by}
      {when ? <span className="tnum"> · {when}</span> : null}
    </p>
  );
}

export function FoundNote() {
  return (
    <p className="mt-2 rounded-[2px] border border-dashed border-closed-line bg-surface px-2.5 py-1.5 text-[12.5px] leading-thai text-ink-2">
      {FOUND_NOTE.th}
    </p>
  );
}

/**
 * Said before anyone reads the summary, while it predates a change (ADR 0032):
 * the TOR changed and the new document isn't read yet. What changed in the
 * facts shows, with both originals.
 */
export function ChangeNotice({ change }: { change: TorChange }) {
  const { title, body } = pendingNotice(change);
  return (
    <div className="mt-3 max-w-4xl rounded-[3px] border border-l-[4px] border-amend-line border-l-amend bg-amend-bg px-3.5 py-3">
      <p className="text-[14px] font-semibold leading-thai text-amend">{title.th}</p>
      <ChangeSourceLine change={change} />
      <p className="mt-1 text-[12.5px] leading-thai text-ink-2">{body.th}</p>
      {change.source === "package" ? <FoundNote /> : null}
      <ChangeRows rows={change.changes} />
      <OriginalLinks change={change} />
    </div>
  );
}

/** One change in the history: worded by the stage that changed, as text, not a badge. */
export function ChangeEntry({ change }: { change: TorChange }) {
  const heading = changeHeading(change.stage);
  const nothingShown = change.changes.every((row) => describeRow(row, "th") === null);
  return (
    <li className="border-l-2 border-line pl-3.5">
      <p className="text-[14px] font-semibold leading-thai text-ink">{heading.th}</p>
      <ChangeSourceLine change={change} />
      {change.source === "package" ? <FoundNote /> : null}
      <ChangeRows rows={change.changes} />
      {change.rereadPending ? (
        <p className="mt-2 text-[12px] leading-thai text-ink-3">
          รายการแก้ไขในเนื้อหา TOR จะแสดงหลังการประมวลผลฉบับใหม่
        </p>
      ) : nothingShown ? (
        <p className="mt-2 text-[12px] leading-thai text-ink-3">
          ไม่พบความต่างในค่าที่ระบบเทียบ ดูรายละเอียดจากเอกสารต้นฉบับ
        </p>
      ) : null}
      <OriginalLinks change={change} />
    </li>
  );
}
