"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useLang } from "./_components/prefs";
import { HeaderControls, Wordmark } from "./_components/shell";

/**
 * Google sends a failed sign-in back here with ?auth=failed and nothing else —
 * the reason stays in the server log on purpose (0005), so all we can honestly
 * do is say it did not complete and offer the other way in. Without this the
 * whole thing is silent: the browser simply reappears on the landing page,
 * apparently signed out, with no explanation.
 *
 * useSearchParams opts a client component out of prerendering, so it is walled
 * off behind its own Suspense boundary rather than taking the landing page
 * with it. A null fallback is right for a strip that is usually absent.
 */
function AuthFailedNotice() {
  const params = useSearchParams();
  const router = useRouter();
  const { lang } = useLang();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || params.get("auth") !== "failed") return null;

  return (
    <div
      role="alert"
      className="border-b border-risk-line bg-risk-bg px-4 py-2.5 text-[13px] leading-thai text-risk"
    >
      <div className="mx-auto flex max-w-[1240px] items-center gap-3">
        <span className="flex-1">
          {lang === "th"
            ? "เข้าสู่ระบบด้วย Google ไม่สำเร็จ ลองอีกครั้ง หรือใช้อีเมลและรหัสผ่าน"
            : "Google sign-in did not complete. Try again, or use your email and password."}
        </span>
        <Link href="/auth" className="shrink-0 underline underline-offset-2">
          {lang === "th" ? "ไปที่หน้าเข้าสู่ระบบ" : "Go to sign in"}
        </Link>
        <button
          type="button"
          onClick={() => {
            setDismissed(true);
            router.replace("/");
          }}
          aria-label={lang === "th" ? "ปิด" : "Dismiss"}
          className="shrink-0 px-1 text-[15px] leading-none opacity-70 hover:opacity-100"
        >
          &times;
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Copy                                                              */
/* ------------------------------------------------------------------ */

const HERO = {
  th: {
    headline: "ค้นหาโครงการไอทีภาครัฐ\nที่คุณทำได้จริง",
    sub: "Mjölnir อ่าน TOR แทนคุณ — สรุปข้อมูลสำคัญ ตรวจจับ lock-spec และเปรียบเทียบราคากลาง เพื่อให้ SME และฟรีแลนซ์เข้าถึงงานภาครัฐได้ง่ายขึ้น",
    cta: "เริ่มค้นหา",
    secondary: "สมัครใช้งาน",
  },
  en: {
    headline: "Find government IT projects\nyou can actually win",
    sub: "Mjölnir reads Thai government TORs so you don't have to — summarizing key facts, detecting lock-spec risk, and benchmarking reference prices so SMEs and freelancers can finally compete.",
    cta: "Browse projects",
    secondary: "Create an account",
  },
};

const FEATURES = [
  {
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
      </svg>
    ),
    title: { th: "AI อ่าน TOR แทนคุณ", en: "AI-powered TOR reading" },
    body: {
      th: "ระบบอ่าน PDF ภาษาไทยด้วย OCR และ LLM แล้วสรุปเป็นข้อมูลที่อ่านง่าย — งบประมาณ เทคโนโลยี กำหนดส่ง ค่าปรับ — ในหน้าเดียว",
      en: "Our pipeline reads scanned Thai PDFs with OCR and LLM, then summarizes budget, tech stack, deadline, and penalty clauses into one clean page.",
    },
    color: "text-open",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
      </svg>
    ),
    title: { th: "ตรวจจับ Lock-spec", en: "Lock-spec detection" },
    body: {
      th: "เปรียบเทียบคุณสมบัติที่กำหนดกับ TOR อื่นในหมวดเดียวกัน แล้วแจ้งเตือนเมื่อพบข้อกำหนดที่ผิดปกติหรือจำเพาะเจาะจงเกินไป",
      en: "We compare qualification requirements against similar past TORs and flag postings with suspiciously restrictive or hyper-specific requirements.",
    },
    color: "text-risk",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
      </svg>
    ),
    title: { th: "ตรวจสอบราคากลาง", en: "Price Reality Check" },
    body: {
      th: "เปรียบเทียบราคากลางของ TOR กับค่ามัธยฐานของโครงการที่คล้ายกัน เพื่อให้คุณตัดสินใจได้ว่าคุ้มค่าที่จะยื่นข้อเสนอหรือไม่",
      en: "Compare the reference price against historical medians for similar projects, so you can judge whether a bid is worth preparing.",
    },
    color: "text-amend",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
      </svg>
    ),
    title: { th: "แจ้งเตือนการแก้ไข TOR", en: "Amendment Watchdog" },
    body: {
      th: "ระบบติดตามการเปลี่ยนแปลงของ TOR ที่คุณสนใจ แจ้งเตือนทันทีเมื่อมีการแก้ไข ปิดรับ หรือมีผู้ชนะ",
      en: "Track changes to TORs you've saved. We watch the source daily and alert you the moment a document is amended, closed, or awarded.",
    },
    color: "text-ink-2",
  },
];

