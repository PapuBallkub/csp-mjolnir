"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useLang } from "../../../../_components/prefs";
import { btn, Panel } from "../../../../_components/ui";
import { formatTHB } from "../../../../_data/tors";
import * as api from "../../../../_lib/api";
import type { NotificationFeedItem, MatchedTorSummary } from "../../../../_lib/api";

function IconAlertTriangle({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 2.2 1.8 13h12.4L8 2.2Z" />
      <path d="M8 6.5v3M8 11.5h.01" />
    </svg>
  );
}

function IconTarget({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
      <circle cx="8" cy="8" r="5.5" />
      <circle cx="8" cy="8" r="2.2" />
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2" />
    </svg>
  );
}

function IconMail({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="3.5" width="12" height="9" rx="1" />
      <path d="M2.5 4.5 8 9l5.5-4.5" />
    </svg>
  );
}

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

export default function NotificationDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { lang } = useLang();

  const [notification, setNotification] = useState<NotificationFeedItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params?.id) return;

    let active = true;
    setLoading(true);
    setError(null);

    api.fetchNotificationById(params.id).then((res) => {
      if (!active) return;
      setLoading(false);
      if (res.ok) {
        const payload = res.data as any;
        const item: NotificationFeedItem = payload?.notification || payload;
        setNotification(item);
      } else {
        setError(res.error.message || "Failed to load notification");
      }
    });

    return () => {
      active = false;
    };
  }, [params?.id]);

  if (loading) {
    return (
      <div className="mx-auto max-w-[900px] px-4 py-8">
        <div className="mb-4 h-6 w-32 animate-pulse rounded bg-surface-2" />
        <div className="mb-6 h-10 w-2/3 animate-pulse rounded bg-surface-2" />
        <div className="space-y-4">
          <div className="h-32 animate-pulse rounded border border-line bg-surface-2" />
          <div className="h-32 animate-pulse rounded border border-line bg-surface-2" />
        </div>
      </div>
    );
  }

  if (error || !notification) {
    return (
      <div className="mx-auto max-w-[900px] px-4 py-8">
        <Link
          href="/notifications"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-2 hover:text-ink"
        >
          <span>←</span>
          <span>{lang === "th" ? "กลับไปยังรายการแจ้งเตือน" : "Back to notifications"}</span>
        </Link>
        <Panel className="mt-4 p-8 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-600 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400">
            <IconAlertTriangle className="h-5 w-5" />
          </div>
          <h2 className="text-[16px] font-semibold text-ink">
            {lang === "th" ? "ไม่พบข้อมูลการแจ้งเตือน" : "Notification Not Found"}
          </h2>
          <p className="mt-1 text-[13px] text-ink-3">
            {error || (lang === "th" ? "การแจ้งเตือนนี้อาจถูกลบไปแล้ว" : "This notification may have been removed.")}
          </p>
          <button
            type="button"
            onClick={() => router.push("/notifications")}
            className={`${btn.primary} mt-4`}
          >
            {lang === "th" ? "ดูการแจ้งเตือนทั้งหมด" : "View all notifications"}
          </button>
        </Panel>
      </div>
    );
  }

  const snapshot = notification.snapshot || {};
  const matchedItems: MatchedTorSummary[] = Array.isArray(snapshot.matchedItems) ? snapshot.matchedItems : [];

  return (
    <div className="mx-auto max-w-[900px] px-4 py-8">
      {/* Back button */}
      <div className="mb-4">
        <Link
          href="/notifications"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-2 transition-colors hover:text-ink"
        >
          <span>←</span>
          <span>{lang === "th" ? "กลับไปยังรายการแจ้งเตือน" : "Back to notifications"}</span>
        </Link>
      </div>

      {/* Header */}
      <header className="mb-6 rounded-md border border-line bg-surface p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded bg-accent/10 px-2.5 py-0.5 text-[11px] font-semibold text-accent">
              <IconTarget className="h-3.5 w-3.5" />
              <span>
                {notification.type === "match"
                  ? lang === "th"
                    ? "ประกาศใหม่ตรงโปรไฟล์"
                    : "Profile Match Alert"
                  : notification.type}
              </span>
            </span>
            <span className="text-[12px] text-ink-3">
              {formatThaiDate(notification.createdAt, lang)}
            </span>
          </div>
          {notification.emailSent && notification.emailSentAt ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-3">
              <IconMail className="h-3.5 w-3.5" />
              <span>{lang === "th" ? "ส่งอีเมลสรุปแล้ว" : "Email digest sent"}</span>
            </span>
          ) : null}
        </div>

        <div className="mt-3">
          <h1 className="text-[20px] font-semibold tracking-tight text-ink">
            {lang === "th"
              ? `สรุป ${matchedItems.length} โครงการจัดซื้อจัดจ้างที่ตรงกับคุณ`
              : `Summary: ${matchedItems.length} procurement tenders matching your skills`}
          </h1>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
            {lang === "th"
              ? "ระบบตรวจพบคัดกรองโครงการประกาศใหม่บนระบบ e-GP ที่มีข้อกำหนดทางเทคนิคตรงกับทักษะในโปรไฟล์ของคุณ ข้อมูลด้านล่างถูกบันทึกภาพถ่าย (Snapshot) ณ เวลาที่แจ้งเตือน"
              : "Procurement notices detected on e-GP matching your technical capability profile. Data below reflects the frozen snapshot at alert time."}
          </p>
        </div>
      </header>

      {/* Matched Tenders List */}
      <div className="space-y-4">
        {matchedItems.length === 0 ? (
          <Panel className="p-6 text-center text-ink-3">
            {lang === "th" ? "ไม่มีรายการโครงการในภาพถ่ายนี้" : "No project items in this snapshot."}
          </Panel>
        ) : (
          matchedItems.map((item, idx) => {
            const daysLeft = calculateDaysRemaining(item.submissionDeadline);

            return (
              <Panel
                key={item.projectId || idx}
                className="group p-5 transition-shadow hover:shadow-sm"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    {/* Project ID & Agency */}
                    <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
                      {item.projectId ? (
                        <span className="font-mono">{item.projectId}</span>
                      ) : null}
                      <span>•</span>
                      <span>{item.agency || "-"}</span>
                    </div>

                    {/* Title */}
                    <h2 className="mt-1 text-[16px] font-semibold leading-snug text-ink">
                      {item.projectTitle || "-"}
                    </h2>

                    {/* Budget & Deadline */}
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
                      <div>
                        <span className="text-ink-3">
                          {lang === "th" ? "งบประมาณ/ราคากลาง: " : "Reference Budget: "}
                        </span>
                        <span className="font-semibold text-ink">
                          {item.budget != null ? formatTHB(item.budget) : "-"}
                        </span>
                      </div>

                      {daysLeft !== null ? (
                        <div className="flex items-center gap-1">
                          <span className="text-ink-3">
                            {lang === "th" ? "กำหนดยื่นซอง: " : "Deadline: "}
                          </span>
                          <span
                            className={`font-medium ${
                              daysLeft <= 3
                                ? "text-red-600 dark:text-red-400 font-semibold"
                                : daysLeft <= 7
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-ink"
                            }`}
                          >
                            {daysLeft > 0
                              ? lang === "th"
                                ? `อีก ${daysLeft} วัน`
                                : `${daysLeft} days left`
                              : lang === "th"
                              ? "ปิดรับซองแล้ว"
                              : "Closed"}
                          </span>
                        </div>
                      ) : null}
                    </div>

                    {/* Matched Skills pills */}
                    {Array.isArray(item.matchedSkills) && item.matchedSkills.length > 0 ? (
                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] text-ink-3">
                          {lang === "th" ? "ทักษะที่ตรงกัน:" : "Matched skills:"}
                        </span>
                        {item.matchedSkills.map((skill) => (
                          <span
                            key={skill}
                            className="rounded border border-line bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-ink"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  {/* Match Score & Action */}
                  <div className="flex shrink-0 flex-row items-center justify-between gap-3 border-t border-line pt-3 sm:flex-col sm:items-end sm:border-0 sm:pt-0">
                    <div className="text-right">
                      <div className="inline-flex items-center gap-1 rounded-md bg-accent/15 px-2.5 py-1 text-[13px] font-bold text-accent">
                        <span>{item.matchScore}%</span>
                        <span className="text-[11px] font-normal">
                          {lang === "th" ? "ตรงกัน" : "match"}
                        </span>
                      </div>
                    </div>

                    {item.projectId ? (
                      <Link
                        href={`/tor/${encodeURIComponent(item.projectId)}`}
                        className={`${btn.primary} text-[12px] py-1.5 px-3`}
                      >
                        {lang === "th" ? "ดูประกาศ TOR →" : "View full TOR →"}
                      </Link>
                    ) : null}
                  </div>
                </div>
              </Panel>
            );
          })
        )}
      </div>

      {/* Official disclaimer footer per §6 AGENTS.md */}
      <footer className="mt-8 rounded border border-line bg-surface-2 p-4 text-[12px] leading-relaxed text-ink-3">
        <p className="font-semibold text-ink">
          {lang === "th" ? "ข้อความปฏิเสธความรับผิดชอบ (Disclaimer)" : "Disclaimer"}
        </p>
        <p className="mt-1">
          {lang === "th"
            ? "GIPDP เป็นระบบช่วยค้นหาและแจ้งเตือนโอกาสโครงการจัดซื้อจัดจ้างภาครัฐ ข้อมูลข้างต้นถูกบันทึกสำเนา (Snapshot) ณ เวลาที่ระบบประเมินผล การยื่นข้อเสนอและการจัดซื้อจัดจ้างอย่างเป็นทางการทั้งหมดดำเนินการผ่านระบบ e-GP ของกรมบัญชีกลางเท่านั้น"
            : "GIPDP is a third-party discovery and notification platform. Data above represents a frozen snapshot at alert generation time. All official bidding and submissions take place exclusively through the Comptroller General's Department e-GP system."}
        </p>
      </footer>
    </div>
  );
}
