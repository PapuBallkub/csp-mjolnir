"use client";

import Link from "next/link";
import { btn, EmptyState } from "../../../_components/ui";

/** Shown only when the API says there is no such TOR, or none the public may see. */
export default function TorNotFound() {
  return (
    <div className="mx-auto max-w-[1240px] px-4 py-10">
      <EmptyState
        headline="ไม่พบประกาศนี้"
        body="ลิงก์อาจพิมพ์ผิด หรือประกาศนี้ไม่ได้เผยแพร่บนแพลตฟอร์ม เช่น ไม่ใช่งานไอที หรือสรุปยังไม่ผ่านการตรวจ ประกาศต้นฉบับทั้งหมดยังอยู่ที่ e-GP"
        action={
          <Link href="/search" className={btn.secondary}>
            ค้นหาประกาศทั้งหมด
          </Link>
        }
      />
    </div>
  );
}
