"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../../../_components/auth";
import { btn, input, Label, Panel } from "../../../_components/ui";
import * as api from "../../../_lib/api";
import type { ApiError } from "../../../_lib/api";

/**
 * Account and password (0042): change the password, or, for an account that
 * signs in only with Google, set a first one through an emailed link. Kept off
 * the profile page, which is about what the person builds, not how they sign in.
 */
export default function AccountPage() {
  const { user, changePassword } = useAuth();

  // Asked of /me, because another feature's answer may have replaced the user
  // in memory without saying whether it has a password
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    api.me().then((result) => {
      if (!cancelled) setHasPassword(result.ok ? result.data.user.hasPassword !== false : true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-[640px] px-4 py-10">
      <Link href="/profile" className="text-[12px] text-ink-3 underline underline-offset-2 hover:text-ink-2">
        ← กลับไปโปรไฟล์
      </Link>
      <h1 className="mt-2 text-[24px] font-bold tracking-tight text-ink">บัญชีและรหัสผ่าน</h1>
      <p className="mt-1 text-[13px] leading-thai text-ink-2">
        เข้าสู่ระบบด้วย <span className="font-mono text-ink">{user?.email}</span>
      </p>

      <Panel className="mt-6 flex flex-col gap-3 p-5">
        {hasPassword === null ? (
          <div aria-hidden="true" className="flex flex-col gap-3">
            <div className="h-5 w-40 rounded-[3px] bg-line" />
            <div className="h-9 w-full rounded-[3px] bg-line" />
            <div className="h-9 w-full rounded-[3px] bg-line" />
          </div>
        ) : hasPassword ? (
          <ChangePasswordForm onNoPassword={() => setHasPassword(false)} changePassword={changePassword} />
        ) : (
          <SetPasswordByEmail email={user?.email ?? ""} />
        )}
      </Panel>
    </div>
  );
}

function ChangePasswordForm({
  changePassword,
  onNoPassword,
}: {
  changePassword: ReturnType<typeof useAuth>["changePassword"];
  onNoPassword: () => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [changed, setChanged] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setChanged(false);
    const failure = await changePassword({ currentPassword, newPassword });
    setPending(false);
    if (!failure) {
      setChanged(true);
      setCurrentPassword("");
      setNewPassword("");
      return;
    }
    if (failure.code === "NO_PASSWORD") {
      onNoPassword();
      return;
    }
    setError(failure);
  }

  const currentError = error?.details?.currentPassword ?? null;
  const newError = error?.details?.newPassword ?? null;
  const formMessage = error && !currentError && !newError ? error.message : null;

  return (
    <form method="post" className="flex flex-col gap-3" onSubmit={handleSubmit} noValidate>
      <h2 className="text-[16px] font-semibold text-ink">เปลี่ยนรหัสผ่าน</h2>
      <p className="text-[13px] leading-thai text-ink-2">
        เมื่อเปลี่ยนแล้ว อุปกรณ์อื่นทั้งหมดจะออกจากระบบ เครื่องนี้ยังอยู่ในระบบ และเราจะส่งอีเมลแจ้งให้ทราบ
      </p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="current-password">รหัสผ่านปัจจุบัน</Label>
        <input
          id="current-password"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          aria-invalid={currentError ? true : undefined}
          aria-describedby={currentError ? "current-password-error" : undefined}
          className={input}
        />
        {currentError ? (
          <p id="current-password-error" role="alert" className="text-[11px] leading-thai text-risk">
            {currentError}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-password">รหัสผ่านใหม่</Label>
        <input
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          aria-invalid={newError ? true : undefined}
          aria-describedby={newError ? "new-password-error" : "new-password-hint"}
          className={input}
        />
        {newError ? (
          <p id="new-password-error" role="alert" className="text-[11px] leading-thai text-risk">
            {newError}
          </p>
        ) : (
          <p id="new-password-hint" className="text-[11px] leading-thai text-ink-3">
            อย่างน้อย 8 ตัวอักษร ไม่ใช่รหัสที่ใช้กันทั่วไป หรือชื่อระบบ อีเมล หรือชื่อของคุณต่อด้วยตัวเลข
          </p>
        )}
      </div>

      {formMessage ? (
        <p
          role="alert"
          className="rounded-[3px] border border-risk-line bg-risk-bg px-2.5 py-2 text-[12px] leading-thai text-risk"
        >
          {formMessage}
        </p>
      ) : null}
      {changed ? (
        <p role="status" className="text-[13px] leading-thai text-ink-2">
          เปลี่ยนรหัสผ่านแล้ว อุปกรณ์อื่นออกจากระบบแล้ว
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || !currentPassword || !newPassword}
        className={`${btn.primary} self-start`}
      >
        {pending ? "กำลังบันทึก…" : "เปลี่ยนรหัสผ่าน"}
      </button>
      <Link href="/auth/forgot" className="self-start text-[12px] text-ink-3 underline underline-offset-2 hover:text-ink-2">
        จำรหัสผ่านปัจจุบันไม่ได้?
      </Link>
    </form>
  );
}

// An account that signs in only with Google has no current password to give,
// so it sets a first one through the same emailed link as a reset
function SetPasswordByEmail({ email }: { email: string }) {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function send() {
    setPending(true);
    setError(null);
    const result = await api.forgotPassword({ email });
    setPending(false);
    if (result.ok) setSent(true);
    else setError(result.error);
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-[16px] font-semibold text-ink">ตั้งรหัสผ่าน</h2>
      <p className="text-[13px] leading-thai text-ink-2">
        บัญชีนี้เข้าสู่ระบบด้วย Google และยังไม่มีรหัสผ่าน ถ้าอยากเข้าสู่ระบบด้วยอีเมลและรหัสผ่านได้ด้วย
        เราจะส่งลิงก์ตั้งรหัสผ่านไปที่อีเมลของบัญชี
      </p>
      {sent ? (
        <p role="status" className="text-[13px] leading-thai text-ink-2">
          ส่งลิงก์ไปที่ <span className="font-mono text-ink">{email}</span> แล้ว ลิงก์ใช้ได้ภายใน 1 ชั่วโมง
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="rounded-[3px] border border-risk-line bg-risk-bg px-2.5 py-2 text-[12px] leading-thai text-risk"
        >
          {error.message}
        </p>
      ) : null}
      <button type="button" onClick={send} disabled={pending || !email} className={`${btn.secondary} self-start`}>
        {pending ? "กำลังส่ง…" : sent ? "ส่งอีกครั้ง" : "ส่งลิงก์ตั้งรหัสผ่าน"}
      </button>
    </div>
  );
}
