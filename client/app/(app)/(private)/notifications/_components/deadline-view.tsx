"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Panel } from "../../../../_components/ui";
import { formatTHB } from "../../../../_data/tors";
import { formatThaiDateTime as formatThaiDate } from "../../../../_lib/deadline";
import type { DeadlineSnapshot } from "../../../../_lib/api";

type SingleDeadlineItem = {
  projectId: string;
  projectTitle: string;
  agency?: string;
  budget?: number | null;
  deadlineType?: string;
  deadlineDate?: string | Date | null;
  daysRemaining: number;
};

export function DeadlineView({
  snapshot,
}: {
  snapshot: DeadlineSnapshot & { items?: SingleDeadlineItem[] };
}) {
  const items: SingleDeadlineItem[] =
    Array.isArray(snapshot.items) && snapshot.items.length > 0
      ? snapshot.items
      : [
          {
            projectId: snapshot.projectId,
            projectTitle: snapshot.projectTitle,
            agency: snapshot.agency,
            budget: snapshot.budget,
            deadlineType: snapshot.deadlineType,
            deadlineDate: snapshot.deadlineDate,
            daysRemaining: snapshot.daysRemaining,
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

          {/* Countdown Callout Box */}
          <div className="mt-4 rounded-md border border-orange-300 bg-orange-50/60 p-4 dark:border-orange-800/80 dark:bg-orange-950/20">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <span className="text-[12px] font-medium text-orange-900 dark:text-orange-300">
                  {item.deadlineType === "comment"
                    ? "แจ้งเตือนกำหนดสิ้นสุดการรับฟังความคิดเห็น"
                    : "แจ้งเตือนกำหนดเวลาสิ้นสุดการยื่นข้อเสนอ"}
                </span>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-[26px] font-bold text-orange-600 dark:text-orange-400">
                    {item.daysRemaining}
                  </span>
                  <span className="text-[14px] font-semibold text-orange-950 dark:text-orange-200">
                    วันสุดท้ายก่อนปิดรับ
                  </span>
                </div>
              </div>
              {item.deadlineDate ? (
                <div className="rounded border border-orange-200 bg-surface/80 p-2.5 text-left sm:text-right dark:border-orange-900/40">
                  <span className="text-[11px] text-ink-3">
                    วันและเวลาปิดรับข้อเสนอ
                  </span>
                  <p className="mt-0.5 text-[13.5px] font-semibold text-ink">
                    {formatThaiDate(item.deadlineDate)}
                  </p>
                </div>
              ) : null}
            </div>
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
      ))}
    </div>
  );
}
