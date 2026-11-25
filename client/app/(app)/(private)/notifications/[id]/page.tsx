"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRightLeft,
  BowArrow,
  Clock,
  FileEdit,
  Mail,
} from "lucide-react";
import { btn, Panel } from "../../../../_components/ui";
import * as api from "../../../../_lib/api";
import type { NotificationFeedItem } from "../../../../_lib/api";
import { formatThaiDateTime as formatThaiDate } from "../../../../_lib/deadline";
import { AmendmentView } from "../_components/amendment-view";
import { StatusChangeView } from "../_components/status-change-view";
import { DeadlineView } from "../_components/deadline-view";
import { MatchView } from "../_components/match-view";

function getItemCount(notification: NotificationFeedItem): number {
  const snapshot = notification.snapshot;
  if (!snapshot || typeof snapshot !== "object") return 1;
  const s = snapshot as Record<string, unknown>;
  if (notification.type === "match") {
    return Array.isArray(s.matchedItems) ? s.matchedItems.length : 1;
  }
  if (Array.isArray(s.items) && s.items.length > 0) {
    return s.items.length;
  }
  return 1;
}

function getHeaderContent(type: string, count: number) {
  switch (type) {
    case "status_change":
      return {
        badgeText: "เปลี่ยนสถานะ",
        title: `สรุป ${count} โครงการที่มีการเปลี่ยนสถานะ`,
        subtitle: "ระบบรวบรวมรายการโครงการที่คุณติดตามที่มีการเปลี่ยนแปลงสถานะล่าสุด",
      };
    case "amendment":
      return {
        badgeText: "แก้ไขเอกสาร TOR",
        title: `สรุป ${count} โครงการที่มีการแก้ไขเอกสาร TOR`,
        subtitle: "ระบบรวบรวมรายการโครงการที่คุณติดตามที่มีการแก้ไขเปลี่ยนแปลงข้อกำหนดหรือเอกสารโครงการ",
      };
    case "deadline":
      return {
        badgeText: "ใกล้ปิดรับข้อเสนอ",
        title: `สรุป ${count} โครงการที่ใกล้ปิดรับข้อเสนอ`,
        subtitle: "ระบบรวบรวมรายการโครงการที่คุณติดตามที่กำลังจะถึงกำหนดสิ้นสุดการยื่นข้อเสนอ",
      };
    case "match":
    default:
      return {
        badgeText: "เหมาะสมกับโปรไฟล์",
        title: `สรุป ${count} โครงการที่เหมาะสมกับโปรไฟล์ของคุณ`,
        subtitle: "ระบบตรวจพบคัดกรองโครงการประกาศใหม่บนระบบ e-GP ที่มีข้อกำหนดทางเทคนิคและงบประมาณเหมาะสมกับโปรไฟล์ของคุณ",
      };
  }
}

