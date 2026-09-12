"use client";

import Link from "next/link";
import { useState } from "react";
import { useLang, LangToggle, ThemeToggle } from "../_components/prefs";
import { Wordmark } from "../_components/shell";
import { btn, input, Label, Panel } from "../_components/ui";
import { LockSpecBadge, StatusBadge } from "../_components/verdict";

function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" className="h-4 w-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

/**
 * A utility screen, deliberately not a design showcase (AGENTS §4.6). The one
 * thing it does carry is a reason to sign up at all — the alert that only
 * works if we know who to email.
 */
export default function AuthPage() {
  const { lang } = useLang();
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-[1000px] items-center gap-4 px-4 py-2.5">
          <Link href="/">
            <Wordmark />
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <LangToggle />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[1000px] flex-1 items-start gap-8 px-4 py-10 lg:grid-cols-2 lg:py-16">
        <Panel className="p-5">
          <div className="mb-4 flex gap-1 border-b border-line">
            {(["signin", "signup"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setMode(option)}
                className={`-mb-px border-b-2 px-2 py-2 text-[13px] font-medium transition-colors ${
                  mode === option
                    ? "border-ink text-ink"
                    : "border-transparent text-ink-3 hover:text-ink-2"
                }`}
              >
                {option === "signin"
                  ? lang === "th"
                    ? "เข้าสู่ระบบ"
                    : "Sign in"
                  : lang === "th"
                    ? "สมัครใช้งาน"
                    : "Create account"}
              </button>
            ))}
          </div>

          <form className="flex flex-col gap-3" onSubmit={(e) => e.preventDefault()}>
            <div className="flex flex-col gap-1.5">
              <Label>{lang === "th" ? "อีเมล" : "Email"}</Label>
              <input
                type="email"
                autoComplete="email"
                placeholder="you@example.co.th"
                className={`${input} font-mono`}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between">
                <Label>{lang === "th" ? "รหัสผ่าน" : "Password"}</Label>
                {mode === "signin" ? (
                  <button
                    type="button"
                    className="text-[11px] text-ink-3 underline underline-offset-2 hover:text-ink"
                  >
                    {lang === "th" ? "ลืมรหัสผ่าน" : "Forgot password"}
                  </button>
                ) : null}
              </div>
              <input
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                className={input}
              />
              {mode === "signup" ? (
                <p className="text-[11px] text-ink-3">
                  {lang === "th" ? "อย่างน้อย 8 ตัวอักษร" : "At least 8 characters."}
                </p>
              ) : null}
            </div>

            {mode === "signup" ? (
              <label className="flex cursor-pointer items-start gap-2 text-[12px] leading-thai text-ink-2">
                <input type="checkbox" className="mt-1 h-3.5 w-3.5 shrink-0 accent-ink" />
                <span>
                  {lang === "th"
                    ? "ยินยอมให้ส่งอีเมลแจ้งเตือนงานที่ตรงกับโปรไฟล์ ถอนความยินยอมได้ทุกเมื่อ"
                    : "Email me projects that match my profile. I can withdraw this at any time."}
                </span>
              </label>
            ) : null}

            <button type="submit" className={`${btn.primary} w-full`}>
              {mode === "signin"
                ? lang === "th"
                  ? "เข้าสู่ระบบ"
                  : "Sign in"
                : lang === "th"
                  ? "สมัครใช้งาน"
                  : "Create account"}
            </button>

            <div className="flex items-center gap-3 py-1">
              <span className="h-px flex-1 bg-line" />
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
                {lang === "th" ? "หรือ" : "or"}
              </span>
              <span className="h-px flex-1 bg-line" />
            </div>

            <button type="button" className={`${btn.secondary} w-full`}>
              <GoogleMark />
              {lang === "th" ? "ดำเนินการต่อด้วย Google" : "Continue with Google"}
            </button>
          </form>
        </Panel>

        <div className="flex flex-col gap-4 lg:pt-4">
          <h1 className="text-[24px] leading-thai font-semibold tracking-tight text-ink">
            {lang === "th"
              ? "ค้นหางานไอทีของ กทม. ได้โดยไม่ต้องเปิด PDF สักไฟล์"
              : "Find Bangkok's IT contracts without opening a single PDF"}
          </h1>
          <p className="text-[14px] leading-thai text-ink-2">
            {lang === "th"
              ? "ดูประกาศทั้งหมดได้โดยไม่ต้องสมัคร สมัครเมื่อคุณอยากให้เราคอยดูให้ว่า TOR ถูกแก้ไขเมื่อไหร่ และมีงานใหม่ที่ตรงกับคุณเมื่อไหร่"
              : "Browsing needs no account. Sign up when you want us to watch for amendments and tell you when something matching you is posted."}
          </p>

          <Panel className="flex flex-col gap-2 p-3.5">
            <Label>{lang === "th" ? "ตัวอย่างการแจ้งเตือน" : "A typical alert"}</Label>
            <div className="flex flex-wrap gap-1.5">
              <StatusBadge status="amended" lang={lang} round="ครั้งที่ 2" />
              <LockSpecBadge level="high" score={87} lang={lang} showScore={false} />
            </div>
            <p className="text-[13px] leading-thai text-ink-2">
              {lang === "th"
                ? "“ประสบการณ์ที่กำหนดเพิ่มจาก 3 ปี เป็น 10 ปี หลังปิดรับฟังความคิดเห็น” — แจ้งภายในวันเดียวกับที่เอกสารถูกเปลี่ยน"
                : "“Required experience jumped from 3 years to 10 after the comment period closed” — sent the same day the file changed."}
            </p>
          </Panel>

          <Link
            href="/catalog"
            className="text-[13px] text-ink-2 underline underline-offset-2 hover:text-ink"
          >
            {lang === "th" ? "ดูประกาศก่อนโดยไม่ต้องสมัคร →" : "Browse without an account →"}
          </Link>
        </div>
      </main>
    </div>
  );
}
