"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../../_components/auth";
import { CatalogRow, CatalogRowSkeleton } from "../../../_components/catalog-row";
import { useLang } from "../../../_components/prefs";
import { btn, EmptyState, SectionHeading } from "../../../_components/ui";
import * as api from "../../../_lib/api";
import type { TorInsightSummary } from "../../../_lib/api";

type AlertItem = {
  projectId: string;
  kind: "amended" | "closing" | "closed";
  title: string;
  message: { th: string; en: string };
  date?: string;
};

const ALERT_TONE = {
  amended: "border-amend-line bg-amend-bg text-amend",
  closing: "border-amend-line bg-amend-bg text-amend",
  closed: "border-closed-line bg-closed-bg text-ink-2",
};

export default function WatchlistPage() {
  const { lang } = useLang();
  const { user, removeFromWatchlist } = useAuth();

  const [tors, setTors] = useState<TorInsightSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const fetchWatchlist = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await api.getWatchlist();
    if (res.ok) {
      setTors(res.data.tors);
    } else {
      setError(
        res.error.message ||
          (lang === "th" ? "ไม่สามารถโหลดข้อมูลรายการที่ติดตามได้" : "Failed to load watchlist"),
      );
    }
    setLoading(false);
  }, [lang]);

  useEffect(() => {
    fetchWatchlist();
  }, [fetchWatchlist]);

  const handleRemove = async (projectId: string) => {
    setRemovingId(projectId);
    const err = await removeFromWatchlist(projectId);
    if (!err) {
      setTors((prev) => prev.filter((t) => t.projectId !== projectId));
    }
    setRemovingId(null);
  };

  // Lightweight preview for FR-18: in-memory derived notices from live TOR status & amendments
  const alerts = useMemo(() => {
    const list: AlertItem[] = [];
    const now = new Date();

    for (const tor of tors) {
      const iden = tor.identification;
      const facts = tor.facts;
      const isAmended = tor.amendmentInfo?.isAmended ?? false;
      const title = (lang === "en" && iden.titleEn) || iden.titleTh;

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

      if (iden.status === "Closed" || iden.status === "Awarded") {
        list.push({
          projectId: tor.projectId,
          kind: "closed",
          title,
          message: {
            th:
              iden.status === "Awarded"
                ? "โครงการประกาศผู้ชนะแล้ว"
                : "สิ้นสุดการยื่นข้อเสนอแล้ว",
            en:
              iden.status === "Awarded"
                ? "Winning contractor has been announced."
                : "Submissions are now closed.",
          },
        });
      } else if (facts.submissionDeadline) {
        const diffMs = new Date(facts.submissionDeadline).getTime() - now.getTime();
        const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        if (daysLeft >= 0 && daysLeft <= 7) {
          list.push({
            projectId: tor.projectId,
            kind: "closing",
            title,
            message: {
              th: `เหลือเวลาอีก ${daysLeft} วันก่อนปิดรับข้อเสนอ`,
              en: `${daysLeft} days left before submission closes.`,
            },
            date: facts.submissionDeadline,
          });
        }
      }
    }

    return list.filter((a) => !dismissed.includes(`${a.projectId}-${a.kind}`));
  }, [tors, lang, dismissed]);

  const now = useMemo(() => new Date(), []);

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
            onClick={fetchWatchlist}
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
                ? "รวมทั้งการแก้ไขเอกสาร การปิดรับ และกำหนดยื่นที่ใกล้เข้ามา"
                : "Amendments, closures, and approaching deadlines."
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
            {tors.length} {lang === "th" ? "โครงการ" : "saved"}
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
          {tors.map((tor) => (
            <CatalogRow
              key={tor.projectId}
              tor={tor}
              now={now}
              trailing={
                <button
                  type="button"
                  disabled={removingId === tor.projectId}
                  onClick={() => handleRemove(tor.projectId)}
                  className="font-mono text-[11px] text-ink-3 hover:text-red-600 underline underline-offset-2 disabled:opacity-50"
                >
                  {removingId === tor.projectId
                    ? lang === "th"
                      ? "กำลังเอาออก…"
                      : "Removing…"
                    : lang === "th"
                      ? "เอาออก"
                      : "Remove"}
                </button>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
