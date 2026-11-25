"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import * as api from "../_lib/api";
import type { ApiError } from "../_lib/api";
import { AuthHeader } from "./auth-form";
import { btn, input, Label, Panel } from "./ui";

/**
 * Asks for a link to set a new password (0042). The answer is the same for
 * every address, so the page says the same thing whether or not one has an
 * account: it can't know, and saying more would tell anyone who asks.
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await api.forgotPassword({ email });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSentTo(email.trim().toLowerCase());
  }

  const fieldError = error?.details?.email ?? null;
  const formMessage = error && !fieldError ? error.message : null;

  return (
    <div className="flex min-h-full flex-col">
      <AuthHeader />

      <main className="mx-auto w-full max-w-[480px] flex-1 px-4 py-10 lg:py-16">
        <Panel className="flex flex-col gap-3 p-5">
          {sentTo ? (
            <div role="status" className="flex flex-col gap-2">
              <h1 className="text-[17px] leading-thai font-semibold text-ink">ตรวจอีเมลของคุณ</h1>
              <p className="text-[13px] leading-thai text-ink-2">
                ถ้ามีบัญชีที่ใช้ <span className="font-mono text-ink">{sentTo}</span> เราได้ส่งลิงก์ตั้งรหัสผ่านใหม่ไปแล้ว
                ถ้าไม่เห็น ลองดูในโฟลเดอร์สแปม
              </p>
              <p className="text-[12px] leading-thai text-ink-3">ลิงก์ใช้ได้ครั้งเดียว ภายใน 1 ชั่วโมง</p>
              <Link href="/auth" className="self-start text-[13px] text-ink-2 underline underline-offset-2 hover:text-ink">
                กลับไปหน้าเข้าสู่ระบบ
              </Link>
            </div>
          ) : (
            <form method="post" className="flex flex-col gap-3" onSubmit={handleSubmit} noValidate>
              <h1 className="text-[17px] leading-thai font-semibold text-ink">ลืมรหัสผ่าน</h1>
              <p className="text-[13px] leading-thai text-ink-2">
                กรอกอีเมลของบัญชี เราจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปให้ บัญชีที่สมัครด้วย Google ใช้ลิงก์นี้ตั้งรหัสผ่านครั้งแรกได้เช่นกัน
              </p>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="forgot-email">อีเมล</Label>
                <input
                  id="forgot-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={fieldError ? true : undefined}
                  aria-describedby={fieldError ? "forgot-email-error" : undefined}
                  className={`${input} font-mono`}
                />
                {fieldError ? (
                  <p id="forgot-email-error" role="alert" className="text-[11px] leading-thai text-risk">
                    {fieldError}
                  </p>
                ) : null}
              </div>

              {formMessage ? (
                <p
                  role="alert"
                  className="rounded-xl border border-risk-line bg-risk-bg px-3 py-2 text-[12px] leading-thai text-risk"
                >
                  {formMessage}
                </p>
              ) : null}

              <button type="submit" disabled={pending || !email} className={`${btn.primary} w-full`}>
                {pending ? "กำลังส่ง…" : "ส่งลิงก์ตั้งรหัสผ่าน"}
              </button>
              <Link href="/auth" className="self-start text-[12px] text-ink-3 underline underline-offset-2 hover:text-ink-2">
                นึกออกแล้ว กลับไปเข้าสู่ระบบ
              </Link>
            </form>
          )}
        </Panel>
      </main>
    </div>
  );
}
