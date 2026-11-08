"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  INITIAL_MOCK_NOTIFICATIONS,
  type NotificationItem,
  type MatchedTorSummary,
} from "../../../../_data/notifications";
import { formatTHBCompact, pick } from "../../../../_data/tors";
import { useLang } from "../../../../_components/prefs";
import { btn, Panel } from "../../../../_components/ui";
import { StatusBadge } from "../../../../_components/verdict";

export default function NotificationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { lang } = useLang();
  const [notif, setNotif] = useState<NotificationItem | null>(null);

  useEffect(() => {
    const item = INITIAL_MOCK_NOTIFICATIONS.find((n) => n.id === id);
    if (item) {
      item.isRead = true;
      setNotif({ ...item, isRead: true });
    }
  }, [id]);

  if (!notif) {
    const item = INITIAL_MOCK_NOTIFICATIONS.find((n) => n.id === id);
    if (!item) return notFound();
  }

  const item = notif || INITIAL_MOCK_NOTIFICATIONS.find((n) => n.id === id)!;
  const { snapshot } = item;

  const formattedDate = new Date(item.createdAt).toLocaleDateString(
    lang === "th" ? "th-TH" : "en-US",
    {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }
  );

  return (
    <div className="mx-auto max-w-[950px] px-4 py-8">
      {/* Back button */}
      <nav className="mb-6">
        <Link
          href="/notifications"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-2 transition-colors hover:text-ink"
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10 12L6 8l4-4" />
          </svg>
          {lang === "th" ? "กลับไปหน้ารวมการแจ้งเตือน" : "Back to Notifications Feed"}
        </Link>
      </nav>

      {/* Snapshot Audit Badge */}
      <div className="mb-4 inline-flex items-center gap-2 rounded-[4px] border border-line bg-surface-2 px-3 py-1 text-[11px] font-mono text-ink-3">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        <span>
          {lang === "th"
            ? `บันทึก Snapshot เมื่อ: ${formattedDate} (ข้อมูลคงที่ ณ เวลาแจ้งเตือน)`
            : `Snapshot recorded on: ${formattedDate} (Immutable audit snapshot)`}
        </span>
      </div>

      {/* Header Card */}
      <Panel className="mb-6 p-6">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 rounded-[3px] border border-emerald-600/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {lang === "th" ? "พบโครงการตรงโปรไฟล์" : "Matched Tenders"}
          </span>
          <span className="text-[12px] font-mono text-ink-3">ID: {item.id}</span>
        </div>

        <h1 className="mt-3 text-[22px] font-semibold leading-tight tracking-tight text-ink">
          {pick(item.title, lang)}
        </h1>

        <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
          {pick(item.body, lang)}
        </p>
      </Panel>

      {/* Matched TORs List Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-semibold text-ink">
            {lang === "th"
              ? `รายการโครงการที่ตรงกับคุณ (${snapshot.matchedItems.length} โครงการ)`
              : `Matched Tenders (${snapshot.matchedItems.length} items)`}
          </h2>
          <span className="text-[12px] text-ink-3">
            {lang === "th" ? "เรียงตามคะแนนความเข้ากันได้" : "Ranked by match score"}
          </span>
        </div>

        {snapshot.matchedItems.map((tor: MatchedTorSummary, index: number) => (
          <Panel key={tor.projectId} className="p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-[3px] bg-emerald-500/15 px-2 py-0.5 font-mono text-[12px] font-bold text-emerald-700 dark:text-emerald-300">
                    {tor.matchScore}% ตรงกัน
                  </span>
                  {tor.status && (
                    <StatusBadge
                      status={tor.status}
                      isAmended={tor.isAmended}
                      lang={lang}
                    />
                  )}
                  <span className="text-[12px] font-mono text-ink-3">
                    ID: {tor.projectId}
                  </span>
                </div>

                <h3 className="mt-2 text-[16px] font-semibold text-ink">
                  {tor.projectTitle}
                </h3>
                <p className="mt-0.5 text-[13px] text-ink-2">{tor.agency}</p>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
                  <div>
                    <span className="text-ink-3">{lang === "th" ? "งบประมาณ:" : "Budget:"}</span>{" "}
                    <span className="font-semibold text-ink">{formatTHBCompact(tor.budget)}</span>
                  </div>
                  {tor.daysLeft !== undefined && tor.daysLeft > 0 && (
                    <div>
                      <span className="text-ink-3">{lang === "th" ? "เวลาที่เหลือ:" : "Time left:"}</span>{" "}
                      <span className="font-medium text-amber-600 dark:text-amber-400">
                        {tor.daysLeft} วัน
                      </span>
                    </div>
                  )}
                </div>

                {/* Skills breakdown */}
                <div className="mt-3">
                  <span className="text-[11px] font-medium text-ink-3">
                    {lang === "th" ? "ทักษะที่ตรงกัน:" : "Matched Skills:"}
                  </span>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {tor.matchedSkills.map((skill) => (
                      <span
                        key={skill}
                        className="rounded-[2px] border border-line bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-ink"
                      >
                        ✓ {skill}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Action Button for each TOR */}
              <div className="shrink-0 md:pt-1">
                <Link
                  href={`/tor/${tor.projectId}`}
                  className={`${btn} border-ink bg-ink text-surface hover:opacity-90 inline-flex items-center gap-1.5 text-[13px]`}
                >
                  <span>{lang === "th" ? "เปิดดูประกาศ TOR ฉบับเต็ม" : "View Full TOR"}</span>
                  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 3l5 5-5 5" />
                  </svg>
                </Link>
              </div>
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}
