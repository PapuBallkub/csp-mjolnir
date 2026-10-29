"use client";

import { useEffect, useRef, useState } from "react";
import { getTorPdfPreviewUrl } from "../_lib/api";
import { btn } from "./ui";

interface PdfPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  title: string;
  agency?: string;
  procurementMethod?: string | null;
  officialEgpUrl?: string | null;
  lang?: "th" | "en";
}

export function PdfPreviewModal(props: PdfPreviewModalProps) {
  if (!props.isOpen) return null;
  return <PdfPreviewModalContent key={props.projectId} {...props} />;
}

function PdfPreviewModalContent({
  onClose,
  projectId,
  title,
  agency,
  procurementMethod,
  officialEgpUrl,
  lang = "th",
}: PdfPreviewModalProps) {
  const [loading, setLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [errorDetails, setErrorDetails] = useState<{
    code?: string;
    procurementMethod?: string | null;
    message?: string;
  } | null>(null);
  const [part, setPart] = useState(0);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const activeBlobUrlRef = useRef<string | null>(null);

  const currentRole = part === 0 ? "tor" : part === 1 ? "bidding" : "announcement";
  const previewUrl = getTorPdfPreviewUrl(projectId, part, currentRole);

  const effectiveMethod = errorDetails?.procurementMethod || procurementMethod || "";
  const isDirectProcurement =
    /เฉพาะเจาะจง|direct/i.test(effectiveMethod) ||
    /เฉพาะเจาะจง/i.test(title);
  const isSelectionProcurement =
    /คัดเลือก|selection/i.test(effectiveMethod) ||
    /คัดเลือก/i.test(title);
  const isEmarket =
    /ตลาดอิเล็กทรอนิกส์|e-market/i.test(effectiveMethod) ||
    /ตลาดอิเล็กทรอนิกส์|e-market/i.test(title);
  const isNonBidding =
    isDirectProcurement ||
    isSelectionProcurement ||
    isEmarket ||
    errorDetails?.code === "NO_PUBLIC_DOCUMENT_FOR_METHOD";

  // Close on Escape & Lock body scroll
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [onClose]);

  // Single-fetch PDF as a Blob object URL to prevent iframe subframe navigation
  // from polluting the browser's top-level session history (window.history)
  useEffect(() => {
    let cancelled = false;

    fetch(previewUrl, { credentials: "include" })
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          try {
            const errJson = await res.json();
            if (errJson?.error) {
              setErrorDetails({
                code: errJson.error.code,
                procurementMethod: errJson.error.procurementMethod || procurementMethod,
                message: errJson.error.message,
              });
            }
          } catch {
            // Ignore non-JSON error bodies
          }
          setLoadError(true);
          setLoading(false);
          return;
        }
        const contentType = res.headers.get("content-type") || "";
        if (!contentType.includes("application/pdf")) {
          setLoadError(true);
          setLoading(false);
          return;
        }
        const blob = await res.blob();
        if (cancelled) return;
        const objectUrl = URL.createObjectURL(blob);
        if (activeBlobUrlRef.current) {
          URL.revokeObjectURL(activeBlobUrlRef.current);
        }
        activeBlobUrlRef.current = objectUrl;
        setBlobUrl(objectUrl);
        setLoadError(false);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError(true);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [previewUrl, procurementMethod]);

  // Revoke active blob URL when component unmounts
  useEffect(() => {
    return () => {
      if (activeBlobUrlRef.current) {
        URL.revokeObjectURL(activeBlobUrlRef.current);
        activeBlobUrlRef.current = null;
      }
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdf-modal-title"
      className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-4 bg-ink/40 backdrop-blur-[2px] animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`relative flex flex-col w-full bg-surface border border-line rounded-[4px] shadow-2xl transition-all duration-200 overflow-hidden ${
          isFullscreen
            ? "h-[98vh] max-w-[98vw]"
            : "h-[88vh] max-w-5xl"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-line bg-surface-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex items-center justify-center h-5 px-1.5 rounded-[2px] bg-ink text-surface font-mono text-[10px] font-bold shrink-0">
              PDF
            </span>
            <div className="min-w-0">
              <h2
                id="pdf-modal-title"
                className="text-[13.5px] font-semibold text-ink truncate leading-snug"
                title={title}
              >
                {title || (lang === "th" ? "เอกสารต้นฉบับ TOR" : "Original TOR Document")}
              </h2>
              <div className="flex items-center gap-2 text-[11px] text-ink-3">
                {agency ? <span className="truncate">{agency}</span> : null}
                <span className="font-mono text-[10.5px]">#{projectId}</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            {officialEgpUrl ? (
              <a
                href={officialEgpUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 text-[11.5px] font-medium text-ink-2 hover:text-ink hover:bg-surface rounded-[2px] border border-transparent hover:border-line transition-colors"
                title={lang === "th" ? "เปิดดูบนเว็บ e-GP ทางการ" : "Open on official e-GP"}
              >
                <span>{lang === "th" ? "เปิดใน e-GP" : "Open on e-GP"}</span>
                <span className="text-[10px]">↗</span>
              </a>
            ) : null}

            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11.5px] font-medium text-ink-2 hover:text-ink hover:bg-surface rounded-[2px] border border-transparent hover:border-line transition-colors"
              title={lang === "th" ? "เปิดไฟล์ PDF ในแท็บใหม่" : "Open PDF in new tab"}
            >
              <span>{lang === "th" ? "แท็บใหม่" : "New Tab"}</span>
              <span className="text-[10px]">↗</span>
            </a>

            {/* Fullscreen / Restore Toggle Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsFullscreen((prev) => !prev);
              }}
              className="hidden md:inline-flex items-center justify-center w-7 h-7 text-ink-2 hover:text-ink hover:bg-surface rounded-[2px] border border-transparent hover:border-line transition-colors cursor-pointer"
              title={
                isFullscreen
                  ? lang === "th"
                    ? "ย่อหน้าต่างกลับขนาดเดิม"
                    : "Restore window size"
                  : lang === "th"
                  ? "ขยายเต็มจอ"
                  : "Fullscreen"
              }
              aria-label={isFullscreen ? "Restore size" : "Fullscreen"}
            >
              {isFullscreen ? (
                /* Restore / Exit Fullscreen SVG icon */
                <svg
                  className="w-3.5 h-3.5 pointer-events-none"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="4 14 10 14 10 20" />
                  <polyline points="20 10 14 10 14 4" />
                  <line x1="14" y1="10" x2="21" y2="3" />
                  <line x1="10" y1="14" x2="3" y2="21" />
                </svg>
              ) : (
                /* Fullscreen Expand SVG icon */
                <svg
                  className="w-3.5 h-3.5 pointer-events-none"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="15 3 21 3 21 9" />
                  <polyline points="9 21 3 21 3 15" />
                  <line x1="21" y1="3" x2="14" y2="10" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              )}
            </button>

            {/* Close Modal Button */}
            <button
              type="button"
              onClick={onClose}
              className="flex items-center justify-center w-7 h-7 rounded-[2px] text-ink hover:bg-surface border border-transparent hover:border-line text-[13px] font-semibold transition-colors cursor-pointer"
              aria-label="Close modal"
              title={lang === "th" ? "ปิด (Esc)" : "Close (Esc)"}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Document Selection Subheader */}
        <div className="flex items-center gap-1.5 px-4 py-1.5 border-b border-line bg-surface text-[12px] shrink-0 overflow-x-auto">
          <span className="text-[11px] font-medium text-ink-3 mr-1 shrink-0">
            {lang === "th" ? "เลือกเอกสาร:" : "Document:"}
          </span>
          <button
            type="button"
            onClick={() => {
              if (part !== 0) {
                setPart(0);
                setLoading(true);
                setLoadError(false);
              }
            }}
            className={`px-2.5 py-0.5 rounded-[2px] text-[11.5px] font-medium transition-colors shrink-0 cursor-pointer ${
              part === 0
                ? "bg-ink text-surface"
                : "text-ink-2 hover:text-ink hover:bg-surface-2"
            }`}
          >
            {lang === "th" ? "📄 ขอบเขตงาน (TOR หลัก)" : "📄 TOR Specifications"}
          </button>
          <button
            type="button"
            onClick={() => {
              if (part !== 1) {
                setPart(1);
                setLoading(true);
                setLoadError(false);
              }
            }}
            className={`px-2.5 py-0.5 rounded-[2px] text-[11.5px] font-medium transition-colors shrink-0 cursor-pointer ${
              part === 1
                ? "bg-ink text-surface"
                : "text-ink-2 hover:text-ink hover:bg-surface-2"
            }`}
          >
            {lang === "th" ? "📋 เอกสารประกวดราคา" : "📋 Bidding Rules"}
          </button>
          <button
            type="button"
            onClick={() => {
              if (part !== 2) {
                setPart(2);
                setLoading(true);
                setLoadError(false);
              }
            }}
            className={`px-2.5 py-0.5 rounded-[2px] text-[11.5px] font-medium transition-colors shrink-0 cursor-pointer ${
              part === 2
                ? "bg-ink text-surface"
                : "text-ink-2 hover:text-ink hover:bg-surface-2"
            }`}
          >
            {lang === "th" ? "✉️ ประกาศเชิญชวน" : "✉️ Announcement"}
          </button>
        </div>

        {/* Modal Body / PDF Viewer Frame */}
        <div className="relative flex-1 w-full bg-surface-2 min-h-0 overflow-hidden">
          {loading && !loadError ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface z-10 text-ink">
              <div className="w-6 h-6 border-2 border-line-2 border-t-ink rounded-full animate-spin" />
              <p className="text-[12.5px] text-ink-2">
                {lang === "th" ? "กำลังโหลดเอกสาร PDF ต้นฉบับ..." : "Loading PDF document..."}
              </p>
            </div>
          ) : null}

          {loadError ? (
            isNonBidding ? (
              /* Method-Aware Explanation State (Direct / Selective Procurement) */
              <div className="flex flex-col items-center justify-center h-full p-6 sm:p-10 text-center bg-surface text-ink overflow-y-auto">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-[3px] bg-surface-2 border border-line text-[11.5px] font-semibold tracking-wide text-ink mb-2">
                  <span>🏷️</span>
                  <span>
                    {isDirectProcurement
                      ? (lang === "th" ? "โครงการจัดหาโดยวิธีเฉพาะเจาะจง (Direct Contracting)" : "Direct Contracting Procurement")
                      : isSelectionProcurement
                      ? (lang === "th" ? "โครงการจัดหาโดยวิธีคัดเลือก (Selective Method)" : "Selective Method Procurement")
                      : (lang === "th" ? "วิธีจัดซื้อจัดจ้างที่ไม่มีประกาศเชิญชวนทั่วไป" : "Non-Open Bidding Method")}
                  </span>
                </div>

                <h3 className="text-[15.5px] font-semibold text-ink">
                  {isDirectProcurement
                    ? (lang === "th" ? "ไม่มีเอกสาร TOR ประกาศสาธารณะสำหรับวิธีเฉพาะเจาะจง" : "No Public TOR Published for Direct Contracting")
                    : isSelectionProcurement
                    ? (lang === "th" ? "ไม่มีเอกสาร TOR ประกาศสาธารณะสำหรับวิธีคัดเลือก" : "No Public TOR Published for Selective Procurement")
                    : (lang === "th" ? "ไม่มีเอกสารประกาศเชิญชวนทั่วไปในระบบ" : "No Public Tender Package for this Method")}
                </h3>

                <div className="max-w-xl mt-3 p-4 rounded-[4px] bg-surface-2 border border-line text-left text-[12px] leading-relaxed text-ink-2 space-y-2">
                  {lang === "th" ? (
                    <>
                      <p>
                        <strong className="text-ink font-semibold">ตาม พ.ร.บ. การจัดซื้อจัดจ้างและการบริหารพัสดุภาครัฐ พ.ศ. 2560:</strong>{" "}
                        {isDirectProcurement
                          ? "การจัดหาโดยวิธีเฉพาะเจาะจงเป็นการติดต่อเจรจาตกลงราคากับผู้ประกอบการโดยตรง (เช่น วงเงินไม่เกิน 500,000 บาท หรือเป็นงานจ้างบำรุงรักษาต่อเนื่องจากระบบเดิมที่มีผู้เชี่ยวชาญตรงเพียงรายเดียว) จึงไม่มีการออกร่างขอบเขตของงาน (TOR) หรือประกาศเชิญชวนสาธารณะเพื่อรับฟังความคิดเห็น (B0/D0) บนระบบ e-GP เหมือนวิธี e-bidding"
                          : "การจัดหาโดยวิธีคัดเลือกเป็นการส่งหนังสือเชิญชวนไปยังผู้ประกอบการที่มีคุณสมบัติตรงไม่น้อยกว่า 3 รายโดยตรง ไม่ใช่การเปิดประมูลสาธารณะทั่วไป จึงไม่มีการเผยแพร่ไฟล์แพ็กเกจประกาศสาธารณะบนระบบ e-GP"}
                      </p>
                      <p className="text-ink-3 text-[11px] pt-2 border-t border-line">
                        ℹ️ ข้อมูลโครงการที่แสดงบนแพลตฟอร์มนี้ (งบประมาณ, ราคากลาง, รายชื่อผู้ชนะ และสัญญา) ถูกนำเข้าจากฐานข้อมูลเปิดภาครัฐ (data.go.th) ท่านสามารถตรวจสอบบันทึกผลการจัดซื้อจัดจ้างและสาระสำคัญของสัญญาทางการได้โดยตรงที่หน้าเว็บ e-GP
                      </p>
                    </>
                  ) : (
                    <>
                      <p>
                        <strong className="text-ink font-semibold">Under the Public Procurement and Supplies Administration Act B.E. 2560:</strong>{" "}
                        {isDirectProcurement
                          ? "Direct contracting procures directly from a qualified vendor (e.g. contracts under 500k THB or ongoing proprietary system maintenance). Government agencies do not publish open public TOR hearing packages (B0/D0) on e-GP."
                          : "Selective procurement invites at least 3 qualified vendors directly rather than conducting an open public tender. Consequently, no public invitation package is archived on e-GP."}
                      </p>
                      <p className="text-ink-3 text-[11px] pt-2 border-t border-line">
                        ℹ️ Project details shown on GIPDP (budget, reference price, awarded contractor, and contract information) are aggregated from open government spending data. Official award and contract milestones can be verified directly on the official e-GP portal.
                      </p>
                    </>
                  )}
                </div>

                <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2 text-[11px] font-mono text-ink-3 bg-surface-2 border border-line rounded-[2px] px-2.5 py-1">
                  <span>Project #{projectId}</span>
                  {agency ? <span>· {agency}</span> : null}
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2.5 mt-5">
                  {officialEgpUrl ? (
                    <a
                      href={officialEgpUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${btn.primary} h-8 px-4 text-[12px] flex items-center gap-1.5`}
                    >
                      <span>{lang === "th" ? "เปิดดูข้อมูลโครงการบน e-GP ทางการ" : "Open project details on official e-GP"}</span>
                      <span className="text-[10px]">↗</span>
                    </a>
                  ) : null}
                  <button
                    type="button"
                    onClick={onClose}
                    className={`${btn.secondary} h-8 px-3.5 text-[12px]`}
                  >
                    {lang === "th" ? "ปิดหน้าต่างเพื่ออ่านบทวิเคราะห์ AI" : "Close to view AI Insights"}
                  </button>
                </div>
              </div>
            ) : (
              /* Error State Card (Theme-responsive for standard missing PDF) */
              <div className="flex flex-col items-center justify-center h-full p-6 sm:p-10 text-center bg-surface text-ink">
                <div className="w-12 h-12 rounded-full bg-surface-2 border border-line flex items-center justify-center text-ink-3 mb-3">
                  <svg
                    className="w-6 h-6 text-ink-3"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="9" y1="15" x2="15" y2="15" />
                  </svg>
                </div>

                <h3 className="text-[15px] font-semibold text-ink">
                  {part === 1
                    ? (lang === "th" ? "ไม่มีเอกสารประกวดราคาในแพ็กเกจนี้" : "No Bidding Rules Document in this Package")
                    : part === 2
                    ? (lang === "th" ? "ไม่มีเอกสารประกาศเชิญชวนในแพ็กเกจนี้" : "No Announcement Letter in this Package")
                    : (lang === "th" ? "ยังไม่มีไฟล์เอกสาร PDF ต้นฉบับในขณะนี้" : "Original PDF Document Unavailable")}
                </h3>

                <p className="max-w-md mt-1.5 text-[12.5px] text-ink-2 leading-relaxed">
                  {part === 1
                    ? (lang === "th"
                        ? "โครงการในขั้นตอนรับฟังความคิดเห็นร่าง หรือบางประกาศอาจไม่มีการแนบเอกสารประกวดราคาแยกต่างหาก คุณสามารถตรวจสอบเอกสาร TOR หลัก หรือดูประกาศทางการบน e-GP ได้"
                        : "Draft hearing stages or certain notices may not include separate bidding rules. You can inspect the main TOR specification or the official e-GP portal.")
                    : part === 2
                    ? (lang === "th"
                        ? "แพ็กเกจเอกสารนี้ไม่มีไฟล์ประกาศเชิญชวนแยกต่างหาก คุณสามารถดูเอกสาร TOR หลัก หรือเปิดดูประกาศทางการบน e-GP ได้"
                        : "This package does not contain a separate announcement document. You can inspect the main TOR or open official e-GP.")
                    : (lang === "th"
                        ? "โครงการนี้อาจยังไม่มีเอกสารแนบเผยแพร่ในระบบ หรือไฟล์อยู่ระหว่างการจัดเตรียมจาก e-GP คุณสามารถตรวจสอบรายละเอียดประกาศทางการได้โดยตรงที่หน้าเว็บ e-GP"
                        : "This notice may not have an attached PDF published yet or e-GP is preparing the package. You can view the announcement details on the official portal.")}
                </p>

                <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2 text-[11px] font-mono text-ink-3 bg-surface-2 border border-line rounded-[2px] px-2.5 py-1">
                  <span>Project #{projectId}</span>
                  {agency ? <span>· {agency}</span> : null}
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2.5 mt-5">
                  {part > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        setPart(0);
                        setLoading(true);
                        setLoadError(false);
                      }}
                      className={`${btn.primary} h-8 px-3.5 text-[12px]`}
                    >
                      {lang === "th" ? "📄 กลับไปดูเอกสาร TOR หลัก" : "📄 View Main TOR"}
                    </button>
                  ) : null}
                  {officialEgpUrl ? (
                    <a
                      href={officialEgpUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${part > 0 ? btn.secondary : btn.primary} h-8 px-3.5 text-[12px] flex items-center gap-1.5`}
                    >
                      <span>{lang === "th" ? "เปิดดูบนเว็บ e-GP ทางการ" : "Open on official e-GP"}</span>
                      <span className="text-[10px]">↗</span>
                    </a>
                  ) : null}
                  <button
                    type="button"
                    onClick={onClose}
                    className={`${btn.secondary} h-8 px-3.5 text-[12px]`}
                  >
                    {lang === "th" ? "ปิดหน้าต่าง" : "Close"}
                  </button>
                </div>
              </div>
            )
          ) : blobUrl ? (
            <iframe
              key={blobUrl}
              src={blobUrl}
              title={title || "PDF Preview"}
              className="w-full h-full border-0 bg-surface-2"
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default PdfPreviewModal;
