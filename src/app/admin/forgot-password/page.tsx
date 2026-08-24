import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      tone="ink"
      title="Reset your password"
      subtitle="We'll email you a link to choose a new one."
    >
      <ForgotPasswordForm portal="platform" backHref="/admin/login" />
    </AuthShell>
  );
}
