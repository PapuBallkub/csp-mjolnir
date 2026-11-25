import type { Metadata } from "next";
import { VerifyEmailForm } from "../../_components/verify-email-form";

export const metadata: Metadata = {
  title: "ยืนยันอีเมล — GIPDP",
  // A link from one person's inbox, never a page to find by search
  robots: { index: false, follow: false },
};

/**
 * Where a confirm email links to: /auth/verify#token=… (0041). A server
 * component only to carry the metadata; the token is after `#`, which reaches
 * no server, so the form reads it in the browser.
 */
export default function VerifyEmailPage() {
  return <VerifyEmailForm />;
}
