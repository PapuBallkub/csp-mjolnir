"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { BeforeAfterSlider } from "./_components/BeforeAfterSlider";
import { CatalogRow, CatalogRowSkeleton } from "./_components/catalog-row";
import { HeaderControls, Wordmark } from "./_components/shell";
import { useAuth } from "./_components/auth";
import { useProfile } from "./_components/prefs";
import { listTors, type TorInsightSummary } from "./_lib/api";
import { matchFor } from "./_lib/match";

/**
 * แจ้งเตือนเมื่อการเข้าสู่ระบบผ่าน Google ไม่สำเร็จ
 */
function AuthFailedNotice() {
  const params = useSearchParams();
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || params.get("auth") !== "failed") return null;

  return (
    <div
      role="alert"
      className="border-b border-risk-line bg-risk-bg px-4 py-2.5 text-[13px] leading-thai text-risk"
    >
      <div className="mx-auto flex max-w-[1240px] items-center gap-3">
        <span className="flex-1">
          เข้าสู่ระบบด้วย Google ไม่สำเร็จ ลองอีกครั้ง หรือใช้อีเมลและรหัสผ่าน
        </span>
        <Link href="/auth" className="shrink-0 underline underline-offset-2">
          ไปที่หน้าเข้าสู่ระบบ
        </Link>
        <button
          type="button"
          onClick={() => {
            setDismissed(true);
            router.replace("/");
          }}
          aria-label="ปิด"
          className="shrink-0 px-1 text-[15px] leading-none opacity-70 hover:opacity-100 cursor-pointer"
        >
          &times;
        </button>
      </div>
    </div>
  );
}

const QUICK_FILTERS = [
  { label: "🟢 เปิดรับข้อเสนออยู่", href: "/search?statuses=D0" },
  { label: "🛡️ เสี่ยงล็อกสเปกต่ำ", href: "/search?hideHighRisk=true" },
  { label: "💻 ฟรีแลนซ์ยื่นได้", href: "/search?q=บุคคลธรรมดา" },
  { label: "☁️ Cloud & Server", href: "/search?tech=Cloud,Windows+Server" },
  { label: "🤖 AI & Machine Learning", href: "/search?tech=Python,AI" },
];

const SHIELDS = [
  {
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6 text-risk" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
      </svg>
    ),
    title: "เกราะตรวจจับล็อกสเปก (Lock-spec Risk Shield)",
    desc: "วิเคราะห์ข้อกำหนดใน TOR ที่จำเพาะเจาะจงเกินจำเป็น เช่น บังคับใบรับรองพันธมิตรเฉพาะราย หรือเงื่อนไขประสบการณ์ 10 ปีกับเทคโนโลยีที่เพิ่งเปิดตัว เพื่อแจ้งเตือนไม่ให้คุณเสียเวลาเตรียมเอกสารกับงานที่มีเจ้าเดิมเต็งไว้",
    tag: "ประเมินคะแนน 0-100",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6 text-amend" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
      </svg>
    ),
    title: "เกราะตรวจสอบราคากลาง (Price Reality Check)",
    desc: "เปรียบเทียบราคากลางที่ตั้งไว้กับค่ามัธยฐานและค่าเฉลี่ยของโครงการจัดซื้อไอทีย้อนหลังในหมวดเดียวกัน เพื่อให้ผู้บริหาร SME และฟรีแลนซ์ตัดสินใจได้ทันทีว่างบประมาณสมเหตุสมผลและคุ้มค่าแก่การลงทุนทำข้อเสนอหรือไม่",
    tag: "เทียบฐานข้อมูลกว่า 1,000 โครงการ",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6 text-open" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
      </svg>
    ),
    title: "เกราะติดตามการแก้ไขเงียบ (Silent Amendment Watchdog)",
    desc: "เอกสาร TOR ภาครัฐมักมีการแก้ไข (รหัส e-GP D2) แบบเงียบๆ โดยไม่มีบันทึกการเปลี่ยนแปลง (Changelog) ระบบจะตรวจสอบและเปรียบเทียบข้อความที่เปลี่ยนแปลง (Diff) พร้อมแจ้งเตือนทันที ป้องกันไม่ให้คุณยื่นผิดเวอร์ชัน",
    tag: "ตรวจจับรหัส D2 และแจ้งเตือนอัตโนมัติ",
  },
];

