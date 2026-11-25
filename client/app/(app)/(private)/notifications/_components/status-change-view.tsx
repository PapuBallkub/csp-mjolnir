"use client";

import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import { StatusBadge } from "../../../../_components/verdict";
import { Panel } from "../../../../_components/ui";
import { formatTHB, type Status } from "../../../../_data/tors";
import { formatThaiDateTime as formatThaiDate } from "../../../../_lib/deadline";
import type { StatusSnapshot } from "../../../../_lib/api";

type SingleStatusItem = {
  projectId: string;
  projectTitle: string;
  agency?: string;
  budget?: number | null;
  previousStatus: string;
  newStatus: string;
  changedAt?: string | Date;
};

export function StatusChangeView({
  snapshot,
}: {
  snapshot: StatusSnapshot & { items?: SingleStatusItem[] };
}) {
  const items: SingleStatusItem[] =
    Array.isArray(snapshot.items) && snapshot.items.length > 0
      ? snapshot.items
      : [
          {
            projectId: snapshot.projectId,
            projectTitle: snapshot.projectTitle,
            agency: snapshot.agency,
            budget: snapshot.budget,
            previousStatus: snapshot.previousStatus,
            newStatus: snapshot.newStatus,
            changedAt: snapshot.changedAt,
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
      {items.map((item, idx) => {
        const prev = (item.previousStatus as Status) || "Open";
        const next = (item.newStatus as Status) || "Open";

        return (
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

            {/* Status Transition Callout Box */}
            <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-900/60 dark:bg-blue-950/20">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex flex-col items-start gap-1">
                  <span className="text-[11px] text-ink-3">
                    สถานะเดิมเมื่อบันทึก
                  </span>
                  <StatusBadge status={prev} size="large" />
                </div>
                <ArrowRight className="h-5 w-5 text-ink-3" />
                <div className="flex flex-col items-start gap-1">
                  <span className="text-[11px] text-ink-3">
                    สถานะปัจจุบัน
                  </span>
                  <StatusBadge status={next} size="large" />
                </div>
              </div>
              {item.changedAt ? (
                <p className="mt-3 text-[11.5px] text-ink-3">
                  {`ตรวจพบการเปลี่ยนสถานะเมื่อ: ${formatThaiDate(item.changedAt)}`}
                </p>
              ) : null}
            </div>

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
        );
      })}
    </div>
  );
}
