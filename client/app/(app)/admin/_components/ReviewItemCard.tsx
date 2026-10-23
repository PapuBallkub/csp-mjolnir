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
  lang,
  resolution,
  onResolution,
  onSuccess,
}: {
  item: ReviewItem;
  lang: "th" | "en";
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
      const msg = lang === "th" ? "จัดประเภทเป็นงานนอกขอบเขตแล้ว" : "Reclassified out of scope";
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
      const msg = lang === "th" ? "ยืนยันการจัดประเภทแล้ว" : "Classification confirmed";
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
      const msg = lang === "th" ? "ส่งอ่านใหม่แล้ว" : "Re-queued";
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
    <Panel className="overflow-hidden">
      <div className="flex w-full flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono tnum text-[11px] font-semibold text-ink-3">{item.docId}</span>
            {isReviewed ? (
              <span className="rounded-[2px] border border-open-line bg-open-bg px-2 py-0.5 text-[11px] font-medium text-open">
                {lang === "th" ? "✓ ตรวจทานแล้ว" : "✓ Reviewed"}
              </span>
            ) : isExcluded ? (
              <span className="rounded-[2px] border border-risk-line bg-risk-bg px-2 py-0.5 text-[11px] font-medium text-risk">
                {lang === "th" ? "คัดออกนอกขอบเขต" : "Excluded"}
              </span>
            ) : (
              <span className="rounded-[2px] border border-amend-line bg-amend-bg px-2 py-0.5 text-[11px] font-medium text-amend">
                {lang === "th" ? "รอตรวจทาน" : "Pending review"}
              </span>
            )}
            {item.misclassified ? (
              <span className="rounded-[2px] border border-risk-line bg-risk-bg px-2 py-0.5 text-[11px] font-medium text-risk">
                {lang === "th" ? "⚠️ อาจจัดประเภทผิด" : "⚠️ Likely misclassified"}
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
                {lang === "th"
                  ? `ระบบจัดเป็น “${item.misclassified.predicted}” แต่เนื้อหาน่าจะเป็น “${item.misclassified.likely}”`
                  : `Classified as “${item.misclassified.predicted}”, but the content reads as “${item.misclassified.likely}”.`}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleReclassify}
                  className={`${btn.primary} text-[11px]`}
                >
                  {isSubmitting
                    ? lang === "th"
                      ? "กำลังบันทึก..."
                      : "Saving..."
                    : lang === "th"
                      ? "จัดประเภทใหม่เป็นงานนอกขอบเขต"
                      : "Reclassify as out of scope"}
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleConfirmClassification}
                  className={`${btn.secondary} text-[11px]`}
                >
                  {lang === "th" ? "ยืนยันว่าถูกต้องแล้ว" : "Classification is correct"}
                </button>
              </div>
            </div>
          ) : null}

          {item.lowFields.length > 0 ? (
            <div className="mt-3">
              <span className="text-[11px] font-medium text-ink-3 block mb-1.5">
                {lang === "th" ? "ฟิลด์ที่ค่าความมั่นใจต่ำ (Low-confidence fields):" : "Low-confidence fields:"}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {item.lowFields.map((f) => (
                  <span
                    key={f.field}
                    className="inline-flex items-center gap-1 rounded-[2px] border border-amend-line bg-amend-bg px-2 py-0.5 text-[11px] text-amend"
                  >
                    <span className="font-mono font-medium">{f.field}</span>
                    <span className="text-[10px] opacity-75">({f.confidence}%)</span>
                  </span>
                ))}
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

        <div className="flex shrink-0 flex-col items-end gap-3 sm:w-56">
          <div className="flex w-full flex-col gap-1.5">
            <ConfidenceBar value={item.ocr} label="OCR" />
            <ConfidenceBar value={item.extraction} label="LLM" />
          </div>

          <div className="flex w-full flex-col gap-2 pt-1">
            <Link
              href={`/admin/review/${item.docId}`}
              className={`${btn.primary} w-full text-center text-[12px] font-medium justify-center py-2`}
            >
              {lang === "th" ? "🔍 ตรวจทานและแก้ไขข้อมูล" : "🔍 Review & Edit Facts"} ↗
            </Link>
            <div className="flex gap-1.5 w-full">
              <a
                href={`/tor/${item.docId}`}
                target="_blank"
                rel="noreferrer"
                className={`${btn.secondary} flex-1 text-center text-[11px] py-1 justify-center`}
              >
                {lang === "th" ? "ดูหน้าเว็บ" : "GIPDP"} ↗
              </a>
              <a
                href={`https://process5.gprocurement.go.th/egp-agpc01-web/announcement?keywordSearch=${item.docId}`}
                target="_blank"
                rel="noreferrer"
                className={`${btn.secondary} flex-1 text-center text-[11px] py-1 justify-center`}
              >
                {lang === "th" ? "e-GP" : "e-GP"} ↗
              </a>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleReExtract}
                title={lang === "th" ? "สั่งอ่านเอกสารใหม่" : "Re-queue extraction"}
                className={`${btn.ghost} text-[11px] px-2 py-1`}
              >
                ↻
              </button>
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}
