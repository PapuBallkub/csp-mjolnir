"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import * as api from "../_lib/api";
import type { ApiError } from "../_lib/api";
import { AuthHeader } from "./auth-form";
import { useLinkToken } from "./link-token";
import { btn, input, Label, Panel } from "./ui";

/**
 * The page a reset email links to: /auth/reset#token=… (0042). It sets the new
 * password and signs nothing in. Every session ends, and the person signs in
 * with the new password, so the emailed link alone is never a way in.
 */
export function ResetPasswordForm() {
  const token = useLinkToken();
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [done, setDone] = useState(false);
  const [linkDead, setLinkDead] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setPending(true);
    setError(null);
    const result = await api.resetPassword({ token, password });
    setPending(false);
    if (result.ok) {
      setDone(true);
      return;
    }
    if (result.error.code === "LINK_INVALID") {
      setLinkDead(true);
      return;
    }
    // A password the policy refused keeps the link: another can be tried
    setError(result.error);
  }

  const passwordError = error?.details?.password ?? null;
  const formMessage = error && !passwordError ? error.message : null;

  return (
    <div className="flex min-h-full flex-col">
      <AuthHeader />

      <main className="mx-auto w-full max-w-[480px] flex-1 px-4 py-10 lg:py-16">
        <Panel className="flex flex-col gap-3 p-5">
          {done ? (
            <div role="status" className="flex flex-col gap-2">
              <h1 className="text-[17px] leading-thai font-semibold text-ink">ตั้งรหัสผ่านใหม่แล้ว</h1>
              <p className="text-[13px] leading-thai text-ink-2">
                ทุกอุปกรณ์ออกจากระบบแล้ว เข้าสู่ระบบด้วยรหัสผ่านใหม่ได้เลย
              </p>
              <Link href="/auth" className={`${btn.primary} mt-1 self-start`}>
                เข้าสู่ระบบ
              </Link>
            </div>
          ) : linkDead || token === null ? (
            <div role="status" className="flex flex-col gap-2">
              <h1 className="text-[17px] leading-thai font-semibold text-ink">
                {token === null ? "ลิงก์นี้ไม่ครบ" : "ลิงก์นี้หมดอายุหรือถูกใช้ไปแล้ว"}
              </h1>
              <p className="text-[13px] leading-thai text-ink-2">
                ลิงก์ตั้งรหัสผ่านใช้ได้ครั้งเดียว ภายใน 1 ชั่วโมง และใช้ได้เฉพาะลิงก์ล่าสุด ขอลิงก์ใหม่ได้เลย
              </p>
              <Link href="/auth/forgot" className={`${btn.primary} mt-1 self-start`}>
                ขอลิงก์ใหม่
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
            <form method="post" className="flex flex-col gap-3" onSubmit={handleSubmit} noValidate>
              <h1 className="text-[17px] leading-thai font-semibold text-ink">ตั้งรหัสผ่านใหม่</h1>
              <p className="text-[13px] leading-thai text-ink-2">
                อย่างน้อย 8 ตัวอักษร ไม่ต้องมีตัวเลขหรือสัญลักษณ์ แต่ต้องไม่ใช่รหัสที่ใช้กันทั่วไป หรือชื่อระบบ อีเมล หรือชื่อของคุณต่อด้วยตัวเลข
              </p>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reset-password">รหัสผ่านใหม่</Label>
                <input
                  id="reset-password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={passwordError ? true : undefined}
                  aria-describedby={passwordError ? "reset-password-error" : undefined}
                  className={input}
                />
                {passwordError ? (
                  <p id="reset-password-error" role="alert" className="text-[11px] leading-thai text-risk">
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
                {pending ? "กำลังบันทึก…" : "ตั้งรหัสผ่านใหม่"}
              </button>
              <p className="text-[11px] leading-thai text-ink-3">
                เมื่อตั้งแล้ว ทุกอุปกรณ์จะออกจากระบบ รวมถึงเครื่องนี้
              </p>
            </form>
          )}
        </Panel>
      </main>
    </div>
  );
}
