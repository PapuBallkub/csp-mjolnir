"use client";

import { useState } from "react";
import Link from "next/link";
import {
  adminReExtract,
  adminUpdateReview,
  type ReviewItem,
} from "../../../_lib/api";
import { btn, Panel } from "../../../_components/ui";
import { ConfidenceBar } from "./ConfidenceBar";

export function ReviewItemCard({
  item,
  resolution,
  onResolution,
  onSuccess,
}: {
  item: ReviewItem;
  resolution: string | null;
  onResolution: (text: string) => void;
  onSuccess?: () => void;
  isOpen?: boolean;
  onToggle?: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedSuccess, setSavedSuccess] = useState<string | null>(null);

  const handleReclassify = async () => {
    setIsSubmitting(true);
    setErrorMsg(null);
    setSavedSuccess(null);

    const res = await adminUpdateReview(item.docId, {
      action: "reclassify",
      reclassifyReason: item.misclassified?.likely || "Civil works — out of scope",
    });

    setIsSubmitting(false);
    if (res.ok) {
      const msg = "จัดประเภทเป็นงานนอกขอบเขตแล้ว";
      setSavedSuccess(msg);
      onResolution(msg);
      onSuccess?.();
    } else {
      setErrorMsg(res.error.message);
    }
  };

  const handleConfirmClassification = async () => {
    setIsSubmitting(true);
    setErrorMsg(null);
    setSavedSuccess(null);

    const res = await adminUpdateReview(item.docId, {
      action: "confirm_classification",
    });

    setIsSubmitting(false);
    if (res.ok) {
      const msg = "ยืนยันการจัดประเภทแล้ว";
      setSavedSuccess(msg);
      onResolution(msg);
      onSuccess?.();
    } else {
      setErrorMsg(res.error.message);
    }
  };

  const handleReExtract = async () => {
    setIsSubmitting(true);
    setErrorMsg(null);
    setSavedSuccess(null);

    const res = await adminReExtract(item.docId);

    setIsSubmitting(false);
    if (res.ok) {
      const msg = "ส่งอ่านใหม่แล้ว";
      setSavedSuccess(msg);
      onResolution(msg);
      onSuccess?.();
    } else {
      setErrorMsg(res.error.message);
    }
  };

  const isReviewed =
    item.reviewStatus === "approved" ||
    Boolean(savedSuccess) ||
    resolution?.includes("ตรวจทาน") ||
    resolution?.includes("บันทึก") ||
    resolution?.includes("Published");

  const isExcluded =
    item.reviewStatus === "rejected" ||
    resolution?.includes("นอกขอบเขต") ||
    resolution?.includes("scope");

  return (
    <Panel className="w-full overflow-hidden p-4">
      <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        {/* Left column: ID, Status Badges, Title, Agency, Misclassified notice */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono tnum text-[11px] font-semibold text-ink-3">{item.docId}</span>
            {isReviewed ? (
              <span className="rounded-[2px] border border-open-line bg-open-bg px-2 py-0.5 text-[11px] font-medium text-open">
                ✓ ตรวจทานแล้ว
              </span>
            ) : isExcluded ? (
              <span className="rounded-[2px] border border-risk-line bg-risk-bg px-2 py-0.5 text-[11px] font-medium text-risk">
                คัดออกนอกขอบเขต
              </span>
            ) : (
              <span className="rounded-[2px] border border-amend-line bg-amend-bg px-2 py-0.5 text-[11px] font-medium text-amend">
                รอตรวจทาน
              </span>
            )}
            {item.misclassified ? (
              <span className="rounded-[2px] border border-risk-line bg-risk-bg px-2 py-0.5 text-[11px] font-medium text-risk">
                ⚠️ อาจจัดประเภทผิด
              </span>
            ) : null}
            {item.ocr != null && item.ocr < 0.8 ? (
              <span className="rounded-[2px] border border-risk-line bg-risk-bg px-2 py-0.5 text-[11px] font-medium text-risk">
                ⚠️ OCR ต่ำ (&lt; 80%)
              </span>
            ) : null}
            {item.extraction < 0.8 ? (
              <span className="rounded-[2px] border border-risk-line bg-risk-bg px-2 py-0.5 text-[11px] font-medium text-risk">
                ⚠️ AI สกัดต่ำ (&lt; 80%)
              </span>
            ) : null}
            {resolution ? (
              <span className="rounded-[2px] border border-open-line bg-open-bg px-2 py-0.5 text-[11px] font-medium text-open">
                {resolution}
              </span>
            ) : null}
          </div>

          <h3 className="mt-2 text-[14px] font-semibold leading-thai text-ink">{item.title}</h3>
          <p className="mt-0.5 text-[12px] text-ink-3">
            {item.agency} · {item.ingestedAt}
          </p>

          {item.misclassified ? (
            <div className="mt-3 rounded-[3px] border border-line bg-surface-2 p-3 text-[12px]">
              <p className="font-medium text-ink-2">
                {`ระบบจัดเป็น “${item.misclassified.predicted}” แต่เนื้อหาน่าจะเป็น “${item.misclassified.likely}”`}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleReclassify}
                  className={`${btn.primary} text-[11px]`}
                >
                  {isSubmitting ? "กำลังบันทึก..." : "จัดประเภทใหม่เป็นงานนอกขอบเขต"}
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleConfirmClassification}
                  className={`${btn.secondary} text-[11px]`}
                >
                  ยืนยันว่าถูกต้องแล้ว
                </button>
              </div>
            </div>
          ) : null}

          {errorMsg ? (
            <div className="mt-3 rounded-[3px] border border-risk-line bg-risk-bg p-2 text-[12px] text-risk">
              {errorMsg}
            </div>
          ) : null}

          {savedSuccess ? (
            <div className="mt-3 rounded-[3px] border border-open-line bg-open-bg p-2 text-[12px] text-open">
              {savedSuccess}
            </div>
          ) : null}
        </div>

        {/* Right column: OCR & LLM confidence bars */}
        <div className="flex shrink-0 flex-col items-end gap-1.5 sm:w-56">
          <ConfidenceBar value={item.ocr} label="OCR" />
          <ConfidenceBar value={item.extraction} label="LLM" />
        </div>
      </div>

      {/* Bottom Action Bar */}
      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-3">
        {/* Left: Secondary Reference Links & Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/tor/${item.docId}`}
            target="_blank"
            rel="noreferrer"
            className={`${btn.secondary} text-[11px] h-7.5 px-2.5 whitespace-nowrap flex items-center gap-1`}
          >
            <span>ดูหน้าเว็บ</span>
            <span className="text-[10px] opacity-70">↗</span>
          </a>
          <a
            href={`https://process5.gprocurement.go.th/egp-agpc01-web/announcement?keywordSearch=${item.docId}`}
            target="_blank"
            rel="noreferrer"
            className={`${btn.secondary} text-[11px] h-7.5 px-2.5 whitespace-nowrap flex items-center gap-1`}
          >
            <span>e-GP</span>
            <span className="text-[10px] opacity-70">↗</span>
          </a>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleReExtract}
            title="สั่งอ่านเอกสารใหม่"
            className={`${btn.ghost} h-7.5 px-2 text-[11px] flex items-center gap-1 text-ink-3 hover:text-ink cursor-pointer`}
          >
            <span className="text-[13px]">↻</span>
            <span>อ่านใหม่</span>
          </button>
        </div>

        {/* Right: Primary Call-to-Action */}
        <Link
          href={`/admin/review/${item.docId}`}
          className={`${btn.primary} text-[12px] h-8 px-3.5 flex items-center gap-1.5 shadow-2xs`}
        >
          <span>🔍 ตรวจทานและแก้ไขข้อมูล</span>
          <span className="text-[10px] opacity-75">↗</span>
        </Link>
      </div>
    </Panel>
  );
}
