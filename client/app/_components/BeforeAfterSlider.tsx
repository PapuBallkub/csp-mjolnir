"use client";

import { useCallback, useRef, useState } from "react";

interface BeforeAfterSliderProps {
  className?: string;
  initialPosition?: number; // 0 to 100
}

/**
 * ตราครุฑราชการไทย (Garuda Emblem) จำลองหัวเอกสารราชการ
 */
function GarudaSeal({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      className={`fill-current ${className}`}
      aria-hidden="true"
    >
      {/* Head & Crown */}
      <path d="M60 10 L63 22 L67 18 L64 26 L69 25 L63 32 L60 30 L57 32 L51 25 L56 26 L53 18 L57 22 Z" />
      <circle cx="60" cy="33" r="3" />
      {/* Beak & Face */}
      <path d="M57 34 Q60 38 60 41 Q60 38 63 34 Z" />
      {/* Torso & Chest */}
      <path d="M54 42 Q60 44 66 42 L68 56 Q60 59 52 56 Z" />
      {/* Left Wing */}
      <path d="M52 44 C42 36 28 32 14 36 C22 44 32 48 40 54 C30 54 20 52 10 56 C20 62 30 64 42 66 C32 68 22 70 16 76 C26 78 36 76 46 74 C38 78 30 84 26 92 C36 88 46 82 52 74 Z" />
      {/* Right Wing */}
      <path d="M68 44 C78 36 92 32 106 36 C98 44 88 48 80 54 C90 54 100 52 110 56 C100 62 90 64 78 66 C88 68 98 70 104 76 C94 78 84 76 74 74 C82 78 90 84 94 92 C84 88 74 82 68 74 Z" />
      {/* Lower Body & Tail Feathers */}
      <path d="M52 58 L48 76 L54 74 L52 94 L57 88 L60 104 L63 88 L68 94 L66 74 L72 76 L68 58 Z" />
      {/* Legs & Talons */}
      <path d="M46 72 Q42 82 40 92 Q46 90 50 86 Z" />
      <path d="M74 72 Q78 82 80 92 Q74 90 70 86 Z" />
    </svg>
  );
}

/**
 * Layer 1 (AFTER): การ์ดข้อมูลวิเคราะห์ของ GIPDP
 * ใช้ร่วมกันทั้งใน Mobile Tab View และ Desktop Split Slider
 */