const PROBLEMS = [
  {
    stat: { th: "30–50 หน้า", en: "30–50 pages" },
    label: {
      th: "ต่อ TOR หนึ่งฉบับ — ข้อมูลสำคัญฝังอยู่ในเอกสารราชการที่ยาวหลายสิบหน้า",
      en: "per TOR — critical details buried in dense bureaucratic Thai legalese",
    },
  },
  {
    stat: { th: "กระจัดกระจาย", en: "Scattered" },
    label: {
      th: "ข้อมูลกระจายอยู่ตามระบบ e-GP และเว็บไซต์หน่วยงานรัฐทั่วประเทศ ไม่มีที่เดียวที่รวบรวมอย่างเป็นระบบ",
      en: "scattered across e-GP and agency websites nationwide — with no unified place to analyze them",
    },
  },
  {
    stat: { th: "แก้ไขเงียบ", en: "Silent edits" },
    label: {
      th: "TOR ถูกแก้ไขโดยไม่มี changelog — คุณอาจยื่นข้อเสนอตาม TOR เก่าที่ถูกแก้ไปแล้ว",
      en: "TORs are amended without changelogs — you might bid on an outdated version",
    },
  },
];

export default function LandingPage() {
  const { lang } = useLang();
  const t = HERO[lang];

  return (
    <div className="flex min-h-full flex-col">
      {/* Minimal header for landing */}
      <Suspense fallback={null}>
        <AuthFailedNotice />
      </Suspense>

      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex min-h-[52px] max-w-[1240px] items-center gap-4 px-4 py-2.5">
          <Link
            href="/"
            className="flex h-[26px] items-center shrink-0 transition-opacity hover:opacity-80"
            title="Mjölnir Home"
          >
            <Wordmark />
          </Link>
          <nav className="-mx-1 hidden sm:flex min-w-0 items-center gap-1 overflow-x-auto px-1">
            <Link
              href="/search"
              className="rounded-[3px] px-2.5 py-1.5 text-[13px] text-ink-2 hover:bg-surface-2 hover:text-ink transition-colors"
            >
              {lang === "th" ? "ค้นหาประกาศ" : "Browse TORs"}
            </Link>
            <Link
              href="/watchlist"
              className="rounded-[3px] px-2.5 py-1.5 text-[13px] text-ink-2 hover:bg-surface-2 hover:text-ink transition-colors"
            >
              {lang === "th" ? "รายการติดตาม" : "Watchlist"}
            </Link>
            <Link
              href="/watchdog"
              className="rounded-[3px] px-2.5 py-1.5 text-[13px] text-ink-2 hover:bg-surface-2 hover:text-ink transition-colors"
            >
              {lang === "th" ? "ตรวจสอบราคา/การแก้ไข" : "Price & Amendment Analysis"}
            </Link>
          </nav>
          <HeaderControls className="ml-auto" />
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-surface">
        <div className="mx-auto max-w-[1240px] px-4 py-20 sm:py-28">
          <div className="max-w-[800px]">
            <h1 className="text-[32px] leading-[1.25] font-bold tracking-tight text-ink sm:text-[44px]">
              {t.headline.split("\n").map((line, i) => (
                <span key={i}>
                  {line}
                  {i === 0 && <br />}
                </span>
              ))}
            </h1>
            <p className="mt-5 max-w-[760px] text-[15px] leading-thai text-ink-2">
              {t.sub}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/search"
                className="inline-flex h-10 min-w-[190px] items-center justify-center rounded-[3px] bg-ink px-5 text-[14px] font-medium text-surface transition-opacity hover:opacity-85"
              >
                {t.cta}
              </Link>
              <Link
                href="/auth"
                className="inline-flex h-10 min-w-[130px] items-center justify-center rounded-[3px] border border-line px-5 text-[14px] font-medium text-ink transition-colors hover:bg-surface-2"
              >
                {t.secondary}
              </Link>
            </div>

            {/* Live-feel Normalized TOR Card Preview */}
            <div className="mt-12 rounded-lg border border-line bg-surface p-4 sm:p-5 shadow-sm max-w-[800px]">
              <div className="flex items-center justify-between pb-2 mb-3 border-b border-line/60">
                <span className="text-[11.5px] font-medium text-ink-3">
                  {lang === "th"
                    ? "ตัวอย่างผลลัพธ์: AI สรุปสาระสำคัญจากเอกสาร TOR หลายสิบหน้าเหลือการ์ดเดียว"
                    : "Example output: AI extracts critical facts from 40+ page TOR into a single actionable card"}
                </span>
                <Link
                  href="/search"
                  className="text-[11.5px] font-semibold text-open hover:underline"
                >
                  {lang === "th" ? "ค้นหาประกาศจริง →" : "Browse real projects →"}
                </Link>
              </div>

              {/* Sample Card (using the new left-aligned status system) */}
              <div className="relative flex gap-3 rounded-lg border border-line bg-surface-2/30 p-3 sm:p-3.5">
                <span className="w-[4px] shrink-0 rounded-full bg-open" aria-hidden="true" />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:gap-2">
                  {/* Tier 1: Metadata */}
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-ink-3">
                    <span className="font-medium text-ink-2 bg-surface-2 px-1.5 py-0.5 rounded-[2px] border border-line">
                      ปีงบฯ 2569
                    </span>
                    <span className="font-mono tnum">#68049322058</span>
                    <span className="text-ink-4">·</span>
                    <span className="font-medium text-ink-2">กองทุนบำเหน็จบำนาญข้าราชการ (กบข.)</span>
                    <span className="text-ink-4">/</span>
                    <span>สำนักบริการคอมพิวเตอร์</span>
                  </div>

                  {/* Tier 2: Status & Risk Badges (left-aligned) */}
                  <div className="flex flex-wrap items-center gap-1.5 border-b border-line/40 pb-1.5">
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
                  <h3 className="text-[14px] sm:text-[15px] font-semibold leading-snug text-ink">
                    ประกวดราคาจ้างบริการพัฒนาและปรับปรุงระบบงานสารสนเทศด้านลงทุนและสำนักงาน ปี 2568 ด้วยวิธี e-bidding
                  </h3>

                  {/* Tier 4: Core Facts Grid */}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 rounded-[4px] bg-surface-2/60 border border-line/50 p-2 text-[12px]">
                    <div>
                      <span className="text-[10px] font-medium text-ink-3 uppercase">ราคากลาง</span>
                      <div className="font-mono font-bold text-ink text-[14px]">฿1,796,185</div>
                      <span className="text-[10.5px] text-ink-4">วงเงินงบประมาณ</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-medium text-ink-3 uppercase">กำหนดยื่นข้อเสนอ</span>
                      <div className="font-medium text-[12.5px] text-amend font-semibold">เหลืออีก 11 วัน</div>
                      <span className="text-[10.5px] text-ink-4">20 พ.ย. 2569</span>
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <span className="text-[10px] font-medium text-ink-3 uppercase">ความตรงกับคุณ</span>
                      <div className="font-mono font-bold text-open text-[13px]">61/100</div>
                      <span className="text-[10.5px] text-ink-3">ตรงบางส่วน (ทักษะเข้าเกณฑ์)</span>
                    </div>
                  </div>

                  {/* Tier 5: Tech stack chips */}
                  <div className="flex items-center gap-1.5 pt-0.5 overflow-hidden flex-nowrap text-[11px]">
                    <span className="inline-flex items-center gap-1 rounded-[3px] border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10.5px] font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300 shrink-0">
                      ⚠️ เฉพาะนิติบุคคล
                    </span>
                    <span className="h-3 w-px bg-line/80 mx-0.5 shrink-0" />
                    <span className="rounded-[3px] border border-open-line bg-open-bg px-2 py-0.5 text-open shrink-0">
                      ✓ Linux
                    </span>
                    <span className="rounded-[3px] border border-line/60 bg-surface-2 px-2 py-0.5 text-ink-2 shrink-0">
                      PostgreSQL 15
                    </span>
                    <span className="rounded-[3px] border border-open-line bg-open-bg px-2 py-0.5 text-open shrink-0">
                      ✓ Docker
                    </span>
                    <span className="rounded-[3px] border border-line/60 bg-surface-2 px-1.5 py-0.5 text-ink-3 shrink-0">
                      +1
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Decorative accent — the hammer silhouette, large and faded */}
          <div className="pointer-events-none absolute -right-20 top-1/2 hidden -translate-y-1/2 opacity-[0.04] sm:block">
            <svg viewBox="0 0 20 20" className="h-[420px] w-[420px] text-ink">
              <path
                d="M2.5 2.5 H17.5 V8.6 H12.4 V11.4 H14 V17.5 H6 V11.4 H7.6 V8.6 H2.5 Z"
                fill="currentColor"
              />
            </svg>
          </div>
        </div>
      </section>

      {/* Problem stats bar */}
      <section className="border-y border-line bg-surface-2">
        <div className="mx-auto grid max-w-[1240px] gap-6 px-4 py-10 sm:grid-cols-3 sm:gap-8">
          {PROBLEMS.map((p, i) => (
            <div key={i}>
              <p className="text-[22px] font-bold tracking-tight text-ink">
                {p.stat[lang]}
              </p>
              <p className="mt-1 text-[13px] leading-thai text-ink-2">
                {p.label[lang]}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="bg-surface">
        <div className="mx-auto max-w-[1240px] px-4 py-16 sm:py-20">
          <h2 className="text-[12px] font-medium uppercase tracking-[0.05em] text-ink-3">
            {lang === "th" ? "ความสามารถหลัก" : "Core capabilities"}
          </h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            {FEATURES.map((f, i) => (
              <div
                key={i}
                className="rounded-[4px] border border-line bg-surface-2 p-5 transition-colors hover:border-line-2"
              >
                <div className={`${f.color}`}>{f.icon}</div>
                <h3 className="mt-3 text-[15px] font-semibold text-ink">
                  {f.title[lang]}
                </h3>
                <p className="mt-1.5 text-[13px] leading-thai text-ink-2">
                  {f.body[lang]}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA banner */}
      <section className="border-t border-line bg-surface-2">
        <div className="mx-auto max-w-[1240px] px-4 py-14 text-center sm:py-16">
          <h2 className="text-[22px] font-bold tracking-tight text-ink sm:text-[26px]">
            {lang === "th"
              ? "เริ่มค้นหาโครงการที่ตรงกับคุณ"
              : "Start finding projects that match you"}
          </h2>
          <p className="mx-auto mt-3 max-w-[460px] text-[14px] leading-thai text-ink-2">
            {lang === "th"
              ? "ไม่ต้องสมัครก็ดูประกาศได้ — สมัครเพื่อบันทึกโครงการและรับการแจ้งเตือน"
              : "Browse without signing up — create an account to save projects and get alerts."}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/search"
              className="inline-flex h-10 min-w-[160px] items-center justify-center rounded-[3px] bg-ink px-5 text-[14px] font-medium text-surface transition-opacity hover:opacity-85"
            >
              {lang === "th" ? "ค้นหา TOR" : "Browse TORs"}
            </Link>
            <Link
              href="/auth"
              className="inline-flex h-10 min-w-[160px] items-center justify-center rounded-[3px] border border-line px-5 text-[14px] font-medium text-ink transition-colors hover:bg-surface-3"
            >
              {lang === "th" ? "สมัครใช้งานฟรี" : "Sign up for free"}
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 text-[11.5px] text-ink-3">
          <Wordmark className="opacity-70" />
          <span className="leading-thai">
            {lang === "th"
              ? "แพลตฟอร์มค้นหาและวิเคราะห์ประกาศจัดซื้อจัดจ้างภาครัฐด้าน IT (เครื่องมืออิสระบุคคลที่สาม — การยื่นข้อเสนอทางการทั้งหมดทำผ่านระบบ e-GP)"
              : "Government IT Procurement Discovery Platform (Independent third-party tool — all official submissions occur via e-GP)."}
          </span>
          <span className="ml-auto font-mono text-[11px] text-ink-4">01219346 · Kasetsart University</span>
        </div>
      </footer>
    </div>
  );
}
