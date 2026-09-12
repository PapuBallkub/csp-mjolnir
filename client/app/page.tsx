"use client";

import Link from "next/link";
import { useLang, LangToggle, ThemeToggle } from "./_components/prefs";
import { Wordmark } from "./_components/shell";

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
      th: "ข้อมูลกระจายอยู่ตามเว็บไซต์หน่วยงาน BMA หลายสิบแห่ง ไม่มีที่เดียวรวมทั้งหมด",
      en: "across dozens of BMA agency sites — no single place to check them all",
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
      <header className="border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1240px] items-center gap-4 px-4 py-2.5">
          <Link href="/" className="shrink-0 transition-opacity hover:opacity-80" title="Mjölnir Home">
            <Wordmark />
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <LangToggle />
            <ThemeToggle />
            <Link
              href="/auth"
              className="inline-flex w-[74px] justify-center rounded-[3px] py-1.5 text-[13px] text-ink-2 transition-colors hover:text-ink"
            >
              {lang === "th" ? "เข้าสู่ระบบ" : "Sign in"}
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-surface">
        <div className="mx-auto max-w-[1240px] px-4 py-20 sm:py-28">
          <div className="max-w-[640px]">
            <h1 className="text-[32px] leading-[1.25] font-bold tracking-tight text-ink sm:text-[44px]">
              {t.headline.split("\n").map((line, i) => (
                <span key={i}>
                  {line}
                  {i === 0 && <br />}
                </span>
              ))}
            </h1>
            <p className="mt-5 max-w-[520px] text-[15px] leading-thai text-ink-2">
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
          <h2 className="text-[13px] font-medium uppercase tracking-[0.12em] text-ink-3">
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
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-4 text-[11px] text-ink-3">
          <Wordmark className="opacity-60" />
          <span className="leading-thai">
            เครื่องมือค้นหาโครงการ ไม่ใช่ระบบยื่นข้อเสนอ · A discovery tool, not a bidding
            assistant.
          </span>
          <span className="ml-auto font-mono">01219346 · Kasetsart University</span>
        </div>
      </footer>
    </div>
  );
}
