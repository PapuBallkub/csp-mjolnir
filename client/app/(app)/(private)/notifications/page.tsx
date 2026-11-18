"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  ArrowRightLeft,
  Bell,
  BowArrow,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  FileEdit,
  Mail,
  Wrench,
} from "lucide-react";
import { useLang, useProfile } from "../../../_components/prefs";
import { StatusBadge } from "../../../_components/verdict";
import { btn, Panel } from "../../../_components/ui";
import { formatTHBCompact } from "../../../_data/tors";
import { isProfileBaseline } from "../../../_lib/match";
import * as api from "../../../_lib/api";
import type {
  NotificationFeedItem,
  MatchedTorSummary,
  AmendmentSnapshot,
  StatusSnapshot,
  DeadlineSnapshot,
} from "../../../_lib/api";
import type { Status } from "../../../_data/tors";

function NotificationTypeIcon({ type }: { type: string }) {
  if (type === "match") {
    return <BowArrow className="h-4 w-4 text-open" />;
  }
  if (type === "amendment") {
    return <FileEdit className="h-4 w-4 text-amber-600 dark:text-amber-400" />;
  }
  if (type === "status_change") {
    return <ArrowRightLeft className="h-4 w-4 text-blue-600 dark:text-blue-400" />;
  }
  if (type === "deadline") {
    return <Clock className="h-4 w-4 text-orange-600 dark:text-orange-400" />;
  }
  return <Bell className="h-4 w-4 text-ink-2" />;
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
  const { profile } = useProfile();

  const isProfileEmpty = isProfileBaseline(profile);

  // Inbox Feed State
  const [notifications, setNotifications] = useState<NotificationFeedItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [feedLoading, setFeedLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | "unread">("all");
  const [typeFilter, setTypeFilter] = useState<
    "all" | "match" | "status_change" | "amendment" | "deadline"
  >("all");
  const [markingAll, setMarkingAll] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Fetch notifications on mount
  useEffect(() => {
    let active = true;

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
    setShowConfirmModal(false);
    if (res.ok) {
      setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true })));
      setUnreadCount(0);
      window.dispatchEvent(
        new CustomEvent("notifications-updated", { detail: { unreadCount: 0 } })
      );
    }
  }

  const matchCount = notifications.filter((item) => item.type === "match").length;
  const statusCount = notifications.filter((item) => item.type === "status_change").length;
  const amendmentCount = notifications.filter((item) => item.type === "amendment").length;
  const deadlineCount = notifications.filter((item) => item.type === "deadline").length;

  const filteredNotifications = notifications.filter((item) => {
    if (statusFilter === "unread" && item.isRead) return false;
    if (typeFilter !== "all" && item.type !== typeFilter) return false;
    return true;
  });

  return (
    <div className="flex flex-1 flex-col justify-between">
      <div className="mx-auto w-full max-w-[1000px] flex-1 px-4 pt-6 pb-8">
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
              <Wrench className="h-3.5 w-3.5" />
              <span>{lang === "th" ? "ตั้งค่าโปรไฟล์และทักษะ" : "Profile & Skills Settings"}</span>
            </Link>
          </div>
        </header>

        {/* Subheader Filters: Read Status on Left, Type Dropdown & Actions on Right */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
          {/* Read Status Tabs (All vs Unread) */}
          <div className="flex items-center gap-1.5 rounded-md border border-line bg-surface p-1 shadow-2xs">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={`rounded px-3 py-1 text-[12px] font-medium transition-colors cursor-pointer ${
                statusFilter === "all"
                  ? "bg-surface-3 text-ink font-semibold shadow-xs"
                  : "text-ink-3 hover:text-ink"
              }`}
            >
              {lang === "th" ? "ทั้งหมด" : "All"} ({notifications.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("unread")}
              className={`rounded px-3 py-1 text-[12px] font-medium transition-colors cursor-pointer ${
                statusFilter === "unread"
                  ? "bg-surface-3 text-ink font-semibold shadow-xs"
                  : "text-ink-3 hover:text-ink"
              }`}
            >
              {lang === "th" ? "ยังไม่อ่าน" : "Unread"} ({unreadCount})
            </button>
          </div>

          {/* Right Controls: Mark All Read + Type Dropdown */}
          <div className="flex flex-wrap items-center gap-3">
            {unreadCount > 0 ? (
              <button
                type="button"
                onClick={() => setShowConfirmModal(true)}
                disabled={markingAll}
                className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-2 hover:text-ink hover:underline disabled:opacity-50 cursor-pointer"
              >
                <Check className="h-3.5 w-3.5 text-open" />
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

            {/* Type Dropdown Filter */}
            <div className="flex items-center gap-2">
              <label
                htmlFor="notification-type-filter"
                className="text-[12px] font-medium text-ink-3 shrink-0"
              >
                {lang === "th" ? "ประเภท:" : "Type:"}
              </label>
              <div className="relative">
                <select
                  id="notification-type-filter"
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as any)}
                  className="h-8 rounded-md border border-line bg-surface pl-2.5 pr-8 text-[12px] font-medium text-ink transition-colors hover:border-line-2 focus:border-ink focus:outline-none cursor-pointer appearance-none shadow-xs"
                >
                  <option value="all">
                    {lang === "th" ? "ทุกประเภท" : "All types"}
                  </option>
                  <option value="match">
                    {lang === "th"
                      ? `ตรงโปรไฟล์ (${matchCount})`
                      : `Profile Match (${matchCount})`}
                  </option>
                  <option value="status_change">
                    {lang === "th"
                      ? `เปลี่ยนสถานะ (${statusCount})`
                      : `Status Change (${statusCount})`}
                  </option>
                  <option value="amendment">
                    {lang === "th"
                      ? `แก้ไขเอกสาร TOR (${amendmentCount})`
                      : `TOR Amendment (${amendmentCount})`}
                  </option>
                  <option value="deadline">
                    {lang === "th"
                      ? `ใกล้ปิดรับข้อเสนอ (${deadlineCount})`
                      : `Approaching Deadline (${deadlineCount})`}
                  </option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-3" />
              </div>
            </div>
          </div>
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
              <Bell className="h-6 w-6" />
            </div>
            <h3 className="text-[15px] font-semibold text-ink">
              {statusFilter === "unread" && typeFilter === "all"
                ? lang === "th"
                  ? "ไม่มีการแจ้งเตือนที่ยังไม่ได้อ่าน"
                  : "No unread notifications"
                : statusFilter === "unread" && typeFilter !== "all"
                ? lang === "th"
                  ? "ไม่มีการแจ้งเตือนที่ยังไม่ได้อ่านในประเภทนี้"
                  : "No unread notifications in this category"
                : typeFilter !== "all"
                ? lang === "th"
                  ? "ไม่มีการแจ้งเตือนในประเภทนี้"
                  : "No notifications in this category"
                : lang === "th"
                ? "ยังไม่มีการแจ้งเตือน"
                : "No notifications yet"}
            </h3>
            <p className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-ink-3">
              {statusFilter === "unread"
                ? lang === "th"
                  ? "คุณได้อ่านการแจ้งเตือนทั้งหมดแล้ว เมื่อมีรายการใหม่เข้ามาจะแสดงขึ้นที่นี่"
                  : "You are all caught up! New alerts will appear here."
                : lang === "th"
                ? "เมื่อมีประกาศจัดซื้อจัดจ้างใหม่ตรงกับโปรไฟล์ของคุณ หรือโครงการในรายการติดตามมีการแก้ไขหรือเปลี่ยนสถานะ ระบบจะแจ้งเตือนให้คุณทราบที่นี่"
                : "When new procurement notices match your profile or watched projects change, alerts will appear here."}
            </p>
          </Panel>
        ) : (
          <div className="space-y-3">
            {filteredNotifications.map((item) => {
              const snapshot = item.snapshot || {};

              return (
                <Link
                  key={item._id}
                  href={`/notifications/${item._id}`}
                  className={`group relative block rounded-md border p-4 transition-all hover:border-line-2 hover:shadow-xs ${
                    !item.isRead
                      ? "border-line-2 bg-surface shadow-xs"
                      : "border-line/70 bg-surface-2/60 opacity-85 hover:opacity-100"
                  }`}
                >
                  {!item.isRead ? (
                    <span
                      className="absolute top-3.5 right-3.5 h-2 w-2 rounded-full bg-red-600"
                      aria-label="Unread"
                    />
                  ) : null}

                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      {/* Icon */}
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-ink-2">
                        <NotificationTypeIcon type={item.type} />
                      </div>

                      {/* Content based on type */}
                      <div className="min-w-0 flex-1">
                        {item.type === "match" ? (
                          // Match Notification Card
                          (() => {
                            const matchedItems: MatchedTorSummary[] = Array.isArray(snapshot.matchedItems)
                              ? snapshot.matchedItems
                              : [];
                            const count = matchedItems.length;
                            const isMulti = count > 1;
                            const firstItem = matchedItems[0];
                            const allSkills = Array.from(
                              new Set(matchedItems.flatMap((m) => m.matchedSkills || []))
                            ).slice(0, 5);
                            const agencies = Array.from(
                              new Set(matchedItems.map((m) => m.agency).filter(Boolean))
                            );
                            const agencySummary =
                              agencies.slice(0, 2).join(", ") +
                              (agencies.length > 2 ? ` และอีก ${agencies.length - 2} หน่วยงาน` : "");

                            return (
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="inline-flex items-center gap-1 rounded bg-open-bg px-2 py-0.5 text-[11px] font-semibold text-open border border-open-line">
                                    {lang === "th" ? "ตรงโปรไฟล์" : "Match"}
                                  </span>
                                  <span className="text-[14px] font-semibold text-ink group-hover:underline transition-colors">
                                    {lang === "th"
                                      ? `พบ ${count} โครงการใหม่ที่ตรงกับโปรไฟล์ของคุณ`
                                      : `Found ${count} new tenders matching your profile`}
                                  </span>
                                </div>

                                {!isMulti && firstItem ? (
                                  <>
                                    <p className="mt-1 line-clamp-1 text-[13px] text-ink font-medium">
                                      {firstItem.projectTitle}
                                    </p>
                                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-ink-3">
                                      {allSkills.length > 0 ? (
                                        <span>ทักษะที่ตรง: {allSkills.join(", ")} •</span>
                                      ) : null}
                                      {firstItem.agency ? <span>{firstItem.agency}</span> : null}
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    {allSkills.length > 0 ? (
                                      <p className="mt-1 line-clamp-1 text-[13px] text-ink-2">
                                        <span className="font-medium text-ink">
                                          {lang === "th" ? "ตรงกับทักษะของคุณ: " : "Matching skills: "}
                                        </span>
                                        {allSkills.join(", ")}
                                      </p>
                                    ) : null}
                                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-ink-3">
                                      {agencies.length > 0 ? (
                                        <span>{agencies.length} หน่วยงาน ({agencySummary})</span>
                                      ) : null}
                                    </div>
                                  </>
                                )}
                              </div>
                            );
                          })()
                        ) : item.type === "amendment" ? (
                          // Amendment Notification Card
                          (() => {
                            const s = snapshot as any;
                            const items: any[] = Array.isArray(s.items) && s.items.length > 0 ? s.items : [s];
                            const count = items.length;
                            const isMulti = count > 1;
                            const first = items[0] || {};
                            const allChanged = Array.from(
                              new Set(items.flatMap((it) => it.changedFieldsTh || []))
                            ).slice(0, 4);
                            const agencies = Array.from(
                              new Set(items.map((it) => it.agency).filter(Boolean))
                            );
                            const agencySummary =
                              agencies.slice(0, 2).join(", ") +
                              (agencies.length > 2 ? ` และอีก ${agencies.length - 2} หน่วยงาน` : "");

                            return (
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 border border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
                                    {lang === "th" ? "แก้ไข TOR" : "Amended"}
                                  </span>
                                  <span className="text-[14px] font-semibold text-ink group-hover:underline transition-colors">
                                    {lang === "th"
                                      ? `พบ ${count} โครงการที่คุณติดตามมีการแก้ไข TOR`
                                      : `${count} watched projects were amended`}
                                  </span>
                                </div>

                                {!isMulti ? (
                                  <>
                                    <p className="mt-1 line-clamp-1 text-[13px] text-ink font-medium">
                                      {first.projectTitle || first.projectId}
                                    </p>
                                    {first.amendmentHeadline ? (
                                      <p className="mt-0.5 line-clamp-1 text-[12px] text-amber-900 dark:text-amber-200">
                                        “{first.amendmentHeadline}”
                                      </p>
                                    ) : null}
                                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                      {first.agency ? (
                                        <span className="text-[11px] text-ink-3">{first.agency} •</span>
                                      ) : null}
                                      {Array.isArray(first.changedFieldsTh) &&
                                        first.changedFieldsTh.map((f: string, idx: number) => (
                                          <span
                                            key={idx}
                                            className="rounded bg-surface-3 px-1.5 py-0.5 text-[10.5px] font-medium text-ink-2 border border-line"
                                          >
                                            {f}
                                          </span>
                                        ))}
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    {allChanged.length > 0 ? (
                                      <p className="mt-1 line-clamp-1 text-[13px] text-ink-2">
                                        <span className="font-medium text-ink">
                                          {lang === "th" ? "ส่วนที่มีการปรับเปลี่ยน: " : "Modified sections: "}
                                        </span>
                                        {allChanged.join(", ")}
                                      </p>
                                    ) : null}
                                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-ink-3">
                                      {agencies.length > 0 ? (
                                        <span>{agencies.length} หน่วยงาน ({agencySummary})</span>
                                      ) : null}
                                    </div>
                                  </>
                                )}
                              </div>
                            );
                          })()
                        ) : item.type === "status_change" ? (
                          // Status Change Notification Card
                          (() => {
                            const s = snapshot as any;
                            const items: any[] = Array.isArray(s.items) && s.items.length > 0 ? s.items : [s];
                            const count = items.length;
                            const isMulti = count > 1;
                            const first = items[0] || {};
                            const prev = (first.previousStatus as Status) || "Open";
                            const next = (first.newStatus as Status) || "Open";

                            const statusLabels: Record<string, string> = {
                              Draft: "ร่างประกาศ / วิจารณ์",
                              Open: "เปิดรับข้อเสนอ",
                              Awarded: "ประกาศผู้ชนะแล้ว",
                              Closed: "ปิดรับข้อเสนอแล้ว",
                              Cancelled: "ยกเลิก",
                            };

                            const uniqueTargetStatuses = Array.from(
                              new Set(items.map((it) => statusLabels[it.newStatus] || it.newStatus).filter(Boolean))
                            );
                            const agencies = Array.from(
                              new Set(items.map((it) => it.agency).filter(Boolean))
                            );
                            const agencySummary =
                              agencies.slice(0, 2).join(", ") +
                              (agencies.length > 2 ? ` และอีก ${agencies.length - 2} หน่วยงาน` : "");

                            return (
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-800 border border-blue-300 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800">
                                    {lang === "th" ? "เปลี่ยนสถานะ" : "Status Changed"}
                                  </span>
                                  <span className="text-[14px] font-semibold text-ink group-hover:underline transition-colors">
                                    {lang === "th"
                                      ? `พบ ${count} โครงการที่คุณติดตามมีการเปลี่ยนสถานะ`
                                      : `${count} watched projects changed status`}
                                  </span>
                                </div>

                                {!isMulti ? (
                                  <>
                                    <p className="mt-1 line-clamp-1 text-[13px] text-ink font-medium">
                                      {first.projectTitle || first.projectId}
                                    </p>
                                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                                      <div className="flex items-center gap-1.5 text-[12px]">
                                        <StatusBadge status={prev} lang={lang} size="regular" />
                                        <ArrowRight className="h-3 w-3 text-ink-3" />
                                        <StatusBadge status={next} lang={lang} size="regular" />
                                      </div>
                                      {first.agency ? (
                                        <span className="text-[11px] text-ink-3">• {first.agency}</span>
                                      ) : null}
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <p className="mt-1 line-clamp-1 text-[13px] text-ink-2">
                                      <span className="font-medium text-ink">
                                        {lang === "th" ? "มีการเปลี่ยนสถานะสู่: " : "Updated to: "}
                                      </span>
                                      {uniqueTargetStatuses.join(", ")}
                                    </p>
                                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-ink-3">
                                      {agencies.length > 0 ? (
                                        <span>{agencies.length} หน่วยงาน ({agencySummary})</span>
                                      ) : null}
                                    </div>
                                  </>
                                )}
                              </div>
                            );
                          })()
                        ) : item.type === "deadline" ? (
                          // Approaching Deadline Notification Card
                          (() => {
                            const s = snapshot as any;
                            const items: any[] = Array.isArray(s.items) && s.items.length > 0 ? s.items : [s];
                            const count = items.length;
                            const isMulti = count > 1;
                            const first = items[0] || {};
                            const agencies = Array.from(
                              new Set(items.map((it) => it.agency).filter(Boolean))
                            );
                            const agencySummary =
                              agencies.slice(0, 2).join(", ") +
                              (agencies.length > 2 ? ` และอีก ${agencies.length - 2} หน่วยงาน` : "");

                            return (
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="inline-flex items-center gap-1 rounded bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-800 border border-orange-300 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800">
                                    {lang === "th" ? "ใกล้ปิดรับข้อเสนอ" : "Deadline Approaching"}
                                  </span>
                                  <span className="text-[14px] font-semibold text-ink group-hover:underline transition-colors">
                                    {lang === "th"
                                      ? `พบ ${count} โครงการที่คุณติดตามใกล้ปิดรับข้อเสนอ`
                                      : `${count} watched projects approaching deadline`}
                                  </span>
                                </div>

                                {!isMulti ? (
                                  <>
                                    <p className="mt-1 line-clamp-1 text-[13px] text-ink font-medium">
                                      {first.projectTitle || first.projectId}
                                    </p>
                                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-ink-3">
                                      <span className="font-medium text-orange-700 dark:text-orange-300">
                                        เหลือเวลาอีก {first.daysRemaining ?? "-"} วัน
                                      </span>
                                      {first.deadlineDate ? (
                                        <span>
                                          (ปิดรับ:{" "}
                                          {new Date(first.deadlineDate).toLocaleDateString(
                                            lang === "th" ? "th-TH" : "en-US",
                                            {
                                              day: "numeric",
                                              month: "short",
                                              year: "numeric",
                                              hour: "2-digit",
                                              minute: "2-digit",
                                            }
                                          )}
                                          )
                                        </span>
                                      ) : null}
                                      {first.agency ? <span>• {first.agency}</span> : null}
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <p className="mt-1 line-clamp-1 text-[13px] text-ink-2">
                                      {lang === "th"
                                        ? "มีโครงการในรายการติดตามที่กำลังจะสิ้นสุดระยะเวลายื่นข้อเสนอเร็วๆ นี้"
                                        : "Watched projects approaching submission deadline soon."}
                                    </p>
                                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-ink-3">
                                      {agencies.length > 0 ? (
                                        <span>{agencies.length} หน่วยงาน ({agencySummary})</span>
                                      ) : null}
                                    </div>
                                  </>
                                )}
                              </div>
                            );
                          })()
                        ) : (
                          // Fallback
                          <div>
                            <span className="text-[14px] font-semibold text-ink">
                              {item.type}
                            </span>
                            <p className="mt-1 line-clamp-1 text-[13px] text-ink-2">
                              {snapshot.projectTitle || snapshot.projectId || "-"}
                            </p>
                          </div>
                        )}

                        {/* Relative timestamp & email status */}
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-ink-3">
                          <span>{formatRelativeTime(item.createdAt, lang)}</span>
                          {item.emailSent && item.emailSentAt ? (
                            <span className="inline-flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              <span>{lang === "th" ? "ส่งอีเมลแล้ว" : "Emailed"}</span>
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    {/* Right side: chevron */}
                    <div className="flex shrink-0 items-center self-center pr-0.5">
                      <ChevronRight className="h-4 w-4 text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-ink" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Profile unconfigured callout */}
      {isProfileEmpty ? (
        <div className="mx-auto w-full max-w-[1000px] px-4">
          <div className="rounded-t-[6px] border-t border-x border-amber-300 bg-amber-50 p-4 shadow-xs dark:border-amber-800/80 dark:bg-amber-950/40">
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4 text-amber-700 dark:text-amber-400 shrink-0" />
                  <h4 className="text-[13.5px] font-semibold text-amber-950 dark:text-amber-100">
                    {lang === "th"
                      ? "คุณยังไม่ได้ระบุทักษะหรือเงื่อนไขในโปรไฟล์"
                      : "You haven't set up your profile skills or preferences yet"}
                  </h4>
                </div>
                <p className="mt-1 text-[12.5px] leading-thai text-amber-900/90 dark:text-amber-300/80">
                  {lang === "th"
                    ? "ระบบจะไม่สามารถค้นหาและแจ้งเตือนโครงการที่ตรงกับคุณได้ จนกว่าจะมีการบันทึกทักษะในโปรไฟล์"
                    : "The system cannot match and notify you of tenders until you save your skills in your profile."}
                </p>
              </div>
              <Link
                href="/profile"
                className="inline-flex shrink-0 items-center justify-center rounded-[3px] border border-amber-400/90 bg-amber-100/90 px-3.5 py-1.5 text-[12.5px] font-medium text-amber-950 transition-colors hover:bg-amber-200/90 cursor-pointer dark:border-amber-700 dark:bg-amber-900/60 dark:text-amber-100 dark:hover:bg-amber-900"
              >
                {lang === "th" ? "ไปที่หน้าตั้งค่าโปรไฟล์และทักษะ →" : "Go to Profile Settings →"}
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {/* Confirmation Modal for Mark All Read */}
      {showConfirmModal ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-[2px] animate-in fade-in duration-150"
          onClick={() => setShowConfirmModal(false)}
        >
          <div
            className="relative w-full max-w-sm rounded-[4px] border border-line bg-surface p-5 shadow-xl transition-all"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="confirm-modal-title" className="text-[15px] font-semibold text-ink">
              {lang === "th" ? "ทำเครื่องหมายว่าอ่านแล้วทั้งหมด?" : "Mark all as read?"}
            </h3>
            <p className="mt-2 text-[13px] leading-thai text-ink-2">
              {lang === "th"
                ? `ต้องการทำเครื่องหมายว่าอ่านแล้วสำหรับการแจ้งเตือนทั้งหมด (${unreadCount} รายการ) ใช่หรือไม่?`
                : `Are you sure you want to mark all ${unreadCount} unread notifications as read?`}
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={markingAll}
                className={`${btn.ghost} cursor-pointer`}
              >
                {lang === "th" ? "ยกเลิก" : "Cancel"}
              </button>
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={markingAll}
                className={`${btn.primary} cursor-pointer`}
              >
                {markingAll
                  ? lang === "th"
                    ? "กำลังดำเนินการ…"
                    : "Marking…"
                  : lang === "th"
                  ? "ยืนยัน"
                  : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
