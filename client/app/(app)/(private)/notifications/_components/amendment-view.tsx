"use client";

import Link from "next/link";
import { ExternalLink, FileText } from "lucide-react";
import { Panel } from "../../../../_components/ui";
import { formatTHB } from "../../../../_data/tors";
import { formatThaiDateTime as formatThaiDate } from "../../../../_lib/deadline";
import type { AmendmentSnapshot } from "../../../../_lib/api";

type SingleAmendmentItem = {
  projectId: string;
  projectTitle: string;
  agency?: string;
  budget?: number | null;
  amendmentHeadline?: string;
  changedFields?: string[];
  changedFieldsTh?: string[];
  detectedAt?: string | Date;
};

export function AmendmentView({
  snapshot,
}: {
  snapshot: AmendmentSnapshot & { items?: SingleAmendmentItem[] };
}) {
  const items: SingleAmendmentItem[] =
    Array.isArray(snapshot.items) && snapshot.items.length > 0
      ? snapshot.items
      : [
          {
            projectId: snapshot.projectId,
            projectTitle: snapshot.projectTitle,
            agency: snapshot.agency,
            budget: snapshot.budget,
            amendmentHeadline: snapshot.amendmentHeadline,
            changedFields: snapshot.changedFields,
            changedFieldsTh: snapshot.changedFieldsTh,
            detectedAt: snapshot.detectedAt,
          },
        ];

  if (items.length === 0 || !items[0].projectTitle) {
    return (
      <Panel className="p-6 text-center text-ink-3">
        ไม่มีรายการโครงการในภาพถ่ายนี้
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      {items.map((item, idx) => (
        <Panel key={item.projectId || idx} className="p-5 shadow-xs">
          {/* Meta row: projectId • agency on left, budget on right */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
              {item.projectId ? (
                <span className="font-mono font-medium text-ink">{item.projectId}</span>
              ) : null}
              {item.agency ? (
                <>
                  <span>•</span>
                  <span>{item.agency}</span>
                </>
              ) : null}
            </div>
            {item.budget != null ? (
              <span className="font-mono text-[13px] font-medium text-ink">
                {formatTHB(item.budget)}
              </span>
            ) : null}
          </div>

          {/* Project Title */}
          <h3 className="mt-3 text-[15px] font-semibold text-ink leading-snug">
            {item.projectTitle}
          </h3>

          {/* Amendment Callout Box */}
          <div className="mt-4 rounded-md border border-amber-300 bg-amber-50/70 p-4 dark:border-amber-800/80 dark:bg-amber-950/30">
            <div className="flex items-start gap-2.5">
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
              <div>
                <h4 className="text-[13.5px] font-semibold text-amber-950 dark:text-amber-100">
                  สรุปการแก้ไขเอกสาร TOR
                </h4>
                <p className="mt-1 text-[13.5px] leading-relaxed text-amber-900 dark:text-amber-200">
                  “{item.amendmentHeadline || "มีการแก้ไขเปลี่ยนแปลงข้อกำหนดหรือเอกสารโครงการ"}”
                </p>
                {item.detectedAt ? (
                  <p className="mt-2 text-[12px] text-amber-800/80 dark:text-amber-400">
                    {`ตรวจพบการแก้ไขเมื่อ: ${formatThaiDate(item.detectedAt)}`}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          {/* Changed Sections Tags */}
          {Array.isArray(item.changedFieldsTh) && item.changedFieldsTh.length > 0 ? (
            <div className="mt-3.5">
              <h5 className="text-[12px] font-medium text-ink-2">
                ส่วนที่มีการเปลี่ยนแปลงในเอกสาร:
              </h5>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {item.changedFieldsTh.map((f, fIdx) => (
                  <span
                    key={fIdx}
                    className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-ink"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    <span>{f}</span>
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {/* Card Footer: View TOR Link */}
          {item.projectId ? (
            <div className="mt-4 flex justify-end">
              <Link
                href={`/tor/${item.projectId}`}
                className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-2 hover:text-ink hover:underline cursor-pointer"
              >
                <span>เปิดดูรายละเอียดโครงการ TOR</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </div>
          ) : null}
        </Panel>
      ))}
    </div>
  );
}
