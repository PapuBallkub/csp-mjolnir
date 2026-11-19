"use client";

import Link from "next/link";
import { Clock, ExternalLink } from "lucide-react";
import { Panel } from "../../../../_components/ui";
import { formatTHB } from "../../../../_data/tors";
import type { MatchSnapshot, MatchedTorSummary } from "../../../../_lib/api";

function formatThaiDate(dateStr?: string | null, lang: "th" | "en" = "th") {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString(lang === "th" ? "th-TH" : "en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function calculateDaysRemaining(deadlineStr?: string | null) {
  if (!deadlineStr) return null;
  const deadline = new Date(deadlineStr);
  if (isNaN(deadline.getTime())) return null;
  const now = new Date();
  const diffDays = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return diffDays;
}

export function MatchView({
  snapshot,
  lang,
}: {
  snapshot: MatchSnapshot;
  lang: "th" | "en";
}) {
  const matchedItems: MatchedTorSummary[] = Array.isArray(snapshot.matchedItems)
    ? snapshot.matchedItems
    : [];

  if (matchedItems.length === 0) {
    return (
      <Panel className="p-6 text-center text-ink-3">
        {lang === "th" ? "ไม่มีรายการโครงการในภาพถ่ายนี้" : "No project items in this snapshot."}
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      {matchedItems.map((item, idx) => {
        const daysLeft = calculateDaysRemaining(item.submissionDeadline);

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

            {/* Match Details Callout Box */}
            <div className="mt-4 rounded-md border border-open-line bg-open-bg/40 p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-2">
                  {item.matchScore != null ? (
                    <span className="inline-flex items-center rounded-full bg-open-bg px-2.5 py-1 text-[12px] font-semibold text-open border border-open-line">
                      {Math.round(item.matchScore)}% {lang === "th" ? "ตรงกับคุณ" : "match"}
                    </span>
                  ) : null}
                  {item.submissionDeadline ? (
                    <span className="inline-flex items-center gap-1 text-[12px] text-ink-3">
                      <Clock className="h-3.5 w-3.5" />
                      <span>ปิดรับ: {formatThaiDate(item.submissionDeadline, lang)}</span>
                      {daysLeft != null ? (
                        <span
                          className={`font-medium ${
                            daysLeft <= 3
                              ? "text-red-600 dark:text-red-400"
                              : daysLeft <= 7
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-ink-3"
                          }`}
                        >
                          ({daysLeft > 0 ? `เหลือ ${daysLeft} วัน` : "สิ้นสุดแล้ว"})
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </div>
              </div>

              {/* Matched Skills */}
              {Array.isArray(item.matchedSkills) && item.matchedSkills.length > 0 ? (
                <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-open-line/50 pt-2.5">
                  <span className="text-[11.5px] font-medium text-ink-2">
                    {lang === "th" ? "ทักษะที่ตรง:" : "Matched:"}
                  </span>
                  {item.matchedSkills.map((skill: string) => (
                    <span
                      key={skill}
                      className="rounded bg-surface px-2 py-0.5 text-[11px] font-medium text-ink border border-line"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            {/* Card Footer: View TOR Link */}
            {item.projectId ? (
              <div className="mt-4 flex justify-end">
                <Link
                  href={`/tor/${item.projectId}`}
                  className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-2 hover:text-ink hover:underline cursor-pointer"
                >
                  <span>{lang === "th" ? "เปิดดูรายละเอียดโครงการ TOR" : "View TOR Details"}</span>
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
