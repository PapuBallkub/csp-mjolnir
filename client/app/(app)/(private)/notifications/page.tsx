"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLang } from "../../../_components/prefs";
import { btn, Panel } from "../../../_components/ui";
import { formatTHBCompact } from "../../../_data/tors";
import * as api from "../../../_lib/api";
import type { NotificationFeedItem } from "../../../_lib/api";

function IconBell({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
      <path d="M4 6.5a4 4 0 1 1 8 0c0 3 1 4 1 4H3s1-1 1-4Z" />
      <path d="M6.5 13a1.6 1.6 0 0 0 3 0" />
    </svg>
  );
}

function IconWrench({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

function IconTarget({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
      <circle cx="8" cy="8" r="5.5" />
      <circle cx="8" cy="8" r="2.2" />
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2" />
    </svg>
  );
}

function IconAmendment({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 2.5h6l3 3v8h-9z" />
      <path d="M9.5 2.5v3h3" />
      <path d="M6 9h4M6 11.5h2.5" />
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

function IconCheck({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
    </svg>
  );
}

function NotificationTypeIcon({ type }: { type: string }) {
  if (type === "match") {
    return <IconTarget className="h-4 w-4 text-accent" />;
  }
  if (type === "amendment") {
    return <IconAmendment className="h-4 w-4 text-amber-600 dark:text-amber-400" />;
  }
  return <IconBell className="h-4 w-4 text-ink-2" />;
}

function formatRelativeTime(dateStr: string, lang: "th" | "en") {
  const d = new Date(dateStr);
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diffSec < 60) return lang === "th" ? "เมื่อสักครู่" : "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return lang === "th" ? `${diffMin} นาทีที่แล้ว` : `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return lang === "th" ? `${diffHour} ชั่วโมงที่แล้ว` : `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return lang === "th" ? `${diffDay} วันที่แล้ว` : `${diffDay}d ago`;
  return d.toLocaleDateString(lang === "th" ? "th-TH" : "en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function NotificationsPage() {
  const { lang } = useLang();

  // Inbox Feed State
  const [notifications, setNotifications] = useState<NotificationFeedItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [feedLoading, setFeedLoading] = useState(true);
  const [filterMode, setFilterMode] = useState<"all" | "unread">("all");
  const [markingAll, setMarkingAll] = useState(false);

  // Fetch notifications on mount
  useEffect(() => {
    let active = true;
    setFeedLoading(true);

    api.fetchNotifications().then((res) => {
      if (!active) return;
      setFeedLoading(false);
      if (res.ok) {
        setNotifications(res.data.notifications || []);
        setUnreadCount(res.data.unreadCount || 0);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  async function handleMarkAllRead() {
    if (markingAll || unreadCount === 0) return;
    setMarkingAll(true);
    const res = await api.markAllNotificationsRead();
    setMarkingAll(false);
    if (res.ok) {
      setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true })));
      setUnreadCount(0);
    }
  }

  async function handleMarkSingleRead(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const res = await api.markNotificationRead(id);
    if (res.ok) {
      setNotifications((prev) =>
        prev.map((item) => (item._id === id ? { ...item, isRead: true } : item))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
  }

  const filteredNotifications = notifications.filter((item) => {
    if (filterMode === "unread") return !item.isRead;
    return true;
  });

  return (
    <div className="mx-auto max-w-[1000px] px-4 py-6">
      {/* Page Header */}
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[26px] leading-tight font-semibold tracking-tight text-ink">
            {lang === "th" ? "การแจ้งเตือน" : "Notifications"}
          </h1>
          <p className="mt-1 max-w-2xl text-[14px] leading-thai text-ink-2">
            {lang === "th"
              ? "แจ้งเตือนประกาศจัดซื้อจัดจ้างภาครัฐใหม่ตรงกับโปรไฟล์ และการเปลี่ยนแปลงของโครงการที่คุณติดตาม"
              : "Alerts for new government tenders matching your profile and updates on your watched projects."}
          </p>
        </div>

        {/* Link to Profile Settings */}
        <div className="shrink-0">
          <Link
            href="/profile"
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-2 hover:text-ink transition-colors"
          >
            <IconWrench className="h-3.5 w-3.5" />
            <span>{lang === "th" ? "ตั้งค่าโปรไฟล์และทักษะ" : "Profile & Skills Settings"}</span>
          </Link>
        </div>
      </header>

      {/* Subheader Filters & Mark All Read */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <div className="flex items-center gap-1.5 rounded-md border border-line bg-surface p-1">
          <button
            type="button"
            onClick={() => setFilterMode("all")}
            className={`rounded px-3 py-1 text-[12px] font-medium transition-colors ${
              filterMode === "all"
                ? "bg-surface-3 text-ink font-semibold shadow-xs"
                : "text-ink-3 hover:text-ink"
            }`}
          >
            {lang === "th" ? "ทั้งหมด" : "All"} ({notifications.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode("unread")}
            className={`rounded px-3 py-1 text-[12px] font-medium transition-colors ${
              filterMode === "unread"
                ? "bg-surface-3 text-ink font-semibold shadow-xs"
                : "text-ink-3 hover:text-ink"
            }`}
          >
            {lang === "th" ? "ยังไม่อ่าน" : "Unread"} ({unreadCount})
          </button>
        </div>

        {unreadCount > 0 ? (
          <button
            type="button"
            onClick={handleMarkAllRead}
            disabled={markingAll}
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-2 hover:text-ink hover:underline disabled:opacity-50"
          >
            <IconCheck className="h-3.5 w-3.5 text-accent" />
            <span>
              {markingAll
                ? lang === "th"
                  ? "กำลังดำเนินการ…"
                  : "Marking…"
                : lang === "th"
                ? "ทำเครื่องหมายว่าอ่านทั้งหมดแล้ว"
                : "Mark all as read"}
            </span>
          </button>
        ) : null}
      </div>

      {/* Feed Content */}
      {feedLoading ? (
        <div className="space-y-3">
          <div className="h-24 animate-pulse rounded border border-line bg-surface-2" />
          <div className="h-24 animate-pulse rounded border border-line bg-surface-2" />
          <div className="h-24 animate-pulse rounded border border-line bg-surface-2" />
        </div>
      ) : filteredNotifications.length === 0 ? (
        <Panel className="p-12 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-line bg-surface-2 text-ink-3">
            <IconBell className="h-6 w-6" />
          </div>
          <h3 className="text-[15px] font-semibold text-ink">
            {filterMode === "unread"
              ? lang === "th"
                ? "ไม่มีการแจ้งเตือนที่ยังไม่ได้อ่าน"
                : "No unread notifications"
              : lang === "th"
              ? "ยังไม่มีการแจ้งเตือน"
              : "No notifications yet"}
          </h3>
          <p className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-ink-3">
            {lang === "th"
              ? "เมื่อมีประกาศจัดซื้อจัดจ้างใหม่ตรงกับทักษะของคุณ หรือโครงการในรายการติดตามมีการแก้ไข ระบบจะแจ้งเตือนให้คุณทราบที่นี่"
              : "When new procurement notices match your skills or watched projects change, alerts will appear here."}
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Link href="/profile" className={btn.secondary}>
              {lang === "th" ? "จัดการทักษะในโปรไฟล์" : "Update Profile Skills"}
            </Link>
            <Link href="/search" className={btn.ghost}>
              {lang === "th" ? "ค้นหาประกาศ TOR" : "Browse Tenders"}
            </Link>
          </div>
        </Panel>
      ) : (
        <div className="space-y-3">
          {filteredNotifications.map((item) => {
            const snapshot = item.snapshot || {};
            const matchedItems = Array.isArray(snapshot.matchedItems) ? snapshot.matchedItems : [];
            const firstItem = matchedItems[0];

            return (
              <Link
                key={item._id}
                href={`/notifications/${item._id}`}
                className={`group relative block rounded-md border p-4 transition-all hover:border-line-2 hover:shadow-xs ${
                  !item.isRead
                    ? "border-accent/40 bg-accent/5 dark:bg-accent/10"
                    : "border-line bg-surface"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    {/* Icon */}
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-ink-2">
                      <NotificationTypeIcon type={item.type} />
                    </div>

                    {/* Title & Preview */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[14px] font-semibold text-ink group-hover:text-accent transition-colors">
                          {item.type === "match"
                            ? lang === "th"
                              ? `พบ ${matchedItems.length} โครงการใหม่ที่ตรงกับโปรไฟล์ของคุณ`
                              : `Found ${matchedItems.length} new tenders matching your profile`
                            : item.type === "amendment"
                            ? lang === "th"
                              ? "โครงการที่คุณติดตามมีการแก้ไข TOR"
                              : "A watched project was amended"
                            : item.type}
                        </span>
                        {!item.isRead ? (
                          <span className="flex h-2 w-2 rounded-full bg-accent" aria-label="Unread" />
                        ) : null}
                      </div>

                      {/* Subtitle / summary */}
                      {firstItem ? (
                        <p className="mt-1 line-clamp-1 text-[13px] text-ink-2">
                          <span className="font-medium text-ink">{firstItem.projectTitle}</span>
                          {firstItem.agency ? ` • ${firstItem.agency}` : ""}
                          {firstItem.budget != null ? ` • ${formatTHBCompact(firstItem.budget)}` : ""}
                        </p>
                      ) : null}

                      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-ink-3">
                        <span>{formatRelativeTime(item.createdAt, lang)}</span>
                        {item.emailSent && item.emailSentAt ? (
                          <span className="inline-flex items-center gap-1">
                            <IconMail className="h-3 w-3" />
                            <span>{lang === "th" ? "ส่งอีเมลแล้ว" : "Emailed"}</span>
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {/* Right quick actions */}
                  <div className="flex shrink-0 items-center gap-2">
                    {!item.isRead ? (
                      <button
                        type="button"
                        onClick={(e) => handleMarkSingleRead(item._id, e)}
                        title={lang === "th" ? "ทำเครื่องหมายว่าอ่านแล้ว" : "Mark as read"}
                        className="rounded p-1 text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink"
                      >
                        <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 8.5l3.5 3.5L13 5" />
                        </svg>
                      </button>
                    ) : null}
                    <span className="text-[13px] text-ink-3 group-hover:translate-x-0.5 transition-transform">
                      →
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
