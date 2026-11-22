import type { Metadata } from "next";
import { ForgotPasswordForm } from "../../_components/forgot-password-form";

export const metadata: Metadata = {
  title: "ลืมรหัสผ่าน",
};

/** Asks for a link to set a new password (0042). */
export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
