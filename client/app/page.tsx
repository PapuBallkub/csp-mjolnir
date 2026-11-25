"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { BeforeAfterSlider } from "./_components/BeforeAfterSlider";
import { CatalogRow, CatalogRowSkeleton } from "./_components/catalog-row";
import { SiteFooter, SiteHeader } from "./_components/shell";
import { useAuth } from "./_components/auth";
import { useProfile } from "./_components/prefs";
import { listTors, torFacets, type TorFacets, type TorInsightSummary } from "./_lib/api";
import { isProfileBaseline, matchFor } from "./_lib/match";

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

const SHIELDS = [
  {
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5 text-risk" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
      </svg>
    ),
    title: "ตรวจจับความเสี่ยงล็อกสเปก (Lock-Spec Risk)",
    desc: "ชี้เป้าข้อกำหนดใน TOR ที่แคบกว่ามาตรฐานทั่วไป เช่น การระบุยี่ห้อเฉพาะราย ใบรับรองตัวแทนจำหน่าย หรือเกณฑ์ประสบการณ์สูงผิดปกติ พร้อมอ้างอิงเลขหน้าและข้อในเอกสารต้นฉบับ",
    tag: "ประเมินคะแนน 0–100 · อ้างอิง ว 214",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5 text-amend" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <path d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
      </svg>
    ),
    title: "ตรวจสอบราคากลาง (Price Reality Check)",
    desc: "เปรียบเทียบราคากลางของโครงการกับค่ามัธยฐานและค่าเฉลี่ยของงานไอทีลักษณะเดียวกันในอดีต เพื่อประเมินความสมเหตุสมผลของงบประมาณก่อนตัดสินใจยื่นข้อเสนอ",
    tag: "เทียบข้อมูล e-GP & data.go.th",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5 text-open" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <path d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
      </svg>
    ),
    title: "ติดตามการแก้ไขเอกสาร (Amendment Tracker)",
    desc: "ตรวจจับการเปลี่ยนแปลงประกาศเชิญชวน (รหัส e-GP D2) และการแก้ไขไฟล์เอกสาร TOR พร้อมสรุปจุดที่เปลี่ยนแปลง (Diff) และแจ้งเตือนรายการที่คุณติดตามอัตโนมัติ",
    tag: "ตรวจจับรหัส D2 และแจ้งเตือนอัตโนมัติ",
  },
];

const PERSONAS = [
  {
    role: "บริษัท SME Tech & System Integrator",
    benefit: "สแกนหาโครงการตามงบประมาณและกำหนดยื่นได้อย่างรวดเร็ว พร้อมดูสัญญาณความเสี่ยงล็อกสเปกและราคากลางก่อนลงทุนเวลาเตรียมข้อเสนอ",
    points: ["คัดกรองงบประมาณและกำหนดยื่น", "ตรวจสอบเงื่อนไขที่แคบกว่าเกณฑ์ปกติ", "เปรียบเทียบราคากลางย้อนหลัง"],
  },
  {
    role: "ฟรีแลนซ์ & ทีมนักพัฒนาอิสระ",
    benefit: "มองเห็นชัดเจนทันทีว่าโครงการใดเปิดกว้างสำหรับบุคคลธรรมดาหรือกำหนดเฉพาะนิติบุคคล พร้อมคำนวณคะแนนความเหมาะสมกับทักษะที่คุณถนัด",
    points: ["แสดงป้ายเฉพาะนิติบุคคลชัดเจน", "ดู Tech Stack และเวอร์ชันทันที", "จัดอันดับงานตามโปรไฟล์ทักษะ"],
  },
  {
    role: "สื่อมวลชน & ผู้ตรวจสอบภาคประชาชน",
    benefit: "เข้าถึงข้อมูลภาพรวมราคากลางย้อนหลัง ประวัติการแก้ไขเอกสาร TOR และหลักฐานอ้างอิงที่เชื่อมกลับไปยังเอกสารต้นฉบับของ e-GP ได้โดยไม่ต้องสมัครสมาชิก",
    points: ["ประวัติการแก้ไขและจุดเปลี่ยนแปลง", "เปรียบเทียบราคากลางกับค่ามัธยฐาน", "เชื่อมตรงเอกสารต้นฉบับทุกโครงการ"],
  },
];

function formatUpdatedShort(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "2-digit",
  }).format(date);
}