const PERSONAS = [
  {
    role: "เจ้าของบริษัท SME Tech & System Integrator",
    benefit: "สแกนหาโครงการมูลค่า 1–20 ล้านบาทอย่างรวดเร็ว ตรวจสอบความเสี่ยงล็อกสเปกก่อนมอบหมายให้ทีมงานลงแรงทำข้อเสนอ ช่วยประหยัดต้นทุนและเพิ่มโอกาสชนะงานจริง",
    points: ["คัดกรองงบประมาณและกำหนดยื่น", "ตรวจจับข้อกำหนดกีดกันคู่แข่ง", "เปรียบเทียบราคากลางย้อนหลัง"],
  },
  {
    role: "ฟรีแลนซ์ & ทีมนักพัฒนาอิสระ",
    benefit: "ค้นหาโครงการบำรุงรักษาหรืองานระบบเปิดกว้างที่ไม่จำกัดเฉพาะนิติบุคคล (บุคคลธรรมดายื่นได้) พร้อมจับคู่ทักษะเทคโนโลยีที่คุณถนัด (Tech Stack Matching)",
    points: ["กรองงานบุคคลธรรมดายื่นได้", "ดู Tech Stack และเวอร์ชันชัดเจน", "จับคู่ทักษะกับโปรไฟล์ของฉัน"],
  },
  {
    role: "สื่อมวลชน & ภาคประชาชน (Civic Watchdog)",
    benefit: "ตรวจสอบความโปร่งใสของการจัดซื้อจัดจ้างภาครัฐ ติดตามประวัติการแก้ไขเอกสาร TOR ที่น่าสงสัย และดูส่วนต่างของราคากลางเทียบกับมาตรฐานตลาด",
    points: ["ประวัติการแก้ไขและจุดเปลี่ยนแปลง", "เปรียบเทียบราคากลางกับค่ามัธยฐาน", "หลักฐานอ้างอิงตรงกับเอกสารต้นฉบับ"],
  },
];

