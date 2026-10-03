"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useLang } from "../../../_components/prefs";
import { btn, EmptyState } from "../../../_components/ui";

/**
 * The API failed or couldn't be reached. Said as that, never as "not found":
 * the TOR is still there, and trying again is the useful next step (§7).
 */
export default function TorDetailError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const { lang } = useLang();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-10">
      <EmptyState
        headline={lang === "th" ? "เปิดประกาศนี้ไม่ได้ในตอนนี้" : "We couldn't load this posting right now"}
        body={
          lang === "th"
            ? "ระบบดึงข้อมูลประกาศไม่สำเร็จ น่าจะเป็นเพราะเซิร์ฟเวอร์ขัดข้องชั่วคราว ตัวประกาศยังอยู่ ลองอีกครั้งในอีกสักครู่"
            : "Fetching the posting failed, most likely a temporary server problem. The posting itself is still there; try again in a moment."
        }
        action={
          <div className="flex flex-col items-center gap-3">
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" onClick={() => retry()} className={btn.primary}>
                {lang === "th" ? "ลองอีกครั้ง" : "Try again"}
              </button>
              <Link href="/search" className={btn.secondary}>
                {lang === "th" ? "กลับไปหน้าค้นหา" : "Back to search"}
              </Link>
            </div>
            {/* Matches the full error in the server's log */}
            {error.digest ? (
              <p className="font-mono text-[11px] text-ink-3">
                {lang === "th" ? "รหัสอ้างอิง" : "Reference"} {error.digest}
              </p>
            ) : null}
          </div>
        }
      />
    </div>
  );
}
