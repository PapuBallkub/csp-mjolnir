"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { getTorInsight, type ApiError, type TorInsightDetail } from "../../../_lib/api";
import { TorDetail } from "../../../_components/tor-detail";
import { btn, EmptyState } from "../../../_components/ui";

function TorDetailSkeleton() {
  return (
    <article className="mx-auto max-w-[1240px] px-4 py-6 animate-pulse">
      {/* Back button placeholder */}
      <div className="h-6 w-28 rounded bg-surface-2 mb-4" />

      {/* Header bar placeholder */}
      <div className="rounded-lg border border-line bg-surface p-5 sm:p-6 mb-6">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="h-5 w-20 rounded bg-surface-2" />
          <div className="h-5 w-32 rounded bg-surface-2" />
          <div className="h-5 w-16 rounded bg-surface-2" />
        </div>
        <div className="h-7 w-3/4 rounded bg-surface-2 mb-2" />
        <div className="h-5 w-1/2 rounded bg-surface-2 mb-5" />

        {/* Budget bar */}
        <div className="h-16 w-full rounded border border-line bg-surface-2/60" />
      </div>

      {/* Segmented Control Tabs */}
      <div className="flex gap-2 mb-6 border-b border-line pb-3 overflow-x-auto">
        <div className="h-9 w-32 shrink-0 rounded bg-surface-2" />
        <div className="h-9 w-40 shrink-0 rounded bg-surface-2" />
        <div className="h-9 w-44 shrink-0 rounded bg-surface-2" />
        <div className="h-9 w-36 shrink-0 rounded bg-surface-2" />
      </div>

      {/* Main Grid: Content + Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="h-44 rounded border border-line bg-surface" />
          <div className="h-64 rounded border border-line bg-surface" />
        </div>
        <div className="space-y-4">
          <div className="h-56 rounded border border-line bg-surface" />
          <div className="h-40 rounded border border-line bg-surface" />
        </div>
      </div>
    </article>
  );
}

export default function TorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [insight, setInsight] = useState<TorInsightDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    // Explicitly reset window scroll to top whenever navigating to a new TOR
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }
  }, [id]);

  useEffect(() => {
    let ignore = false;
    getTorInsight(id).then((result) => {
      if (ignore) return;
      setLoading(false);
      if (result.ok) {
        setInsight(result.data);
      } else {
        setError(result.error);
      }
    });

    return () => {
      ignore = true;
    };
  }, [id, retryKey]);

  useEffect(() => {
    if (insight && typeof window !== "undefined") {
      // Re-scroll to top after data hydration to counter browser scroll restoration
      // from previously viewed long pages or history navigation
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }
  }, [insight]);

  const handleRetry = () => {
    setLoading(true);
    setError(null);
    setRetryKey((k) => k + 1);
  };

  if (loading) {
    return <TorDetailSkeleton />;
  }

  if (insight) {
    return <TorDetail insight={insight} />;
  }

  if (error?.status === 404) {
    return (
      <div className="mx-auto max-w-[1240px] px-4 py-10">
        <EmptyState
          headline="ไม่พบประกาศจัดซื้อจัดจ้างนี้"
          body={`ไม่พบข้อมูล TOR สำหรับรหัสโครงการ ${id} ในระบบ หรือประกาศนี้อาจถูกยกเลิกแล้ว`}
          action={
            <Link href="/search" className={btn.primary}>
              กลับไปหน้าค้นหา
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-10">
      <EmptyState
        headline="เปิดประกาศนี้ไม่ได้ในตอนนี้"
        body="ระบบดึงข้อมูลประกาศไม่สำเร็จ น่าจะเป็นเพราะเซิร์ฟเวอร์ขัดข้องชั่วคราว ตัวประกาศยังอยู่ ลองอีกครั้งในอีกสักครู่"
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" onClick={handleRetry} className={btn.primary}>
              ลองอีกครั้ง
            </button>
            <Link href="/search" className={btn.secondary}>
              กลับไปหน้าค้นหา
            </Link>
          </div>
        }
      />
    </div>
  );
}