function DecodedCardView({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`mx-auto w-full max-w-[840px] rounded-[4px] border border-line bg-surface shadow-sm ${
        compact ? "p-3.5" : "p-5"
      }`}
    >
      {/* Top Tier: Agency Metadata & Project ID */}
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-ink-3">
        <span className="font-medium text-ink-2 bg-surface-2 px-1.5 py-0.5 rounded-[2px] border border-line">
          ปีงบฯ 2569
        </span>
        <span className="font-mono tnum">#68049322058</span>
        <span aria-hidden="true">·</span>
        <span className="font-medium text-ink-2">กรมควบคุมมลพิษ</span>
        <span aria-hidden="true">/</span>
        <span>ส่วนพัฒนาระบบและบริหารระบบสารสนเทศ</span>
      </div>

      {/* Tier 2: Verdict Badges */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-b border-line pb-2.5">
        <span className="inline-flex items-center gap-1.5 rounded-[3px] border border-open-line bg-open-bg px-2 py-0.5 text-[11px] font-semibold text-open">
          <span className="h-1.5 w-1.5 rounded-full bg-open" />
          เปิดรับข้อเสนอ
        </span>
        <span className="inline-flex items-center gap-1 rounded-[3px] border border-risk-line bg-risk-bg px-2 py-0.5 text-[11px] font-semibold text-risk font-mono">
          <span>ความเสี่ยงล็อกสเปกสูง 81/100</span>
        </span>
        <span className="inline-flex items-center gap-1 rounded-[3px] border border-amend-line bg-amend-bg px-2 py-0.5 text-[11px] font-semibold text-amend font-mono">
          <span>▲ สูงกว่าค่ากลาง 19%</span>
        </span>
      </div>

      {/* Tier 3: Title */}
      <h3 className="mt-2.5 text-[14.5px] sm:text-[15.5px] font-semibold leading-snug text-ink">
        โครงการพัฒนาระบบสารสนเทศบริการดิจิทัลอัจฉริยะ (Smart TouchPoint) กรมควบคุมมลพิษ 9 ระบบ
      </h3>

      {/* Tier 4: 3-Column Fact Grid */}
      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 rounded-[4px] bg-surface-2 border border-line p-2.5 text-[12px]">
        <div>
          <span className="text-[10px] font-medium text-ink-3 uppercase">ราคากลาง</span>
          <div className="font-mono font-bold text-ink text-[14.5px] tnum">฿4,916,650</div>
          <span className="text-[10.5px] text-ink-3">ค่ากลางอดีต ฿4.13M</span>
        </div>
        <div>
          <span className="text-[10px] font-medium text-ink-3 uppercase">กำหนดยื่นข้อเสนอ</span>
          <div className="font-semibold text-[13px] text-amend">เหลืออีก 16 วัน</div>
          <span className="text-[10.5px] text-ink-3">26 พ.ย. 2569</span>
        </div>
        <div className="col-span-2 sm:col-span-1 border-t border-line/60 pt-2 sm:border-t-0 sm:pt-0">
          <span className="text-[10px] font-medium text-ink-3 uppercase">ความเหมาะสมกับโปรไฟล์</span>
          <div className="font-mono font-bold text-open text-[13.5px] tnum">69/100</div>
          <span className="text-[10.5px] text-ink-3">ตรง 2 จาก 4 เทคโนโลยี</span>
        </div>
      </div>

      {/* Tier 5: Tech Stack Chips (flex-wrap prevents overflow on narrow viewports) */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="inline-flex items-center gap-1 rounded-[3px] border border-amend-line bg-amend-bg px-1.5 py-0.5 text-[10.5px] font-medium text-amend">
          เฉพาะนิติบุคคล
        </span>
        <span className="rounded-[3px] border border-open-line bg-open-bg px-2 py-0.5 text-open font-medium">
          ✓ Linux
        </span>
        <span className="rounded-[3px] border border-open-line bg-open-bg px-2 py-0.5 text-open font-medium">
          ✓ Docker
        </span>
        <span className="rounded-[3px] border border-line bg-surface-2 px-2 py-0.5 text-ink-2">
          PostgreSQL 15
        </span>
        <span className="rounded-[3px] border border-line bg-surface-2 px-2 py-0.5 text-ink-2">
          Node.js 20
        </span>
      </div>

      {/* Tier 6: Structured Insights & Evidence (Source vs. Analysis clearly separated) */}
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 text-[11.5px] leading-thai">
        <div className="rounded-[3px] border border-line bg-surface-2/70 p-2.5">
          <div className="text-[10.5px] font-semibold text-ink-3">สรุปสาระจากเอกสาร TOR</div>
          <p className="mt-1 text-ink-2">
            พัฒนาระบบบริการประชาชน 9 ระบบ ส่งมอบ 4 งวด ภายใน 180 วัน อัตราค่าปรับความล่าช้า{" "}
            <span className="font-mono text-ink">0.20%/วัน</span>
          </p>
        </div>
        <div className="rounded-[3px] border border-risk-line bg-risk-bg/60 p-2.5">
          <div className="text-[10.5px] font-semibold text-risk">
            ผลวิเคราะห์ความเสี่ยงล็อกสเปก (GIPDP)
          </div>
          <p className="mt-1 text-ink">
            กำหนดใบรับรอง <span className="font-mono">Authorized Platinum Partner</span> และประสบการณ์ 10 ปี ซึ่งสูงกว่าเกณฑ์โครงการลักษณะเดียวกัน (ปกติ 3–5 ปี) — อ้างอิงหน้า 28 ข้อ 2.3
          </p>
        </div>
      </div>

      {/* Footer Traceability Bar */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line/70 pt-2.5 text-[11px] text-ink-3">
        <span>ตรวจเทียบกับเอกสารต้นฉบับได้ทุกข้อ (ตัวอย่างจำลอง)</span>
        <span className="font-mono text-ink-2">อ้างอิง e-GP #68049322058</span>
      </div>
    </div>
  );
}

/**
 * Layer 2 (BEFORE): เอกสาร TOR สแกนฉบับราชการ
 * คงโทนกระดาษสแกนสีอ่อนไว้ทั้ง Light และ Dark mode เพื่อรักษาความต่างเชิงภาพกับ UI ของ GIPDP
 */
function ScannedPdfView({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`relative mx-auto w-full max-w-[840px] rounded border border-stone-300 bg-[#fffdf8] text-stone-900 shadow-sm ${
        compact ? "p-4" : "p-5 sm:p-6"
      }`}
    >
      {/* Top Center Garuda Emblem */}
      <div className="flex flex-col items-center text-center pb-2.5 border-b border-stone-200">
        <GarudaSeal className="h-11 w-11 sm:h-12 sm:w-12 text-stone-800" />
        <h4 className="mt-1.5 text-[13.5px] sm:text-[14.5px] font-bold tracking-tight text-stone-900 font-serif">
          ร่างขอบเขตของงาน (Terms of Reference : TOR)
        </h4>
        <p className="text-[11.5px] sm:text-[12.5px] font-semibold text-stone-800 font-serif leading-snug">
          โครงการจ้างพัฒนาระบบสารสนเทศบริการดิจิทัลอัจฉริยะ (Smart TouchPoint) กรมควบคุมมลพิษ ๙ ระบบ
        </p>
        <div className="mt-1 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-0.5 text-[10px] font-mono text-stone-500">
          <span>เลขที่โครงการ ๖๘๐๔๙๓๒๒๐๕๘</span>
          <span>·</span>
          <span>ปีงบประมาณ พ.ศ. ๒๕๖๙</span>
          <span>·</span>
          <span>เอกสารสแกนหน้า ๑ จาก ๔๒ หน้า</span>
        </div>
      </div>

      {/* Document Body Clauses */}
      <div className="mt-3 space-y-2 font-serif text-[11px] sm:text-[11.5px] leading-relaxed text-stone-800">
        <p className="indent-5">
          <strong>๑. ความเป็นมาและวัตถุประสงค์:</strong> กรมควบคุมมลพิษ มีความประสงค์จะดำเนินการประกวดราคาจ้างพัฒนาระบบสารสนเทศบริการดิจิทัลอัจฉริยะ (Smart TouchPoint) ด้วยวิธีประกวดราคาอิเล็กทรอนิกส์ (e-bidding) เพื่อยกระดับการให้บริการประชาชนจำนวน ๙ ระบบงาน...
        </p>

        {/* Clause 2: Narrow Qualification Requirement */}
        <div className="relative rounded border border-dashed border-rose-500/80 bg-rose-50/80 p-2 pt-3 text-stone-900">
          <span className="absolute -top-2 right-2 rounded bg-rose-700 px-1.5 py-0.5 text-[9px] font-sans font-semibold text-white">
            ข้อกำหนดที่ควรตรวจสอบ (หน้า ๒๘ ข้อ ๒.๓)
          </span>
          <p className="indent-4">
            <strong>๒. คุณสมบัติเฉพาะของผู้ยื่นข้อเสนอ:</strong> ๒.๓ ผู้ยื่นข้อเสนอต้องเป็นตัวแทนจำหน่ายที่ได้รับการแต่งตั้งอย่างเป็นทางการ (Authorized Platinum Partner) จากเจ้าของผลิตภัณฑ์ซอฟต์แวร์ <strong>NGINX Plus</strong> และ <strong>Microsoft</strong> โดยต้องมีวิศวกรประจำที่มีใบรับรองระดับ Architect ไม่น้อยกว่า ๓ คน และมีประสบการณ์ติดตั้งในหน่วยงานรัฐย้อนหลังไม่น้อยกว่า ๑๐ ปี
          </p>
        </div>

        {/* Clause 3: Technical Stack */}
        <p className="indent-5">
          <strong>๓. ขอบเขตงานด้านเทคโนโลยี (Technical Specs):</strong> ผู้รับจ้างต้องติดตั้งระบบบนระบบปฏิบัติการ Linux พร้อม Docker Container โดยใช้ระบบจัดการฐานข้อมูล PostgreSQL 15 และ Node.js 20 เชื่อมต่อกับระบบเดิม
        </p>

        {/* Clause 4: Reference Price & Budget */}
        <div className="relative rounded border border-dashed border-amber-500/80 bg-amber-50/80 p-2 pt-3 text-stone-900">
          <span className="absolute -top-2 right-2 rounded bg-amber-700 px-1.5 py-0.5 text-[9px] font-sans font-semibold text-white">
            ราคากลางฝังในเอกสารแนบท้าย
          </span>
          <p className="indent-4">
            <strong>๔. วงเงินงบประมาณและราคากลาง:</strong> ได้รับจัดสรรงบประมาณ ๔,๙๑๖,๖๕๐.๐๐ บาท (สี่ล้านเก้าแสนหนึ่งหมื่นหกพันหกร้อยห้าสิบบาทถ้วน) และราคากลางคำนวณเป็นเงิน ๔,๙๑๖,๖๕๐.๐๐ บาท
          </p>
        </div>

        {/* Clause 5: Delivery & Penalty */}
        <p className="indent-5">
          <strong>๕. การส่งมอบงานและอัตราค่าปรับ:</strong> ส่งมอบงาน ๔ งวด ภายใน ๑๘๐ วันนับถัดจากวันลงนาม หากส่งมอบล่าช้าคิดค่าปรับรายวันในอัตราร้อยละ <strong>๐.๒๐</strong> ของมูลค่างานจ้างตามสัญญา
        </p>
      </div>

      {/* Bottom Signature & Stamp */}
      <div className="mt-3 pt-2 border-t border-stone-200 flex flex-wrap items-center justify-between gap-2 text-[10px] text-stone-500">
        <div className="flex items-center gap-1.5 border border-rose-600/70 text-rose-700 rounded px-2 py-0.5 rotate-[-2deg] font-bold">
          <span>[สำเนาถูกต้อง]</span>
          <span className="font-mono text-[8.5px]">ศูนย์เทคโนโลยีสารสนเทศฯ</span>
        </div>
        <div className="text-right font-serif">
          <span>(ลงชื่อ)........................................ประธานกรรมการร่าง TOR</span>
        </div>
      </div>
    </div>
  );
}

export function BeforeAfterSlider({
  className = "",
  initialPosition = 38,
}: BeforeAfterSliderProps) {
  const [sliderPos, setSliderPos] = useState<number>(initialPosition);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [mobileTab, setMobileTab] = useState<"after" | "before">("after");
  const containerRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const pos = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPos(pos);
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(true);
    updatePosition(e.clientX);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    updatePosition(e.clientX);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      setSliderPos((prev) => Math.max(0, prev - 5));
    } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      setSliderPos((prev) => Math.min(100, prev + 5));
    } else if (e.key === "Home") {
      e.preventDefault();
      setSliderPos(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setSliderPos(100);
    }
  };

  return (
    <div className={`flex flex-col ${className}`}>
      {/* ========================================================= */}
      {/* MOBILE VIEW (< sm): Clean Toggle — zero text slicing      */}
      {/* ========================================================= */}
      <div className="sm:hidden">
        <div
          role="tablist"
          aria-label="สลับมุมมองตัวอย่างเอกสาร TOR ก่อนและหลังถอดรหัส"
          className="mb-3 grid grid-cols-2 gap-1 rounded-md border border-line bg-surface p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mobileTab === "before"}
            onClick={() => setMobileTab("before")}
            className={`rounded px-2.5 py-2 text-[12px] font-medium transition-colors ${
              mobileTab === "before"
                ? "bg-ink text-surface shadow-xs"
                : "text-ink-2 hover:text-ink"
            }`}
          >
            ก่อน: PDF สแกน 42 หน้า
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mobileTab === "after"}
            onClick={() => setMobileTab("after")}
            className={`rounded px-2.5 py-2 text-[12px] font-medium transition-colors ${
              mobileTab === "after"
                ? "bg-ink text-surface shadow-xs"
                : "text-ink-2 hover:text-ink"
            }`}
          >
            หลัง: GIPDP ถอดรหัส
          </button>
        </div>

        {mobileTab === "before" ? (
          <div className="rounded-lg border border-line bg-[#f4efe3] p-3 scanlines">
            <ScannedPdfView compact />
          </div>
        ) : (
          <div className="rounded-lg border border-line bg-canvas p-3">
            <DecodedCardView compact />
          </div>
        )}
      </div>

      {/* ========================================================= */}
      {/* DESKTOP VIEW (sm+): Interactive Before / After Slider     */}
      {/* ========================================================= */}
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="relative hidden sm:block w-full overflow-hidden rounded-lg border border-line shadow-sm select-none cursor-ew-resize min-h-[500px] bg-canvas"
        style={{ touchAction: "none" }}
      >
        {/* LAYER 1: AFTER (BASE) — GIPDP Decoded Card */}
        <div className="absolute inset-0 flex items-center justify-center p-6 pt-12 bg-canvas overflow-hidden">
          <DecodedCardView />
        </div>

        {/* LAYER 2: BEFORE (CLIPPED OVERLAY) — Always paper-toned scanned PDF */}
        <div
          className="absolute inset-0 flex items-center justify-center p-6 pt-12 bg-[#f4efe3] overflow-hidden scanlines text-stone-900 transition-none"
          style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
        >
          <ScannedPdfView />
        </div>

        {/* LAYER 3: DIVIDER HANDLE */}
        <div
          className="absolute top-0 bottom-0 pointer-events-none z-20 flex items-center transition-none"
          style={{ left: `${sliderPos}%` }}
        >
          <div className="absolute top-0 bottom-0 -left-[1px] w-[2px] bg-ink shadow-[0_0_12px_rgba(0,0,0,0.45)]" />

          <div
            role="slider"
            tabIndex={0}
            aria-valuenow={Math.round(sliderPos)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="เลื่อนเพื่อเปรียบเทียบก่อนและหลังถอดรหัสเอกสาร TOR"
            onKeyDown={handleKeyDown}
            className={`pointer-events-auto absolute -left-5 flex h-10 w-10 items-center justify-center rounded-full border-2 border-surface bg-ink text-surface shadow-xl transition-transform hover:scale-105 cursor-ew-resize focus:outline-none focus:ring-2 focus:ring-focus ${
              isDragging ? "scale-110 ring-2 ring-focus" : ""
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4.5 w-4.5 fill-none stroke-current"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m9 18-6-6 6-6M15 6l6 6-6 6" />
            </svg>
          </div>
        </div>

        {/* Corner Indicator Pills */}
        <div className="pointer-events-none absolute top-3 left-3 z-10 rounded bg-stone-900/90 text-stone-100 backdrop-blur px-2.5 py-1 text-[11px] font-medium shadow">
          ◄ ก่อน: PDF สแกน 42 หน้า
        </div>
        <div className="pointer-events-none absolute top-3 right-3 z-10 rounded bg-ink/90 text-surface backdrop-blur px-2.5 py-1 text-[11px] font-medium shadow">
          หลัง: GIPDP ถอดรหัส ►
        </div>
      </div>
    </div>
  );
}