export default function NotificationDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [notification, setNotification] = useState<NotificationFeedItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params?.id) return;

    let active = true;

    api.fetchNotificationById(params.id).then((res) => {
      if (!active) return;
      setLoading(false);
      if (res.ok) {
        const item = res.data.notification || res.data;
        setNotification(item);

        // Immediately notify navigation bar shell with the updated unread count
        const unreadCount =
          typeof res.data.unreadCount === "number" ? res.data.unreadCount : undefined;
        window.dispatchEvent(
          new CustomEvent("notifications-updated", { detail: { unreadCount } })
        );
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
      <div className="mx-auto w-full max-w-[900px] px-4 py-8">
        <div className="mb-4 h-6 w-32 animate-pulse rounded bg-surface-2" />
        <div className="mb-6 h-28 animate-pulse rounded-md border border-line bg-surface-2" />
        <div className="space-y-4">
          <div className="h-44 animate-pulse rounded border border-line bg-surface-2" />
          <div className="h-44 animate-pulse rounded border border-line bg-surface-2" />
        </div>
      </div>
    );
  }

  if (error || !notification) {
    return (
      <div className="mx-auto w-full max-w-[900px] px-4 py-8">
        <Link
          href="/notifications"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-2 hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
          <span>กลับไปยังรายการแจ้งเตือน</span>
        </Link>
        <Panel className="mt-4 p-8 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-600 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <h2 className="text-[16px] font-semibold text-ink">
            ไม่พบข้อมูลการแจ้งเตือน
          </h2>
          <p className="mt-1 text-[13px] text-ink-3">
            {error || "การแจ้งเตือนนี้อาจถูกลบไปแล้ว"}
          </p>
          <button
            type="button"
            onClick={() => router.push("/notifications")}
            className={`${btn.primary} mt-4 cursor-pointer`}
          >
            ดูการแจ้งเตือนทั้งหมด
          </button>
        </Panel>
      </div>
    );
  }

  const snapshot = notification.snapshot || {};
  const itemCount = getItemCount(notification);
  const headerContent = getHeaderContent(notification.type, itemCount);

  return (
    <div className="mx-auto w-full max-w-[900px] px-4 py-8">
      {/* Top back navigation */}
      <div className="mb-4">
        <Link
          href="/notifications"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-2 transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
          <span>กลับไปยังรายการแจ้งเตือน</span>
        </Link>
      </div>

      {/* Header Container Panel */}
      <header className="mb-6 rounded-md border border-line bg-surface p-5 shadow-xs">
        {/* Row 1: Type badge on left, timestamp & email status on right */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
          <div className="flex items-center gap-2">
            {notification.type === "match" ? (
              <span className="inline-flex items-center gap-1.5 rounded bg-open-bg px-2.5 py-0.5 text-[11.5px] font-semibold text-open border border-open-line">
                <BowArrow className="h-3.5 w-3.5" />
                <span>{headerContent.badgeText}</span>
              </span>
            ) : notification.type === "amendment" ? (
              <span className="inline-flex items-center gap-1.5 rounded bg-amber-50 px-2.5 py-0.5 text-[11.5px] font-semibold text-amber-800 border border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
                <FileEdit className="h-3.5 w-3.5" />
                <span>{headerContent.badgeText}</span>
              </span>
            ) : notification.type === "status_change" ? (
              <span className="inline-flex items-center gap-1.5 rounded bg-blue-50 px-2.5 py-0.5 text-[11.5px] font-semibold text-blue-800 border border-blue-300 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800">
                <ArrowRightLeft className="h-3.5 w-3.5" />
                <span>{headerContent.badgeText}</span>
              </span>
            ) : notification.type === "deadline" ? (
              <span className="inline-flex items-center gap-1.5 rounded bg-orange-50 px-2.5 py-0.5 text-[11.5px] font-semibold text-orange-800 border border-orange-300 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800">
                <Clock className="h-3.5 w-3.5" />
                <span>{headerContent.badgeText}</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded bg-surface-3 px-2.5 py-0.5 text-[11.5px] font-semibold text-ink border border-line">
                <span>{notification.type}</span>
              </span>
            )}

            <span className="text-[12px] text-ink-3">
              {formatThaiDate(notification.createdAt)}
            </span>
          </div>

          {notification.emailSent && notification.emailSentAt ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-3">
              <Mail className="h-3.5 w-3.5" />
              <span>ส่งอีเมลแจ้งเตือนแล้ว</span>
            </span>
          ) : null}
        </div>

        {/* Row 2: Headline title, subtitle, and project count pill */}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-[20px] font-bold tracking-tight text-ink">
              {headerContent.title}
            </h1>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
              {headerContent.subtitle}
            </p>
          </div>
          <div className="shrink-0 self-start sm:self-center">
            <span className="inline-flex items-center rounded-md border border-line bg-surface-2 px-3 py-1 text-[12.5px] font-medium text-ink-2">
              {`${itemCount} โครงการ`}
            </span>
          </div>
        </div>
      </header>

      {/* Project Cards (Polymorphic Snapshot Body) */}
      <section aria-label="รายละเอียดรายการแจ้งเตือน" className="space-y-4">
        {notification.type === "amendment" ? (
          <AmendmentView snapshot={snapshot as unknown as Parameters<typeof AmendmentView>[0]["snapshot"]} />
        ) : notification.type === "status_change" ? (
          <StatusChangeView snapshot={snapshot as unknown as Parameters<typeof StatusChangeView>[0]["snapshot"]} />
        ) : notification.type === "deadline" ? (
          <DeadlineView snapshot={snapshot as unknown as Parameters<typeof DeadlineView>[0]["snapshot"]} />
        ) : (
          <MatchView snapshot={snapshot as unknown as Parameters<typeof MatchView>[0]["snapshot"]} />
        )}
      </section>

      {/* Bottom Back Button: Only shown when there are 10 or more projects */}
      {itemCount >= 10 ? (
        <div className="mt-8 flex justify-center border-t border-line pt-4">
          <Link href="/notifications" className={`${btn.ghost} cursor-pointer`}>
            กลับหน้ารายการแจ้งเตือน
          </Link>
        </div>
      ) : null}

      {/* Third-party Disclaimer */}
      <footer className="mt-8 text-center text-[12px] text-ink-3">
        <p>
          แพลตฟอร์มนี้เป็นเครื่องมือช่วยค้นหาและติดตามประกาศจัดซื้อจัดจ้างภาครัฐ ไม่ใช่ระบบยื่นข้อเสนอทางการ การยื่นข้อเสนอและการติดต่อหน่วยงานต้องดำเนินการผ่านระบบ e-GP ทางการของกรมบัญชีกลางเท่านั้น
        </p>
      </footer>
    </div>
  );
}
