import type { Metadata } from "next";
import { ResetPasswordForm } from "../../_components/reset-password-form";

export const metadata: Metadata = {
  title: "ตั้งรหัสผ่านใหม่",
  // A link from one person's inbox, never a page to find by search
  robots: { index: false, follow: false },
};

/**
 * Where a reset email links to: /auth/reset#token=… (0042). A server
 * component only to carry the metadata; the token is after `#`, which reaches
 * no server, so the form reads it in the browser.
 */
export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
