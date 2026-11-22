"use client";

import { useState, type FormEvent } from "react";
import { btn, input, Panel, SectionHeading } from "../../../_components/ui";
import * as api from "../../../_lib/api";
import type { ApiError } from "../../../_lib/api";

/**
 * Sends a user a link to set a new password (ADR 0042, ASVS V6.4.6). The admin
 * names the address and nothing else: there is no field for a password, and
 * the answer never carries the link, so only the account's owner can finish.
 */
export function PasswordResetCard() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSentTo(null);
    const result = await api.adminSendPasswordReset({ email });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSentTo(email.trim().toLowerCase());
    setEmail("");
  }

  const message = error ? (error.details?.email ?? error.message) : null;

  return (
    <section className="mb-8 w-full">
      <SectionHeading sub="ส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่อีเมลของผู้ใช้ ผู้ดูแลระบบไม่เห็นลิงก์ และตั้งรหัสผ่านแทนผู้ใช้ไม่ได้">
        บัญชีผู้ใช้
      </SectionHeading>
      <Panel className="p-4">
        <form method="post" className="flex flex-wrap items-end gap-2" onSubmit={handleSubmit} noValidate>
          <div className="flex min-w-[240px] flex-1 flex-col gap-1.5">
            <label htmlFor="admin-reset-email" className="text-[11px] font-medium text-ink-2">
              อีเมลของผู้ใช้
            </label>
            <input
              id="admin-reset-email"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={message ? true : undefined}
              aria-describedby={message ? "admin-reset-error" : undefined}
              className={`${input} font-mono`}
            />
          </div>
          <button type="submit" disabled={pending || !email} className={btn.primary}>
            {pending ? "กำลังส่ง…" : "ส่งลิงก์ตั้งรหัสผ่าน"}
          </button>
        </form>
        {message ? (
          <p id="admin-reset-error" role="alert" className="mt-2 text-[12px] leading-thai text-risk">
            {message}
          </p>
        ) : null}
        {sentTo ? (
          <p role="status" className="mt-2 text-[12px] leading-thai text-ink-2">
            ส่งลิงก์ไปที่ <span className="font-mono text-ink">{sentTo}</span> แล้ว ใช้ได้ภายใน 1 ชั่วโมง
          </p>
        ) : null}
      </Panel>
    </section>
  );
}
