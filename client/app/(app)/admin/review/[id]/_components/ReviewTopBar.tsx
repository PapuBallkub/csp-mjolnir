import Link from "next/link";
import { FileText, Search } from "lucide-react";
import { btn } from "../../../../../_components/ui";
import { confidenceTone } from "./ReviewFieldPrimitives";

export function ReviewTopBar({
  projectId,
  extraction,
  currentVersion,
  diffCount,
  hasEvidence,
  isReExtracting,
  isSaving,
  hasValidationErrors,
  onOpenVersions,
  onOpenPdf,
  onOpenEvidence,
  onReExtract,
  onOpenReclassify,
}: {
  projectId: string;
  extraction: number;
  currentVersion: number | null;
  diffCount: number;
  hasEvidence: boolean;
  isReExtracting: boolean;
  isSaving: boolean;
  hasValidationErrors: boolean;
  onOpenVersions: () => void;
  onOpenPdf: () => void;
  onOpenEvidence: () => void;
  onReExtract: () => void;
  onOpenReclassify: () => void;
}) {
  return (
    <div className="sticky top-[53px] z-20 mb-6 flex flex-col gap-2.5 rounded-2xl border border-line bg-surface/95 px-4 py-2.5 backdrop-blur shadow-sm xl:flex-row xl:items-center xl:justify-between">
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <Link
          href="/admin?job=review"
          className="text-[12px] font-medium text-ink-3 hover:text-ink transition-colors flex items-center gap-1 shrink-0"
        >
          <span>←</span>
          <span>{"คิวตรวจทาน"}</span>
        </Link>
        <span className="text-line-2">|</span>
        <span className="font-mono text-[12px] font-bold text-ink shrink-0">{projectId}</span>
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium font-mono shrink-0 ${confidenceTone(extraction)}`}>
          {Math.round(extraction * 100)}%
        </span>
        {currentVersion ? (
          <button
            type="button"
            onClick={onOpenVersions}
            className="rounded-full border border-line bg-surface-2 px-2.5 py-0.5 text-[11px] font-mono text-ink-2 hover:border-ink hover:text-ink transition-colors cursor-pointer shrink-0"
            title={"ดูประวัติเวอร์ชันและย้อนกลับ"}
          >
            v{currentVersion} ↗
          </button>
        ) : null}
        {diffCount > 0 && (
          <span className="rounded-full border border-amend-line bg-amend-bg px-2.5 py-0.5 text-[11px] font-medium text-amend shrink-0 flex items-center gap-1">
            <span>●</span>
            <span>{`แก้ไข ${diffCount} รายการ`}</span>
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 xl:justify-end">
        <button
          type="button"
          onClick={onOpenPdf}
          className={`${btn.secondary} text-[11px] h-7 px-2 flex items-center gap-1 shrink-0`}
          title={"พรีวิวเอกสาร PDF ต้นฉบับ"}
        >
          <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{"พรีวิว PDF"}</span>
        </button>
        {hasEvidence ? (
          <button
            type="button"
            onClick={onOpenEvidence}
            className={`${btn.secondary} text-[11px] h-7 px-2 flex items-center gap-1 shrink-0`}
          >
            <Search className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{"หลักฐาน TOR"}</span>
          </button>
        ) : null}
        <a
          href={`/tor/${projectId}`}
          target="_blank"
          rel="noreferrer"
          className={`${btn.secondary} text-[11px] h-7 px-2 flex items-center gap-1 shrink-0`}
        >
          <span>{"ดูหน้าเว็บ"}</span>
          <span className="text-[10px] opacity-75">↗</span>
        </a>
        <button
          type="button"
          disabled={isReExtracting}
          onClick={onReExtract}
          className={`${btn.secondary} text-[11px] h-7 px-2 text-ink-2 shrink-0`}
        >
          {isReExtracting ? "กำลังส่งอ่าน..." : "ส่งอ่านใหม่"}
        </button>
        <button
          type="button"
          onClick={onOpenReclassify}
          className="inline-flex items-center justify-center gap-1.5 rounded-full border border-risk-line bg-risk-bg px-4 h-9 text-[13px] font-medium text-risk hover:opacity-85 transition-opacity cursor-pointer shrink-0"
        >
          {"คัดออก"}
        </button>
        <button
          type="submit"
          form="review-form"
          disabled={isSaving || hasValidationErrors}
          className={`${btn.primary} text-[13px] h-9 px-4 font-semibold shrink-0 cursor-pointer`}
        >
          {isSaving ? "กำลังบันทึก..." : "บันทึกและอนุมัติ"}
        </button>
      </div>
    </div>
  );
}