export default function LandingPage() {
  const router = useRouter();
  const { status: authStatus } = useAuth();
  const { profile } = useProfile();

  const [searchQuery, setSearchQuery] = useState("");
  const [featuredTors, setFeaturedTors] = useState<TorInsightSummary[]>([]);
  const [isLoadingTors, setIsLoadingTors] = useState(true);

  // Fetch 5 live open projects to feature on the discovery section
  useEffect(() => {
    let cancelled = false;
    listTors({ limit: 5, status: ["Draft", "Open"] })
      .then((res) => {
        if (!cancelled && res.ok) {
          const onlyActive = res.data.tors
            .filter((t) => t.identification.status === "Draft" || t.identification.status === "Open")
            .slice(0, 5);
          setFeaturedTors(onlyActive);
        }
      })
      .catch(() => {
        // Fallback gracefully
      })
      .finally(() => {
        if (!cancelled) setIsLoadingTors(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = searchQuery.trim();
    if (q) {
      router.push(`/search?q=${encodeURIComponent(q)}`);
    } else {
      router.push("/search");
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface text-ink">
      <Suspense fallback={null}>
        <AuthFailedNotice />
      </Suspense>

      {/* Navigation Header */}
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex min-h-[52px] max-w-[1240px] items-center gap-3 sm:gap-4 px-3 sm:px-4 py-2.5">
          <Link
            href="/"
            className="flex h-[26px] items-center shrink-0 transition-opacity hover:opacity-80"
            title="หน้าแรก GIPDP"
          >
            <Wordmark />
          </Link>
          <nav className="-mx-1 hidden sm:flex min-w-0 items-center gap-1 overflow-x-auto px-1">
            <Link
              href="/search"
              className="rounded-[3px] px-2.5 py-1.5 text-[13px] text-ink-2 hover:bg-surface-2 hover:text-ink transition-colors"
            >
              ค้นหาประกาศ
            </Link>
            <Link
              href="/watchlist"
              className="rounded-[3px] px-2.5 py-1.5 text-[13px] text-ink-2 hover:bg-surface-2 hover:text-ink transition-colors"
            >
              รายการติดตาม
            </Link>
            <Link
              href="/watchdog"
              className="rounded-[3px] px-2.5 py-1.5 text-[13px] text-ink-2 hover:bg-surface-2 hover:text-ink transition-colors"
            >
              ตรวจสอบราคา/การแก้ไข
            </Link>
          </nav>
          <HeaderControls className="ml-auto" />
        </div>
      </header>

      <main className="flex-1">
        {/* ========================================================= */}
        {/* SECTION 0: INTERACTIVE PRIMER — Before/After Simulator     */}
        {/* "ก่อนเข้าสู่หน้าค้นหา ให้ผู้ใช้เห็นว่าเว็บนี้ทำอะไรได้ทันที" */}
        {/* ========================================================= */}
        <section className="border-b border-line bg-surface py-12 sm:py-16">
          <div className="mx-auto max-w-[1240px] px-4">
            {/* Lead Headline */}
            <div className="mx-auto max-w-[840px] text-center">
              <h1 className="text-[28px] sm:text-[40px] font-bold tracking-tight text-ink leading-[1.25]">
                ค้นหาโครงการไอทีภาครัฐที่คุณทำได้จริง
              </h1>
              <p className="mt-3 text-[14.5px] sm:text-[16px] leading-thai text-ink-2">
                เปลี่ยนเอกสารสแกน 40 หน้าภาษาราชการ ให้กลายเป็นข้อมูลพร้อมตัดสินใจใน 3 วินาที — สรุปภาษาคน ตรวจจับล็อกสเปก และเปรียบเทียบราคากลาง เพื่อให้ SME และฟรีแลนซ์เข้าถึงโอกาสอย่างเท่าเทียม
              </p>
            </div>

            {/* The Interactive Before/After Comparison Slider */}
            <div className="mt-8 sm:mt-10 max-w-[1040px] mx-auto">
              <div className="mb-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[12px] text-ink-3">
                <span className="font-semibold text-ink">
                  ตัวจำลองการถอดรหัส (Interactive TOR Decoder):
                </span>
                <span className="text-[11.5px]">
                  ลองเลื่อนตัวแบ่งซ้าย-ขวา เพื่อดูความเปลี่ยนแปลง
                </span>
              </div>

              <BeforeAfterSlider initialPosition={50} />
            </div>

            {/* 3 Core Value Micro-Cards */}
            <div className="mt-10 mx-auto max-w-[1040px] grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-[4px] border border-line bg-surface-2 p-4">
                <div className="text-[13px] font-semibold text-risk flex items-center gap-1.5">
                  <span>🚨</span>
                  <span>ตรวจจับล็อกสเปก</span>
                </div>
                <p className="mt-1.5 text-[12.5px] leading-thai text-ink-2">
                  ชี้เป้าข้อกำหนดผิดปกติ ใบรับรองเฉพาะราย หรือเงื่อนไขที่ตั้งใจกีดกันผู้แข่งขัน ไม่ให้คุณเสียเวลาทำข้อเสนอฟรี
                </p>
              </div>

              <div className="rounded-[4px] border border-line bg-surface-2 p-4">
                <div className="text-[13px] font-semibold text-amend flex items-center gap-1.5">
                  <span>📊</span>
                  <span>ตรวจสอบราคากลาง</span>
                </div>
                <p className="mt-1.5 text-[12.5px] leading-thai text-ink-2">
                  เทียบราคากลางกับค่ามัธยฐานในอดีตกว่า 1,000 โครงการ ประเมินความคุ้มค่าและอัตรากำไรก่อนตัดสินใจยื่นแข่งขัน
                </p>
              </div>

              <div className="rounded-[4px] border border-line bg-surface-2 p-4">
                <div className="text-[13px] font-semibold text-open flex items-center gap-1.5">
                  <span>🎯</span>
                  <span>จับคู่ทักษะอัตโนมัติ</span>
                </div>
                <p className="mt-1.5 text-[12.5px] leading-thai text-ink-2">
                  คำนวณคะแนนความตรงระหว่างสเปกเทคโนโลยีของโครงการ กับทักษะความเชี่ยวชาญที่คุณบันทึกไว้ในโปรไฟล์
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================= */}
        {/* SECTION 1: LIVE DISCOVERY HERO — ค้นหาและดูประกาศจริง        */}
        {/* ========================================================= */}
        <section className="bg-surface-2 border-b border-line py-12 sm:py-16">
          <div className="mx-auto max-w-[1040px] px-4">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
              <div>
                <h2 className="text-[20px] sm:text-[24px] font-bold tracking-tight text-ink">
                  ค้นหาประกาศจัดซื้อจัดจ้างจริงที่เปิดรับอยู่
                </h2>
                <p className="mt-1 text-[13px] text-ink-2 leading-thai">
                  รวบรวมประกาศจาก e-GP และหน่วยงานรัฐทั่วประเทศ ถอดรหัสและพร้อมตรวจสอบความเสี่ยงแล้ว
                </p>
              </div>
              <Link
                href="/search"
                className="text-[13px] font-semibold text-open hover:underline shrink-0"
              >
                ดูทั้งหมดในแคตตาล็อก →
              </Link>
            </div>

            {/* Interactive Search Bar Form */}
            <form onSubmit={handleSearchSubmit} className="mb-4">
              <div className="flex gap-2 rounded-lg border border-line bg-surface p-1.5 shadow-sm">
                <div className="relative flex-1 flex items-center pl-3">
                  <svg
                    viewBox="0 0 16 16"
                    className="pointer-events-none absolute left-3.5 h-4 w-4 text-ink-3"
                    aria-hidden="true"
                  >
                    <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
                    <path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="พิมพ์ชื่อโครงการ, หน่วยงาน หรือเทคโนโลยี เช่น Windows Server, Docker, PostgreSQL, Cloud..."
                    className="w-full pl-7 pr-3 py-2 text-[13.5px] bg-transparent text-ink placeholder:text-ink-3 focus:outline-none"
                    aria-label="ค้นหาประกาศจัดซื้อจัดจ้าง IT"
                  />
                </div>
                <button
                  type="submit"
                  className="rounded-[4px] bg-ink px-5 py-2 text-[13.5px] font-medium text-surface transition-opacity hover:opacity-85 cursor-pointer shrink-0"
                >
                  ค้นหาประกาศ
                </button>
              </div>
            </form>

            {/* Quick Filter Tags */}
            <div className="flex flex-wrap items-center gap-1.5 mb-8">
              <span className="text-[12px] font-medium text-ink-3 mr-1">ช็อตคัตยอดนิยม:</span>
              {QUICK_FILTERS.map((f) => (
                <Link
                  key={f.href}
                  href={f.href}
                  className="rounded-[3px] border border-line bg-surface px-2.5 py-1 text-[12px] text-ink-2 hover:bg-surface-3 hover:text-ink transition-colors"
                >
                  {f.label}
                </Link>
              ))}
            </div>

            {/* Featured Live TOR Cards */}
            <div className="space-y-3">
              {isLoadingTors ? (
                <div className="flex flex-col gap-3">
                  {Array.from({ length: 5 }, (_, i) => (
                    <CatalogRowSkeleton key={i} />
                  ))}
                </div>
              ) : featuredTors.length > 0 ? (
                featuredTors.slice(0, 5).map((tor) => {
                  const match = authStatus === "authenticated" ? matchFor(tor, profile) : undefined;
                  return <CatalogRow key={tor.projectId} tor={tor} now={new Date()} match={match} />;
                })
              ) : (
                <div className="rounded border border-line bg-surface p-6 text-center text-[13px] text-ink-2">
                  ขณะนี้กำลังเชื่อมต่อฐานข้อมูลโครงการ คุณสามารถกด{" "}
                  <Link href="/search" className="font-semibold text-open underline">
                    ไปที่หน้าค้นหาหลัก
                  </Link>{" "}
                  เพื่อดูประกาศทั้งหมด
                </div>
              )}
            </div>

            <div className="mt-6 text-center">
              <Link
                href="/search"
                className="inline-flex h-10 items-center justify-center rounded-[3px] border border-line bg-surface px-6 text-[13.5px] font-medium text-ink transition-colors hover:bg-surface-3"
              >
                ดูประกาศจัดซื้อจัดจ้างทั้งหมดในระบบ →
              </Link>
            </div>
          </div>
        </section>

        {/* ========================================================= */}
        {/* SECTION 2: 3 CORE SHIELDS — 3 เกราะป้องกันผู้ยื่นประมูล      */}
        {/* ========================================================= */}
        <section className="bg-surface py-16 sm:py-20 border-b border-line">
          <div className="mx-auto max-w-[1040px] px-4">
            <div className="text-center max-w-[680px] mx-auto mb-12">
              <h2 className="text-[22px] sm:text-[28px] font-bold tracking-tight text-ink">
                3 เกราะป้องกันความเสี่ยงสำหรับผู้ยื่นประมูล
              </h2>
              <p className="mt-2 text-[14px] leading-thai text-ink-2">
                เครื่องมือช่วยผู้ยื่นประมูลรายเล็กและฟรีแลนซ์ ให้มีข้อมูลเชิงลึกทัดเทียมกับบริษัทใหญ่
              </p>
            </div>

            <div className="grid gap-6 sm:grid-cols-3">
              {SHIELDS.map((s, idx) => (
                <div
                  key={idx}
                  className="flex flex-col rounded-[4px] border border-line bg-surface-2 p-5 transition-colors hover:border-line-2"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="rounded p-1.5 bg-surface border border-line">{s.icon}</div>
                    <span className="text-[10.5px] font-mono text-ink-3 bg-surface px-2 py-0.5 rounded border border-line">
                      {s.tag}
                    </span>
                  </div>
                  <h3 className="text-[15px] font-semibold text-ink leading-snug">{s.title}</h3>
                  <p className="mt-2 text-[12.5px] leading-thai text-ink-2 flex-1">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ========================================================= */}
        {/* SECTION 3: AUDIENCE PERSONAS — แพลตฟอร์มนี้สร้างมาเพื่อใคร   */}
        {/* ========================================================= */}
        <section className="bg-surface-2 py-16 sm:py-20 border-b border-line">
          <div className="mx-auto max-w-[1040px] px-4">
            <div className="text-center max-w-[960px] mx-auto mb-12">
              <h2 className="text-[22px] sm:text-[28px] font-bold tracking-tight text-ink">
                ออกแบบมาเพื่อผู้ยื่นประมูลที่ต้องการความโปร่งใส
              </h2>
              <p className="mt-2 text-[14px] leading-thai text-ink-2 lg:whitespace-nowrap">
                ไม่ว่าคุณจะเป็นเจ้าของกิจการ นักพัฒนาอิสระ หรือผู้ตรวจสอบสังคม ข้อมูลทั้งหมดเปิดให้เข้าถึงได้โดยไม่ต้องเสียค่าใช้จ่าย
              </p>
            </div>

            <div className="grid gap-6 sm:grid-cols-3">
              {PERSONAS.map((p, idx) => (
                <div key={idx} className="rounded-[4px] border border-line bg-surface p-5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-open">
                    กลุ่มผู้ใช้งาน #{idx + 1}
                  </span>
                  <h3 className="mt-1 text-[15.5px] font-bold text-ink">{p.role}</h3>
                  <p className="mt-2 text-[12.5px] leading-thai text-ink-2">{p.benefit}</p>
                  <ul className="mt-4 space-y-1.5 border-t border-line/60 pt-3 text-[11.5px] text-ink-3">
                    {p.points.map((pt, pIdx) => (
                      <li key={pIdx} className="flex items-center gap-1.5">
                        <span className="text-open font-bold">✓</span>
                        <span>{pt}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ========================================================= */}
        {/* SECTION 4: CALL TO ACTION BANNER                          */}
        {/* ========================================================= */}
        <section className="bg-surface py-16 text-center">
          <div className="mx-auto max-w-[1040px] px-4">
            <h2 className="text-[24px] sm:text-[30px] font-bold tracking-tight text-ink">
              พร้อมเริ่มต้นค้นหาโครงการไอทีภาครัฐแล้วหรือยัง?
            </h2>
            <p className="mt-3 text-[14.5px] leading-thai text-ink-2 lg:whitespace-nowrap">
              ค้นหาและอ่านสรุป TOR ได้ทันทีโดยไม่ต้องมีบัญชีผู้ใช้ หรือสมัครใช้งานฟรีเพื่อบันทึกโปรไฟล์ทักษะและรับคะแนนความเหมาะสมรายโครงการ
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/search"
                className="inline-flex h-10 min-w-[170px] items-center justify-center rounded-[3px] bg-ink px-5 text-[14px] font-medium text-surface transition-opacity hover:opacity-85"
              >
                เริ่มค้นหาประกาศ TOR
              </Link>
              <Link
                href="/auth"
                className="inline-flex h-10 min-w-[150px] items-center justify-center rounded-[3px] border border-line px-5 text-[14px] font-medium text-ink transition-colors hover:bg-surface-2"
              >
                สมัครใช้งานฟรี
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Official Disclaimer Footer */}
      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 text-[11.5px] text-ink-3">
          <Wordmark className="opacity-70" />
          <span className="leading-thai">
            แพลตฟอร์มค้นหาและวิเคราะห์ประกาศจัดซื้อจัดจ้างภาครัฐด้าน IT (เครื่องมืออิสระบุคคลที่สาม — การยื่นข้อเสนอและการประมูลทางการทั้งหมดทำผ่านระบบ e-GP ของกรมบัญชีกลาง)
          </span>
          <span className="ml-auto font-mono text-[11px] text-ink-4">01219346 · Kasetsart University</span>
        </div>
      </footer>
    </div>
  );
}
