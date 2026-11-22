"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { googleSignInUrl, type ApiError } from "../_lib/api";
import { useAuth } from "./auth";
import { ThemeToggle } from "./prefs";
import { Wordmark } from "./shell";
import { btn, input, Label, Panel } from "./ui";
import { LockSpecBadge, StatusBadge } from "./verdict";

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

/** One server message, under the input it belongs to. */
function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-[11px] leading-thai text-risk">
      {message}
    </p>
  );
}

/** Where signing in lands when there is no validated ?next= to return to. */
const AFTER_SIGN_IN = "/search";

/** The bar over both account screens: this one and the confirm-link page. */
export function AuthHeader() {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-[1000px] items-center gap-4 px-4 py-2.5">
        <Link href="/">
          <Wordmark />
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

/**
 * A utility screen, deliberately not a design showcase (AGENTS §4.6). The one
 * thing it does carry is a reason to sign up at all — the alert that only
 * works if we know who to email.
 *
 * `next` arrives already validated by the server component that renders this;
 * it is never read from the URL here. See safe-next.ts for why that matters.
 */
export function AuthForm({ next }: { next: string | null }) {
  const router = useRouter();
  const { status, signIn, signUp } = useAuth();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<ApiError | null>(null);
  // Where the confirm email went, once sign-up is sent: the form gives way to
  // "check your inbox". Registering signs no one in (0041).
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  // Already signed in — a login form is not what this person needs. replace,
  // so Back does not return them to it.
  useEffect(() => {
    if (status === "authenticated") router.replace(next ?? AFTER_SIGN_IN);
  }, [status, next, router]);

  // 400 carries per-field details; everything else is one message.
  const fieldErrors = formError?.details ?? {};
  const formMessage = formError && !formError.details ? formError.message : null;

  function switchMode(option: "signin" | "signup") {
    setMode(option);
    // The password rarely survives a mode switch usefully, and an error about
    // the other form is just noise. The address is worth keeping.
    setPassword("");
    setFormError(null);
  }

  async function sendSignUp() {
    setPending(true);
    setFormError(null);
    const error = await signUp({ email, password, name, notificationConsent: consent });
    setPending(false);
    if (error) {
      setFormError(error);
      return false;
    }
    setSentTo(email.trim().toLowerCase());
    return true;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (mode === "signup") {
      await sendSignUp();
      return;
    }

    setPending(true);
    setFormError(null);
    const error = await signIn({ email, password });
    if (error) {
      setFormError(error);
      setPending(false);
      return;
    }
    router.replace(next ?? AFTER_SIGN_IN);
  }

  // The same values again, under the same limits: one endpoint less than a
  // separate "resend", and the answer is the same 202
  async function resend() {
    setResent(false);
    setResent(await sendSignUp());
  }

  function useAnotherAddress() {
    setSentTo(null);
    setResent(false);
    setFormError(null);
    setPassword("");
  }

  return (
    <div className="flex min-h-full flex-col">
      <AuthHeader />

      <main className="mx-auto grid w-full max-w-[1000px] flex-1 items-start gap-8 px-4 py-10 lg:grid-cols-2 lg:py-16">
        {sentTo ? (
          <Panel className="flex flex-col gap-3 p-5">
            <div role="status" className="flex flex-col gap-2">
              <h2 className="text-[17px] leading-thai font-semibold text-ink">ตรวจอีเมลของคุณ</h2>
              {/* The same words whether the address is new or already has an
                  account: both get an email, and the page says nothing more */}
              <p className="text-[13px] leading-thai text-ink-2">
                เราส่งอีเมลไปที่ <span className="font-mono text-ink">{sentTo}</span> แล้ว
                ทำตามขั้นตอนในอีเมลเพื่อเริ่มใช้งาน ถ้าไม่เห็น ลองดูในโฟลเดอร์สแปม
              </p>
              <p className="text-[12px] leading-thai text-ink-3">
                ลิงก์ในอีเมลใช้ได้ครั้งเดียว ภายใน 24 ชั่วโมง และจะถามรหัสผ่านที่คุณเพิ่งตั้ง
              </p>
            </div>

            {resent ? (
              <p role="status" className="text-[12px] leading-thai text-ink-2">
                ส่งอีกครั้งแล้ว
              </p>
            ) : null}
            {formMessage ? (
              <p
                role="alert"
                className="rounded-[3px] border border-risk-line bg-risk-bg px-2.5 py-2 text-[12px] leading-thai text-risk"
              >
                {formMessage}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={resend} disabled={pending} className={btn.secondary}>
                {pending ? "กำลังส่ง…" : "ส่งอีกครั้ง"}
              </button>
              <button type="button" onClick={useAnotherAddress} className={btn.secondary}>
                ใช้อีเมลอื่น
              </button>
            </div>
          </Panel>
        ) : (
          <Panel className="p-5">
            <div className="mb-4 flex gap-1 border-b border-line">
              {(["signin", "signup"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => switchMode(option)}
                  className={`-mb-px border-b-2 px-2 py-2 text-[13px] font-medium transition-colors ${
                    mode === option
                      ? "border-ink text-ink"
                      : "border-transparent text-ink-3 hover:text-ink-2"
                  }`}
                >
                  {option === "signin" ? "เข้าสู่ระบบ" : "สมัครใช้งาน"}
                </button>
              ))}
            </div>

            {/* noValidate: the browser own-language bubble is unlocalised and
                would pre-empt our messages, which match what the server says. */}
            <form className="flex flex-col gap-3" onSubmit={handleSubmit} noValidate>
              {mode === "signup" ? (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="auth-name">ชื่อที่ใช้แสดง</Label>
                  <input
                    id="auth-name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="สุชาติ ว."
                    className={input}
                  />
                  <FieldError message={fieldErrors.name} />
                </div>
              ) : null}

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="auth-email">อีเมล</Label>
                <input
                  id="auth-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.co.th"
                  className={`${input} font-mono`}
                />
                <FieldError message={fieldErrors.email} />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between">
                  <Label htmlFor="auth-password">รหัสผ่าน</Label>
                  {mode === "signin" ? (
                    <span className="text-[11px] text-ink-3">
                      ยังรีเซ็ตรหัสผ่านไม่ได้
                    </span>
                  ) : null}
                </div>
                <input
                  id="auth-password"
                  name="password"
                  type="password"
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={input}
                />
                <FieldError message={fieldErrors.password} />
                {mode === "signup" ? (
                  <p className="text-[11px] text-ink-3">
                    อย่างน้อย 8 ตัวอักษร
                  </p>
                ) : null}
              </div>

              {mode === "signup" ? (
                <label className="flex cursor-pointer items-start gap-2 text-[12px] leading-thai text-ink-2">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="mt-1 h-3.5 w-3.5 shrink-0 accent-ink"
                  />
                  <span>
                    ยินยอมให้ส่งอีเมลแจ้งเตือนงานที่เหมาะสมกับโปรไฟล์ ถอนความยินยอมได้ทุกเมื่อ
                  </span>
                </label>
              ) : null}

              {formMessage ? (
                <div
                  role="alert"
                  className="flex flex-col gap-2 rounded-[3px] border border-risk-line bg-risk-bg px-2.5 py-2 text-[12px] leading-thai text-risk"
                >
                  <p>{formMessage}</p>
                  {/* The right password on an address never confirmed: signing
                      up again with it sends a new link, and keeps the account */}
                  {formError?.code === "EMAIL_NOT_VERIFIED" ? (
                    <button
                      type="button"
                      onClick={() => switchMode("signup")}
                      className="self-start font-medium underline underline-offset-2"
                    >
                      สมัครอีกครั้งด้วยอีเมลนี้
                    </button>
                  ) : null}
                </div>
              ) : null}

              <button type="submit" disabled={pending} className={`${btn.primary} w-full`}>
                {pending
                  ? "กำลังดำเนินการ…"
                  : mode === "signin"
                    ? "เข้าสู่ระบบ"
                    : "สมัครใช้งาน"}
              </button>

              <div className="flex items-center gap-3 py-1">
                <span className="h-px flex-1 bg-line" />
                <span className="text-[11px] font-medium text-ink-3">
                  หรือ
                </span>
                <span className="h-px flex-1 bg-line" />
              </div>

              {/* An anchor, not a button with onClick: this has to be a
                  top-level navigation. A fetch would follow the 302 to
                  accounts.google.com and die on CORS, and the state cookie
                  would never be set. */}
              <a href={googleSignInUrl} className={`${btn.secondary} w-full`}>
                <GoogleMark />
                ดำเนินการต่อด้วย Google
              </a>
            </form>
          </Panel>
        )}

        <div className="flex flex-col gap-4 lg:pt-4">
          <h1 className="text-[24px] leading-thai font-semibold tracking-tight text-ink">
            ค้นหางานไอทีภาครัฐได้โดยไม่ต้องเปิด PDF สักไฟล์
          </h1>
          <p className="text-[14px] leading-thai text-ink-2">
            ดูประกาศทั้งหมดได้โดยไม่ต้องสมัคร สมัครเมื่อคุณอยากให้เราคอยดูให้ว่า TOR ถูกแก้ไขเมื่อไหร่ และมีงานใหม่ที่เหมาะสมกับคุณเมื่อไหร่
          </p>

          <Panel className="flex flex-col gap-2 p-3.5">
            <Label>ตัวอย่างการแจ้งเตือน</Label>
            <div className="flex flex-wrap gap-1.5">
              <StatusBadge status="Open" isAmended round="ครั้งที่ 2" />
              <LockSpecBadge level="high" score={87} showScore={false} />
            </div>
            <p className="text-[13px] leading-thai text-ink-2">
              “ประสบการณ์ที่กำหนดเพิ่มจาก 3 ปี เป็น 10 ปี หลังปิดรับฟังความคิดเห็น” — แจ้งภายในวันเดียวกับที่เอกสารถูกเปลี่ยน
            </p>
          </Panel>

          <Link
            href="/search"
            className="text-[13px] text-ink-2 underline underline-offset-2 hover:text-ink"
          >
            ดูประกาศก่อนโดยไม่ต้องสมัคร →
          </Link>
        </div>
      </main>
    </div>
  );
}
