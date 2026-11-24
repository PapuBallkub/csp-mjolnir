"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../../_components/auth";
import { CatalogRow, CatalogRowSkeleton } from "../../../_components/catalog-row";
import { useProfile } from "../../../_components/prefs";
import { btn, EmptyState, SectionHeading } from "../../../_components/ui";
import { isDead } from "../../../_components/verdict";
import * as api from "../../../_lib/api";
import type { WatchlistItem } from "../../../_lib/api";
import { changedFields, changedSinceSaved } from "../../../_lib/changes";
import { daysLeft } from "../../../_lib/deadline";
import { isProfileBaseline, matchFor } from "../../../_lib/match";

type AlertKind = "announced" | "found" | "closing";

type AlertItem = {
  projectId: string;
  kind: AlertKind;
  title: string;
  message: string;
  detail?: string;
  href: string;
};

const ALERT_TONE: Record<AlertKind, string> = {
  announced: "border-amend-line bg-amend-bg text-amend",
  found: "border-dashed border-closed-line bg-surface text-ink-2",
  closing: "border-amend-line bg-amend-bg text-amend",
};

export default function WatchlistPage() {
  const { removeFromWatchlist } = useAuth();
  const { profile } = useProfile();

  const [tors, setTors] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const canMatch = !isProfileBaseline(profile);

  useEffect(() => {
    let cancelled = false;

    api.getWatchlist().then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setTors(res.data.tors);
      } else {
        setError(res.error.message || "ไม่สามารถโหลดข้อมูลรายการที่ติดตามได้");
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [retryCount]);

  const handleRetry = () => {
    setLoading(true);
    setError(null);
    setRetryCount((c) => c + 1);
  };

  const handleRemove = async (projectId: string) => {
    setRemovingId(projectId);
    setError(null);
    const err = await removeFromWatchlist(projectId);
    if (!err) {
      setTors((prev) => prev.filter((t) => t.projectId !== projectId));
    } else {
      setError(err.message || "ไม่สามารถนำโครงการออกจากรายการที่ติดตามได้");
    }
    setRemovingId(null);
  };

  const now = useMemo(() => new Date(), []);

  // Sort: Active nearest-deadline first (ascending), followed by undated open, followed by closed/awarded at the bottom
  const sortedTors = useMemo(() => {
    return [...tors].sort((a, b) => {
      const isDeadA = isDead(a.identification.status);
      const isDeadB = isDead(b.identification.status);

      const deadlineA = a.facts.submissionDeadline ? new Date(a.facts.submissionDeadline).getTime() : null;
      const deadlineB = b.facts.submissionDeadline ? new Date(b.facts.submissionDeadline).getTime() : null;

      const isExpiredA = isDeadA || (deadlineA !== null && deadlineA < now.getTime());
      const isExpiredB = isDeadB || (deadlineB !== null && deadlineB < now.getTime());

      // If one is expired/closed and one is active, active always comes first
      if (!isExpiredA && isExpiredB) return -1;
      if (isExpiredA && !isExpiredB) return 1;

      // Both are active:
      if (!isExpiredA && !isExpiredB) {
        // If both have deadlines, sort nearest deadline first (ascending)
        if (deadlineA !== null && deadlineB !== null) {
          return deadlineA - deadlineB;
        }
        // If only one has deadline, the one with deadline comes first
        if (deadlineA !== null && deadlineB === null) return -1;
        if (deadlineA === null && deadlineB !== null) return 1;
        return 0;
      }

      // Both are expired/closed:
      // Sort most recently closed or deadline first (descending)
      if (deadlineA !== null && deadlineB !== null) {
        return deadlineB - deadlineA;
      }
      return 0;
    });
  }, [tors, now]);

  // Active vs closed split
  const activeTors = useMemo(
    () => sortedTors.filter((t) => !isDead(t.identification.status)),
    [sortedTors],
  );
  const closedTors = useMemo(
    () => sortedTors.filter((t) => isDead(t.identification.status)),
    [sortedTors],
  );

  // Actionable alerts (FR-17, FR-18): changes detected after savedAt (both feed & package) + approaching deadlines (<= 7 days)
  const alerts = useMemo(() => {
    const list: AlertItem[] = [];

    for (const tor of activeTors) {
      const iden = tor.identification;
      const facts = tor.facts;
      const title = iden.titleTh;

      // 1. Change detected after the reader saved this TOR (docs/features/watchlist-changes.md)
      if (changedSinceSaved(tor) && tor.latestChange) {
        const announced = tor.latestChange.source === "feed";
        const detail = changedFields(tor.latestChange.fields) || undefined;
        list.push({
          projectId: tor.projectId,
          kind: announced ? "announced" : "found",
          title,
          message: announced
            ? "หน่วยงานประกาศแก้ไขหลังจากคุณบันทึก"
            : "พบการแก้ไขเอกสารบน e-GP หลังจากคุณบันทึก",
          detail,
          href: `/tor/${tor.projectId}#changes`,
        });
      }

      // 2. Approaching Deadline alert (<= 7 days on active items)
      if (facts.submissionDeadline) {
        const remaining = daysLeft(facts.submissionDeadline, now);
        if (remaining >= 0 && remaining <= 7) {
          list.push({
            projectId: tor.projectId,
            kind: "closing",
            title,
            message:
              remaining === 0
                ? "สิ้นสุดการยื่นข้อเสนอวันนี้"
                : `เหลือเวลาอีก ${remaining} วันก่อนปิดรับข้อเสนอ`,
            href: `/tor/${tor.projectId}`,
          });
        }
      }
    }

    return list.filter((a) => !dismissed.includes(`${a.projectId}-${a.kind}`));
  }, [activeTors, dismissed, now]);

  const renderRemoveButton = (projectId: string) => (
    <button
      type="button"
      disabled={removingId === projectId}
      onClick={() => handleRemove(projectId)}
      className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-transparent px-2 py-0.5 text-[11.5px] font-medium text-ink-3 transition-colors hover:border-risk-line hover:bg-risk-bg hover:text-risk disabled:cursor-not-allowed disabled:opacity-50"
      title="เอาออกจากรายการที่ติดตาม"
    >
      <svg
        className="h-3.5 w-3.5 shrink-0 opacity-70"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        strokeWidth="2"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
        />
      </svg>
      <span>{removingId === projectId ? "กำลังเอาออก…" : "เอาออก"}</span>
    </button>
  );

  return (
    <div className="mx-auto w-full max-w-[1000px] px-4 py-6 sm:py-8 pb-16">
      <header className="mb-5">
        <h1 className="text-[26px] leading-tight font-semibold tracking-tight text-ink">
          รายการที่ติดตาม
        </h1>
        <p className="mt-1 max-w-2xl text-[14px] leading-thai text-ink-2">
          ติดตามประกาศที่คุณสนใจ หากมีการแก้ไข TOR หรือเปลี่ยนแปลงสถานะ ระบบจะแสดงแจ้งเตือนที่นี่ทันที
        </p>
      </header>

      {/* Error state */}
      {error ? (
        <div
          role="alert"
          className="mb-6 rounded-md border border-risk-line bg-risk-bg p-4 text-[13px] text-risk"
        >
          <p>{error}</p>
          <button
            type="button"
            onClick={handleRetry}
            className="mt-2 font-medium underline underline-offset-2 hover:opacity-80 cursor-pointer"
          >
            ลองใหม่อีกครั้ง
          </button>
        </div>
      ) : null}

      {/* Real Alert Banners (FR-17, FR-18) */}
      {alerts.length > 0 ? (
        <section className="mb-8">
          <SectionHeading
            sub="การแก้ไขเอกสารหลังคุณบันทึก และกำหนดยื่นข้อเสนอที่ใกล้เข้ามา"
            right={
              <span className="font-mono text-[11px] text-ink-3">
                {`${alerts.length} รายการ`}
              </span>
            }
          >
            การเปลี่ยนแปลงและแจ้งเตือน
          </SectionHeading>

          <ul className="flex flex-col gap-2">
            {alerts.map((alert) => (
              <li
                key={`${alert.projectId}-${alert.kind}`}
                className={`flex flex-wrap items-start gap-x-3 gap-y-2 rounded-[3px] border px-3.5 py-3 ${ALERT_TONE[alert.kind]}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[11px] opacity-80">{alert.projectId}</p>
                  <p className="mt-0.5 text-[14px] leading-thai font-medium">
                    {alert.message}
                  </p>
                  {alert.detail ? (
                    <p className="mt-0.5 text-[12.5px] leading-thai opacity-90">
                      {`เปลี่ยน: ${alert.detail}`}
                    </p>
                  ) : null}
                  <Link
                    href={alert.href}
                    className="mt-1 inline-block text-[13px] leading-thai text-ink-2 underline underline-offset-2 hover:text-ink"
                  >
                    {alert.title}
                  </Link>
                </div>
                <button
                  type="button"
                  onClick={() => setDismissed([...dismissed, `${alert.projectId}-${alert.kind}`])}
                  className="shrink-0 font-mono text-[11px] text-ink-3 underline hover:text-ink cursor-pointer"
                >
                  รับทราบ
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Watchlist Items */}
      <SectionHeading
        right={
          <span className="font-mono text-[11px] text-ink-3">
            {closedTors.length > 0
              ? `เปิดรับ ${activeTors.length} · สิ้นสุดแล้ว ${closedTors.length}`
              : `${tors.length} โครงการ`}
          </span>
        }
      >
        โครงการที่บันทึกไว้
      </SectionHeading>

      {loading ? (
        <div className="flex flex-col gap-2.5">
          <CatalogRowSkeleton />
          <CatalogRowSkeleton />
          <CatalogRowSkeleton />
        </div>
      ) : tors.length === 0 ? (
        <EmptyState
          headline="ยังไม่ได้บันทึกโครงการไว้"
          body="กดบันทึกจากหน้ารายละเอียดโครงการ แล้วคุณจะสามารถติดตามความคืบหน้าของโครงการได้จากหน้านี้"
          action={
            <Link href="/search" className={btn.secondary}>
              ไปหน้าค้นหาประกาศ
            </Link>
          }
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {activeTors.map((tor) => (
            <CatalogRow
              key={tor.projectId}
              tor={tor}
              now={now}
              match={canMatch ? matchFor(tor, profile) : undefined}
              trailing={renderRemoveButton(tor.projectId)}
            />
          ))}

          {activeTors.length > 0 && closedTors.length > 0 ? (
            <div className="pt-4 pb-1 flex items-center gap-3">
              <span className="text-[12px] font-medium text-ink-3">
                {`สิ้นสุดการรับข้อเสนอ / ประกาศผลแล้ว (${closedTors.length})`}
              </span>
              <div className="flex-1 h-px bg-line/60" />
            </div>
          ) : null}

          {closedTors.map((tor) => (
            <CatalogRow
              key={tor.projectId}
              tor={tor}
              now={now}
              match={canMatch ? matchFor(tor, profile) : undefined}
              trailing={renderRemoveButton(tor.projectId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
