"use client";

import Link from "next/link";
import { useLang } from "../../../_components/prefs";
import { btn, EmptyState } from "../../../_components/ui";

/** Shown only when the API says there is no such TOR, or none the public may see. */
export default function TorNotFound() {
  const { lang } = useLang();

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-10">
      <EmptyState
        headline={lang === "th" ? "ไม่พบประกาศนี้" : "We can't find this posting"}
        body={
          lang === "th"
            ? "ลิงก์อาจพิมพ์ผิด หรือประกาศนี้ไม่ได้เผยแพร่บนแพลตฟอร์ม เช่น ไม่ใช่งานไอที หรือสรุปยังไม่ผ่านการตรวจ ประกาศต้นฉบับทั้งหมดยังอยู่ที่ e-GP"
            : "The link may be mistyped, or this posting isn't published here: it may not be IT work, or its summary hasn't passed review yet. Every original is still on e-GP."
        }
        action={
          <Link href="/search" className={btn.secondary}>
            {lang === "th" ? "ค้นหาประกาศทั้งหมด" : "Search all postings"}
          </Link>
        }
      />
    </div>
  );
}
