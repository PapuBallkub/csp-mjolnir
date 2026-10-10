"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../../_components/auth";
import { CatalogRow, CatalogRowSkeleton } from "../../../_components/catalog-row";
import { useLang } from "../../../_components/prefs";
import { btn, EmptyState, SectionHeading } from "../../../_components/ui";
import { isDead } from "../../../_components/verdict";
import * as api from "../../../_lib/api";
import type { TorInsightSummary } from "../../../_lib/api";

type AlertItem = {
  projectId: string;
  kind: "amended" | "closing";
  title: string;
  message: { th: string; en: string };
  date?: string;
};

const ALERT_TONE = {
  amended: "border-amend-line bg-amend-bg text-amend",
  closing: "border-amend-line bg-amend-bg text-amend",
};

export default function WatchlistPage() {
  const { lang } = useLang();
  const { removeFromWatchlist } = useAuth();

  const [tors, setTors] = useState<TorInsightSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    api.getWatchlist().then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setTors(res.data.tors);
      } else {
        setError(
          res.error.message ||
            (lang === "th" ? "ไม่สามารถโหลดข้อมูลรายการที่ติดตามได้" : "Failed to load watchlist"),
        );
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [lang, retryCount]);

  const handleRetry = () => {
    setLoading(true);
    setError(null);
    setRetryCount((c) => c + 1);
  };

  const handleRemove = async (projectId: string) => {
    setRemovingId(projectId);
    const err = await removeFromWatchlist(projectId);
    if (!err) {
      setTors((prev) => prev.filter((t) => t.projectId !== projectId));
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

  // Actionable alerts: Only approaching deadlines (<= 7 days) and official amendments on active projects
  const alerts = useMemo(() => {
    const list: AlertItem[] = [];

    for (const tor of activeTors) {
      const iden = tor.identification;
      const facts = tor.facts;
      const isAmended = tor.amendmentInfo?.isAmended ?? false;
      const title = (lang === "en" && iden.titleEn) || iden.titleTh;

      // 1. Official Amendment alert
      if (isAmended) {
        list.push({
          projectId: tor.projectId,
          kind: "amended",
          title,
          message: {
            th: "TOR มีการออกเอกสารแก้ไขประกาศหรือเงื่อนไข",
            en: "This TOR has been officially amended.",
          },
        });
      }

      // 2. Approaching Deadline alert (<= 7 days on active items)
      if (facts.submissionDeadline) {
        const diffMs = new Date(facts.submissionDeadline).getTime() - now.getTime();
        const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        if (daysLeft >= 0 && daysLeft <= 7) {
          list.push({
            projectId: tor.projectId,
            kind: "closing",
            title,
            message: {
              th:
                daysLeft === 0
                  ? "สิ้นสุดการยื่นข้อเสนอวันนี้"
                  : `เหลือเวลาอีก ${daysLeft} วันก่อนปิดรับข้อเสนอ`,
              en:
                daysLeft === 0
                  ? "Submissions close today."
                  : `${daysLeft} days left before submission closes.`,
            },
            date: facts.submissionDeadline,
          });
        }
      }
    }

    return list.filter((a) => !dismissed.includes(`${a.projectId}-${a.kind}`));
  }, [activeTors, lang, dismissed, now]);

  return (
    <div className="mx-auto max-w-[1000px] px-4 py-6 sm:py-8 pb-16">
      <header className="mb-5">
        <h1 className="text-[26px] leading-tight font-semibold tracking-tight text-ink">
          {lang === "th" ? "รายการที่ติดตาม" : "Your watchlist"}
        </h1>
        <p className="mt-1 max-w-2xl text-[14px] leading-thai text-ink-2">
          {lang === "th"
            ? "ติดตามประกาศที่คุณสนใจ หากมีการแก้ไข TOR หรือเปลี่ยนแปลงสถานะ ระบบจะแสดงแจ้งเตือนที่นี่ทันที"
            : "Track procurement notices you care about. If a document changes or moves through stages, you will see it here first."}
        </p>
      </header>

      {/* Error state */}
      {error ? (
        <div className="mb-6 rounded-md border border-red-200 bg-red-50 p-4 text-[13px] text-red-700">
          <p>{error}</p>
          <button
            type="button"
            onClick={handleRetry}
            className="mt-2 font-medium underline hover:text-red-900"
          >
            {lang === "th" ? "ลองใหม่อีกครั้ง" : "Try again"}
          </button>
        </div>
      ) : null}

      {/* Real Alert Banners (FR-18 lightweight preview) */}
      {alerts.length > 0 ? (
        <section className="mb-8">
          <SectionHeading
            sub={
              lang === "th"
                ? "การแก้ไขเอกสาร และกำหนดยื่นข้อเสนอที่ใกล้เข้ามา"
                : "Official amendments and approaching submission deadlines."
            }
            right={
              <span className="font-mono text-[11px] text-ink-3">
                {lang === "th" ? `${alerts.length} รายการ` : `${alerts.length} alerts`}
              </span>
            }
          >
            {lang === "th" ? "การเปลี่ยนแปลงและแจ้งเตือน" : "Important Updates"}
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
                    {alert.message[lang]}
                  </p>
                  <Link
                    href={`/tor/${alert.projectId}`}
                    className="mt-1 inline-block text-[13px] leading-thai text-ink-2 underline hover:text-ink"
                  >
                    {alert.title}
                  </Link>
                </div>
                <button
                  type="button"
                  onClick={() => setDismissed([...dismissed, `${alert.projectId}-${alert.kind}`])}
                  className="shrink-0 font-mono text-[11px] text-ink-3 underline hover:text-ink"
                >
                  {lang === "th" ? "รับทราบ" : "Dismiss"}
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
              ? lang === "th"
                ? `เปิดรับ ${activeTors.length} · สิ้นสุดแล้ว ${closedTors.length}`
                : `${activeTors.length} active · ${closedTors.length} closed`
              : lang === "th"
                ? `${tors.length} โครงการ`
                : `${tors.length} saved`}
          </span>
        }
      >
        {lang === "th" ? "โครงการที่บันทึกไว้" : "Saved projects"}
      </SectionHeading>

      {loading ? (
        <div className="flex flex-col gap-2.5">
          <CatalogRowSkeleton />
          <CatalogRowSkeleton />
          <CatalogRowSkeleton />
        </div>
      ) : tors.length === 0 ? (
        <EmptyState
          headline={lang === "th" ? "ยังไม่ได้บันทึกโครงการไว้" : "You have not saved anything yet"}
          body={
            lang === "th"
              ? "กดบันทึกจากหน้ารายละเอียดโครงการ แล้วคุณจะสามารถติดตามความคืบหน้าของโครงการได้จากหน้านี้"
              : "Save a project from its detail page to track its updates and status changes here."
          }
          action={
            <Link href="/search" className={btn.secondary}>
              {lang === "th" ? "ไปหน้าค้นหาประกาศ" : "Go to search"}
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
              trailing={
                <button
                  type="button"
                  disabled={removingId === tor.projectId}
                  onClick={() => handleRemove(tor.projectId)}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-transparent px-2 py-1 text-[11.5px] font-medium text-ink-3 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:hover:border-red-900/40 dark:hover:bg-red-950/30 dark:hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
                  title={lang === "th" ? "เอาออกจากรายการเฝ้าดู" : "Remove from watchlist"}
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
                  <span>
                    {removingId === tor.projectId
                      ? lang === "th"
                        ? "กำลังเอาออก…"
                        : "Removing…"
                      : lang === "th"
                        ? "เอาออก"
                        : "Remove"}
                  </span>
                </button>
              }
            />
          ))}

          {activeTors.length > 0 && closedTors.length > 0 ? (
            <div className="pt-4 pb-1 flex items-center gap-3">
              <span className="text-[12px] font-medium text-ink-3">
                {lang === "th"
                  ? `สิ้นสุดการรับข้อเสนอ / ประกาศผลแล้ว (${closedTors.length})`
                  : `Closed or awarded projects (${closedTors.length})`}
              </span>
              <div className="flex-1 h-px bg-line/60" />
            </div>
          ) : null}

          {closedTors.map((tor) => (
            <CatalogRow
              key={tor.projectId}
              tor={tor}
              now={now}
              trailing={
                <button
                  type="button"
                  disabled={removingId === tor.projectId}
                  onClick={() => handleRemove(tor.projectId)}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-transparent px-2 py-1 text-[11.5px] font-medium text-ink-3 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:hover:border-red-900/40 dark:hover:bg-red-950/30 dark:hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
                  title={lang === "th" ? "เอาออกจากรายการเฝ้าดู" : "Remove from watchlist"}
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
                  <span>
                    {removingId === tor.projectId
                      ? lang === "th"
                        ? "กำลังเอาออก…"
                        : "Removing…"
                      : lang === "th"
                        ? "เอาออก"
                        : "Remove"}
                  </span>
                </button>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