export default function LandingPage() {
  const router = useRouter();
  const { status: authStatus } = useAuth();
  const { profile } = useProfile();

  const [searchQuery, setSearchQuery] = useState("");
  const [featuredTors, setFeaturedTors] = useState<TorInsightSummary[]>([]);
  const [fetchedAt, setFetchedAt] = useState<Date>(() => new Date());
  const [isLoadingTors, setIsLoadingTors] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [facets, setFacets] = useState<TorFacets | null>(null);

  const isAuthed = authStatus === "authenticated";
  const hasProfile = isAuthed && !isProfileBaseline(profile);

  // Fetch live catalog stats (facets) and 5 active (Draft/Open) projects
  useEffect(() => {
    let cancelled = false;

    Promise.all([
      listTors({ limit: 5, status: ["Draft", "Open"] }),
      torFacets(),
    ])
      .then(([listRes, facetsRes]) => {
        if (cancelled) return;
        if (facetsRes.ok) {
          setFacets(facetsRes.data);
        }
        if (listRes.ok) {
          const onlyActive = listRes.data.tors
            .filter((t) => t.identification.status === "Draft" || t.identification.status === "Open")
            .slice(0, 5);
          setFeaturedTors(onlyActive);
          setFetchedAt(new Date());
          setLoadError(false);
        } else {
          setLoadError(true);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingTors(false);
      });

    return () => {
      cancelled = true;
    };
  }, [retryCount]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = searchQuery.trim();
    if (q) {
      router.push(`/search?q=${encodeURIComponent(q)}`);
    } else {
      router.push("/search");
    }
  }

  function handleRetry() {
    setIsLoadingTors(true);
    setLoadError(false);
    setRetryCount((n) => n + 1);
  }

  const activeCount = facets ? (facets.statuses.Open ?? 0) + (facets.statuses.Draft ?? 0) : null;
  const updatedLabel = formatUpdatedShort(facets?.lastUpdated ?? null);

  return (
    <div className="flex min-h-screen flex-col bg-surface text-ink">
      <Suspense fallback={null}>
        <AuthFailedNotice />
      </Suspense>

      {/* Navigation Header */}
      <SiteHeader />

      <main className="flex-1">
        {/* ========================================================= */}
        {/* SECTION 0: ABOVE-THE-FOLD HERO — Search, CTAs & Live Stats */}
        {/* ========================================================= */}
        <section className="relative border-b border-line bg-surface py-10 sm:py-14">
          <div className="scanlines pointer-events-none absolute inset-0 opacity-40" aria-hidden="true" />
          <div className="relative mx-auto max-w-[1040px] px-4">
            <div className="mx-auto max-w-[780px] text-center">
              <h1 className="text-[26px] sm:text-[38px] font-bold tracking-tight text-ink leading-[1.25]">
                ค้นหาโครงการไอทีภาครัฐที่คุณทำได้จริง
              </h1>
              <p className="mt-3 text-[14.5px] sm:text-[16px] leading-thai text-ink-2">
                เปลี่ยนเอกสารสแกน TOR หลายสิบหน้าภาษาราชการ ให้เป็นข้อมูลพร้อมตัดสินใจ — สรุปสาระสำคัญ ตรวจสอบข้อกำหนดล็อกสเปก และเทียบราคากลางย้อนหลัง โดยไม่ต้องเปิด PDF
              </p>
            </div>

            {/* Primary Search Bar (Above the Fold) */}
            <form onSubmit={handleSearchSubmit} className="mx-auto mt-6 max-w-[780px]">
              <div className="flex flex-col gap-2 sm:flex-row rounded-2xl border border-line-2 bg-surface p-1.5 shadow-sm focus-within:border-ink">
                <div className="relative flex flex-1 items-center">
                  <svg
                    viewBox="0 0 16 16"
                    className="pointer-events-none absolute left-3.5 h-4 w-4 text-ink-3"
                    aria-hidden="true"
                  >
                    <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
                    <path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                  <input
                    id="landing-search"
                    name="q"
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="พิมพ์ชื่อโครงการ, หน่วยงาน หรือเทคโนโลยี เช่น Cloud, PostgreSQL, Docker..."
                    className="w-full py-2 pl-10 pr-3 text-[13.5px] bg-transparent text-ink placeholder:text-ink-3 focus:outline-none"
                    aria-label="ค้นหาประกาศจัดซื้อจัดจ้าง IT"
                  />
                </div>
                <button
                  type="submit"
                  className="rounded-full bg-ink px-6 py-2.5 sm:py-2 text-[13.5px] font-medium text-surface transition-opacity hover:opacity-85 cursor-pointer shrink-0"
                >
                  ค้นหาประกาศ
                </button>
              </div>
            </form>

            {/* Primary & Secondary CTAs (Auth-aware, no sign-in wall) */}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5 text-[13px]">
              <Link
                href="/search"
                className="inline-flex h-9 items-center justify-center rounded-full border border-line-2 bg-surface px-4.5 font-medium text-ink transition-colors hover:bg-surface-2"
              >
                ดูประกาศทั้งหมดในระบบ →
              </Link>
              {isAuthed ? (
                <Link
                  href={hasProfile ? "/search?sort=match-desc" : "/profile"}
                  className="inline-flex h-9 items-center justify-center rounded-full border border-open-line bg-open-bg px-4.5 font-medium text-open transition-opacity hover:opacity-90"
                >
                  {hasProfile ? "ดูประกาศที่เหมาะกับโปรไฟล์ของฉัน" : "ตั้งค่าโปรไฟล์และทักษะ"}
                </Link>
              ) : (
                <Link
                  href="/auth"
                  className="inline-flex h-9 items-center justify-center rounded-full border border-line bg-surface-2 px-4.5 font-medium text-ink-2 transition-colors hover:border-line-2 hover:text-ink"
                >
                  เข้าสู่ระบบเพื่อจับคู่ทักษะ
                </Link>
              )}
              <Link
                href="/watchdog"
                className="inline-flex h-9 items-center justify-center rounded-full px-3.5 text-ink-2 underline underline-offset-2 transition-colors hover:text-ink"
              >
                ภาพรวมราคากลางและความเสี่ยง
              </Link>
            </div>

            {/* Live Catalog Metrics Strip (backed by real /api/tors/facets) */}
            <div className="mx-auto mt-7 grid max-w-[780px] grid-cols-3 divide-x divide-line rounded-2xl border border-line bg-surface-2/80 text-center">
              <div className="px-2 py-2.5 sm:px-4">
                <div className="font-mono tnum text-[17px] sm:text-[20px] font-bold text-ink">
                  {facets ? facets.total.toLocaleString() : "—"}
                </div>
                <div className="mt-0.5 text-[11px] sm:text-[11.5px] text-ink-3">
                  ประกาศ IT ที่ถอดรหัสแล้ว
                </div>
              </div>
              <div className="px-2 py-2.5 sm:px-4">
                <div className="font-mono tnum text-[17px] sm:text-[20px] font-bold text-open">
                  {activeCount !== null ? activeCount.toLocaleString() : "—"}
                </div>
                <div className="mt-0.5 text-[11px] sm:text-[11.5px] text-ink-3">
                  เปิดรับ / รับฟังความเห็น
                </div>
              </div>
              <div className="px-2 py-2.5 sm:px-4">
                <div className="font-mono tnum text-[15px] sm:text-[20px] font-bold text-ink whitespace-nowrap">
                  {updatedLabel ?? (facets ? `${facets.agencies.length}+` : "—")}
                </div>
                <div className="mt-0.5 text-[11px] sm:text-[11.5px] text-ink-3">
                  {updatedLabel ? "อัปเดตข้อมูลล่าสุด" : "หน่วยงานภาครัฐ"}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================= */}
        {/* SECTION 1: INTERACTIVE TOR DECODER (Before / After)       */}
        {/* ========================================================= */}
        <section className="border-b border-line bg-surface-2 py-10 sm:py-14">
          <div className="mx-auto max-w-[1040px] px-4">
            <div className="mb-4 flex flex-col sm:flex-row sm:items-end justify-between gap-2">
              <div>
                <h2 className="text-[19px] sm:text-[22px] font-bold tracking-tight text-ink">
                  จากเอกสารสแกน 42 หน้า สู่ข้อมูลพร้อมตัดสินใจในหน้าเดียว
                </h2>
                <p className="mt-1 text-[13px] leading-thai text-ink-2">
                  ตัวอย่างการแยกข้อเท็จจริงจากเอกสาร TOR ออกจากผลการวิเคราะห์ความเสี่ยงของ GIPDP (ข้อมูลตัวอย่างจำลอง)
                </p>
              </div>
              <span className="hidden sm:inline text-[12px] text-ink-3 shrink-0">
                ลากเส้นแบ่งซ้าย–ขวา หรือกดปุ่มลูกศรเพื่อเปรียบเทียบ
              </span>
            </div>

            <BeforeAfterSlider initialPosition={38} />
          </div>
        </section>

        {/* ========================================================= */}
        {/* SECTION 2: LIVE DISCOVERY — ประกาศล่าสุดในระบบ              */}
        {/* ========================================================= */}
        <section className="border-b border-line bg-surface py-12 sm:py-16">
          <div className="mx-auto max-w-[1040px] px-4">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-[20px] sm:text-[24px] font-bold tracking-tight text-ink">
                  ประกาศจัดซื้อจัดจ้างล่าสุดที่เปิดรับหรืออยู่ระหว่างรับฟังความเห็น
                </h2>
                <p className="mt-1 text-[13px] text-ink-2 leading-thai">
                  ดึงข้อมูลจริงจาก e-GP และหน่วยงานรัฐทั่วประเทศ — เปิดอ่านสรุปได้ทันทีโดยไม่ต้องลงชื่อเข้าใช้
                </p>
              </div>
              <Link
                href="/search"
                className="text-[13px] font-medium text-ink-2 underline underline-offset-2 hover:text-ink shrink-0"
              >
                ดูทั้งหมด →
              </Link>
            </div>

            {/* Featured Live TOR Cards */}
            <div className="space-y-3">
              {isLoadingTors ? (
                <div className="flex flex-col gap-3">
                  {Array.from({ length: 5 }, (_, i) => (
                    <CatalogRowSkeleton key={i} />
                  ))}
                </div>
              ) : loadError ? (
                <div className="rounded-2xl border border-line bg-surface-2 p-6 text-center text-[13px] text-ink-2">
                  <p className="font-medium text-ink">โหลดรายการประกาศล่าสุดไม่สำเร็จชั่วคราว</p>
                  <p className="mt-1 text-ink-3">
                    เซิร์ฟเวอร์อาจขัดข้องชั่วคราว ลองโหลดใหม่อีกครั้ง หรือเข้าดูที่หน้าค้นหาหลัก
                  </p>
                  <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={handleRetry}
                      className="inline-flex h-8 items-center rounded-full border border-line-2 bg-surface px-4 text-[12.5px] font-medium text-ink hover:bg-surface-3 cursor-pointer"
                    >
                      ลองโหลดใหม่
                    </button>
                    <Link
                      href="/search"
                      className="inline-flex h-8 items-center rounded-full px-3 text-[12.5px] font-medium text-ink-2 underline underline-offset-2 hover:text-ink"
                    >
                      ไปที่หน้าค้นหาหลัก
                    </Link>
                  </div>
                </div>
              ) : featuredTors.length > 0 ? (
                featuredTors.map((tor) => {
                  const match = hasProfile ? matchFor(tor, profile) : undefined;
                  return <CatalogRow key={tor.projectId} tor={tor} now={fetchedAt} match={match} />;
                })
              ) : (
                <div className="rounded-2xl border border-line bg-surface-2 p-6 text-center text-[13px] text-ink-2">
                  ขณะนี้ยังไม่มีประกาศสถานะเปิดรับข้อเสนอหรือร่างรับฟังความเห็น คุณสามารถดูโครงการในอดีตทั้งหมดได้ที่{" "}
                  <Link href="/search" className="font-semibold text-ink underline underline-offset-2">
                    หน้าค้นหาประกาศทั้งหมด
                  </Link>
                </div>
              )}
            </div>

            <div className="mt-6 text-center">
              <Link
                href="/search"
                className="inline-flex h-10 items-center justify-center rounded-full border border-line-2 bg-surface px-6 text-[13.5px] font-medium text-ink transition-colors hover:bg-surface-2"
              >
                ดูประกาศจัดซื้อจัดจ้างทั้งหมดในระบบ →
              </Link>
            </div>
          </div>
        </section>

        {/* ========================================================= */}
        {/* SECTION 3: 3 CORE SHIELDS — 3 เครื่องมือช่วยวิเคราะห์ความเสี่ยง */}
        {/* ========================================================= */}
        <section className="border-b border-line bg-surface-2 py-14 sm:py-16">
          <div className="mx-auto max-w-[1040px] px-4">
            <div className="text-center max-w-[680px] mx-auto mb-10">
              <h2 className="text-[21px] sm:text-[26px] font-bold tracking-tight text-ink">
                3 เครื่องมือช่วยตัดสินใจก่อนลงแรงทำข้อเสนอ
              </h2>
              <p className="mt-2 text-[14px] leading-thai text-ink-2">
                แยกข้อเท็จจริงจากเอกสาร TOR ออกจากผลการวิเคราะห์ เพื่อให้ผู้ยื่นประมูลรายเล็กเห็นข้อมูลสำคัญครบในที่เดียว
              </p>
            </div>

            <div className="grid gap-5 sm:grid-cols-3">
              {SHIELDS.map((s) => (
                <div
                  key={s.title}
                  className="flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-xs transition-colors hover:border-line-2"
                >
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="rounded-xl p-2 bg-surface-2 border border-line shrink-0">{s.icon}</div>
                    <span className="text-[10.5px] font-mono text-ink-3 bg-surface-2 px-2.5 py-0.5 rounded-full border border-line truncate">
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
        {/* SECTION 4: AUDIENCE PERSONAS — แพลตฟอร์มนี้สร้างมาเพื่อใคร   */}
        {/* ========================================================= */}
        <section className="border-b border-line bg-surface py-14 sm:py-16">
          <div className="mx-auto max-w-[1040px] px-4">
            <div className="text-center max-w-[760px] mx-auto mb-10">
              <h2 className="text-[21px] sm:text-[26px] font-bold tracking-tight text-ink">
                ออกแบบมาเพื่อผู้ยื่นประมูลและผู้ติดตามข้อมูลสาธารณะ
              </h2>
              <p className="mt-2 text-[14px] leading-thai text-ink-2">
                ไม่ว่าคุณจะเป็นเจ้าของกิจการ นักพัฒนาอิสระ หรือผู้ตรวจสอบสังคม ข้อมูลประกาศและภาพรวมราคาเปิดให้เข้าถึงได้ฟรีโดยไม่ต้องมีบัญชี
              </p>
            </div>

            <div className="grid gap-5 sm:grid-cols-3">
              {PERSONAS.map((p, idx) => (
                <div key={p.role} className="flex flex-col rounded-2xl border border-line bg-surface-2/60 p-5">
                  <span className="text-[11px] font-bold tracking-wider text-open">
                    กลุ่มผู้ใช้งาน #{idx + 1}
                  </span>
                  <h3 className="mt-1 text-[15.5px] font-bold text-ink">{p.role}</h3>
                  <p className="mt-2 text-[12.5px] leading-thai text-ink-2 flex-1">{p.benefit}</p>
                  <ul className="mt-4 space-y-1.5 border-t border-line pt-3 text-[12px] text-ink-2">
                    {p.points.map((pt) => (
                      <li key={pt} className="flex items-start gap-1.5">
                        <span className="text-open font-bold shrink-0">✓</span>
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
        {/* SECTION 5: AUTH-AWARE CALL TO ACTION BANNER               */}
        {/* ========================================================= */}
        <section className="bg-surface-2 py-14 text-center">
          <div className="mx-auto max-w-[820px] px-4">
            <h2 className="text-[22px] sm:text-[28px] font-bold tracking-tight text-ink">
              พร้อมเริ่มต้นค้นหาโครงการไอทีภาครัฐแล้วหรือยัง?
            </h2>
            <p className="mt-3 text-[14px] leading-thai text-ink-2">
              {isAuthed
                ? "คุณเข้าสู่ระบบเรียบร้อยแล้ว — ค้นหาประกาศตามทักษะในโปรไฟล์ หรือติดตามประกาศสำคัญเพื่อรับแจ้งเตือนเมื่อมีการแก้ไขเอกสาร"
                : "ค้นหาและอ่านสรุป TOR ได้ทันทีโดยไม่ต้องมีบัญชีผู้ใช้ หรือสมัครใช้งานฟรีเพื่อบันทึกโปรไฟล์ทักษะ รายการติดตาม และรับแจ้งเตือนเมื่อ TOR เปลี่ยนแปลง"}
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/search"
                className="inline-flex h-10 min-w-[170px] items-center justify-center rounded-full bg-ink px-6 text-[14px] font-medium text-surface transition-opacity hover:opacity-85"
              >
                เริ่มค้นหาประกาศ TOR
              </Link>
              {isAuthed ? (
                <Link
                  href="/profile"
                  className="inline-flex h-10 min-w-[160px] items-center justify-center rounded-full border border-line-2 bg-surface px-6 text-[14px] font-medium text-ink transition-colors hover:bg-surface-3"
                >
                  จัดการโปรไฟล์และทักษะ
                </Link>
              ) : (
                <Link
                  href="/auth"
                  className="inline-flex h-10 min-w-[150px] items-center justify-center rounded-full border border-line-2 bg-surface px-6 text-[14px] font-medium text-ink transition-colors hover:bg-surface-3"
                >
                  สมัครใช้งานฟรี
                </Link>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Official Disclaimer Footer */}
      <SiteFooter />
    </div>
  );
}
