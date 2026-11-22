"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { ApiError } from "../_lib/api";
import { useAuth } from "./auth";
import { AuthHeader } from "./auth-form";
import { useLinkToken } from "./link-token";
import { btn, input, Label, Panel } from "./ui";

// A new account has an empty profile, and matching is the product, so it goes
// where it can say what it builds, not to the catalog
const AFTER_CONFIRM = "/profile";

type Ending = "no-token" | "invalid" | "too-many" | "already";

// What each answer that ends this page says. None is retryable here: each needs
// a new link, or no link at all.
const ENDINGS: Record<Ending, { heading: string; body: string; action: string }> = {
  "no-token": {
    heading: "ลิงก์นี้ไม่ครบ",
    body: "เปิดลิงก์จากอีเมลอีกครั้ง หรือสมัครใหม่เพื่อรับลิงก์ใหม่",
    action: "ไปหน้าสมัครใช้งาน",
  },
  invalid: {
    heading: "ลิงก์นี้หมดอายุหรือถูกใช้ไปแล้ว",
    body: "ลิงก์ยืนยันใช้ได้ครั้งเดียว ภายใน 24 ชั่วโมง สมัครอีกครั้งด้วยอีเมลเดิมเพื่อรับลิงก์ใหม่",
    action: "สมัครอีกครั้ง",
  },
  "too-many": {
    heading: "กรอกรหัสผ่านผิดหลายครั้งเกินไป",
    body: "ลิงก์นี้ใช้ไม่ได้แล้ว สมัครอีกครั้งด้วยอีเมลเดิมเพื่อรับลิงก์ใหม่",
    action: "สมัครอีกครั้ง",
  },
  already: {
    heading: "อีเมลนี้ยืนยันแล้ว",
    body: "บัญชีพร้อมใช้งานแล้ว เข้าสู่ระบบได้เลย",
    action: "เข้าสู่ระบบ",
  },
};

const ENDING_FOR_CODE: Partial<Record<string, Ending>> = {
  LINK_INVALID: "invalid",
  TOO_MANY_TRIES: "too-many",
  ALREADY_VERIFIED: "already",
};

/**
 * The page a confirm email links to. It asks for the password chosen at
 * sign-up: the link alone isn't enough, so someone who registered your address
 * can't have you confirm their account by clicking it (0041).
 */
export function VerifyEmailForm() {
  const router = useRouter();
  const { confirmEmail } = useAuth();

  // undefined on the server, which never sees the hash; the browser reads it,
  // then clears it from the address bar
  const token = useLinkToken();
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [ending, setEnding] = useState<Ending | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setPending(true);
    setError(null);

    const failure = await confirmEmail({ token, password });
    if (!failure) {
      router.replace(AFTER_CONFIRM);
      return;
    }

    setPending(false);
    const ends = failure.code ? ENDING_FOR_CODE[failure.code] : undefined;
    if (ends) {
      setEnding(ends);
      return;
    }
    setError(failure);
  }

  const passwordError =
    error?.code === "WRONG_PASSWORD" ? error.message : (error?.details?.password ?? null);
  const formMessage = error && !passwordError ? error.message : null;
  const end = ending ? ENDINGS[ending] : token === null ? ENDINGS["no-token"] : null;

  return (
    <div className="flex min-h-full flex-col">
      <AuthHeader />

      <main className="mx-auto w-full max-w-[480px] flex-1 px-4 py-10 lg:py-16">
        <Panel className="flex flex-col gap-3 p-5">
          {end ? (
            <div role="status" className="flex flex-col gap-2">
              <h1 className="text-[17px] leading-thai font-semibold text-ink">{end.heading}</h1>
              <p className="text-[13px] leading-thai text-ink-2">{end.body}</p>
              <Link href="/auth" className={`${btn.primary} mt-1 self-start`}>
                {end.action}
              </Link>
            </div>
          ) : token === undefined ? (
            // A moment, while the browser reads the link: shaped like what follows
            <div aria-hidden="true" className="flex flex-col gap-3">
              <div className="h-5 w-32 rounded-[3px] bg-line" />
              <div className="h-4 w-full rounded-[3px] bg-line" />
              <div className="h-9 w-full rounded-[3px] bg-line" />
            </div>
          ) : (
            <form className="flex flex-col gap-3" onSubmit={handleSubmit} noValidate>
              <h1 className="text-[17px] leading-thai font-semibold text-ink">ยืนยันอีเมล</h1>
              <p className="text-[13px] leading-thai text-ink-2">
                กรอกรหัสผ่านที่คุณตั้งไว้ตอนสมัคร เพื่อยืนยันว่าเป็นคุณ แล้วเราจะสร้างบัญชีและพาเข้าสู่ระบบ
              </p>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="verify-password">รหัสผ่าน</Label>
                <input
                  id="verify-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={passwordError ? true : undefined}
                  aria-describedby={passwordError ? "verify-password-error" : undefined}
                  className={input}
                />
                {passwordError ? (
                  <p id="verify-password-error" role="alert" className="text-[11px] leading-thai text-risk">
                    {passwordError}
                  </p>
                ) : null}
              </div>

              {formMessage ? (
                <p
                  role="alert"
                  className="rounded-[3px] border border-risk-line bg-risk-bg px-2.5 py-2 text-[12px] leading-thai text-risk"
                >
                  {formMessage}
                </p>
              ) : null}

              <button type="submit" disabled={pending || !password} className={`${btn.primary} w-full`}>
                {pending ? "กำลังยืนยัน…" : "ยืนยันและเข้าสู่ระบบ"}
              </button>
              <p className="text-[11px] leading-thai text-ink-3">
                ไม่ได้สมัครเอง? ปิดหน้านี้ได้เลย บัญชีจะไม่ถูกสร้างจนกว่าจะยืนยัน
              </p>
            </form>
          )}
        </Panel>
      </main>
    </div>
  );
}
