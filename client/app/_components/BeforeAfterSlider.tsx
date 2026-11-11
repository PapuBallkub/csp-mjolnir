"use client";

import { useCallback, useRef, useState } from "react";

interface BeforeAfterSliderProps {
  className?: string;
  initialPosition?: number; // 0 to 100
}

/**
 * ตราครุฑราชการไทย (Garuda Emblem) มาตรฐานเอกสารราชการ
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

export function BeforeAfterSlider({
  className = "",
  initialPosition = 50,
}: BeforeAfterSliderProps) {
  const [sliderPos, setSliderPos] = useState<number>(initialPosition);
  const [isDragging, setIsDragging] = useState<boolean>(false);
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
      {/* Slider Interactive Canvas */}
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="relative w-full overflow-hidden rounded-lg border border-line shadow-sm select-none cursor-ew-resize min-h-[580px] sm:min-h-[530px] bg-canvas"
        style={{ touchAction: "none" }}
      >
        {/* ========================================================= */}
        {/* LAYER 1: AFTER (BASE) — ข้อมูลวิเคราะห์อัจฉริยะ GIPDP (หน้าเว็บจริง) */}
        {/* ========================================================= */}
        <div className="absolute inset-0 p-4 sm:p-7 bg-canvas overflow-hidden">
          {/* Authentic Real Web Card (ตรงกับรูปแบบในหน้าค้นหาและหน้ารายละเอียด 100%) */}
          <div className="mx-auto max-w-[820px] rounded-[3px] border border-line bg-surface p-4 sm:p-5 shadow-sm">
            {/* Top Tier: Agency Metadata & Project ID */}
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-ink-3">
              <span className="font-medium text-ink-2 bg-surface-2 px-1.5 py-0.5 rounded-[2px] border border-line">
                ปีงบฯ 2569
              </span>
              <span className="font-mono tnum">#68049322058</span>
              <span className="text-ink-4">·</span>
              <span className="font-medium text-ink-2">กรมควบคุมมลพิษ</span>
              <span className="text-ink-4">/</span>
              <span>ส่วนพัฒนาระบบและบริหารระบบสารสนเทศ</span>
            </div>

            {/* Tier 2: Left-Aligned Verdict Badges (รูปแบบใหม่ล่าสุด) */}
            <div className="mt-2 flex flex-wrap items-center gap-1.5 border-b border-line pb-2">
              <span className="inline-flex items-center gap-1.5 rounded-[3px] border border-open-line bg-open-bg px-2 py-0.5 text-[11px] font-semibold text-open">
                <span className="h-1.5 w-1.5 rounded-full bg-open" />
                เปิดรับข้อเสนอ
              </span>
              <span className="inline-flex items-center gap-1 rounded-[3px] border border-risk-line bg-risk-bg px-2 py-0.5 text-[11px] font-semibold text-risk font-mono">
                <span>📊</span>
                <span>ความเสี่ยงล็อกสเปกสูง 81</span>
              </span>
              <span className="inline-flex items-center gap-1 rounded-[3px] border border-amend-line bg-amend-bg px-2 py-0.5 text-[11px] font-semibold text-amend font-mono">
                <span>▲</span>
                <span>สูงกว่าราคากลาง 19%</span>
              </span>
            </div>

            {/* Tier 3: Title */}
            <h3 className="mt-2.5 text-[14.5px] sm:text-[15.5px] font-semibold leading-snug text-ink">
              โครงการพัฒนาระบบสารสนเทศบริการดิจิทัลอัจฉริยะ (Smart TouchPoint) กรมควบคุมมลพิษ ๙ ระบบ
            </h3>

            {/* Tier 4: 3-Column Fact Grid (ราคากลาง, กำหนดยื่น, ความตรงกับคุณ) */}
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 rounded-[4px] bg-surface-2/80 border border-line p-2.5 text-[12px]">
              <div>
                <span className="text-[10px] font-medium text-ink-3 uppercase">ราคากลาง</span>
                <div className="font-mono font-bold text-ink text-[14.5px]">฿4,916,650</div>
                <span className="text-[10px] text-ink-4">วงเงินงบประมาณ</span>
              </div>
              <div>
                <span className="text-[10px] font-medium text-ink-3 uppercase">กำหนดยื่นข้อเสนอ</span>
                <div className="font-semibold text-[13px] text-amend">เหลืออีก 16 วัน</div>
                <span className="text-[10px] text-ink-4">26 พ.ย. 2569</span>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <span className="text-[10px] font-medium text-ink-3 uppercase">ความตรงกับคุณ</span>
                <div className="font-mono font-bold text-open text-[13.5px]">69/100</div>
                <span className="text-[10px] text-ink-3">ตรงบางส่วน (ทักษะเข้าเกณฑ์)</span>
              </div>
            </div>

            {/* Tier 5: Tech Stack Chips (พร้อมไฮไลต์ทักษะที่ตรง) */}
            <div className="mt-2.5 flex items-center gap-1.5 flex-nowrap overflow-hidden text-[11px]">
              <span className="inline-flex items-center gap-1 rounded-[3px] border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10.5px] font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300 shrink-0">
                ⚠️ เฉพาะนิติบุคคล
              </span>
              <span className="h-3 w-px bg-line mx-0.5 shrink-0" />
              <span className="rounded-[3px] border border-open-line bg-open-bg px-2 py-0.5 text-open shrink-0 font-medium">
                ✓ Linux
              </span>
              <span className="rounded-[3px] border border-open-line bg-open-bg px-2 py-0.5 text-open shrink-0 font-medium">
                ✓ Docker
              </span>
              <span className="rounded-[3px] border border-line bg-surface-2 px-2 py-0.5 text-ink-2 shrink-0">
                PostgreSQL 15
              </span>
              <span className="rounded-[3px] border border-line bg-surface-2 px-2 py-0.5 text-ink-2 shrink-0">
                Node.js 20
              </span>
            </div>

            {/* Tier 6: AI Intelligence Insights Box (เหมือนในหน้า TOR Detail #verdict) */}
            <div className="mt-3 space-y-1.5 rounded-md border border-line bg-surface-2/60 p-2.5 text-[11.5px] leading-thai">
              <div className="flex items-start gap-1.5">
                <span className="shrink-0 text-[12px]">🛡️</span>
                <p className="text-ink-2">
                  <strong className="text-ink">สรุปสาระสำคัญ:</strong> ระบบบริการประชาชน 9 บริการ ส่งมอบ 4 งวดงาน ระยะเวลา 180 วัน อัตราค่าปรับความล่าช้า 0.20%/วัน
                </p>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="shrink-0 text-[12px]">🚨</span>
                <p className="text-risk font-medium">
                  <strong>ตรวจจับล็อกสเปก (81/100):</strong> บังคับใบรับรอง NGINX Platinum Partner และประสบการณ์ 10 ปีเกินสมควร — ชี้เป้าว่ามีเจ้าเดิมเต็งไว้ ไม่แนะนำให้ SME ยื่นโดยลำพัง
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* LAYER 2: BEFORE (CLIPPED OVERLAY) — เอกสาร TOR สแกนฉบับราชการ */}
        {/* ========================================================= */}
        <div
          className="absolute inset-0 p-4 sm:p-7 bg-[#f7f4ea] dark:bg-[#16181b] overflow-hidden scanlines text-stone-900 dark:text-stone-200 transition-none"
          style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
        >
          {/* Authentic Scanned Sheet Container */}
          <div className="relative mx-auto max-w-[820px] rounded border border-stone-300/80 dark:border-stone-700/80 bg-white dark:bg-[#1c1f23] p-5 sm:p-7 shadow-sm">
            {/* Top Center Garuda Emblem (เหมือนหน้าแรกของ TOR ราชการ) */}
            <div className="flex flex-col items-center text-center pb-3 border-b border-stone-200 dark:border-stone-800">
              <GarudaSeal className="h-14 w-14 text-stone-800 dark:text-stone-300" />
              <h4 className="mt-2 text-[14px] sm:text-[15px] font-bold tracking-tight text-stone-900 dark:text-stone-100 font-serif">
                ร่างขอบเขตของงาน (Terms of Reference : TOR)
              </h4>
              <p className="text-[12px] sm:text-[13px] font-semibold text-stone-800 dark:text-stone-200 font-serif leading-snug">
                โครงการจ้างพัฒนาระบบสารสนเทศบริการดิจิทัลอัจฉริยะ (Smart TouchPoint) กรมควบคุมมลพิษ ๙ ระบบ
              </p>
              <div className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 text-[10.5px] font-mono text-stone-500 dark:text-stone-400">
                <span>เลขที่โครงการ ๖๘๐๔๙๓๒๒๐๕๘</span>
                <span>·</span>
                <span>ปีงบประมาณ พ.ศ. ๒๕๖๙</span>
                <span>·</span>
                <span>เอกสารสแกนหน้า ๑ จาก ๔๒ หน้า</span>
              </div>
            </div>

            {/* Document Body Clauses */}
            <div className="mt-3.5 space-y-2.5 font-serif text-[11px] sm:text-[12px] leading-relaxed text-stone-800 dark:text-stone-300">
              <p className="indent-6">
                <strong>๑. ความเป็นมาและวัตถุประสงค์:</strong> กรมควบคุมมลพิษ มีความประสงค์จะดำเนินการประกวดราคาจ้างพัฒนาระบบสารสนเทศบริการดิจิทัลอัจฉริยะ (Smart TouchPoint) ด้วยวิธีประกวดราคาอิเล็กทรอนิกส์ (e-bidding) เพื่อยกระดับการให้บริการประชาชนจำนวน ๙ ระบบงาน...
              </p>

              {/* Clause 2: Hidden Lock-spec Requirement */}
              <div className="relative rounded border border-dashed border-red-500/80 bg-red-50/60 dark:bg-red-950/30 p-2 text-stone-800 dark:text-stone-200">
                <span className="absolute -top-2.5 right-2 rounded bg-risk px-1.5 py-0.2 text-[9px] font-sans font-bold text-white shadow-xs">
                  🚨 เงื่อนไขส่อล็อกสเปก (หน้า ๒๘ ข้อ ๒.๓)
                </span>
                <p className="indent-4">
                  <strong>๒. คุณสมบัติเฉพาะของผู้ยื่นข้อเสนอ:</strong> ๒.๓ ผู้ยื่นข้อเสนอต้องเป็นตัวแทนจำหน่ายที่ได้รับการแต่งตั้งอย่างเป็นทางการ (Authorized Platinum Partner) จากเจ้าของผลิตภัณฑ์ซอฟต์แวร์ <strong>NGINX Plus</strong> และ <strong>Microsoft</strong> โดยต้องมีวิศวกรประจำที่มีใบรับรองระดับ Architect ไม่น้อยกว่า ๓ คน และมีประสบการณ์ติดตั้งในหน่วยงานรัฐย้อนหลังไม่น้อยกว่า ๑๐ ปี
                </p>
              </div>

              {/* Clause 3: Technical Stack Requirements */}
              <p className="indent-6">
                <strong>๓. ขอบเขตงานด้านเทคโนโลยี (Technical Specs):</strong> ผู้รับจ้างต้องติดตั้งระบบบนระบบปฏิบัติการ Linux พร้อม Docker Container โดยใช้ระบบจัดการฐานข้อมูล PostgreSQL 15 และ Node.js 20 เชื่อมต่อกับระบบเดิม
              </p>

              {/* Clause 4: Reference Price & Budget */}
              <div className="relative rounded border border-dashed border-amber-500/80 bg-amber-50/60 dark:bg-amber-950/30 p-2 text-stone-800 dark:text-stone-200">
                <span className="absolute -top-2.5 right-2 rounded bg-amend px-1.5 py-0.2 text-[9px] font-sans font-bold text-white shadow-xs">
                  💰 ราคากลางฝังในตารางแนบท้าย
                </span>
                <p className="indent-4">
                  <strong>๔. วงเงินงบประมาณและราคากลาง:</strong> ได้รับจัดสรรงบประมาณ ๔,๙๑๖,๖๕๐.๐๐ บาท (สี่ล้านเก้าแสนหนึ่งหมื่นหกพันหกร้อยห้าสิบบาทถ้วน) และราคากลางคำนวณเป็นเงิน ๔,๙๑๖,๖๕๐.๐๐ บาท
                </p>
              </div>

              {/* Clause 5: Delivery & Penalty */}
              <p className="indent-6">
                <strong>๕. การส่งมอบงานและอัตราค่าปรับ:</strong> ส่งมอบงาน ๔ งวด ภายใน ๑๘๐ วันนับถัดจากวันลงนาม หากส่งมอบล่าช้าคิดค่าปรับรายวันในอัตราร้อยละ <strong>๐.๒๐</strong> ของมูลค่างานจ้างตามสัญญา
              </p>
            </div>

            {/* Bottom Signature & Stamp */}
            <div className="mt-4 pt-2.5 border-t border-stone-200 dark:border-stone-800 flex items-center justify-between text-[10px] text-stone-500">
              <div className="flex items-center gap-1.5 border border-red-600/70 text-red-700 dark:text-red-400 rounded px-2 py-0.5 rotate-[-2deg] font-bold">
                <span>[สำเนาถูกต้อง]</span>
                <span className="font-mono text-[8.5px]">ศูนย์เทคโนโลยีสารสนเทศฯ</span>
              </div>
              <div className="text-right font-serif">
                <span>(ลงชื่อ)....................................................ประธานกรรมการร่าง TOR</span>
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* LAYER 3: DIVIDER HANDLE & PILLS                          */}
        {/* ========================================================= */}
        <div
          className="absolute top-0 bottom-0 pointer-events-none z-20 flex items-center transition-none"
          style={{ left: `${sliderPos}%` }}
        >
          {/* Vertical Hairline */}
          <div className="absolute top-0 bottom-0 -left-[1px] w-[2px] bg-ink shadow-[0_0_12px_rgba(0,0,0,0.5)]" />

          {/* Circular Grabber Handle */}
          <div
            role="slider"
            tabIndex={0}
            aria-valuenow={Math.round(sliderPos)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="เลื่อนเพื่อเปรียบเทียบก่อนและหลังถอดรหัสเอกสาร TOR"
            onKeyDown={handleKeyDown}
            className={`pointer-events-auto absolute -left-5 sm:-left-6 flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full border-2 border-surface bg-ink text-surface shadow-2xl active:scale-110 hover:scale-105 cursor-ew-resize focus:outline-none focus:ring-2 focus:ring-focus ${
              isDragging ? "scale-110 ring-2 ring-focus" : ""
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m9 18-6-6 6-6M15 6l6 6-6 6" />
            </svg>
          </div>
        </div>

        {/* Corner Indicator Pills */}
        <div className="pointer-events-none absolute top-3 left-3 z-10 rounded bg-stone-900/85 text-stone-100 backdrop-blur px-2.5 py-1 text-[11px] font-medium shadow">
          ◄ ก่อน: PDF สแกน 42 หน้า
        </div>
        <div className="pointer-events-none absolute top-3 right-3 z-10 rounded bg-ink/90 text-surface backdrop-blur px-2.5 py-1 text-[11px] font-medium shadow">
          หลัง: GIPDP ถอดรหัส ►
        </div>
      </div>
    </div>
  );
}
